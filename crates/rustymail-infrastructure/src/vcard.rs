//! Import / export vCard 3.0 (sous-ensemble FN, EMAIL, NOTE, CATEGORIES).

use crate::address_contacts::{list_address_contacts, upsert_manual_contact, AddressContactRow, ManualContactUpsert};
use crate::open_sqlite_migrated;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportVcardResult {
    pub imported: u32,
    pub skipped_duplicates: u32,
    pub errors: Vec<String>,
}

fn escape_vcard_value(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
        .replace('\r', "")
}

fn fold_vcard_line(line: &str) -> String {
    let mut out = String::new();
    let bytes = line.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if i == 0 {
            out.push_str(&line[i..(i + 75).min(bytes.len())]);
            i = (i + 75).min(bytes.len());
        } else {
            out.push('\n');
            out.push(' ');
            let end = (i + 74).min(bytes.len());
            out.push_str(&line[i..end]);
            i = end;
        }
    }
    out
}

pub fn contact_to_vcard(row: &AddressContactRow) -> String {
    let name = if row.display_name.trim().is_empty() {
        row.email.clone()
    } else {
        row.display_name.clone()
    };
    let mut lines = vec![
        "BEGIN:VCARD".to_string(),
        "VERSION:3.0".to_string(),
        format!("FN:{}", escape_vcard_value(&name)),
        format!("EMAIL;TYPE=INTERNET:{}", escape_vcard_value(&row.email)),
    ];
    if !row.notes.trim().is_empty() {
        lines.push(format!("NOTE:{}", escape_vcard_value(row.notes.trim())));
    }
    if row.is_favorite {
        lines.push("CATEGORIES:RustyMail-Favorite".to_string());
    }
    lines.push("END:VCARD".to_string());
    lines.join("\r\n")
}

pub fn export_address_contacts_vcard(
    db_path: &Path,
    account_id: &str,
    global_scope: bool,
) -> Result<String, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Ok(String::new());
    }
    let mut all: Vec<AddressContactRow> = Vec::new();
    let mut offset = 0u32;
    loop {
        let page = if global_scope {
            crate::contact_detail::list_address_contacts_scoped(
                db_path,
                account_id,
                "",
                offset,
                100,
                true,
            )?
            .items
            .into_iter()
            .map(|i| i.row)
            .collect::<Vec<_>>()
        } else {
            list_address_contacts(db_path, account_id, "", offset, 100)?.items
        };
        if page.is_empty() {
            break;
        }
        let n = page.len() as u32;
        all.extend(page);
        offset += n;
        if n < 100 {
            break;
        }
    }
    let body: String = all
        .iter()
        .map(|r| fold_vcard_line(&contact_to_vcard(r)))
        .collect::<Vec<_>>()
        .join("\r\n");
    Ok(body)
}

fn unfold_vcard_lines(content: &str) -> Vec<String> {
    let mut logical: Vec<String> = Vec::new();
    for raw in content.lines() {
        let line = raw.trim_end();
        if line.is_empty() {
            continue;
        }
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = logical.last_mut() {
                last.push_str(line.trim_start());
            }
        } else {
            logical.push(line.to_string());
        }
    }
    logical
}

fn parse_vcard_block(lines: &[String]) -> Option<(String, String, String, bool)> {
    let mut email = String::new();
    let mut name = String::new();
    let mut notes = String::new();
    let mut favorite = false;
    for line in lines {
        let upper = line.to_ascii_uppercase();
        if upper.starts_with("EMAIL") {
            let val = line.split_once(':').map(|(_, v)| v).unwrap_or("").trim();
            if !val.is_empty() {
                email = val.to_ascii_lowercase();
            }
        } else if upper.starts_with("FN:") {
            name = line.split_once(':').map(|(_, v)| v).unwrap_or("").trim().to_string();
        } else if upper.starts_with("NOTE:") {
            notes = line.split_once(':').map(|(_, v)| v).unwrap_or("").trim().to_string();
        } else if upper.starts_with("CATEGORIES:") {
            let val = line.split_once(':').map(|(_, v)| v).unwrap_or("").to_ascii_lowercase();
            if val.contains("rustymail-favorite") {
                favorite = true;
            }
        }
    }
    if email.contains('@') {
        Some((email, name, notes, favorite))
    } else {
        None
    }
}

pub fn parse_vcards(content: &str) -> Vec<(String, String, String, bool)> {
    let logical = unfold_vcard_lines(content);
    let mut blocks: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();
    for line in logical {
        let u = line.to_ascii_uppercase();
        if u == "BEGIN:VCARD" {
            current.clear();
            current.push(line);
        } else if u == "END:VCARD" {
            if !current.is_empty() {
                current.push(line);
                blocks.push(current.clone());
                current.clear();
            }
        } else if !current.is_empty() {
            current.push(line);
        }
    }
    blocks
        .iter()
        .filter_map(|b| parse_vcard_block(b))
        .collect()
}

pub fn import_address_contacts_vcard(
    db_path: &Path,
    account_id: &str,
    content: &str,
    merge: bool,
) -> Result<ImportVcardResult, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Err("account_id requis".into());
    }
    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let parsed = parse_vcards(content);
    let mut imported = 0u32;
    let mut skipped = 0u32;
    let mut errors = Vec::new();

    for (email, name, notes, favorite) in parsed {
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM address_contacts WHERE account_id = ?1 AND email = ?2 LIMIT 1",
                rusqlite::params![account_id, email],
                |_| Ok(()),
            )
            .is_ok();
        if exists && !merge {
            skipped += 1;
            continue;
        }
        match upsert_manual_contact(
            db_path,
            ManualContactUpsert {
                account_id: account_id.to_string(),
                email: email.clone(),
                display_name: name,
                notes,
                is_favorite: favorite,
            },
        ) {
            Ok(_) => imported += 1,
            Err(e) => errors.push(format!("{email}: {e}")),
        }
    }
    Ok(ImportVcardResult {
        imported,
        skipped_duplicates: skipped,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::address_contacts::upsert_manual_contact;
    use tempfile::tempdir;

    #[test]
    fn vcard_round_trip() {
        let dir = tempdir().unwrap();
        let db = dir.path().join("t.db");
        let acc = "acc1";
        upsert_manual_contact(
            &db,
            ManualContactUpsert {
                account_id: acc.into(),
                email: "alice@example.com".into(),
                display_name: "Alice".into(),
                notes: "note test".into(),
                is_favorite: true,
            },
        )
        .unwrap();
        let vcf = export_address_contacts_vcard(&db, acc, false).unwrap();
        assert!(vcf.contains("alice@example.com"));
        let dir2 = tempdir().unwrap();
        let db2 = dir2.path().join("t2.db");
        let res = import_address_contacts_vcard(&db2, acc, &vcf, true).unwrap();
        assert_eq!(res.imported, 1);
    }
}
