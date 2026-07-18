//! Chemins d'archivage hiérarchique `Archive/{YYYY}/{MM-mois}/`.

use chrono::{DateTime, Datelike, Utc};
use rustymail_domain::ArchiveLayout;

pub fn month_label(locale: &str, month: u32) -> String {
    let loc = locale.trim().to_ascii_lowercase();
    let names_fr = [
        "janvier",
        "fevrier",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "aout",
        "septembre",
        "octobre",
        "novembre",
        "decembre",
    ];
    let names_en = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ];
    let idx = month.saturating_sub(1).min(11) as usize;
    if loc.starts_with("fr") {
        names_fr[idx].to_string()
    } else {
        names_en[idx].to_string()
    }
}

pub fn archive_mailbox_path(
    archive_root: &str,
    received_at_rfc3339: &str,
    locale: &str,
) -> Option<String> {
    let dt: DateTime<Utc> = DateTime::parse_from_rfc3339(received_at_rfc3339)
        .ok()
        .map(|d| d.with_timezone(&Utc))
        .or_else(|| received_at_rfc3339.parse::<DateTime<Utc>>().ok())?;
    let year = dt.format("%Y").to_string();
    let month_num = dt.format("%m").to_string();
    let month_name = month_label(locale, dt.month());
    let root = archive_root.trim().trim_matches('/');
    if root.is_empty() {
        return None;
    }
    Some(format!("{root}/{year}/{month_num}-{month_name}"))
}

pub fn resolve_archive_target(
    layout: ArchiveLayout,
    archive_root: &str,
    locale: &str,
    received_at: &str,
    flat_fallback: &str,
) -> String {
    match layout {
        ArchiveLayout::Flat => flat_fallback.to_string(),
        ArchiveLayout::Hierarchical => archive_mailbox_path(archive_root, received_at, locale)
            .unwrap_or_else(|| flat_fallback.to_string()),
    }
}

pub fn parse_archive_layout(s: &str) -> ArchiveLayout {
    if s.eq_ignore_ascii_case("flat") {
        ArchiveLayout::Flat
    } else {
        ArchiveLayout::Hierarchical
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hierarchical_fr() {
        let p = archive_mailbox_path("Archive", "2024-05-15T10:00:00Z", "fr").unwrap();
        assert_eq!(p, "Archive/2024/05-mai");
    }
}
