//! SQLCipher : clé dans le trousseau OS, migration transparente des bases SQLite en clair.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::Connection;

#[cfg(not(test))]
use crate::KEYRING_SERVICE;

static DB_KEY_CACHE: OnceLock<Vec<u8>> = OnceLock::new();
const PLAINTEXT_BACKUP_SUFFIX: &str = ".pre-sqlcipher.bak";
/// Fichier d'export SQLCipher (nom historique du code, pas `*.encrypt-staging`).
const ENCRYPT_STAGING_SUFFIX: &str = ".encrypting";
/// Nom cité par le brief 0.4.5 : reconnu en plus de `.encrypting`.
const ENCRYPT_STAGING_ALT_SUFFIX: &str = ".encrypt-staging";
const MIGRATING_MARKER_SUFFIX: &str = ".sqlcipher-migrating";
const VERIFIED_OPENS_META_KEY: &str = "sqlcipher_verified_opens";
const LAST_APP_VERSION_META_KEY: &str = "last_app_version";
pub(crate) const VERSION_BACKUP_NOTICE_KEY: &str = "version_backup_notice";

pub(crate) const DB_LOCKED_MESSAGE: &str = "Base verrouillée : trousseau inaccessible, réessayer";

#[cfg(not(test))]
const DB_KEYRING_USER: &str = "sqlcipher-db-v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum KeyDecision {
    Use(Vec<u8>),
    CreateNew,
    Fail(String),
}

/// Décide quoi faire d'une lecture de clé. `CreateNew` uniquement si l'entrée n'existe pas.
pub(crate) fn decide_db_key(read: Result<String, keyring_core::Error>) -> KeyDecision {
    match read {
        Err(keyring_core::Error::NoEntry) => KeyDecision::CreateNew,
        Err(e) => KeyDecision::Fail(format!("{DB_LOCKED_MESSAGE} ({e})")),
        Ok(raw) => match base64_decode_key(raw.trim()) {
            Ok(bytes) if bytes.len() >= 32 => KeyDecision::Use(bytes),
            Ok(bytes) => KeyDecision::Fail(format!(
                "{DB_LOCKED_MESSAGE} (clé trop courte : {} octets)",
                bytes.len()
            )),
            Err(e) => KeyDecision::Fail(format!("{DB_LOCKED_MESSAGE} ({e})")),
        },
    }
}

/// `CreateNew` n'est appliqué que s'il n'y a pas encore de base, ou si le fichier est encore
/// du SQLite en clair, et qu'aucun artefact de migration / sauvegarde n'est présent.
/// Sinon une entrée `NoEntry` ne doit pas écraser le trousseau : la base chiffrée resterait
/// illisible et serait mise en quarantaine au prochain essai.
pub(crate) fn provision_db_key(decision: KeyDecision, path: &Path) -> KeyDecision {
    match decision {
        KeyDecision::CreateNew if key_creation_allowed(path) => KeyDecision::CreateNew,
        KeyDecision::CreateNew => KeyDecision::Fail(format!(
            "{DB_LOCKED_MESSAGE} (base chiffrée présente, clé absente du trousseau — ne pas recréer)"
        )),
        other => other,
    }
}

fn key_creation_allowed(path: &Path) -> bool {
    if migration_interrupted(path)
        || plaintext_backup_path(path).exists()
        || version_backup_sibling_exists(path)
    {
        return false;
    }
    if !path.exists() {
        return true;
    }
    is_plaintext_sqlite_file(path)
}

