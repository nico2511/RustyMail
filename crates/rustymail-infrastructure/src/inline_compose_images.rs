//! Images `data:` collées dans le compositeur TipTap.
//!
//! Elles sortent du corps avant le plafond IPC (`draft.markdownBody`, 512 Kio)
//! et partent en pièces `multipart/related` (`cid:`). Le texte du message
//! reste soumis au plafond : un corps vraiment trop long est encore refusé.

use std::collections::HashMap;

use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};

/// Une image inline, octets déjà décodés. `content_id` est sans `<>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InlineImagePart {
    pub content_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

/// Aligné sur l’affichage local des images `cid:` (webview).
pub(crate) const MAX_INLINE_PART_BYTES: usize = 8 * 1024 * 1024;
/// ~25 Mo MIME après base64, même ordre de grandeur que le budget des pièces jointes.
pub(crate) const MAX_INLINE_PARTS_TOTAL_BYTES: usize = 18 * 1024 * 1024;
pub(crate) const MAX_INLINE_PART_COUNT: usize = 40;

#[derive(Clone, Copy)]
pub(crate) struct InlineImageLimits {
    pub max_bytes_per_image: usize,
    pub max_bytes_total: usize,
    pub max_count: usize,
}

impl InlineImageLimits {
    pub(crate) const fn production() -> Self {
        Self {
            max_bytes_per_image: MAX_INLINE_PART_BYTES,
            max_bytes_total: MAX_INLINE_PARTS_TOTAL_BYTES,
            max_count: MAX_INLINE_PART_COUNT,
        }
    }
}

/// Remplace les images inline (`src="data:image/…"` ou `](data:image/…)`) par `cid:`.
/// Le corps sans image n’est pas modifié.
pub fn extract_inline_data_images(body: &mut String) -> Result<Vec<InlineImagePart>, String> {
    let (rewritten, parts) =
        extract_inline_data_images_limited(body, InlineImageLimits::production())?;
    if rewritten != *body {
        *body = rewritten;
    }
    Ok(parts)
}

pub(crate) fn extract_inline_data_images_limited(
    body: &str,
    limits: InlineImageLimits,
) -> Result<(String, Vec<InlineImagePart>), String> {
    let bytes = body.as_bytes();
    let mut i = 0usize;
    let mut parts: Vec<InlineImagePart> = Vec::new();
    let mut seen: HashMap<[u8; 32], usize> = HashMap::new();
    let mut total = 0usize;
    let mut replacements: Vec<(usize, usize, String)> = Vec::new();

    while let Some(start) = find_data_image(bytes, i) {
        if !is_image_reference(body, start) {
            i = start + 1;
            continue;
        }
        match parse_image_data_url(body, start, limits)? {
            ParsedImage::Skip { resume } => {
                i = resume;
            }
            ParsedImage::Image { end, mime, bytes } => {
                let digest = sha256(&bytes);
                let cid = if let Some(&idx) = seen.get(&digest) {
                    parts[idx].content_id.clone()
                } else {
                    if parts.len() >= limits.max_count {
                        return Err(format!(
                            "draft.markdownBody: trop d’images intégrées (max {}).",
                            limits.max_count
                        ));
                    }
                    if total.saturating_add(bytes.len()) > limits.max_bytes_total {
                        return Err(format!(
                            "draft.markdownBody: images intégrées trop volumineuses (max {} octets).",
                            limits.max_bytes_total
                        ));
                    }
                    total += bytes.len();
                    let cid = format!("img{}-{}", parts.len() + 1, hex::encode(&digest[..8]));
                    let file_name = format!("image-{}.{}", parts.len() + 1, extension_for(&mime));
                    seen.insert(digest, parts.len());
                    parts.push(InlineImagePart {
                        content_id: cid.clone(),
                        file_name,
                        mime_type: mime,
                        bytes,
                    });
                    cid
                };
                replacements.push((start, end, cid));
                i = end;
            }
        }
    }

    if replacements.is_empty() {
        return Ok((body.to_string(), parts));
    }

    let mut out = String::with_capacity(body.len().min(64 * 1024));
    let mut last = 0usize;
    for (start, end, cid) in replacements {
        out.push_str(&body[last..start]);
        out.push_str("cid:");
        out.push_str(&cid);
        last = end;
    }
    out.push_str(&body[last..]);
    Ok((out, parts))
}

enum ParsedImage {
    Skip {
        resume: usize,
    },
    Image {
        end: usize,
        mime: String,
        bytes: Vec<u8>,
    },
}

