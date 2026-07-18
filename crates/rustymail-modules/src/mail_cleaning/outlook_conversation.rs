//! Rapport hiérarchique des fils Outlook (transferts / réponses citées).

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use ego_tree::NodeId;
use regex::Regex;
use scraper::{ElementRef, Html, Node, Selector};

use super::dom::{detach_nodes, element_visible_mass, escape_html_text, visible_char_count};

pub struct ConversationReport {
    pub html: String,
    pub plain_text: String,
}

#[derive(Debug, Default, Clone)]
struct Participant {
    name: String,
    email: String,
}

#[derive(Debug, Default, Clone)]
struct Envelope {
    from: Vec<Participant>,
    to: Vec<Participant>,
    cc: Vec<Participant>,
    bcc: Vec<Participant>,
    sent: String,
    subject: String,
}

struct Turn {
    envelope: Envelope,
    body_html: String,
    body_text: String,
}

static SEL_SIGNATURE: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("#Signature, #signature, #x_Signature, #x_signature")
        .expect("outlook signature selector")
});

static SEL_FWD_HEADER: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("#divRplyFwdMsg, #x_divRplyFwdMsg").expect("outlook forward header selector")
});

static SEL_INLINE_QUOTE_BLOCKS: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("div, p, blockquote").expect("inline quote blocks selector"));

static SEL_COMPOSE_JUNK: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("#appendonsend, [id*='appendonsend'], [id*='LSI_marker'], .elementToProof")
        .expect("outlook compose junk selector")
});

static RE_OUTLOOK_INLINE_QUOTE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)(?:de\s*:|from\s*:|-----original message-----).*?(?:envoy[ée]\s*:|sent\s*:).*?(?:objet\s*:|subject\s*:)",
    )
    .expect("outlook inline quote header regex")
});

static RE_ENV_FROM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)(?:de|from)\s*:\s*(.*?)(?:envoy[ée]|envoye|sent)\s*:")
        .expect("env from regex")
});

static RE_ENV_SENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)(?:envoy[ée]|envoye|sent)\s*:\s*(.*?)(?:(?:à|to)\s*:|(?:cc|cci|bcc)\s*:|(?:objet|subject)\s*:)",
    )
    .expect("env sent regex")
});

static RE_ENV_TO: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)(?:à|to)\s*:\s*(.*?)(?:cc|cci|bcc|objet|subject)\s*:").expect("env to regex")
});

static RE_ENV_CC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)cc\s*:\s*(.*?)(?:cci|bcc|objet|subject)\s*:").expect("env cc regex")
});

static RE_ENV_BCC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)(?:cci|bcc)\s*:\s*(.*?)(?:objet|subject)\s*:").expect("env bcc regex")
});

static RE_ENV_SUBJECT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)(?:objet|subject)\s*:\s*(.+)").expect("env subject regex"));

static RE_SUBJECT_BODY_SPLIT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)^((?:(?:re|tr|fw|fwd)\s*:\s*)?.+?)(?:\s+(?:bonjour|hello|hi|dear|nous|je|merci|please|voici|suite)\b)",
    )
    .expect("subject/body split regex")
});

static RE_EMAIL_TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}").expect("email token regex")
});

static RE_HEADER_JUNK_BODY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)^(objet|envoy[ée]|envoye|sent|de|from|à|to|cc)\s*:\s*")
        .expect("header junk body regex")
});

static RE_CHAINED_HEADER_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)^(?:(?:objet|envoy[ée]|envoye|sent|de|from|à|to|cc)\s*:\s*)+")
        .expect("chained header prefix regex")
});

static RE_HTML_AFTER_GT_HEADER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)>\s*(?:(?:objet|envoy[ée]|envoye|sent|de|from|à|to|cc)\s*:\s*)+")
        .expect("html after-gt header regex")
});

/// Construit un rapport conversationnel si ≥2 tranches détectées.
pub fn try_build_report(html: &str) -> Option<ConversationReport> {
    if html.contains("rustymail:amazon-digest")
        || html.contains("rustymail:deblock-digest")
        || html.contains("rustymail:github-digest")
        || html.contains("rm-conversation-report")
    {
        return None;
    }

    let mut doc = Html::parse_fragment(html);
    remove_compose_junk(&mut doc);
    detach_signatures(&mut doc);

    let boundaries = collect_boundaries(&doc);
    if boundaries.is_empty() {
        return None;
    }

    let order = document_order(&doc);
    let boundary_set: HashSet<NodeId> = boundaries.iter().copied().collect();
    let mut slice_nodes = assign_nodes_to_slices(&doc, &order, &boundary_set);
    augment_slices_after_boundaries(&doc, &boundaries, &mut slice_nodes);
    let slice_count = boundaries.len() + 1;
    let mut turns: Vec<Turn> = Vec::with_capacity(slice_count);

    for slice_idx in 0..slice_count {
        let nodes: Vec<NodeId> = slice_nodes
            .iter()
            .filter_map(|(id, idx)| (*idx == slice_idx).then_some(*id))
            .collect();
        let top = content_nodes_for_slice(&doc, &nodes, &boundary_set);
        let raw_html = serialize_nodes(&doc, &top);
        let raw_plain = html_slice_to_plain(&raw_html);

        let mut envelope = if slice_idx == 0 {
            Envelope::default()
        } else {
            boundaries
                .get(slice_idx - 1)
                .and_then(|&id| doc.tree.get(id))
                .and_then(|n| ElementRef::wrap(n))
                .map(|el| parse_envelope(&el.text().collect::<String>()))
                .unwrap_or_default()
        };
        promote_orphan_email_lists(&mut envelope, &raw_plain);

        let mut body_html = sanitize_conversation_body_html(&raw_html);
        let mut body_text = clean_conversation_body_text(&html_slice_to_plain(&body_html));
        if slice_idx > 0 {
            if let Some((embedded_html, embedded_text)) =
                embedded_body_from_boundary(&doc, boundaries.get(slice_idx - 1).copied())
            {
                if !embedded_html.trim().is_empty() {
                    body_html = merge_body_html(&embedded_html, &body_html);
                }
                if !embedded_text.trim().is_empty() {
                    body_text = merge_body_text(&embedded_text, &body_text);
                }
            }
            body_text = strip_leading_inline_headers(&body_text);
            body_text = strip_redundant_envelope_lines_from_body(&body_text, &envelope);
        }

        turns.push(Turn {
            envelope,
            body_html,
            body_text,
        });
    }

    if !should_activate(&boundaries, &turns) {
        return None;
    }

    turns.retain(|t| visible_char_count(&t.body_text) >= 4 && !body_is_header_junk(&t.body_text));
    if turns.is_empty() {
        return None;
    }

    Some(build_report(turns))
}