fn version_backup_sibling_exists(path: &Path) -> bool {
    let Some(dir) = path.parent() else {
        return false;
    };
    let stem = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if stem.is_empty() {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries
        .flatten()
        .any(|entry| is_version_backup_name(&entry.file_name().to_string_lossy(), &stem))
}

#[cfg(not(test))]
fn db_keyring_entry() -> Result<keyring_core::Entry, String> {
    keyring::use_native_store(false).map_err(|e| format!("keyring native store failed: {e}"))?;
    keyring_core::Entry::new(KEYRING_SERVICE, DB_KEYRING_USER)
        .map_err(|e| format!("keyring db key entry failed: {e}"))
}

#[allow(clippy::needless_return)]
fn load_or_create_db_key(path: &Path) -> Result<Vec<u8>, String> {
    if let Some(k) = DB_KEY_CACHE.get() {
        return Ok(k.clone());
    }
    #[cfg(test)]
    {
        let _ = path;
        let key = vec![0xA7u8; 32];
        let _ = DB_KEY_CACHE.set(key.clone());
        return Ok(key);
    }
    #[cfg(not(test))]
    {
        let entry = match db_keyring_entry() {
            Ok(entry) => entry,
            Err(e) => return Err(format!("{DB_LOCKED_MESSAGE} ({e})")),
        };
        let read = match entry.get_password() {
            Ok(raw) => decide_db_key(Ok(raw)),
            Err(e) => decide_db_key(Err(e)),
        };
        // `set_password` uniquement si `provision_db_key` laisse `CreateNew`.
        let decision = provision_db_key(read, path);
        let key = match decision {
            KeyDecision::Use(bytes) => bytes,
            KeyDecision::Fail(message) => return Err(message),
            KeyDecision::CreateNew => {
                let mut material = [0u8; 32];
                rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut material);
                let stored = STANDARD.encode(material);
                entry
                    .set_password(&stored)
                    .map_err(|e| format!("{DB_LOCKED_MESSAGE} (écriture trousseau : {e})"))?;
                material.to_vec()
            }
        };
        let _ = DB_KEY_CACHE.set(key.clone());
        Ok(key)
    }
}

fn base64_decode_key(raw: &str) -> Result<Vec<u8>, String> {
    STANDARD
        .decode(raw)
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

fn cipher_probe(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
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

fn path_with_extra_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

fn plaintext_backup_path(path: &Path) -> PathBuf {
    path_with_extra_suffix(path, PLAINTEXT_BACKUP_SUFFIX)
}

fn staging_encrypt_path(path: &Path) -> PathBuf {
    path_with_extra_suffix(path, ENCRYPT_STAGING_SUFFIX)
}

fn staging_encrypt_alt_path(path: &Path) -> PathBuf {
    path_with_extra_suffix(path, ENCRYPT_STAGING_ALT_SUFFIX)
}

fn migrating_marker_path(path: &Path) -> PathBuf {
    path_with_extra_suffix(path, MIGRATING_MARKER_SUFFIX)
}

fn migration_interrupted(path: &Path) -> bool {
    staging_encrypt_path(path).exists()
        || staging_encrypt_alt_path(path).exists()
        || migrating_marker_path(path).is_file()
}

fn write_migrating_marker(path: &Path) -> Result<(), String> {
    let marker = migrating_marker_path(path);
    std::fs::write(&marker, b"1").map_err(|e| format!("marqueur sqlcipher-migrating: {e}"))
}

fn remove_migration_artifacts(path: &Path) {
    let _ = std::fs::remove_file(migrating_marker_path(path));
    let _ = std::fs::remove_file(staging_encrypt_path(path));
    let _ = std::fs::remove_file(staging_encrypt_alt_path(path));
}

fn backup_plaintext_once(path: &Path) -> Result<(), String> {
    let backup = plaintext_backup_path(path);
    if backup.exists() {
        return Ok(());
    }
    std::fs::copy(path, &backup).map_err(|e| format!("backup sqlite before encrypt: {e}"))?;
    Ok(())
}

/// Chemin SQL pour `ATTACH DATABASE` (slashes + échappement des quotes).
fn sql_attach_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").replace('\'', "''")
}

/// Convertit une base SQLite **en clair** vers SQLCipher via `ATTACH` + `sqlcipher_export`.
fn migrate_plaintext_to_encrypted(path: &Path, key: &[u8]) -> Result<(), String> {
    backup_plaintext_once(path)?;
    write_migrating_marker(path)?;
    let staging = staging_encrypt_path(path);
    if staging.exists() {
        std::fs::remove_file(&staging).map_err(|e| format!("remove stale staging db: {e}"))?;
    }

    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    cipher_probe(&conn)
        .map_err(|e| format!("base SQLite illisible avant migration SQLCipher: {e}"))?;
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

    let verify = open_with_key(path, key).map_err(|e| e.to_string())?;
    cipher_probe(&verify)
        .map_err(|_| "migration SQLCipher : vérification après export échouée".to_string())?;
    drop(verify);
    remove_migration_artifacts(path);
    Ok(())
}

fn try_restore_plaintext_backup(path: &Path) -> Result<(), String> {
    let backup = plaintext_backup_path(path);
    if !backup.is_file() || !is_plaintext_sqlite_file(&backup) {
        return Err("aucune sauvegarde plaintext utilisable".into());
    }
    let quarantined = if path.exists() {
        Some(quarantine_unreadable(path)?)
    } else {
        None
    };
    if let Err(e) = std::fs::copy(&backup, path) {
        if let Some(saved) = quarantined {
            let _ = std::fs::rename(&saved, path);
        }
        return Err(format!("restore plaintext backup: {e}"));
    }
    Ok(())
}

fn is_notadb(err: &rusqlite::Error) -> bool {
    match err {
        rusqlite::Error::SqliteFailure(code, _) => {
            (code.extended_code & 0xff) == rusqlite::ffi::SQLITE_NOTADB
        }
        _ => false,
    }
}

fn quarantine_unreadable(path: &Path) -> Result<PathBuf, String> {
    let ts = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let stem = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "rustymail.sqlite3".to_string());
    let dest_name = format!("{stem}.unreadable-{ts}");
    let dest = path.with_file_name(&dest_name);
    std::fs::rename(path, &dest).map_err(|e| format!("quarantaine base illisible: {e}"))?;
    for suffix in ["-wal", "-shm"] {
        let side = path_with_extra_suffix(path, suffix);
        if side.exists() {
            let dest_side = path_with_extra_suffix(&dest, suffix);
            if let Err(e) = std::fs::rename(&side, &dest_side) {
                log::warn!("quarantaine {suffix} : {e}");
            }
        }
    }
    Ok(dest)
}

