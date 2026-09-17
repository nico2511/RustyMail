import { invoke } from "@tauri-apps/api/core";
import { isSavedDraftsVirtualMailbox, preferredInboxMailboxName } from "../../mailboxKinds";
import {
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  defaultListFilterFromRaw,
} from "../lib/appUiConstants";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";
import type { State } from "../types";
import { resolveMailboxInList } from "./searchMailboxResolve";

export function defaultListFilterFromPrefs(): State["listFilter"] {
  return defaultListFilterFromRaw(state.appPrefs.general.defaultListFilter);
}

export function defaultAccountIdFromPrefs(): string | undefined {
  const id = (state.appPrefs.general.defaultAccountId ?? "").trim();
  if (!id) return undefined;
  return state.accounts.some((a) => a.id === id) ? id : undefined;
}

export function applyDefaultAccountFromPrefs(): void {
  const pref = defaultAccountIdFromPrefs();
  if (pref) {
    state.selectedAccountId = pref;
    return;
  }
  if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0]?.id;
  }
}

export function ensureValidSelectedMailbox(): void {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox) && isTauriRuntime()) return;
  if (!state.mailboxes.length) return;
  const resolved = resolveMailboxInList(state.mailboxes, state.selectedMailbox);
  if (resolved !== undefined) {
    if (resolved !== state.selectedMailbox) state.selectedMailbox = resolved;
    return;
  }
  state.selectedMailbox =
    preferredInboxMailboxName(state.mailboxes) ?? state.mailboxes[0] ?? "INBOX";
}

export function shouldShowDefaultAccountPrompt(): boolean {
  if (!isTauriRuntime() || state.view !== "list") return false;
  if (state.accounts.length < 2) return false;
  if (defaultAccountIdFromPrefs()) return false;
  try {
    if (window.localStorage.getItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

export async function persistDefaultAccountId(accountId: string): Promise<void> {
  const id = accountId.trim();
  if (!id || !state.accounts.some((a) => a.id === id)) {
    toast("Compte introuvable.");
    return;
  }
  if (!isTauriRuntime()) return;
  state.appPrefs.general.defaultAccountId = id;
  await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
}
