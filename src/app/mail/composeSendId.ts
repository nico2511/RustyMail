import { state } from "../state";

/** Nouvel identifiant à chaque ouverture réelle du composer (pas une restauration d'historique). */
export function resetComposeSendId(): void {
  state.composeSendId = globalThis.crypto.randomUUID();
  state.sendDraftInFlight = false;
}

export function currentComposeSendId(): string {
  const existing = state.composeSendId.trim();
  if (existing) return existing;
  resetComposeSendId();
  return state.composeSendId;
}
