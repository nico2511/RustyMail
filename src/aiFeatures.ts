import type { AppPrefsAi } from "./prefs_defaults";
import { t } from "./i18n";

export type AiFeatureKey =
  | "featureThreadSummaryEnabled"
  | "featureThreadTranslateEnabled"
  | "featureMessageTranslateEnabled"
  | "featureComposeRewriteEnabled"
  | "featureComposeGrammarEnabled"
  | "featureQuickReplyThreadEnabled"
  | "featureQuickReplyComposeEnabled"
  | "featureInboxDigestEnabled"
  | "featureSearchNlEnabled"
  | "featureThreadQaEnabled"
  | "featureSecurityLlmEnabled"
  | "featureAddressAutocompleteEnabled"
  | "featureAutoThreadSummaryEnabled"
  | "featureAgentPrepareReplyEnabled"
  | "featureContactProfileEnabled"
  | "featureOrgProposalsEnabled";

export const AI_FEATURE_KEYS: readonly AiFeatureKey[] = [
  "featureThreadSummaryEnabled",
  "featureThreadTranslateEnabled",
  "featureMessageTranslateEnabled",
  "featureComposeRewriteEnabled",
  "featureComposeGrammarEnabled",
  "featureQuickReplyThreadEnabled",
  "featureQuickReplyComposeEnabled",
  "featureInboxDigestEnabled",
  "featureSearchNlEnabled",
  "featureThreadQaEnabled",
  "featureSecurityLlmEnabled",
  "featureAddressAutocompleteEnabled",
  "featureAutoThreadSummaryEnabled",
  "featureAgentPrepareReplyEnabled",
  "featureContactProfileEnabled",
  "featureOrgProposalsEnabled",
] as const;

export function isAiFeatureEnabled(ai: AppPrefsAi, key: AiFeatureKey): boolean {
  return Boolean(ai[key]);
}

export type AiFeatureToggleItem = { key: AiFeatureKey; label: string; description: string };

export type AiFeatureToggleGroup = {
  title: string;
  items: AiFeatureToggleItem[];
};

const FEATURE_I18N: Record<
  AiFeatureKey,
  { labelKey: string; descKey: string }
> = {
  featureThreadSummaryEnabled: {
    labelKey: "ai.features.threadSummary.label",
    descKey: "ai.features.threadSummary.description",
  },
  featureThreadTranslateEnabled: {
    labelKey: "ai.features.threadTranslate.label",
    descKey: "ai.features.threadTranslate.description",
  },
  featureMessageTranslateEnabled: {
    labelKey: "ai.features.messageTranslate.label",
    descKey: "ai.features.messageTranslate.description",
  },
  featureInboxDigestEnabled: {
    labelKey: "ai.features.inboxDigest.label",
    descKey: "ai.features.inboxDigest.description",
  },
  featureOrgProposalsEnabled: {
    labelKey: "ai.features.orgProposals.label",
    descKey: "ai.features.orgProposals.description",
  },
  featureThreadQaEnabled: {
    labelKey: "ai.features.threadQa.label",
    descKey: "ai.features.threadQa.description",
  },
  featureAutoThreadSummaryEnabled: {
    labelKey: "ai.features.autoThreadSummary.label",
    descKey: "ai.features.autoThreadSummary.description",
  },
  featureComposeRewriteEnabled: {
    labelKey: "ai.features.composeRewrite.label",
    descKey: "ai.features.composeRewrite.description",
  },
  featureComposeGrammarEnabled: {
    labelKey: "ai.features.composeGrammar.label",
    descKey: "ai.features.composeGrammar.description",
  },
  featureQuickReplyThreadEnabled: {
    labelKey: "ai.features.quickReplyThread.label",
    descKey: "ai.features.quickReplyThread.description",
  },
  featureQuickReplyComposeEnabled: {
    labelKey: "ai.features.quickReplyCompose.label",
    descKey: "ai.features.quickReplyCompose.description",
  },
  featureAgentPrepareReplyEnabled: {
    labelKey: "ai.features.agentPrepareReply.label",
    descKey: "ai.features.agentPrepareReply.description",
  },
  featureSearchNlEnabled: {
    labelKey: "ai.features.searchNl.label",
    descKey: "ai.features.searchNl.description",
  },
  featureAddressAutocompleteEnabled: {
    labelKey: "ai.features.addressAutocomplete.label",
    descKey: "ai.features.addressAutocomplete.description",
  },
  featureContactProfileEnabled: {
    labelKey: "ai.features.contactProfile.label",
    descKey: "ai.features.contactProfile.description",
  },
  featureSecurityLlmEnabled: {
    labelKey: "ai.features.securityLlm.label",
    descKey: "ai.features.securityLlm.description",
  },
};

