use std::sync::OnceLock;

use super::generic::{self, generic_html_clean};
use super::registry::ProviderRegistry;
use super::types::{CleanHtmlResult, CleaningInput, ProviderId};

static BUILTIN_REGISTRY: OnceLock<ProviderRegistry> = OnceLock::new();

fn builtin_registry() -> &'static ProviderRegistry {
    BUILTIN_REGISTRY.get_or_init(ProviderRegistry::builtin)
}

/// Full pipeline: generic clean → provider plugin (if any) → quality guard.
pub fn clean_html_builtin(input: &CleaningInput<'_>, html: &str) -> CleanHtmlResult {
    clean_html_for_markdown(builtin_registry(), input, html)
}

pub fn clean_html_for_markdown(
    registry: &ProviderRegistry,
    input: &CleaningInput<'_>,
    html: &str,
) -> CleanHtmlResult {
    let mut diagnostics = Vec::new();
    let generic_out = generic_html_clean(html);
    let provider = registry.resolve_provider(input);

    let finalize = generic::finalize_html_for_display;

    if provider == ProviderId::Generic {
        let fin = finalize(&generic_out);
        return CleanHtmlResult {
            html: fin.html,
            resolved_provider: ProviderId::Generic,
            generic_rule_set_version: generic::GENERIC_RULE_SET_VERSION,
            provider_rule_set_version: None,
            diagnostics,
            conversation_text: fin.conversation_text,
        };
    }

    let Some(cleaner) = registry.cleaner_for(provider) else {
        diagnostics.push("no cleaner for resolved provider; using generic only".to_string());
        let fin = finalize(&generic_out);
        return CleanHtmlResult {
            html: fin.html,
            resolved_provider: ProviderId::Generic,
            generic_rule_set_version: generic::GENERIC_RULE_SET_VERSION,
            provider_rule_set_version: None,
            diagnostics,
            conversation_text: fin.conversation_text,
        };
    };

    let ver = cleaner.rule_set_version();
    let after_plugin = match cleaner.clean(&generic_out, input) {
        Ok(s) => s,
        Err(e) => {
            diagnostics.push(format!("provider clean error: {e}; fallback generic"));
            let fin = finalize(&generic_out);
            return CleanHtmlResult {
                html: fin.html,
                resolved_provider: ProviderId::Generic,
                generic_rule_set_version: generic::GENERIC_RULE_SET_VERSION,
                provider_rule_set_version: Some(ver),
                diagnostics,
                conversation_text: fin.conversation_text,
            };
        }
    };

    let g_mass = html_text_mass(&generic_out);
    let p_mass = html_text_mass(&after_plugin);
    let threshold = g_mass.saturating_mul(3) / 10;
    let threshold = threshold.max(50);
    // Amazon semantic digest deliberately drops noisy marketing blobs; bypass mass guard when tagged.
    let digest_bypass_guard = after_plugin.contains("rustymail:amazon-digest")
        || after_plugin.contains("rustymail:deblock-digest");
    if !digest_bypass_guard && p_mass < threshold && g_mass > 80 {
        diagnostics.push(format!(
            "quality guard: plugin text mass {p_mass} < max({threshold}, 30% of generic {g_mass}); fallback generic"
        ));
        let fin = finalize(&generic_out);
        return CleanHtmlResult {
            html: fin.html,
            resolved_provider: ProviderId::Generic,
            generic_rule_set_version: generic::GENERIC_RULE_SET_VERSION,
            provider_rule_set_version: Some(ver),
            diagnostics,
            conversation_text: fin.conversation_text,
        };
    }

    let (html_out, conversation_text) = if digest_bypass_guard {
        (after_plugin.clone(), None)
    } else {
        let fin = finalize(&after_plugin);
        (fin.html, fin.conversation_text)
    };

    CleanHtmlResult {
        html: html_out,
        resolved_provider: provider,
        generic_rule_set_version: generic::GENERIC_RULE_SET_VERSION,
        provider_rule_set_version: Some(ver),
        diagnostics,
        conversation_text,
    }
}

fn html_text_mass(html: &str) -> usize {
    let doc = scraper::Html::parse_fragment(html);
    doc.tree
        .nodes()
        .filter_map(|n| n.value().as_text())
        .flat_map(|t| t.chars())
        .filter(|c| !c.is_whitespace())
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_only_when_no_amazon_signal() {
        let reg = ProviderRegistry::builtin();
        let input = CleaningInput {
            sender_email: "a@newsletter.example",
            subject: "Weekly",
            html_preview: None,
            plain_body: None,
        };
        let r = clean_html_for_markdown(&reg, &input, "<p>Hello</p><script>x</script>");
        assert_eq!(r.resolved_provider, ProviderId::Generic);
        assert!(!r.html.contains("script"));
    }
}