fn parse_image_data_url(
    body: &str,
    start: usize,
    limits: InlineImageLimits,
) -> Result<ParsedImage, String> {
    const PREFIX: &str = "data:image/";
    let after = &body[start + PREFIX.len()..];
    let subtype_len = after
        .find(|c: char| !c.is_ascii_alphanumeric() && c != '+' && c != '-' && c != '.')
        .unwrap_or(after.len());
    let subtype = after[..subtype_len].to_ascii_lowercase();
    let Some(mime) = mime_for_subtype(&subtype) else {
        return Ok(ParsedImage::Skip {
            resume: start + PREFIX.len(),
        });
    };
    let header = &after[subtype_len..];
    let Some(comma_rel) = header.find(',') else {
        return Ok(ParsedImage::Skip {
            resume: start + PREFIX.len(),
        });
    };
    let params = &header[..comma_rel];
    if !params
        .to_ascii_lowercase()
        .split(';')
        .any(|part| part.trim() == "base64")
    {
        return Ok(ParsedImage::Skip {
            resume: start + PREFIX.len(),
        });
    }
    let payload_start = start + PREFIX.len() + subtype_len + comma_rel + 1;
    let payload_end = scan_base64_end(body.as_bytes(), payload_start);
    let cleaned: String = body[payload_start..payload_end]
        .chars()
        .filter(|c| *c != '\n' && *c != '\r')
        .collect();
    if cleaned.is_empty() {
        return Ok(ParsedImage::Skip {
            resume: start + PREFIX.len(),
        });
    }
    let max_b64 = limits
        .max_bytes_per_image
        .saturating_mul(4)
        .saturating_div(3)
        .saturating_add(8);
    if cleaned.len() > max_b64 {
        return Err(format!(
            "draft.markdownBody: image intégrée trop volumineuse (max {} octets).",
            limits.max_bytes_per_image
        ));
    }
    let decoded = STANDARD
        .decode(cleaned.as_bytes())
        .map_err(|_| "draft.markdownBody: image intégrée illisible.".to_string())?;
    if decoded.len() > limits.max_bytes_per_image {
        return Err(format!(
            "draft.markdownBody: image intégrée trop volumineuse (max {} octets).",
            limits.max_bytes_per_image
        ));
    }
    if !magic_matches(&mime, &decoded) {
        return Err("draft.markdownBody: image intégrée illisible.".to_string());
    }
    Ok(ParsedImage::Image {
        end: payload_end,
        mime,
        bytes: decoded,
    })
}

fn mime_for_subtype(subtype: &str) -> Option<String> {
    match subtype {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "gif" => Some("image/gif".to_string()),
        "webp" => Some("image/webp".to_string()),
        "bmp" => Some("image/bmp".to_string()),
        _ => None,
    }
}

fn extension_for(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "png",
    }
}

fn magic_matches(mime: &str, bytes: &[u8]) -> bool {
    match mime {
        "image/png" => bytes.starts_with(&[0x89, b'P', b'N', b'G']),
        "image/jpeg" => {
            bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
        }
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        "image/bmp" => bytes.starts_with(b"BM"),
        _ => false,
    }
}