fn notadb_error(detail: &str) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_NOTADB),
        Some(detail.to_string()),
    )
}

fn recover_interrupted(path: &Path, key: &[u8]) -> Result<(), rusqlite::Error> {
    if try_restore_plaintext_backup(path).is_ok() && is_plaintext_sqlite_file(path) {
        return migrate_plaintext_to_encrypted(path, key)
            .map_err(|e| rusqlite::Error::InvalidPath(e.into()));
    }
    let staging = staging_encrypt_path(path);
    if staging.is_file() && !path.exists() {
        std::fs::rename(&staging, path).map_err(|e| {
            rusqlite::Error::InvalidPath(format!("promote staging SQLCipher: {e}").into())
        })?;
        return Ok(());
    }
    Err(notadb_error(
        "SQLCipher: migration interrompue sans sauvegarde en clair utilisable",
    ))
}

/// Ouvre (ou crée) la base avec une clé explicite. Les tests de clé fausse passent par ici.
fn open_with_key(path: &Path, key: &[u8]) -> Result<Connection, rusqlite::Error> {
    if !path.exists() {
        if migration_interrupted(path) {
            recover_interrupted(path, key)?;
        } else {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let conn = Connection::open(path)?;
            apply_cipher_key(&conn, key)?;
            return Ok(conn);
        }
    }

    if path.exists() && is_plaintext_sqlite_file(path) {
        migrate_plaintext_to_encrypted(path, key)
            .map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;
    } else if path.exists() {
        let conn = Connection::open(path)?;
        apply_cipher_key(&conn, key)?;
        match cipher_probe(&conn) {
            Ok(()) => {
                drop(conn);
                remove_migration_artifacts(path);
                let conn = Connection::open(path)?;
                apply_cipher_key(&conn, key)?;
                return Ok(conn);
            }
            Err(err) if is_notadb(&err) => {
                drop(conn);
                if migration_interrupted(path) {
                    recover_interrupted(path, key)?;
                } else {
                    let dest = quarantine_unreadable(path)
                        .map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;
                    return Err(notadb_error(&format!(
                        "SQLCipher: base illisible, renommée en {} — aucune restauration",
                        dest.file_name().unwrap_or_default().to_string_lossy()
                    )));
                }
            }
            Err(err) => return Err(err),
        }
    }

    let conn = Connection::open(path)?;
    apply_cipher_key(&conn, key)?;
    match cipher_probe(&conn) {
        Ok(()) => {
            drop(conn);
            remove_migration_artifacts(path);
            let conn = Connection::open(path)?;
            apply_cipher_key(&conn, key)?;
            Ok(conn)
        }
        Err(err) if is_notadb(&err) => {
            drop(conn);
            if migration_interrupted(path) {
                recover_interrupted(path, key)?;
                let conn = Connection::open(path)?;
                apply_cipher_key(&conn, key)?;
                cipher_probe(&conn)?;
                remove_migration_artifacts(path);
                Ok(conn)
            } else {
                let dest = quarantine_unreadable(path)
                    .map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;
                Err(notadb_error(&format!(
                    "SQLCipher: base illisible, renommée en {} — aucune restauration",
                    dest.file_name().unwrap_or_default().to_string_lossy()
                )))
            }
        }
        Err(err) => Err(err),
    }
}

