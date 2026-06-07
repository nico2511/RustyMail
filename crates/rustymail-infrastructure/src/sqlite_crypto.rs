//! SQLCipher : clé dans le trousseau OS, migration transparente des bases SQLite en clair.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::Connection;

use crate::KEYRING_SERVICE;

const DB_KEYRING_USER: &str = "sqlcipher-db-v1";
static DB_KEY_CACHE: OnceLock<Vec<u8>> = OnceLock::new();
const PLAINTEXT_BACKUP_SUFFIX: &str = ".pre-sqlcipher.bak";
const ENCRYPT_STAGING_SUFFIX: &str = ".encrypting";

fn db_keyring_entry() -> Result<keyring_core::Entry, String> {
    keyring::use_native_store(false)
        .map_err(|e| format!("keyring native store failed: {e}"))?;
    keyring_core::Entry::new(KEYRING_SERVICE, DB_KEYRING_USER)
        .map_err(|e| format!("keyring db key entry failed: {e}"))
}

fn load_or_create_db_key() -> Result<Vec<u8>, String> {
    if let Some(k) = DB_KEY_CACHE.get() {
        return Ok(k.clone());
    }
    #[cfg(test)]
    {
        let key = vec![0xA7u8; 32];
        let _ = DB_KEY_CACHE.set(key.clone());
        return Ok(key);
    }
    #[cfg(not(test))]
    {
        let entry = db_keyring_entry()?;
        let key = if let Ok(raw) = entry.get_password() {
            let bytes = base64_decode_key(raw.trim())?;
            if bytes.len() >= 32 {
                bytes
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };
        let key = if key.len() >= 32 {
            key
        } else {
            let mut material = [0u8; 32];
            rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut material);
            let stored = STANDARD.encode(material);
            entry
                .set_password(&stored)
                .map_err(|e| format!("keyring db key write failed: {e}"))?;
            material.to_vec()
        };
        let _ = DB_KEY_CACHE.set(key.clone());
        Ok(key)
    }
}

fn base64_decode_key(raw: &str) -> Result<Vec<u8>, String> {
    STANDARD.decode(raw)
        .map_err(|e| format!("db key base64: {e}"))
}

fn key_hex(key: &[u8]) -> String {
    key.iter().map(|b| format!("{b:02x}")).collect()
}

fn pragma_key_sql(key: &[u8]) -> String {
    format!("PRAGMA key = \"x'{}'\";", key_hex(key))
}

fn apply_cipher_key(conn: &Connection, key: &[u8]) -> Result<(), rusqlite::Error> {
    conn.execute_batch(&pragma_key_sql(key))
}

/// Vérifie que la base répond après application de la clé (évite les faux positifs).
fn cipher_opens(conn: &Connection) -> bool {
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
        .is_ok()
}

fn is_plaintext_sqlite_file(path: &Path) -> bool {
    let Ok(mut f) = std::fs::File::open(path) else {
        return false;
    };
    use std::io::Read;
    let mut hdr = [0u8; 16];
    if f.read_exact(&mut hdr).is_err() {
        return false;
    }
    &hdr == b"SQLite format 3\0"
}

fn backup_plaintext_once(path: &Path) -> Result<(), String> {
    let mut backup = path.as_os_str().to_os_string();
    backup.push(PLAINTEXT_BACKUP_SUFFIX);
    let backup = PathBuf::from(backup);
    if backup.exists() {
        return Ok(());
    }
    std::fs::copy(path, &backup).map_err(|e| format!("backup sqlite before encrypt: {e}"))?;
    Ok(())
}

fn plaintext_backup_path(path: &Path) -> PathBuf {
    let mut backup = path.as_os_str().to_os_string();
    backup.push(PLAINTEXT_BACKUP_SUFFIX);
    PathBuf::from(backup)
}

fn staging_encrypt_path(path: &Path) -> PathBuf {
    let mut staging = path.as_os_str().to_os_string();
    staging.push(ENCRYPT_STAGING_SUFFIX);
    PathBuf::from(staging)
}

/// Chemin SQL pour `ATTACH DATABASE` (slashes + échappement des quotes).
fn sql_attach_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").replace('\'', "''")
}

