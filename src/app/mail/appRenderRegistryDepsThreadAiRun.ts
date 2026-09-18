/** AI / agent / translation job helpers for thread render deps. */
import type { RenderDeps } from "../ui/render/renderDeps";
import {
  activeSecurityLlmAugmentCount,
  isSecurityLlmAugmentPending,
} from "./mailSecurityDisplay";
import {
  agentOfferSlotsStep,
  agentSkillEnabled,
  agentStepProgressLabel,
  threadAiSummaryForCurrentThread,
  threadAiSummaryShownInZen,
} from "./threadAiStreamDom";
import { shouldOfferThreadTranslate } from "./threadLangGuess";
import { activeMessageTranslationJobCount } from "./threadStatusJobCounts";

export function buildThreadAiRenderDepsFragment(): Pick<
  RenderDeps,
  | "activeMessageTranslationJobCount"
  | "activeSecurityLlmAugmentCount"
  | "threadAiSummaryShownInZen"
  | "isSecurityLlmAugmentPending"
  | "threadAiSummaryForCurrentThread"
  | "agentStepProgressLabel"
  | "agentSkillEnabled"
  | "agentOfferSlotsStep"
  | "shouldOfferThreadTranslate"
> {
  return {
    activeMessageTranslationJobCount,
    activeSecurityLlmAugmentCount,
    threadAiSummaryShownInZen,
    isSecurityLlmAugmentPending,
    threadAiSummaryForCurrentThread,
    agentStepProgressLabel,
    agentSkillEnabled,
    agentOfferSlotsStep,
    shouldOfferThreadTranslate,
  };
}