fn should_activate(boundaries: &[NodeId], turns: &[Turn]) -> bool {
    let substantial: Vec<_> = turns
        .iter()
        .filter(|t| visible_char_count(&t.body_text) >= 4)
        .collect();
    if substantial.is_empty() {
        return false;
    }
    if boundaries.len() >= 2 {
        return true;
    }
    substantial.len() >= 2
}

fn build_report(turns: Vec<Turn>) -> ConversationReport {
    let mut html = String::from("<!-- rustymail:outlook-conversation -->\n");
    html.push_str("<article class=\"rm-conversation-report\">\n");

    let mut plain = String::new();
    for (i, turn) in turns.iter().enumerate() {
        let n = i + 1;
        let cited = i > 0;
        let depth_attr = if cited {
            format!(" data-depth=\"{n}\"")
        } else {
            String::new()
        };
        html.push_str(&format!(
            "<section class=\"rm-conversation-turn{}\" data-turn=\"{n}\"{depth_attr}>\n",
            if cited {
                " rm-conversation-turn--cited"
            } else {
                ""
            }
        ));
        if cited || turn.envelope.has_any() {
            html.push_str("<table class=\"rm-conversation-envelope\"><tbody>\n");
            if !turn.envelope.from.is_empty() {
                html.push_str(&envelope_participants_row("De", &turn.envelope.from));
            }
            if !turn.envelope.sent.is_empty() {
                html.push_str(&envelope_text_row("Envoyé", &turn.envelope.sent));
            }
            if !turn.envelope.to.is_empty() {
                html.push_str(&envelope_participants_row("À", &turn.envelope.to));
            }
            if !turn.envelope.cc.is_empty() {
                html.push_str(&envelope_participants_row("Cc", &turn.envelope.cc));
            }
            if !turn.envelope.bcc.is_empty() {
                html.push_str(&envelope_participants_row("Cci", &turn.envelope.bcc));
            }
            if !turn.envelope.subject.is_empty() {
                html.push_str(&envelope_text_row("Objet", &turn.envelope.subject));
            }
            html.push_str("</tbody></table>\n");
        }
        if !turn.body_html.trim().is_empty() {
            html.push_str("<div class=\"rm-conversation-body\">\n");
            html.push_str(&turn.body_html);
            html.push_str("\n</div>\n");
        }
        html.push_str("</section>\n");

        if i > 0 {
            plain.push_str("\n--- cité ---\n\n");
        }
        plain.push_str(&format!(
            "=== [{n}] {} · {} · {} ===\n",
            format_participants_plain(&turn.envelope.from),
            turn.envelope.sent.trim(),
            turn.envelope.subject.trim()
        ));
        plain.push_str(turn.body_text.trim());
        if !turn.body_text.ends_with('\n') {
            plain.push('\n');
        }
    }
    html.push_str("</article>\n");

    ConversationReport {
        html,
        plain_text: plain.trim().to_string(),
    }
}

fn envelope_text_row(label: &str, value: &str) -> String {
    format!(
        "<tr><th scope=\"row\">{}</th><td>{}</td></tr>\n",
        escape_html_text(label),
        escape_html_text(value.trim())
    )
}

fn envelope_participants_row(label: &str, participants: &[Participant]) -> String {
    format!(
        "<tr><th scope=\"row\">{}</th><td>{}</td></tr>\n",
        escape_html_text(label),
        render_participant_chips(participants)
    )
}

fn render_participant_chips(participants: &[Participant]) -> String {
    if participants.is_empty() {
        return String::new();
    }
    let mut html = String::from("<div class=\"rm-conversation-participants\">");
    for p in participants {
        html.push_str(&render_participant_chip(p));
    }
    html.push_str("</div>");
    html
}

fn render_participant_chip(p: &Participant) -> String {
    let label = escape_html_text(&p.display_label());
    if p.email.is_empty() {
        return format!("<span class=\"rm-conversation-chip\">{label}</span>");
    }
    let title = escape_html_text(&p.email);
    format!("<span class=\"rm-conversation-chip\" title=\"{title}\">{label}</span>")
}

fn format_participants_plain(participants: &[Participant]) -> String {
    participants
        .iter()
        .map(Participant::plain_label)
        .collect::<Vec<_>>()
        .join(", ")
}