/// PRAGMA par connexion (pas dans `migrate`, qui n'est exécuté qu'une fois par processus).
fn apply_per_connection_pragmas(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch("PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;")
}

/// Ouvre (ou crée) la base locale avec SQLCipher. Migre automatiquement une base en clair existante.
pub fn open_sqlite_encrypted(path: &Path) -> Result<Connection, rusqlite::Error> {
    let key = load_or_create_db_key(path).map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;
    let conn = open_with_key(path, &key)?;
    apply_per_connection_pragmas(&conn)?;
    Ok(conn)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum VersionBackupOutcome {
    Unchanged,
    Copied,
    SkippedNoSpace(String),
    Failed(String),
}

/// Espace libre requis pour la copie : **1×** la taille du fichier (le fichier vivant est déjà alloué).
/// `None` (espace inconnu) autorise la copie.
pub(crate) fn version_backup_allowed(db_len: u64, free_bytes: Option<u64>) -> bool {
    match free_bytes {
        Some(free) => free >= db_len,
        None => true,
    }
}

fn interpret_checkpoint_busy(busy: i64) -> Result<(), String> {
    if busy != 0 {
        Err(format!(
            "checkpoint WAL incomplet avant sauvegarde (busy={busy}) — copie reportée"
        ))
    } else {
        Ok(())
    }
}

fn version_backup_path(path: &Path, version: &str) -> PathBuf {
    let stem = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "rustymail.sqlite3".to_string());
    path.with_file_name(format!("{stem}.pre-{version}.bak"))
}

fn is_version_backup_name(file_name: &str, stem: &str) -> bool {
    let Some(rest) = file_name.strip_prefix(&format!("{stem}.pre-")) else {
        return false;
    };
    let Some(ver) = rest.strip_suffix(".bak") else {
        return false;
    };
    ver.starts_with(|c: char| c.is_ascii_digit())
}

fn delete_older_version_backups(path: &Path, keep: &Path) {
    let Some(dir) = path.parent() else {
        return;
    };
    let stem = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let keep_name = keep.file_name().map(|s| s.to_os_string());
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if keep_name.as_ref() == Some(&name) {
            continue;
        }
        let label = name.to_string_lossy();
        if is_version_backup_name(&label, &stem) {
            if let Err(e) = std::fs::remove_file(entry.path()) {
                log::warn!("suppression ancienne sauvegarde {label} : {e}");
            }
        }
    }
}

fn volume_available_bytes(path: &Path) -> Option<u64> {
    let probe = if path.exists() {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(path).to_path_buf()
    };
    #[cfg(unix)]
    {
        unix_available_bytes(&probe)
    }
    #[cfg(windows)]
    {
        windows_available_bytes(&probe)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = probe;
        None
    }
}

#[cfg(unix)]
fn unix_available_bytes(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let c_path = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut buf: libc::statvfs = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::statvfs(c_path.as_ptr(), &mut buf) };
    if rc != 0 {
        return None;
    }
    Some((buf.f_bavail as u64).saturating_mul(buf.f_frsize as u64))
}

#[cfg(windows)]
fn windows_available_bytes(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            lp_directory_name: *const u16,
            lp_free_bytes_available_to_caller: *mut u64,
            lp_total_number_of_bytes: *mut u64,
            lp_total_number_of_free_bytes: *mut u64,
        ) -> i32;
    }
    let dir = path.parent().unwrap_or(path);
    let mut wide: Vec<u16> = dir.as_os_str().encode_wide().collect();
    wide.push(0);
    let mut avail = 0u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut avail,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        None
    } else {
        Some(avail)
    }
}

fn read_meta(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM app_meta WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .ok()
}