/// Convertit une base SQLite **en clair** vers SQLCipher via `ATTACH` + `sqlcipher_export`
/// (PRAGMA `rekey` ne s’applique qu’à une base déjà chiffrée).
fn migrate_plaintext_to_encrypted(path: &Path, key: &[u8]) -> Result<(), String> {
    backup_plaintext_once(path)?;
    let staging = staging_encrypt_path(path);
    if staging.exists() {
        std::fs::remove_file(&staging).map_err(|e| format!("remove stale staging db: {e}"))?;
    }

    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    if !cipher_opens(&conn) {
        return Err("base SQLite illisible avant migration SQLCipher".into());
    }
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    let hex = key_hex(key);
    let staging_sql = sql_attach_path(&staging);
    conn.execute_batch(&format!(
        "ATTACH DATABASE '{staging_sql}' AS enc KEY \"x'{hex}'\";"
    ))
    .map_err(|e| format!("ATTACH encrypted staging: {e}"))?;
    conn.execute_batch("SELECT sqlcipher_export('enc');")
        .map_err(|e| format!("sqlcipher_export: {e}"))?;
    conn.execute_batch("DETACH DATABASE enc;")
        .map_err(|e| format!("DETACH enc: {e}"))?;
    drop(conn);

    std::fs::remove_file(path).map_err(|e| format!("remove plaintext db: {e}"))?;
    std::fs::rename(&staging, path).map_err(|e| format!("promote encrypted db: {e}"))?;

    let verify = open_sqlite_encrypted(path).map_err(|e| e.to_string())?;
    if !cipher_opens(&verify) {
        return Err("migration SQLCipher : vérification après export échouée".into());
    }
    Ok(())
}

/// Si une migration `rekey` ratée a laissé un fichier illisible, restaurer depuis `.pre-sqlcipher.bak`.
fn try_restore_plaintext_backup(path: &Path) -> Result<(), String> {
    let backup = plaintext_backup_path(path);
    if !backup.is_file() || !is_plaintext_sqlite_file(&backup) {
        return Err("aucune sauvegarde plaintext utilisable".into());
    }
    std::fs::copy(&backup, path).map_err(|e| format!("restore plaintext backup: {e}"))?;
    Ok(())
}

/// Ouvre (ou crée) la base locale avec SQLCipher. Migre automatiquement une base en clair existante.
pub fn open_sqlite_encrypted(path: &Path) -> Result<Connection, rusqlite::Error> {
    let key = load_or_create_db_key().map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;

    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(path)?;
        apply_cipher_key(&conn, &key)?;
        return Ok(conn);
    }

    if is_plaintext_sqlite_file(path) {
        migrate_plaintext_to_encrypted(path, &key)
            .map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;
    } else {
        let conn = Connection::open(path)?;
        apply_cipher_key(&conn, &key)?;
        if cipher_opens(&conn) {
            return Ok(conn);
        }
        drop(conn);
        if try_restore_plaintext_backup(path).is_ok() && is_plaintext_sqlite_file(path) {
            migrate_plaintext_to_encrypted(path, &key)
                .map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;
        } else {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_NOTADB),
                Some(
                    "SQLCipher: clé invalide ou fichier corrompu (restaurer *.pre-sqlcipher.bak si besoin)"
                        .into(),
                ),
            ));
        }
    }

    let conn = Connection::open(path)?;
    apply_cipher_key(&conn, &key)?;
    if cipher_opens(&conn) {
        return Ok(conn);
    }

    Err(rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_NOTADB),
        Some("SQLCipher: clé invalide ou fichier corrompu".into()),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn encrypt_new_database_roundtrip() {
        let tmp = NamedTempFile::new().expect("temp");
        let path = tmp.path();
        {
            let conn = open_sqlite_encrypted(path).expect("open new encrypted");
            conn.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (1);")
                .expect("ddl");
        }
        {
            let conn = open_sqlite_encrypted(path).expect("reopen encrypted");
            let n: i64 = conn
                .query_row("SELECT COUNT(*) FROM t", [], |r| r.get(0))
                .expect("count");
            assert_eq!(n, 1);
        }
        assert!(!is_plaintext_sqlite_file(path));
    }

    #[test]
    fn migrate_plaintext_via_sqlcipher_export() {
        let tmp = NamedTempFile::new().expect("temp");
        let path = tmp.path();
        {
            let conn = Connection::open(path).expect("plaintext create");
            conn.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (42);")
                .expect("ddl");
        }
        assert!(is_plaintext_sqlite_file(path));
        migrate_plaintext_to_encrypted(path, &[0xA7u8; 32]).expect("migrate");
        assert!(!is_plaintext_sqlite_file(path));
        let conn = open_sqlite_encrypted(path).expect("open encrypted");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM t", [], |r| r.get(0))
            .expect("count");
        assert_eq!(n, 1);
        let v: i64 = conn
            .query_row("SELECT id FROM t", [], |r| r.get(0))
            .expect("id");
        assert_eq!(v, 42);
    }
}
