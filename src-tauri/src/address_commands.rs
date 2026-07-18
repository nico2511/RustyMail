//! Carnet d’adresses — recherche, réindexation, contacts manuels.

use rustymail_infrastructure::{
    count_address_contacts_scoped, delete_manual_contact, export_address_contacts_vcard,
    get_address_contact_detail, import_address_contacts_vcard, list_address_contacts,
    list_address_contacts_scoped, list_sender_emails_for_domain, load_app_prefs,
    parse_header_address_list, reindex_address_contacts, search_address_contacts_scoped,
    upsert_manual_contact, AddressContactHit, AddressContactRow, ContactDetailDto,
    ImportVcardResult, ListAddressContactsResult, ListAddressContactsScopedResult,
    ManualContactUpsert,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use tauri::State;

use crate::ipc_guard;
use crate::AppPaths;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReindexAddressContactsResult {
    pub messages_processed: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertManualContactPayload {
    pub account_id: String,
    pub email: String,
    pub display_name: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub is_favorite: bool,
}

#[tauri::command]
pub fn search_address_contacts_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<AddressContactHit>, String> {
    ipc_guard::validate_account_id(&account_id)?;
    let limit = limit.unwrap_or(12).clamp(1, 50);
    let prefs = load_app_prefs(&paths.prefs_path);
    let global = prefs.general.address_book_global_scope;
    search_address_contacts_scoped(
        paths.db_path.as_path(),
        account_id.trim(),
        query.trim(),
        limit,
        global,
    )
}

#[tauri::command]
pub async fn reindex_address_contacts_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
) -> Result<ReindexAddressContactsResult, String> {
    ipc_guard::validate_account_id(&account_id)?;
    let paths = Clone::clone(&*paths);
    let account_id = account_id.trim().to_string();
    let n = tauri::async_runtime::spawn_blocking(move || {
        reindex_address_contacts(paths.db_path.as_path(), &account_id)
    })
    .await
    .map_err(|e| format!("reindex join: {e}"))??;
    Ok(ReindexAddressContactsResult {
        messages_processed: n,
    })
}

#[tauri::command]
pub fn parse_address_list_cmd(raw: String) -> Vec<rustymail_domain::EmailAddress> {
    parse_header_address_list(raw.trim())
}

#[tauri::command]
pub fn list_address_contacts_scoped_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    query: String,
    offset: Option<u32>,
    limit: Option<u32>,
    global_scope: Option<bool>,
) -> Result<ListAddressContactsScopedResult, String> {
    ipc_guard::validate_account_id(&account_id)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    let global = global_scope.unwrap_or(prefs.general.address_book_global_scope);
    list_address_contacts_scoped(
        paths.db_path.as_path(),
        account_id.trim(),
        query.trim(),
        offset.unwrap_or(0),
        limit.unwrap_or(50).clamp(1, 100),
        global,
    )
}

#[tauri::command]
pub fn count_address_contacts_scoped_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    global_scope: Option<bool>,
) -> Result<u32, String> {
    ipc_guard::validate_account_id(&account_id)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    let global = global_scope.unwrap_or(prefs.general.address_book_global_scope);
    count_address_contacts_scoped(paths.db_path.as_path(), account_id.trim(), global)
}

#[tauri::command]
pub fn list_sender_emails_for_domain_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    domain: String,
    global_scope: Option<bool>,
) -> Result<Vec<String>, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_domain_label(&domain)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    let global = global_scope.unwrap_or(prefs.general.address_book_global_scope);
    list_sender_emails_for_domain(
        paths.db_path.as_path(),
        account_id.trim(),
        domain.trim(),
        global,
    )
}

#[tauri::command]
pub fn get_address_contact_detail_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    email: String,
    global_scope: Option<bool>,
) -> Result<ContactDetailDto, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_contact_email(&email)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    let global = global_scope.unwrap_or(prefs.general.address_book_global_scope);
    get_address_contact_detail(
        paths.db_path.as_path(),
        account_id.trim(),
        email.trim(),
        global,
    )
}

#[tauri::command]
pub fn list_address_contacts_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    query: String,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<ListAddressContactsResult, String> {
    ipc_guard::validate_account_id(&account_id)?;
    list_address_contacts(
        paths.db_path.as_path(),
        account_id.trim(),
        query.trim(),
        offset.unwrap_or(0),
        limit.unwrap_or(40).clamp(1, 100),
    )
}

#[tauri::command]
pub fn upsert_manual_contact_cmd(
    paths: State<'_, AppPaths>,
    payload: UpsertManualContactPayload,
) -> Result<AddressContactRow, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    ipc_guard::validate_contact_email(&payload.email)?;
    upsert_manual_contact(
        paths.db_path.as_path(),
        ManualContactUpsert {
            account_id: payload.account_id,
            email: payload.email,
            display_name: payload.display_name,
            notes: payload.notes,
            is_favorite: payload.is_favorite,
        },
    )
}

#[tauri::command]
pub fn delete_manual_contact_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    email: String,
) -> Result<bool, String> {
    ipc_guard::validate_account_id(&account_id)?;
    ipc_guard::validate_contact_email(&email)?;
    delete_manual_contact(paths.db_path.as_path(), account_id.trim(), email.trim())
}

#[tauri::command]
pub fn export_address_contacts_vcard_cmd(
    paths: State<'_, AppPaths>,
    account_id: String,
    global_scope: Option<bool>,
) -> Result<String, String> {
    ipc_guard::validate_account_id(&account_id)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    let global = global_scope.unwrap_or(prefs.general.address_book_global_scope);
    let content =
        export_address_contacts_vcard(paths.db_path.as_path(), account_id.trim(), global)?;
    #[cfg(test)]
    return Ok(content);
    #[cfg(not(test))]
    {
        let path = rfd::FileDialog::new()
            .set_title("Exporter le carnet vCard")
            .add_filter("vCard", &["vcf"])
            .set_file_name("rustymail-contacts.vcf")
            .save_file();
        let Some(path) = path else {
            return Err("export annulé".into());
        };
        let mut f = fs::File::create(&path).map_err(|e| e.to_string())?;
        f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        Ok(path.display().to_string())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportVcardPayload {
    pub account_id: String,
    #[serde(default)]
    pub merge: bool,
    pub content: Option<String>,
}

#[tauri::command]
pub fn import_address_contacts_vcard_cmd(
    paths: State<'_, AppPaths>,
    payload: ImportVcardPayload,
) -> Result<ImportVcardResult, String> {
    ipc_guard::validate_account_id(&payload.account_id)?;
    let content = if let Some(c) = payload.content.filter(|s| !s.trim().is_empty()) {
        c
    } else {
        #[cfg(test)]
        return Err("content requis en test".into());
        #[cfg(not(test))]
        {
            let path = rfd::FileDialog::new()
                .set_title("Importer vCard")
                .add_filter("vCard", &["vcf"])
                .pick_file();
            let Some(path) = path else {
                return Err("import annulé".into());
            };
            fs::read_to_string(&path).map_err(|e| e.to_string())?
        }
    };
    import_address_contacts_vcard(
        paths.db_path.as_path(),
        payload.account_id.trim(),
        content.as_str(),
        payload.merge,
    )
}