/// Sauvegarde chiffrée avant migration si `last_app_version` diffère.
/// La connexion reste ouverte : on ne renomme ni ne supprime le fichier SQLite vivant.
pub(crate) fn prepare_version_backup(conn: &Connection, path: &Path) -> VersionBackupOutcome {
    let current = env!("CARGO_PKG_VERSION");
    if read_meta(conn, LAST_APP_VERSION_META_KEY).as_deref() == Some(current) {
        return VersionBackupOutcome::Unchanged;
    }
    if !path.is_file() {
        return VersionBackupOutcome::Unchanged;
    }
    let busy: i64 = match conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| row.get(0)) {
        Ok(busy) => busy,
        Err(e) => {
            return VersionBackupOutcome::Failed(format!(
                "checkpoint avant sauvegarde de version : {e}"
            ));
        }
    };
    if let Err(msg) = interpret_checkpoint_busy(busy) {
        return VersionBackupOutcome::Failed(msg);
    }
    let db_len = match std::fs::metadata(path) {
        Ok(meta) => meta.len(),
        Err(e) => {
            return VersionBackupOutcome::Failed(format!("taille base avant sauvegarde : {e}"));
        }
    };
    let free = volume_available_bytes(path);
    if !version_backup_allowed(db_len, free) {
        return VersionBackupOutcome::SkippedNoSpace(format!(
            "Sauvegarde pre-{current} ignorée : espace libre {free:?} < taille de la base ({db_len} octets). Une copie demande environ 1× la taille du fichier. Nouvel essai au prochain lancement."
        ));
    }
    let dest = version_backup_path(path, current);
    if let Err(e) = std::fs::copy(path, &dest) {
        return VersionBackupOutcome::Failed(format!("copie sauvegarde pre-{current} : {e}"));
    }
    delete_older_version_backups(path, &dest);
    log::info!(
        "sauvegarde chiffrée écrite ({})",
        dest.file_name().unwrap_or_default().to_string_lossy()
    );
    VersionBackupOutcome::Copied
}

/// Succès : fige `last_app_version` et efface l'avis. Échec ou manque de place : avis visible,
/// version non figée (nouvel essai au prochain lancement).
pub(crate) fn apply_version_backup_outcome(
    conn: &Connection,
    outcome: &VersionBackupOutcome,
) -> Result<(), rusqlite::Error> {
    match outcome {
        VersionBackupOutcome::Unchanged | VersionBackupOutcome::Copied => {
            write_last_app_version(conn)?;
            clear_version_backup_notice(conn)?;
        }
        VersionBackupOutcome::SkippedNoSpace(msg) | VersionBackupOutcome::Failed(msg) => {
            log::error!("{msg}");
            write_version_backup_notice(conn, msg)?;
        }
    }
    Ok(())
}

