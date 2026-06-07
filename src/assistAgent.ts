import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { t } from "./i18n";

export type AssistMode = "quick" | "deep" | "strictSafe";

export type AssistSkillId =
  | "analyzeIntent"
  | "extractFacts"
  | "actionItems"
  | "riskFlagger"
  | "draftReply"
  | "toneAdapter"
  | "consistencyCheck"
  | "slotSuggestion";

export type AssistRunStep = {
  skill: string;
  status: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  message?: string;
};

export type AssistRoutingPlan = {
  assistMode: AssistMode;
  steps: Array<{ skill: string; required: boolean }>;
  offerSlotStep: boolean;
  needsClarification?: boolean;
};

export type AssistIntentSnapshot = {
  intent: string;
  toneHint: string;
  needsScheduling: boolean;
};

export type AssistFact = {
  kind: string;
  text: string;
  messageIds?: string[];
};

export type AssistFactsSnapshot = {
  facts: AssistFact[];
  ambiguities: string[];
  confidence: number;
};

export type AssistRecommendation = {
  kind: string;
  label: string;
  detail?: string;
};

export type AssistResult = {
  schemaVersion: number;
  intentSummary?: string;
  draftResponse?: string;
  recommendations?: AssistRecommendation[];
  clarificationQuestions?: string[];
  confidence?: number;
  safetyFlags?: string[];
  executedSkills?: string[];
  intent?: AssistIntentSnapshot;
  slots?: string[];
  facts?: AssistFactsSnapshot;
  consistencyIssues?: string[];
  needsClarification?: boolean;
  plan?: AssistRoutingPlan;
  runSteps?: AssistRunStep[];
};

export type AssistThreadPayload = {
  schemaVersion: number;
  threadId: string;
  accountId: string;
  assistMode: AssistMode;
  enabledSkills: string[];
};

const SKILL_TO_API: Record<AssistSkillId, string> = {
  analyzeIntent: "analyzeIntent",
  extractFacts: "extractFacts",
  actionItems: "actionItems",
  riskFlagger: "riskFlag",
  draftReply: "draftReply",
  toneAdapter: "toneAdapt",
  consistencyCheck: "consistencyCheck",
  slotSuggestion: "suggestSlots",
};

export function assistPhaseForSkill(skill: AssistSkillId): string {
  return SKILL_TO_API[skill];
}

export function defaultEnabledSkillIds(mode: AssistMode): AssistSkillId[] {
  switch (mode) {
    case "quick":
      return ["analyzeIntent", "draftReply", "toneAdapter"];
    case "strictSafe":
      return [
        "analyzeIntent",
        "extractFacts",
        "actionItems",
        "riskFlagger",
        "draftReply",
        "toneAdapter",
        "consistencyCheck",
        "slotSuggestion",
      ];
    default:
      return [
        "analyzeIntent",
        "extractFacts",
        "actionItems",
        "draftReply",
        "toneAdapter",
        "consistencyCheck",
        "slotSuggestion",
      ];
  }
}

export function buildAssistPayload(
  threadId: string,
  accountId: string,
  assistMode: AssistMode = "deep",
  enabledSkills: AssistSkillId[] = [],
): AssistThreadPayload {
  return {
    schemaVersion: 3,
    threadId,
    accountId,
    assistMode,
    enabledSkills,
  };
}

const SKILL_LABEL_KEYS: Record<string, string> = {
  analyze_intent: "assist.skills.analyzeIntent",
  extract_facts: "assist.skills.extractFacts",
  action_items: "assist.skills.actionItems",
  risk_flagger: "assist.skills.riskFlagger",
  draft_reply: "assist.skills.draftReply",
  tone_adapter: "assist.skills.toneAdapter",
  consistency_check: "assist.skills.consistencyCheck",
  slot_suggestion: "assist.skills.slotSuggestion",
};

export function getAssistSkillUi(): Array<{ id: AssistSkillId; label: string; api: string }> {
  const ids: AssistSkillId[] = [
    "analyzeIntent",
    "extractFacts",
    "actionItems",
    "riskFlagger",
    "draftReply",
    "toneAdapter",
    "consistencyCheck",
    "slotSuggestion",
  ];
  return ids.map((id) => ({
    id,
    label: t(`assist.skills.${id}`),
    api: SKILL_TO_API[id],
  }));
}

/** @deprecated Use getAssistSkillUi() — kept for imports that expect a constant array shape. */
export const ASSIST_SKILL_UI = getAssistSkillUi();

export function assistSkillLabel(skill: string): string {
  const key = SKILL_LABEL_KEYS[skill];
  if (key) return t(key);
  const camel = skill.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const alt = `assist.skills.${camel}`;
  const tr = t(alt);
  return tr !== alt ? tr : skill;
}

const STEP_LABEL_KEYS: Record<string, string> = {
  analyzeIntent: "assist.skills.analyzeIntent",
  extractFacts: "assist.skills.extractFacts",
  clarification: "assist.skills.analyzeIntent",
  draftReply: "assist.skills.draftReply",
  suggestSlots: "assist.skills.slotSuggestion",
};

export function assistStepLabel(step: string): string {
  const key = STEP_LABEL_KEYS[step];
  return key ? t(key) : step;
}

export function assistSafetyFlagLabel(code: string): string {
  const c = code.trim();
  const known: Record<string, string> = {
    consistency_warning: "Écart possible entre le brouillon et les faits du fil",
    unverified_claim: "Affirmation non vérifiée par rapport aux faits",
    invented_deadline: "Échéance ou date non présente dans les faits",
    invented_meeting_request: "Proposition de rendez-vous ou de créneaux non demandée dans le fil",
    unspecified_meeting_request: "Demande de rendez-vous sans précision suffisante",
    mail_security: "Signal issu de l’analyse de sécurité du message",
  };
  if (known[c]) return known[c];
  if (c.startsWith("mail_security:")) {
    const rest = c.slice("mail_security:".length);
    return `${known.mail_security} (${rest})`;
  }
  if (c.startsWith("thread_security:")) {
    return `Niveau de vigilance sur le fil : ${c.slice("thread_security:".length)}`;
  }
  return c;
}

export function assistModeLabel(mode: AssistMode): string {
  switch (mode) {
    case "quick":
      return t("assist.mode.quick");
    case "strictSafe":
      return t("assist.mode.strictSafe");
    default:
      return t("assist.mode.deep");
  }
}

/** Écoute `llm-assist-telemetry` pour le fil donné ; retourne une fonction de désabonnement. */
export async function bindAssistTelemetry(
  threadId: string,
  onStep: (step: AssistRunStep) => void,
): Promise<UnlistenFn> {
  return listen<{ threadId: string; runStep: AssistRunStep }>("llm-assist-telemetry", (e) => {
    if (e.payload.threadId !== threadId) return;
    onStep(e.payload.runStep);
  });
}