impl Participant {
    fn display_label(&self) -> String {
        if !self.name.is_empty() {
            return self.name.clone();
        }
        display_name_from_email(&self.email)
    }

    fn plain_label(&self) -> String {
        if self.email.is_empty() {
            return self.name.clone();
        }
        if self.name.is_empty() || self.name.eq_ignore_ascii_case(&self.email) {
            return self.email.clone();
        }
        format!("{} ({})", self.name, self.email)
    }
}

impl Envelope {
    fn has_any(&self) -> bool {
        !self.from.is_empty()
            || !self.to.is_empty()
            || !self.cc.is_empty()
            || !self.bcc.is_empty()
            || !self.sent.is_empty()
            || !self.subject.is_empty()
    }
}

fn parse_envelope(raw: &str) -> Envelope {
    let text = normalize_probe(raw).replace('\n', " ");
    Envelope {
        from: parse_participants(&capture_env(&RE_ENV_FROM, &text)),
        sent: capture_env(&RE_ENV_SENT, &text),
        to: parse_participants(&capture_env(&RE_ENV_TO, &text)),
        cc: parse_participants(&capture_env(&RE_ENV_CC, &text)),
        bcc: parse_participants(&capture_env(&RE_ENV_BCC, &text)),
        subject: capture_subject(&text),
    }
}

fn capture_subject(text: &str) -> String {
    let raw = RE_ENV_SUBJECT
        .captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .unwrap_or_default();
    trim_subject_value(raw)
}

fn trim_subject_value(raw: &str) -> String {
    let s = normalize_whitespace(raw.trim());
    if s.is_empty() {
        return String::new();
    }
    if let Some(cap) = RE_SUBJECT_BODY_SPLIT.captures(&s) {
        return normalize_whitespace(cap.get(1).map(|m| m.as_str()).unwrap_or(&s));
    }
    if s.len() > 140 {
        return normalize_whitespace(&s[..140]);
    }
    s
}

fn parse_participants(raw: &str) -> Vec<Participant> {
    split_participant_list(raw)
        .into_iter()
        .filter_map(|token| parse_one_participant(&token))
        .collect()
}

