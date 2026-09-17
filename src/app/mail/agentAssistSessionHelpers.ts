import {
  buildAssistPayload,
  defaultEnabledSkillIds,
  type AssistResult,
  type AssistRunStep,
} from "../../assistAgent";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";

export function agentAssistBasePayload(): ReturnType<typeof buildAssistPayload> | null {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!tid || !accountId) return null;
  const mode = s?.assistMode ?? "deep";
  const skills = s?.enabledSkills?.length ? s.enabledSkills : defaultEnabledSkillIds(mode);
  return buildAssistPayload(tid, accountId, mode, skills);
}

export function pushAgentTelemetry(step: AssistRunStep): void {
  const s = state.agentSession;
  if (!s) return;
  const idx = s.telemetry.findIndex((t) => t.skill === step.skill && t.status === "running");
  if (idx >= 0) s.telemetry[idx] = step;
  else s.telemetry.push(step);
}

export async function stopAgentTelemetry(): Promise<void> {
  const s = state.agentSession;
  if (s?.unlistenTelemetry) {
    s.unlistenTelemetry();
    s.unlistenTelemetry = undefined;
  }
}

export function agentAssistPhasePayload(
  s: NonNullable<typeof state.agentSession>,
  extra: Record<string, unknown>,
): { payload: Record<string, unknown> } {
  const base = agentAssistBasePayload() ?? buildAssistPayload(s.threadId, s.accountId, s.assistMode);
  return {
    payload: {
      ...base,
      priorFacts: s.facts ?? null,
      forceDraft: s.forceDraft,
      ...extra,
    },
  };
}

export function mergeAgentRecommendations(
  s: NonNullable<typeof state.agentSession>,
  res: AssistResult,
): void {
  const recs = res.recommendations ?? [];
  for (const r of recs) {
    if (s.recommendations.some((x) => x.kind === r.kind && x.label === r.label)) continue;
    s.recommendations.push(r);
  }
  if (res.slots?.length) {
    for (const sl of res.slots) {
      if (!s.recommendations.some((x) => x.kind === "slot" && x.label === sl)) {
        s.recommendations.push({ kind: "slot", label: sl });
      }
    }
  }
}