fn find_data_image(bytes: &[u8], from: usize) -> Option<usize> {
    const NEEDLE: &[u8] = b"data:image/";
    let mut i = from;
    while i + NEEDLE.len() <= bytes.len() {
        if bytes[i..i + NEEDLE.len()].eq_ignore_ascii_case(NEEDLE) {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn is_image_reference(body: &str, start: usize) -> bool {
    let before = body[..start].trim_end();
    attr_boundary(before, "src=\"")
        || attr_boundary(before, "src='")
        || attr_boundary(before, "src=")
        || before.ends_with("](")
        || before.ends_with("](<")
}

/// `src` must not be the tail of a longer attribute name (`notsrc=`).
fn attr_boundary(value: &str, suffix: &str) -> bool {
    let value = value.as_bytes();
    let suffix = suffix.as_bytes();
    if value.len() < suffix.len()
        || !value[value.len() - suffix.len()..].eq_ignore_ascii_case(suffix)
    {
        return false;
    }
    if value.len() == suffix.len() {
        return true;
    }
    !value[value.len() - suffix.len() - 1].is_ascii_alphanumeric()
}

fn scan_base64_end(bytes: &[u8], start: usize) -> usize {
    let mut i = start;
    while i < bytes.len() && is_base64_byte(bytes[i]) {
        i += 1;
    }
    i
}

fn is_base64_byte(c: u8) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, b'+' | b'/' | b'=' | b'\n' | b'\r')
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustymail_domain::compose_html::COMPOSE_HTML_MARK;

    const PNG_1X1_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    fn png_bytes() -> Vec<u8> {
        STANDARD.decode(PNG_1X1_B64).unwrap()
    }

    fn tight() -> InlineImageLimits {
        InlineImageLimits {
            max_bytes_per_image: 64,
            max_bytes_total: 100,
            max_count: 2,
        }
    }

    #[test]
    fn plain_text_is_unchanged() {
        let mut body = "Bonjour\n\n**gras**\n".to_string();
        let parts = extract_inline_data_images(&mut body).unwrap();
        assert!(parts.is_empty());
        assert_eq!(body, "Bonjour\n\n**gras**\n");
    }

    #[test]
    fn prose_mention_of_a_data_url_is_not_extracted() {
        let mut body = "Voir data:image/png;base64,AAAA dans le texte".to_string();
        let parts = extract_inline_data_images(&mut body).unwrap();
        assert!(parts.is_empty());
        assert!(body.contains("data:image/png"));
    }

    #[test]
    fn html_data_url_over_the_ipc_cap_becomes_a_cid() {
        let mut pixels = png_bytes();
        pixels.resize(400_000, 0);
        let b64 = STANDARD.encode(&pixels);
        let mut body = format!(
            r#"{COMPOSE_HTML_MARK}<p>Bonjour <img src="data:image/png;base64,{b64}" alt="capture"> suite</p>"#
        );
        assert!(
            body.len() > 524_288,
            "fixture should exceed the historical cap, got {}",
            body.len()
        );
        let parts = extract_inline_data_images(&mut body).unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].bytes, pixels);
        assert_eq!(parts[0].mime_type, "image/png");
        assert!(body.len() < 524_288, "rewritten body still {}", body.len());
        assert!(!body.contains("data:image"));
        assert!(body.contains(&format!("cid:{}", parts[0].content_id)));
        assert!(body.contains("Bonjour"));
        assert!(body.contains("suite"));
        assert!(body.starts_with(COMPOSE_HTML_MARK));
    }

    #[test]
    fn markdown_image_and_duplicate_share_one_part() {
        let b64 = PNG_1X1_B64;
        let mut body =
            format!("A ![cap](data:image/png;base64,{b64}) B ![cap](data:image/png;base64,{b64})");
        let parts = extract_inline_data_images(&mut body).unwrap();
        assert_eq!(parts.len(), 1);
        let cid = &parts[0].content_id;
        assert_eq!(body.matches(&format!("cid:{cid}")).count(), 2);
        assert!(!body.contains("base64"));
    }

    #[test]
    fn oversized_image_keeps_a_specific_error() {
        let mut pixels = png_bytes();
        pixels.resize(80, 0);
        let b64 = STANDARD.encode(&pixels);
        let body = format!(r#"<img src="data:image/png;base64,{b64}" alt="x">"#);
        let err = extract_inline_data_images_limited(&body, tight()).unwrap_err();
        assert!(err.contains("image intégrée trop volumineuse"), "{err}");
        assert!(err.contains("draft.markdownBody"), "{err}");
    }

    #[test]
    fn total_and_count_limits_are_explicit() {
        let png = STANDARD.encode(png_bytes());
        let jpeg = STANDARD.encode([0xFF, 0xD8, 0xFF, 0xD9]);
        let body = format!(
            r#"<img src="data:image/png;base64,{png}"><img src="data:image/jpeg;base64,{jpeg}">"#
        );
        let err = extract_inline_data_images_limited(
            &body,
            InlineImageLimits {
                max_bytes_per_image: 1024,
                max_bytes_total: 10,
                max_count: 4,
            },
        )
        .unwrap_err();
        assert!(err.contains("images intégrées trop volumineuses"), "{err}");

        let err = extract_inline_data_images_limited(
            &body,
            InlineImageLimits {
                max_bytes_per_image: 1024,
                max_bytes_total: 1024,
                max_count: 1,
            },
        )
        .unwrap_err();
        assert!(err.contains("trop d’images intégrées"), "{err}");
    }

    #[test]
    fn unreadable_payload_is_rejected() {
        let body = r#"<img src="data:image/png;base64,AAAA" alt="x">"#;
        let err =
            extract_inline_data_images_limited(body, InlineImageLimits::production()).unwrap_err();
        assert!(err.contains("image intégrée illisible"), "{err}");
    }

    #[test]
    fn svg_data_url_is_left_in_place() {
        let mut body = r#"<img src="data:image/svg+xml;base64,AAAA" alt="x">"#.to_string();
        let parts = extract_inline_data_images(&mut body).unwrap();
        assert!(parts.is_empty());
        assert!(body.contains("data:image/svg"));
    }
}
