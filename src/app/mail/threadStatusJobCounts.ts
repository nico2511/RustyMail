import { state } from "../state";

export function activeMessageTranslationJobCount(): number {
  return Object.values(state.messageTranslationBusy).filter(Boolean).length;
}
