use crate::app_prefs::AiPrefs;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiFeature {
    ThreadSummary,
    ThreadTranslate,
    MessageTranslate,
    ComposeRewrite,
    ComposeGrammar,
    QuickReplyThread,
    QuickReplyCompose,
    InboxDigest,
    SearchNl,
    ThreadQa,
    SecurityLlm,
    AddressAutocomplete,
    AutoThreadSummary,
    AgentPrepareReply,
    ContactProfile,
    OrgProposals,
}

pub fn ai_feature_enabled(prefs: &AiPrefs, feature: AiFeature) -> bool {
    match feature {
        AiFeature::ThreadSummary => prefs.feature_thread_summary_enabled,
        AiFeature::ThreadTranslate => prefs.feature_thread_translate_enabled,
        AiFeature::MessageTranslate => prefs.feature_message_translate_enabled,
        AiFeature::ComposeRewrite => prefs.feature_compose_rewrite_enabled,
        AiFeature::ComposeGrammar => prefs.feature_compose_grammar_enabled,
        AiFeature::QuickReplyThread => prefs.feature_quick_reply_thread_enabled,
        AiFeature::QuickReplyCompose => prefs.feature_quick_reply_compose_enabled,
        AiFeature::InboxDigest => prefs.feature_inbox_digest_enabled,
        AiFeature::SearchNl => prefs.feature_search_nl_enabled,
        AiFeature::ThreadQa => prefs.feature_thread_qa_enabled,
        AiFeature::SecurityLlm => prefs.feature_security_llm_enabled,
        AiFeature::AddressAutocomplete => prefs.feature_address_autocomplete_enabled,
        AiFeature::AutoThreadSummary => prefs.feature_auto_thread_summary_enabled,
        AiFeature::AgentPrepareReply => prefs.feature_agent_prepare_reply_enabled,
        AiFeature::ContactProfile => prefs.feature_contact_profile_enabled,
        AiFeature::OrgProposals => prefs.feature_org_proposals_enabled,
    }
}
