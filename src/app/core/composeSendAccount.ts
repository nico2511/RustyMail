import type { Account } from "../../accountSetup";
import { state } from "../state";
import { currentAccount } from "./accountContext";
import { isDemoPlaygroundAccountId } from "./demoAccount";

/** Comptes réels (hors boîte démo playground). */
export function sendableAccounts(): Account[] {
  return state.accounts.filter((a) => !isDemoPlaygroundAccountId(a.id));
}

/** Afficher le choix d’expéditeur seulement s’il y a au moins deux comptes hors démo. */
export function shouldShowComposeFromAccountSelect(): boolean {
  return sendableAccounts().length >= 2;
}

function accountById(id: string | null | undefined): Account | undefined {
  const key = String(id ?? "").trim();
  if (!key) return undefined;
  return state.accounts.find((a) => a.id === key);
}

/** Compte préféré à l’ouverture du composer (fil courant, sinon compte actif). */
export function preferredComposeSendAccountId(): string | undefined {
  const threadId = state.selectedThreadId?.trim() || state.selectedThread?.id?.trim();
  const fromThread = threadId
    ? state.threads.find((t) => t.id === threadId)?.accountId?.trim()
    : undefined;
  if (fromThread && accountById(fromThread) && !isDemoPlaygroundAccountId(fromThread)) {
    return fromThread;
  }
  const current = currentAccount();
  if (current && !isDemoPlaygroundAccountId(current.id)) return current.id;
  return sendableAccounts()[0]?.id ?? current?.id;
}

export function resolveComposeSendAccountId(preferred?: string | null): string | undefined {
  const sendable = sendableAccounts();
  const pref = String(preferred ?? "").trim();
  if (pref && sendable.some((a) => a.id === pref)) return pref;
  if (pref && accountById(pref) && sendable.length === 0) return pref;
  const current = currentAccount();
  if (current && sendable.some((a) => a.id === current.id)) return current.id;
  return sendable[0]?.id ?? current?.id;
}

/** Initialise / répare `state.composeSendAccountId` à l’ouverture d’une session composer. */
export function ensureComposeSendAccountId(preferred?: string | null): void {
  state.composeSendAccountId = resolveComposeSendAccountId(
    preferred ?? preferredComposeSendAccountId(),
  );
}

/** Compte qui enverra le brouillon (sélecteur De, sinon compte actif). */
export function composeSendAccount(): Account | undefined {
  const chosen = accountById(state.composeSendAccountId);
  if (chosen) return chosen;
  const fallbackId = resolveComposeSendAccountId(preferredComposeSendAccountId());
  return accountById(fallbackId) ?? currentAccount();
}
