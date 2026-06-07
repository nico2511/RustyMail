//! Lightweight writing-language detection (no ML model).

use whatlang::Lang;

/// Returns ISO 639-1 code or `"und"` when unknown / too short.
pub fn detect_language_iso639_1(text: &str) -> String {
    let t = text.trim();
    if t.len() < 16 {
        return "und".to_string();
    }
    match whatlang::detect(t) {
        Some(info) => lang_to_iso639_1(info.lang()),
        None => "und".to_string(),
    }
}

fn lang_to_iso639_1(lang: Lang) -> String {
    match lang {
        Lang::Eng => "en",
        Lang::Fra => "fr",
        Lang::Spa => "es",
        Lang::Deu => "de",
        Lang::Ita => "it",
        Lang::Por => "pt",
        Lang::Rus => "ru",
        Lang::Jpn => "ja",
        Lang::Kor => "ko",
        Lang::Cmn => "zh",
        Lang::Nld => "nl",
        Lang::Pol => "pl",
        Lang::Swe => "sv",
        Lang::Dan => "da",
        Lang::Fin => "fi",
        Lang::Ell => "el",
        Lang::Heb => "he",
        Lang::Ara => "ar",
        Lang::Hin => "hi",
        Lang::Tur => "tr",
        Lang::Ukr => "uk",
        Lang::Bul => "bg",
        Lang::Ces => "cs",
        Lang::Nob => "nb",
        Lang::Epo => "eo",
        Lang::Cat => "ca",
        Lang::Ron => "ro",
        Lang::Hun => "hu",
        Lang::Ind => "id",
        Lang::Vie => "vi",
        Lang::Tha => "th",
        Lang::Slk => "sk",
        Lang::Slv => "sl",
        Lang::Hrv => "hr",
        Lang::Srp => "sr",
        Lang::Lav => "lv",
        Lang::Lit => "lt",
        Lang::Est => "et",
        Lang::Cym => "cy",
        Lang::Bel => "be",
        Lang::Kat => "ka",
        _ => "und",
    }
    .to_string()
}