fn write_app_meta(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_meta(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub(crate) fn write_version_backup_notice(
    conn: &Connection,
    message: &str,
) -> Result<(), rusqlite::Error> {
    write_app_meta(conn, VERSION_BACKUP_NOTICE_KEY, message)
}

pub(crate) fn clear_version_backup_notice(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM app_meta WHERE key = ?1",
        [VERSION_BACKUP_NOTICE_KEY],
    )?;
    Ok(())
}

pub(crate) fn write_last_app_version(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO app_meta(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [LAST_APP_VERSION_META_KEY, env!("CARGO_PKG_VERSION")],
    )?;
    Ok(())
}

/// Compte une ouverture réussie. Au 2ᵉ lancement, supprime `*.pre-sqlcipher.bak`.
pub(crate) fn note_sqlcipher_verified_open(conn: &Connection, path: &Path) {
    let backup = plaintext_backup_path(path);
    if !backup.is_file() {
        return;
    }
    let current = read_meta(conn, VERIFIED_OPENS_META_KEY)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let next = current.saturating_add(1);
    if conn
        .execute(
            "INSERT INTO app_meta(key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![VERIFIED_OPENS_META_KEY, next.to_string()],
        )
        .is_err()
    {
        return;
    }
    if next >= 2 {
        match std::fs::remove_file(&backup) {
            Ok(()) => log::info!(
                "sauvegarde en clair SQLCipher supprimée après {next} ouvertures vérifiées ({})",
                backup.file_name().unwrap_or_default().to_string_lossy()
            ),
            Err(e) => log::warn!("suppression {} : {e}", backup.display()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn temp_db_path() -> (TempDir, PathBuf) {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("rustymail.sqlite3");
        (dir, path)
    }

    #[test]
    fn per_connection_pragmas_survive_second_open() {
        let (_dir, path) = temp_db_path();
        let first = crate::open_sqlite_migrated(&path).expect("first");
        let sync1: i64 = first
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .expect("sync");
        let busy1: i64 = first
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .expect("busy");
        assert_eq!(sync1, 1, "NORMAL");
        assert_eq!(busy1, 5000);
        drop(first);
        let second = crate::open_sqlite_migrated(&path).expect("second");
        let sync2: i64 = second
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .expect("sync2");
        let busy2: i64 = second
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .expect("busy2");
        assert_eq!(sync2, 1);
        assert_eq!(busy2, 5000);
    }

    #[test]
    fn decide_db_key_matrix() {
        assert_eq!(
            decide_db_key(Err(keyring_core::Error::NoEntry)),
            KeyDecision::CreateNew
        );
        assert!(matches!(
            decide_db_key(Err(keyring_core::Error::PlatformFailure(Box::new(
                std::io::Error::other("keychain locked")
            )))),
            KeyDecision::Fail(message) if message.starts_with(DB_LOCKED_MESSAGE)
        ));
        assert!(matches!(
            decide_db_key(Err(keyring_core::Error::NoStorageAccess(Box::new(
                std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied")
            )))),
            KeyDecision::Fail(_)
        ));
        assert!(matches!(
            decide_db_key(Ok("@@@".into())),
            KeyDecision::Fail(message) if message.contains("base64")
        ));
        let short = STANDARD.encode([1u8; 16]);
        assert!(matches!(
            decide_db_key(Ok(short)),
            KeyDecision::Fail(message) if message.contains("trop courte")
        ));
        let key = [0x11u8; 32];
        match decide_db_key(Ok(STANDARD.encode(key))) {
            KeyDecision::Use(bytes) => assert_eq!(bytes, key),
            other => panic!("clé valide : {other:?}"),
        }
    }

    #[test]
    fn version_backup_skips_when_free_space_below_db_size() {
        assert!(!version_backup_allowed(100, Some(99)));
        assert!(version_backup_allowed(100, Some(100)));
        assert!(version_backup_allowed(100, None));
    }

    #[test]
    fn checkpoint_busy_blocks_version_backup() {
        assert!(interpret_checkpoint_busy(0).is_ok());
        let err = interpret_checkpoint_busy(1).expect_err("busy");
        assert!(err.contains("busy=1"), "{err}");
    }

    #[test]
    fn noentry_on_encrypted_db_does_not_create_key_or_quarantine() {
        let (_dir, path) = temp_db_path();
        std::fs::write(&path, b"SQLCipher-not-plaintext!!").expect("encrypted-looking");
        let decision = provision_db_key(KeyDecision::CreateNew, &path);
        match decision {
            KeyDecision::Fail(message) => {
                assert!(message.starts_with(DB_LOCKED_MESSAGE), "{message}");
                assert!(message.contains("ne pas recréer"), "{message}");
            }
            other => panic!("NoEntry + base chiffrée doit échouer : {other:?}"),
        }
        assert!(path.is_file(), "pas de quarantaine");
        let quarantined = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().contains(".unreadable-"));
        assert!(!quarantined, "aucun fichier .unreadable-");
    }

    #[test]
    fn noentry_creates_only_without_db_or_plaintext_and_without_artifacts() {
        let (_dir, path) = temp_db_path();
        assert!(matches!(
            provision_db_key(KeyDecision::CreateNew, &path),
            KeyDecision::CreateNew
        ));
        std::fs::write(&path, b"SQLite format 3\0pad").expect("plain header");
        assert!(is_plaintext_sqlite_file(&path));
        assert!(matches!(
            provision_db_key(KeyDecision::CreateNew, &path),
            KeyDecision::CreateNew
        ));
        std::fs::write(plaintext_backup_path(&path), b"bak").expect("bak");
        assert!(
            matches!(
                provision_db_key(KeyDecision::CreateNew, &path),
                KeyDecision::Fail(_)
            ),
            "un .bak bloque la création de clé"
        );
        let (_dir2, path2) = temp_db_path();
        std::fs::write(staging_encrypt_path(&path2), b"stage").expect("stage");
        assert!(matches!(
            provision_db_key(KeyDecision::CreateNew, &path2),
            KeyDecision::Fail(_)
        ));
        let (_dir3, path3) = temp_db_path();
        std::fs::write(version_backup_path(&path3, "0.4.4"), b"vb").expect("vbak");
        assert!(matches!(
            provision_db_key(KeyDecision::CreateNew, &path3),
            KeyDecision::Fail(_)
        ));
        let kept = [9u8; 32];
        assert!(matches!(
            provision_db_key(KeyDecision::Use(kept.to_vec()), &path),
            KeyDecision::Use(bytes) if bytes == kept
        ));
    }

    #[test]
    fn restore_plaintext_backup_quarantines_current_file() {
        let (_dir, path) = temp_db_path();
        std::fs::write(&path, b"garbage-current").expect("garbage");
        let bak = plaintext_backup_path(&path);
        {
            let conn = Connection::open(&bak).expect("bak");
            conn.execute_batch("CREATE TABLE t (id INTEGER);")
                .expect("ddl");
        }
        try_restore_plaintext_backup(&path).expect("restore");
        assert!(is_plaintext_sqlite_file(&path));
        let parent = path.parent().unwrap();
        let quarantined = std::fs::read_dir(parent)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .find(|n| n.contains(".unreadable-"))
            .expect("quarantaine");
        assert_eq!(
            std::fs::read(parent.join(&quarantined)).unwrap(),
            b"garbage-current"
        );
    }

    #[test]
    fn failed_version_backup_sets_notice_and_keeps_old_stamp() {
        let (_dir, path) = temp_db_path();
        let conn = crate::open_sqlite_migrated(&path).expect("open");
        conn.execute(
            "UPDATE app_meta SET value = '0.4.3' WHERE key = 'last_app_version'",
            [],
        )
        .expect("stamp");
        let detail = "checkpoint WAL incomplet avant sauvegarde (busy=1) — copie reportée";
        apply_version_backup_outcome(&conn, &VersionBackupOutcome::Failed(detail.into()))
            .expect("notice");
        let ver: String = conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'last_app_version'",
                [],
                |r| r.get(0),
            )
            .expect("ver");
        assert_eq!(ver, "0.4.3");
        let notice: String = conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'version_backup_notice'",
                [],
                |r| r.get(0),
            )
            .expect("notice row");
        assert!(notice.contains("busy=1"), "{notice}");
        apply_version_backup_outcome(&conn, &VersionBackupOutcome::Copied).expect("clear");
        let ver: String = conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'last_app_version'",
                [],
                |r| r.get(0),
            )
            .expect("ver");
        assert_eq!(ver, env!("CARGO_PKG_VERSION"));
        let left: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM app_meta WHERE key = 'version_backup_notice'",
                [],
                |r| r.get(0),
            )
            .expect("cleared");
        assert_eq!(left, 0);
    }

    #[test]
    fn encrypt_new_database_roundtrip() {
        let (_dir, path) = temp_db_path();
        {
            let conn = open_sqlite_encrypted(&path).expect("open new encrypted");
            conn.execute_batch(
                "CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (1);",
            )
            .expect("ddl");
        }
        {
            let conn = open_sqlite_encrypted(&path).expect("reopen encrypted");
            let n: i64 = conn
                .query_row("SELECT COUNT(*) FROM t", [], |r| r.get(0))
                .expect("count");
            assert_eq!(n, 1);
        }
        assert!(!is_plaintext_sqlite_file(&path));
    }

    #[test]
    fn migrate_plaintext_via_sqlcipher_export() {
        let (_dir, path) = temp_db_path();
        {
            let conn = Connection::open(&path).expect("plaintext create");
            conn.execute_batch(
                "CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (42);",
            )
            .expect("ddl");
        }
        assert!(is_plaintext_sqlite_file(&path));
        migrate_plaintext_to_encrypted(&path, &[0xA7u8; 32]).expect("migrate");
        assert!(!is_plaintext_sqlite_file(&path));
        assert!(!migrating_marker_path(&path).exists());
        let conn = open_sqlite_encrypted(&path).expect("open encrypted");
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM t", [], |r| r.get(0))
            .expect("count");
        assert_eq!(n, 1);
        let v: i64 = conn
            .query_row("SELECT id FROM t", [], |r| r.get(0))
            .expect("id");
        assert_eq!(v, 42);
    }

    #[test]
    fn wrong_key_quarantines_encrypted_db_and_keeps_plaintext_bak() {
        let (_dir, path) = temp_db_path();
        {
            let conn = open_with_key(&path, &[0x11u8; 32]).expect("create");
            conn.execute_batch(
                "CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (7);",
            )
            .expect("ddl");
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        let bak = plaintext_backup_path(&path);
        {
            let conn = Connection::open(&bak).expect("bak");
            conn.execute_batch(
                "CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (99);",
            )
            .expect("bak ddl");
        }
        let bak_bytes = std::fs::read(&bak).expect("read bak");
        let err = open_with_key(&path, &[0x22u8; 32]).expect_err("wrong key");
        let msg = err.to_string();
        assert!(
            msg.contains("illisible") || msg.contains("aucune restauration"),
            "{msg}"
        );
        assert!(
            !path.exists(),
            "la base chiffrée ne doit pas rester en place"
        );
        assert!(plaintext_backup_path(&path).is_file());
        assert_eq!(
            std::fs::read(plaintext_backup_path(&path)).unwrap(),
            bak_bytes
        );
        let quarantined = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .find(|n| n.contains(".unreadable-"))
            .expect("fichier unreadable");
        assert!(quarantined.starts_with("rustymail.sqlite3.unreadable-"));
        assert!(!is_plaintext_sqlite_file(
            &path.parent().unwrap().join(&quarantined)
        ));
    }

    #[test]
    fn staging_marker_allows_plaintext_restore() {
        let (_dir, path) = temp_db_path();
        let bak = plaintext_backup_path(&path);
        {
            let conn = Connection::open(&bak).expect("bak");
            conn.execute_batch(
                "CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (5);",
            )
            .expect("ddl");
        }
        std::fs::write(&path, b"not-a-sqlite-database").expect("garbage");
        std::fs::write(migrating_marker_path(&path), b"1").expect("marker");
        let conn = open_with_key(&path, &[0xA7u8; 32]).expect("restore");
        let v: i64 = conn
            .query_row("SELECT id FROM t", [], |r| r.get(0))
            .expect("id");
        assert_eq!(v, 5);
        assert!(!migrating_marker_path(&path).exists());
        assert!(
            bak.is_file(),
            "le .bak en clair reste jusqu'au 2e lancement"
        );
        assert!(!is_plaintext_sqlite_file(&path));
    }

    #[test]
    fn plaintext_bak_removed_on_second_verified_open() {
        let (_dir, path) = temp_db_path();
        {
            let conn = crate::open_sqlite_migrated(&path).expect("first");
            drop(conn);
        }
        let bak = plaintext_backup_path(&path);
        {
            let mut f = std::fs::File::create(&bak).expect("bak");
            f.write_all(b"SQLite format 3\0plain").expect("write");
        }
        crate::reset_sqlite_migrated_memo_for_tests();
        {
            let conn = crate::open_sqlite_migrated(&path).expect("second launch");
            let n: String = conn
                .query_row(
                    "SELECT value FROM app_meta WHERE key = 'sqlcipher_verified_opens'",
                    [],
                    |r| r.get(0),
                )
                .expect("counter");
            assert_eq!(n, "1");
            assert!(bak.is_file());
        }
        crate::reset_sqlite_migrated_memo_for_tests();
        {
            let _conn = crate::open_sqlite_migrated(&path).expect("third launch");
        }
        assert!(!bak.exists(), "suppression au 2e lancement vérifié");
    }

    #[test]
    fn version_backup_created_once_and_drops_older() {
        let (_dir, path) = temp_db_path();
        {
            let conn = crate::open_sqlite_migrated(&path).expect("migrate");
            conn.execute(
                "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES ('t1', 'a', 'INBOX', 'Sujet', '')",
                [],
            )
            .expect("thread");
            conn.execute(
                "UPDATE app_meta SET value = '0.4.3' WHERE key = 'last_app_version'",
                [],
            )
            .expect("downgrade stamp");
            drop(conn);
        }
        let old = version_backup_path(&path, "0.4.2");
        std::fs::write(&old, b"old-backup").expect("old bak");
        let current = version_backup_path(&path, env!("CARGO_PKG_VERSION"));
        let _ = std::fs::remove_file(&current);
        crate::reset_sqlite_migrated_memo_for_tests();
        {
            let conn = crate::open_sqlite_migrated(&path).expect("upgrade open");
            let subject: String = conn
                .query_row("SELECT subject FROM threads WHERE id = 't1'", [], |r| {
                    r.get(0)
                })
                .expect("row kept");
            assert_eq!(subject, "Sujet");
            let ver: String = conn
                .query_row(
                    "SELECT value FROM app_meta WHERE key = 'last_app_version'",
                    [],
                    |r| r.get(0),
                )
                .expect("version");
            assert_eq!(ver, env!("CARGO_PKG_VERSION"));
        }
        assert!(current.is_file(), "pre-<version>.bak créé");
        assert!(!old.exists(), "ancienne sauvegarde supprimée");
        let bytes = std::fs::read(&current).expect("bak bytes");
        crate::reset_sqlite_migrated_memo_for_tests();
        {
            let _conn = crate::open_sqlite_migrated(&path).expect("same version");
        }
        let bytes2 = std::fs::read(&current).expect("bak bytes again");
        assert_eq!(bytes, bytes2, "pas de nouvelle copie à version identique");
        let version_baks = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .filter(|e| {
                is_version_backup_name(&e.file_name().to_string_lossy(), "rustymail.sqlite3")
            })
            .count();
        assert_eq!(version_baks, 1);
    }
}
