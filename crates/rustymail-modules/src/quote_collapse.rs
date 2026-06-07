#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuoteCollapseResult {
    pub visible_text: String,
    pub collapsed_quotes: Vec<String>,
    pub dimmed_blocks: Vec<String>,
}

pub fn collapse_quotes(input: &str) -> QuoteCollapseResult {
    let mut visible = Vec::new();
    let mut quotes = Vec::new();
    let mut dimmed = Vec::new();

    for line in input.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('>') || trimmed.starts_with("On ") && trimmed.contains(" wrote:") {
            quotes.push(line.to_string());
        } else if looks_like_disclaimer(trimmed) {
            dimmed.push(line.to_string());
        } else {
            visible.push(line);
        }
    }

    QuoteCollapseResult {
        visible_text: visible.join("\n").trim().to_string(),
        collapsed_quotes: quotes,
        dimmed_blocks: dimmed,
    }
}

fn looks_like_disclaimer(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.contains("confidential")
        || lower.contains("do not print")
        || lower.contains("intended recipient")
}