function featureItem(key: AiFeatureKey): AiFeatureToggleItem {
  const meta = FEATURE_I18N[key];
  return {
    key,
    label: t(meta.labelKey),
    description: t(meta.descKey),
  };
}

export function getAiFeatureToggleGroups(): AiFeatureToggleGroup[] {
  return [
    {
      title: t("ai.features.groups.thread"),
      items: [
        featureItem("featureThreadSummaryEnabled"),
        featureItem("featureThreadTranslateEnabled"),
        featureItem("featureMessageTranslateEnabled"),
        featureItem("featureInboxDigestEnabled"),
        featureItem("featureOrgProposalsEnabled"),
        featureItem("featureThreadQaEnabled"),
        featureItem("featureAutoThreadSummaryEnabled"),
      ],
    },
    {
      title: t("ai.features.groups.compose"),
      items: [
        featureItem("featureComposeRewriteEnabled"),
        featureItem("featureComposeGrammarEnabled"),
        featureItem("featureQuickReplyThreadEnabled"),
        featureItem("featureQuickReplyComposeEnabled"),
        featureItem("featureAgentPrepareReplyEnabled"),
      ],
    },
    {
      title: t("ai.features.groups.search"),
      items: [
        featureItem("featureSearchNlEnabled"),
        featureItem("featureAddressAutocompleteEnabled"),
        featureItem("featureContactProfileEnabled"),
      ],
    },
    {
      title: t("ai.features.groups.security"),
      items: [featureItem("featureSecurityLlmEnabled")],
    },
  ];
}

/** Resolved groups for settings / AI panel (recomputed when locale changes). */
export const AI_FEATURE_TOGGLE_GROUPS: AiFeatureToggleGroup[] = getAiFeatureToggleGroups();

export type AiFeatureToggleGroupDef = {
  titleKey: string;
  keys: AiFeatureKey[];
};

export const AI_FEATURE_TOGGLE_GROUP_DEFS: AiFeatureToggleGroupDef[] = [
  {
    titleKey: "ai.features.groups.thread",
    keys: [
      "featureThreadSummaryEnabled",
      "featureThreadTranslateEnabled",
      "featureMessageTranslateEnabled",
      "featureInboxDigestEnabled",
      "featureOrgProposalsEnabled",
      "featureThreadQaEnabled",
      "featureAutoThreadSummaryEnabled",
    ],
  },
  {
    titleKey: "ai.features.groups.compose",
    keys: [
      "featureComposeRewriteEnabled",
      "featureComposeGrammarEnabled",
      "featureQuickReplyThreadEnabled",
      "featureQuickReplyComposeEnabled",
      "featureAgentPrepareReplyEnabled",
    ],
  },
  {
    titleKey: "ai.features.groups.search",
    keys: [
      "featureSearchNlEnabled",
      "featureAddressAutocompleteEnabled",
      "featureContactProfileEnabled",
    ],
  },
  {
    titleKey: "ai.features.groups.security",
    keys: ["featureSecurityLlmEnabled"],
  },
];

export function refreshAiFeatureToggleGroups(): AiFeatureToggleGroup[] {
  return getAiFeatureToggleGroups();
}

export function setAllAiFeatures(ai: AppPrefsAi, enabled: boolean): void {
  for (const key of AI_FEATURE_KEYS) {
    ai[key] = enabled;
  }
}