fn split_participant_list(raw: &str) -> Vec<String> {
    raw.split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

fn parse_one_participant(raw: &str) -> Option<Participant> {
    let s = decode_html_entities(raw.trim().trim_end_matches(','));
    if s.is_empty() {
        return None;
    }

    if let Some(lt) = s.find('<') {
        if let Some(gt_rel) = s[lt + 1..].find('>') {
            let email = s[lt + 1..lt + 1 + gt_rel].trim().to_ascii_lowercase();
            let name = strip_wrapping_quotes(s[..lt].trim());
            let name = if name.is_empty() {
                display_name_from_email(&email)
            } else {
                name
            };
            if email.contains('@') {
                return Some(Participant { name, email });
            }
        }
    }

    if s.contains('@') && !s.contains(' ') {
        let email = s.to_ascii_lowercase();
        return Some(Participant {
            name: display_name_from_email(&email),
            email,
        });
    }

    Some(Participant {
        name: strip_wrapping_quotes(&s),
        email: String::new(),
    })
}

fn strip_wrapping_quotes(s: &str) -> String {
    let s = s.trim();
    if s.len() >= 2 {
        let bytes = s.as_bytes();
        if (bytes[0] == b'\'' && bytes[s.len() - 1] == b'\'')
            || (bytes[0] == b'"' && bytes[s.len() - 1] == b'"')
        {
            return s[1..s.len() - 1].trim().to_string();
        }
    }
    s.to_string()
}

fn display_name_from_email(email: &str) -> String {
    email
        .split('@')
        .next()
        .unwrap_or(email)
        .replace('.', " ")
        .to_string()
}

fn decode_html_entities(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn capture_env(re: &Regex, text: &str) -> String {
    re.captures(text)
        .and_then(|c| c.get(1))
        .map(|m| normalize_whitespace(m.as_str()))
        .unwrap_or_default()
}

fn normalize_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_probe(s: &str) -> String {
    s.replace('\u{00a0}', " ")
        .replace("&nbsp;", " ")
        .replace('\u{2019}', "'")
        .replace('\r', "\n")
}

fn collect_boundaries(doc: &Html) -> Vec<NodeId> {
    let mut ids: Vec<NodeId> = doc.select(&SEL_FWD_HEADER).map(|e| e.id()).collect();

    let mut inline: Vec<(usize, NodeId)> = doc
        .select(&SEL_INLINE_QUOTE_BLOCKS)
        .filter(|el| !ids.contains(&el.id()))
        .filter(|el| block_looks_like_outlook_inline_quote_header(*el))
        .map(|el| {
            let mass = visible_char_count(&el.text().collect::<String>());
            (mass, el.id())
        })
        .collect();
    inline.sort_by_key(|(mass, _)| *mass);
    for (_, id) in inline {
        if ids.contains(&id) {
            continue;
        }
        if ids.iter().any(|&existing| {
            is_descendant_of(doc, id, existing) || is_descendant_of(doc, existing, id)
        }) {
            continue;
        }
        ids.push(id);
    }

    let order = document_order(doc);
    ids.sort_by_key(|id| order.iter().position(|&x| x == *id).unwrap_or(usize::MAX));
    ids.dedup();
    ids
}

fn block_looks_like_outlook_inline_quote_header(el: ElementRef<'_>) -> bool {
    let text = normalize_probe(&el.text().collect::<String>());
    let mass = visible_char_count(&text);
    if mass == 0 || mass > 9000 {
        return false;
    }
    quote_header_at_block_start(&text)
}

fn block_is_header_only_quote(el: ElementRef<'_>) -> bool {
    let text = normalize_probe(&el.text().collect::<String>());
    quote_header_at_block_start(&text) && visible_char_count(&body_tail_after_headers(&text)) <= 40
}

fn quote_header_at_block_start(text: &str) -> bool {
    let trimmed = text.trim_start();
    if trimmed.is_empty() {
        return false;
    }
    RE_OUTLOOK_INLINE_QUOTE
        .find(trimmed)
        .is_some_and(|m| m.start() == 0)
}

fn body_tail_after_headers(text: &str) -> String {
    let flat = normalize_probe(text).replace('\n', " ");
    let lower = flat.to_ascii_lowercase();
    let Some(idx) = lower.find("objet:").or_else(|| lower.find("subject:")) else {
        return String::new();
    };
    let after = &flat[idx..];
    let raw_subject = RE_ENV_SUBJECT
        .captures(after)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .unwrap_or_default();
    let subject = trim_subject_value(raw_subject);
    if subject.is_empty() {
        return String::new();
    }
    let Some(pos) = after.find(&subject) else {
        return String::new();
    };
    after[pos + subject.len()..].trim().to_string()
}

fn body_is_header_junk(text: &str) -> bool {
    let stripped = strip_inline_header_prefix(text);
    let t = stripped.trim();
    if t.is_empty() {
        return true;
    }
    if RE_OUTLOOK_INLINE_QUOTE.is_match(t) && visible_char_count(t) < 120 {
        return true;
    }
    if RE_HEADER_JUNK_BODY.is_match(t) && visible_char_count(t) < 48 {
        return true;
    }
    false
}

fn promote_orphan_email_lists(envelope: &mut Envelope, raw_plain: &str) {
    if !envelope.to.is_empty() || !envelope.cc.is_empty() {
        return;
    }
    let mut orphans = Vec::new();
    for line in raw_plain.lines() {
        let l = line.trim();
        if looks_like_email_list_line(l) {
            orphans.extend(parse_participants(l));
        }
    }
    if !orphans.is_empty() {
        envelope.to = orphans;
    }
}

fn strip_inline_header_prefix(text: &str) -> String {
    let mut s = text.trim().to_string();
    for _ in 0..8 {
        let stripped = RE_CHAINED_HEADER_PREFIX.replace(&s, "");
        let stripped = stripped.trim_start_matches(['>', ' ', ':']).trim_start();
        if stripped == s.as_str() {
            break;
        }
        s = stripped.to_string();
    }
    s
}

fn clean_conversation_body_text(text: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for line in text.lines() {
        let l = strip_inline_header_prefix(line.trim());
        if l.is_empty() {
            if lines.last().is_some_and(|prev| !prev.is_empty()) {
                lines.push(String::new());
            }
            continue;
        }
        if RE_OUTLOOK_INLINE_QUOTE.is_match(&l) && visible_char_count(&l) < 200 {
            continue;
        }
        if looks_like_email_list_line(&l) {
            continue;
        }
        if RE_HEADER_JUNK_BODY.is_match(&l) && visible_char_count(&l) < 64 {
            continue;
        }
        lines.push(l);
    }
    normalize_plain_lines(&lines.join("\n"))
}

fn strip_leading_inline_headers(text: &str) -> String {
    let mut lines: Vec<String> = text
        .lines()
        .map(|l| strip_inline_header_prefix(l.trim()))
        .collect();
    while !lines.is_empty() {
        let l = lines[0].trim();
        if l.is_empty() {
            lines.remove(0);
            continue;
        }
        if RE_OUTLOOK_INLINE_QUOTE.is_match(l) && visible_char_count(l) < 200 {
            lines.remove(0);
            continue;
        }
        if RE_HEADER_JUNK_BODY.is_match(l) && visible_char_count(l) < 64 {
            lines.remove(0);
            continue;
        }
        break;
    }
    normalize_plain_lines(&lines.join("\n"))
}

fn embedded_body_from_boundary(
    doc: &Html,
    boundary_id: Option<NodeId>,
) -> Option<(String, String)> {
    let id = boundary_id?;
    let el = doc.tree.get(id).and_then(|n| ElementRef::wrap(n))?;
    let probe = normalize_probe(&el.text().collect::<String>());
    let tail = body_tail_after_headers(&probe);
    if visible_char_count(&tail) < 4 {
        return None;
    }
    let html = format!("<p>{}</p>", escape_html_text(&tail));
    Some((html, tail))
}

fn merge_body_html(prefix: &str, suffix: &str) -> String {
    let p = prefix.trim();
    let s = suffix.trim();
    if p.is_empty() {
        return s.to_string();
    }
    if s.is_empty() {
        return p.to_string();
    }
    format!("{p}\n{s}")
}

fn merge_body_text(prefix: &str, suffix: &str) -> String {
    normalize_plain_lines(&format!("{}\n\n{}", prefix.trim(), suffix.trim()))
}

fn strip_redundant_envelope_lines_from_body(text: &str, env: &Envelope) -> String {
    let mut lines: Vec<&str> = text.lines().collect();
    while !lines.is_empty() {
        let l = lines[0].trim();
        if l.is_empty() {
            lines.remove(0);
            continue;
        }
        if line_matches_envelope_sender(l, env) || line_matches_envelope_sent(l, env) {
            lines.remove(0);
            continue;
        }
        if quote_header_at_block_start(l) && visible_char_count(l) < 300 {
            lines.remove(0);
            continue;
        }
        break;
    }
    normalize_plain_lines(&lines.join("\n"))
}

fn line_matches_envelope_sender(line: &str, env: &Envelope) -> bool {
    let l = line.trim();
    env.from.iter().any(|p| {
        if p.name.is_empty() {
            return false;
        }
        let name = p.name.trim();
        l.eq_ignore_ascii_case(name)
            || (l.contains(name) && visible_char_count(l) <= visible_char_count(name) + 16)
    })
}

fn line_matches_envelope_sent(line: &str, env: &Envelope) -> bool {
    let sent = normalize_probe(env.sent.trim());
    if sent.is_empty() {
        return false;
    }
    let l = normalize_probe(line.trim());
    l == sent || sent.contains(&l) || l.contains(&sent)
}

fn looks_like_email_list_line(text: &str) -> bool {
    let t = text.trim();
    if !t.contains('@') {
        return false;
    }
    let emails: Vec<_> = RE_EMAIL_TOKEN.find_iter(t).collect();
    if emails.len() < 2 {
        return false;
    }
    let email_chars: usize = emails.iter().map(|m| m.as_str().len()).sum();
    email_chars >= t.len() * 5 / 10
}

fn block_is_orphan_email_list(text: &str) -> bool {
    if !looks_like_email_list_line(text) {
        return false;
    }
    visible_char_count(&RE_EMAIL_TOKEN.replace_all(text, "")) < 8
}

fn document_order(doc: &Html) -> Vec<NodeId> {
    doc.tree.root().descendants().map(|n| n.id()).collect()
}

fn assign_nodes_to_slices(
    doc: &Html,
    order: &[NodeId],
    boundaries: &HashSet<NodeId>,
) -> HashMap<NodeId, usize> {
    let mut map = HashMap::new();
    let mut slice_idx = 0usize;

    for &id in order {
        if boundaries.contains(&id) {
            slice_idx += 1;
            continue;
        }
        if is_descendant_of_any_boundary(doc, id, boundaries) {
            continue;
        }
        if contains_boundary_descendant(doc, id, boundaries) {
            continue;
        }
        if !is_content_node(doc, id) {
            continue;
        }
        map.insert(id, slice_idx);
    }
    map
}

fn is_descendant_of_any_boundary(doc: &Html, node: NodeId, boundaries: &HashSet<NodeId>) -> bool {
    boundaries.iter().any(|&b| is_descendant_of(doc, node, b))
}

fn augment_slices_after_boundaries(
    doc: &Html,
    boundaries: &[NodeId],
    map: &mut HashMap<NodeId, usize>,
) {
    for (bi, &boundary_id) in boundaries.iter().enumerate() {
        let slice_idx = bi + 1;
        let Some(boundary_node) = doc.tree.get(boundary_id) else {
            continue;
        };
        let Some(parent) = boundary_node.parent() else {
            continue;
        };
        let mut after = false;
        for child in parent.children() {
            if child.id() == boundary_id {
                after = true;
                continue;
            }
            if after {
                if let Some(el) = ElementRef::wrap(child) {
                    assign_subtree_to_slice(doc, el.id(), slice_idx, map);
                }
            }
        }
    }
}

fn assign_subtree_to_slice(
    doc: &Html,
    id: NodeId,
    slice_idx: usize,
    map: &mut HashMap<NodeId, usize>,
) {
    let Some(node) = doc.tree.get(id) else {
        return;
    };
    if is_content_node(doc, id) {
        if matches!(node.value(), Node::Element(_)) {
            map.insert(id, slice_idx);
        }
    }
    for child in node.children() {
        assign_subtree_to_slice(doc, child.id(), slice_idx, map);
    }
}

fn contains_boundary_descendant(doc: &Html, id: NodeId, boundaries: &HashSet<NodeId>) -> bool {
    boundaries.iter().any(|&b| is_descendant_of(doc, b, id))
}

fn is_descendant_of(doc: &Html, node: NodeId, ancestor: NodeId) -> bool {
    let mut cur = doc.tree.get(node);
    while let Some(n) = cur {
        if n.id() == ancestor {
            return true;
        }
        cur = n.parent().and_then(|p| doc.tree.get(p.id()));
    }
    false
}

fn is_content_node(doc: &Html, id: NodeId) -> bool {
    let Some(node) = doc.tree.get(id) else {
        return false;
    };
    match node.value() {
        Node::Text(t) => visible_char_count(t) > 0,
        Node::Element(el) => {
            let tag = el.name.local.as_ref();
            !matches!(tag, "html" | "head" | "body")
        }
        _ => false,
    }
}

fn content_nodes_for_slice(
    doc: &Html,
    nodes: &[NodeId],
    boundaries: &HashSet<NodeId>,
) -> Vec<NodeId> {
    let tops: Vec<NodeId> = top_level_nodes_in_slice(doc, nodes, boundaries)
        .into_iter()
        .filter(|&id| !is_outlook_header_only_block(doc, id))
        .filter(|&id| visible_char_count(&element_text(doc, id)) >= 4)
        .collect();
    if !tops.is_empty() {
        return tops;
    }
    nodes
        .iter()
        .copied()
        .filter(|&id| {
            element_node(doc, id)
                && !boundaries.contains(&id)
                && visible_char_count(&element_text(doc, id)) >= 4
                && !is_outlook_header_only_block(doc, id)
                && !nodes
                    .iter()
                    .any(|&other| other != id && is_descendant_of(doc, id, other))
        })
        .collect()
}

fn is_outlook_header_only_block(doc: &Html, id: NodeId) -> bool {
    doc.tree
        .get(id)
        .and_then(|n| ElementRef::wrap(n))
        .is_some_and(block_is_header_only_quote)
}

fn element_text(doc: &Html, id: NodeId) -> String {
    doc.tree
        .get(id)
        .and_then(|n| ElementRef::wrap(n))
        .map(|el| el.text().collect::<String>())
        .unwrap_or_default()
}

fn top_level_nodes_in_slice(
    doc: &Html,
    nodes: &[NodeId],
    boundaries: &HashSet<NodeId>,
) -> Vec<NodeId> {
    nodes
        .iter()
        .copied()
        .filter(|&id| {
            is_content_node(doc, id)
                && match doc.tree.get(id) {
                    Some(n) => !matches!(n.value(), Node::Text(_)),
                    None => false,
                }
                && !nodes.iter().any(|&other| {
                    other != id && element_node(doc, other) && is_descendant_of(doc, id, other)
                })
                && !contains_boundary_descendant(doc, id, boundaries)
        })
        .collect()
}

fn element_node(doc: &Html, id: NodeId) -> bool {
    doc.tree
        .get(id)
        .is_some_and(|n| matches!(n.value(), Node::Element(_)))
}

fn serialize_nodes(doc: &Html, ids: &[NodeId]) -> String {
    let mut out = String::new();
    for &id in ids {
        let Some(node) = doc.tree.get(id) else {
            continue;
        };
        let Some(el) = ElementRef::wrap(node) else {
            continue;
        };
        let html = el.html();
        if html.is_empty() {
            continue;
        }
        out.push_str(&html);
    }
    out
}

fn html_slice_to_plain(html: &str) -> String {
    let doc = Html::parse_fragment(html);
    let mut out = String::new();
    plain_from_node(doc.root_element(), &mut out, false);
    normalize_plain_lines(&out)
}

fn plain_from_node(el: ElementRef<'_>, out: &mut String, block_context: bool) {
    for child in el.children() {
        match child.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(_) => {
                if let Some(child_el) = ElementRef::wrap(child) {
                    let tag = child_el.value().name.local.as_ref();
                    match tag {
                        "br" => out.push('\n'),
                        "p" | "div" | "blockquote" | "li" | "tr" | "h1" | "h2" | "h3" | "h4"
                        | "h5" | "h6" => {
                            if !out.is_empty() && !out.ends_with('\n') {
                                out.push('\n');
                            }
                            plain_from_node(child_el, out, true);
                            if !out.ends_with('\n') {
                                out.push('\n');
                            }
                        }
                        _ => plain_from_node(child_el, out, block_context),
                    }
                }
            }
            _ => {}
        }
    }
}

fn sanitize_conversation_body_html(html: &str) -> String {
    let mut doc = Html::parse_fragment(html);
    detach_outlook_trace_images(&mut doc);
    strip_noise_blocks_from_body_html(&mut doc);
    prune_empty_spans(&mut doc);
    scrub_leaked_headers_from_html(&doc.html())
}

fn scrub_leaked_headers_from_html(html: &str) -> String {
    let mut s = html.to_string();
    for _ in 0..6 {
        let mut next = RE_CHAINED_HEADER_PREFIX.replace(&s, "").into_owned();
        next = RE_HTML_AFTER_GT_HEADER.replace_all(&next, ">").into_owned();
        next = next.replace(":>", ">").replace(">  ", "> ");
        if next == s {
            break;
        }
        s = next;
    }
    s
}

fn strip_noise_blocks_from_body_html(doc: &mut Html) {
    let Ok(sel) = Selector::parse("p, div, blockquote, span") else {
        return;
    };
    let ids: Vec<NodeId> = doc
        .select(&sel)
        .filter(|el| {
            let text = el.text().collect::<String>();
            let probe = normalize_probe(&text);
            if block_is_orphan_email_list(&probe) {
                return true;
            }
            if block_is_header_only_quote(*el) {
                return true;
            }
            if RE_HEADER_JUNK_BODY.is_match(&probe) && visible_char_count(&probe) < 64 {
                return true;
            }
            let stripped = strip_inline_header_prefix(&probe);
            if stripped != probe
                && visible_char_count(&stripped) < 4
                && visible_char_count(&probe) < 120
            {
                return true;
            }
            false
        })
        .map(|el| el.id())
        .collect();
    detach_nodes(doc, ids);
}

fn detach_outlook_trace_images(doc: &mut Html) {
    let Ok(sel) = Selector::parse("img") else {
        return;
    };
    let ids: Vec<NodeId> = doc
        .select(&sel)
        .filter(|el| super::generic::is_outlook_noise_img(*el))
        .map(|el| el.id())
        .collect();
    detach_nodes(doc, ids);
}

fn prune_empty_spans(doc: &mut Html) {
    let Ok(sel) = Selector::parse("span, font") else {
        return;
    };
    for _ in 0..8 {
        let ids: Vec<NodeId> = doc
            .select(&sel)
            .filter(|el| element_visible_mass(*el) == 0)
            .map(|el| el.id())
            .collect();
        if ids.is_empty() {
            break;
        }
        detach_nodes(doc, ids);
    }
}

fn normalize_plain_lines(s: &str) -> String {
    s.lines()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn remove_compose_junk(doc: &mut Html) {
    let ids: Vec<NodeId> = doc
        .select(&SEL_COMPOSE_JUNK)
        .filter(|el| {
            let id = el.value().attr("id").unwrap_or("");
            id.contains("LSI_marker") || element_visible_mass(*el) < 4
        })
        .map(|el| el.id())
        .collect();
    detach_nodes(doc, ids);
}

fn detach_signatures(doc: &mut Html) {
    let ids: Vec<NodeId> = doc.select(&SEL_SIGNATURE).map(|e| e.id()).collect();
    detach_nodes(doc, ids);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_two_turn_report_for_forward_and_cited() {
        let html = r#"<div>
<p>Message transféré court pour test.</p>
<div id="Signature"><table><tr><td>Nom Exemple</td></tr></table></div>
<div id="appendonsend"></div>
<hr>
<div id="divRplyFwdMsg"><b>De :</b> Alice &lt;a@example.com&gt;<br><b>Envoyé :</b> jeudi<br><b>À :</b> Bob<br><b>Objet :</b> TR: Sujet</div>
<div><p>Bonjour, voici le brief logistique demandé.</p></div>
</div>"#;
        let report = try_build_report(html).expect("report");
        assert!(report.html.contains("rm-conversation-report"));
        assert!(report.html.contains("rm-conversation-chip"));
        assert!(report.html.contains(">Alice<"));
        assert!(!report.html.contains("a@example.com<"));
        assert!(report.html.contains("Message transféré"));
        assert!(report.html.contains("brief logistique"));
        assert!(!report.html.contains("Signature"));
        assert!(!report.html.contains("divRplyFwdMsg"));
        assert!(report.plain_text.contains("=== [1]"));
        assert!(report.plain_text.contains("--- cité ---"));
    }

    #[test]
    fn builds_report_for_inline_quote_chain() {
        let html = r#"<div>
<p>Corps récent.</p>
<div><p><b>De :</b> Coline Exemple &lt;c.exemple@example.fr&gt;<br>
<b>Envoyé :</b> mercredi 3 juin 2026 16:29<br>
<b>À :</b> Alice &lt;a@example.fr&gt;<br>
<b>Objet :</b> RE: Brief Logistique</p></div>
<p>Ancien corps visible.</p>
</div>"#;
        let report = try_build_report(html).expect("report");
        assert!(report.html.contains("rm-conversation-chip"));
        assert!(report.html.contains("Coline Exemple"));
        assert!(!report.html.contains("c.exemple@example.fr<"));
        assert!(report.html.contains("Ancien corps visible"));
        assert!(report.html.contains("Corps récent"));
    }

    #[test]
    fn skips_single_message_without_boundary() {
        let html = r#"<div><p>Hello seul.</p></div>"#;
        assert!(try_build_report(html).is_none());
    }

    #[test]
    fn parses_envelope_fields() {
        let text =
            "De : Alice <a@example.com>\nEnvoyé : lundi\nÀ : Bob\nCc : Eve\nObjet : TR: Test";
        let env = parse_envelope(text);
        assert_eq!(env.from.len(), 1);
        assert_eq!(env.from[0].name, "Alice");
        assert_eq!(env.from[0].email, "a@example.com");
        assert!(env.sent.contains("lundi"));
        assert_eq!(env.to.len(), 1);
        assert_eq!(env.to[0].name, "Bob");
        assert_eq!(env.cc.len(), 1);
        assert_eq!(env.cc[0].name, "Eve");
        assert!(env.subject.contains("TR: Test"));
    }

    #[test]
    fn strips_outlook_trace_from_conversation_body() {
        let html = r#"<div>
<p>Ligne un.</p>
<div><br></div>
<p>Ligne deux.</p>
<div id="divRplyFwdMsg"><b>De :</b> Alice<br><b>Envoyé :</b> lundi<br><b>Objet :</b> TR: test</div>
<div><p><span><img id="x_x__x0000_i1027" data-outlook-trace="F:2|T:2" src="cid:image001.jpg@01DCF376.14FDF370"></span>Cité.</p></div>
</div>"#;
        let report = try_build_report(html).expect("report");
        assert!(!report.html.contains("x0000_i"));
        assert!(!report.html.contains("data-outlook-trace"));
        assert!(!report.html.contains("cid:image001"));
        assert!(report.html.contains("Ligne un"));
        assert!(report.html.contains("Ligne deux"));
        assert!(report.plain_text.contains("Ligne un"));
        assert!(report.plain_text.contains("Ligne deux"));
        assert!(report.plain_text.contains("Cité"));
    }

    #[test]
    fn trim_subject_stops_before_body_on_same_line() {
        let text = "De : Alice <a@example.com> Envoyé : lundi À : Bob Objet : RE: Brief Logistique Bonjour à tous,";
        let env = parse_envelope(text);
        assert!(env.subject.contains("Brief Logistique"));
        assert!(!env.subject.to_ascii_lowercase().contains("bonjour"));
    }

    #[test]
    fn strips_email_list_line_from_body_text() {
        let raw = "Bonjour,\n\nn.exemple@logistics.example.com;ops.exemple@logistics.example.com;warehouse@retail.example.com\n\nMerci.";
        let cleaned = clean_conversation_body_text(raw);
        assert!(cleaned.contains("Bonjour"));
        assert!(cleaned.contains("Merci"));
        assert!(!cleaned.contains("ops.exemple@logistics.example.com"));
    }

    #[test]
    fn promotes_orphan_email_list_to_envelope_chips() {
        let html = r#"<div>
<p>Message transféré court pour test.</p>
<div id="divRplyFwdMsg"><b>De :</b> Alice &lt;a@example.com&gt;<br><b>Envoyé :</b> jeudi<br><b>Objet :</b> TR: Sujet</div>
<div><p>n.exemple@logistics.example.com;ops.exemple@logistics.example.com;warehouse@retail.example.com</p><p>Corps cité avec détail.</p></div>
</div>"#;
        let report = try_build_report(html).expect("report");
        assert!(report.html.contains("rm-conversation-chip"));
        assert!(report.html.contains("n exemple"));
        assert!(!report.html.contains("ops.exemple@logistics.example.com;"));
        assert!(report.html.contains("Corps cité avec détail"));
    }

    #[test]
    fn strips_leaked_header_prefix_from_body() {
        let raw = "Objet :Envoyé :>Nous estimons que la livraison sera ok.";
        let cleaned = clean_conversation_body_text(raw);
        assert!(cleaned.starts_with("Nous estimons"));
        assert!(!cleaned.contains("Objet :"));
        let scrubbed = scrub_leaked_headers_from_html(&format!("<p>{raw}</p>"));
        assert!(scrubbed.contains("Nous estimons"));
        assert!(!scrubbed.contains("Objet :Envoyé"));
    }

    #[test]
    fn body_is_header_junk_rejects_chained_labels() {
        assert!(body_is_header_junk("Objet :Envoyé :"));
        assert!(!body_is_header_junk(
            "Objet :Envoyé :>Nous estimons que oui."
        ));
    }

    #[test]
    fn builds_four_level_kenzo_like_chain() {
        let html = r#"<div>
<p>Commentaire transfert pour Alice et Nicolas. Volume 7000 pièces.</p>
<div id="x_divRplyFwdMsg"><b>De :</b> Nicolas Exemple &lt;n.exemple@logistics.example.com&gt;<br>
<b>Envoyé :</b> jeudi 4 juin 2026 09:51<br><b>Objet :</b> TR: Brief Logistique : KENZO - Demo</div>
<p>Suite au brief, ci-joint le fichier détail.</p>
<div class="WordSection1">
<p>Bonjour,</p>
<div style="border-top:solid"><p><b>De :</b> Coline Exemple &lt;c.exemple@retail.example.com&gt;<br>
<b>Envoyé :</b> mercredi 3 juin 2026 16:29<br><b>À :</b> Nicolas Exemple &lt;n.exemple@logistics.example.com&gt;<br>
<b>Objet :</b> RE: Brief Logistique : KENZO - Demo</p></div>
<p>Nous estimons le volume à repacker.</p>
<div style="border-top:solid"><p><b>De :</b> Coline Exemple &lt;c.exemple@retail.example.com&gt;<br>
<b>Envoyé :</b> mercredi 3 juin 2026 15:01<br><b>À :</b> Nicolas Exemple &lt;n.exemple@logistics.example.com&gt;<br>
<b>Objet :</b> RE: Brief Logistique : KENZO - Demo</p></div>
<p>Pouvez-vous chiffrer en heures de régie le coût du repacking.</p>
<div style="border-top:solid"><p><b>De :</b> Coline Exemple &lt;c.exemple@retail.example.com&gt;<br>
<b>Envoyé :</b> jeudi 28 mai 2026 16:38<br><b>À :</b> Nicolas Exemple &lt;n.exemple@logistics.example.com&gt;<br>
<b>Objet :</b> Brief Logistique : KENZO - Demo</p></div>
<p>Vente : KENZO<br>Date vente : 12/06</p>
</div>
</div>"#;
        let report = try_build_report(html).expect("report");
        assert!(report.html.contains("7000 pièces"));
        assert!(report.html.contains("heures de régie"));
        assert!(report.html.contains("Vente : KENZO"));
        assert!(report.html.contains("Coline Exemple"));
        assert!(report.html.contains("16:29"));
        assert!(report.html.contains("15:01"));
        assert!(report.html.contains("28 mai 2026"));
        assert!(!report.plain_text.contains("\nColine Exemple\n"));
        assert!(report.plain_text.matches("--- cité ---").count() >= 3);
    }

    #[test]
    fn strips_sender_and_date_lines_from_cited_body() {
        let html = r#"<div>
<p>Corps récent.</p>
<div style="border-top:solid"><p><b>De :</b> Coline Exemple &lt;c.exemple@retail.example.com&gt;<br>
<b>Envoyé :</b> mercredi 3 juin 2026 15:01<br><b>À :</b> Bob &lt;b@example.fr&gt;<br>
<b>Objet :</b> RE: Brief Logistique</p></div>
<p>Coline Exemple<br>mercredi 3 juin 2026 15:01<br>Pouvez-vous chiffrer en heures de régie.</p>
</div>"#;
        let report = try_build_report(html).expect("report");
        assert!(report.html.contains("rm-conversation-envelope"));
        assert!(report.html.contains("Coline Exemple"));
        assert!(report.html.contains("heures de régie"));
        assert!(!report.plain_text.contains("Coline Exemple\nmercredi"));
    }

    #[test]
    fn parses_quoted_name_and_multiple_recipients() {
        let raw = "'Denis Dupont' <denis.dupont@example.com>; Alice <a@example.fr>";
        let parts = parse_participants(raw);
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].name, "Denis Dupont");
        assert_eq!(parts[0].email, "denis.dupont@example.com");
        assert_eq!(parts[1].name, "Alice");
        assert!(render_participant_chips(&parts).contains("rm-conversation-chip"));
        assert!(render_participant_chips(&parts).contains("Denis Dupont"));
        assert!(!render_participant_chips(&parts).contains("denis.dupont@example.com<"));
    }
}
