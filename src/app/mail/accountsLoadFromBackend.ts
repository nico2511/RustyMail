import { invoke } from "@tauri-apps/api/core";
import type { Account } from "../../accountSetup";
import { ACCOUNTS_BOOT_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { normalizeAccountRow } from "./accountRowNormalize";

export type LoadAccountsFromBackendOptions = {
  silent?: boolean;
  timeoutMs?: number;
};

export async function loadAccountsFromBackend(options?: LoadAccountsFromBackendOptions): Promise<boolean> {
  state.accountsLoadError = "";
  if (!isTauriRuntime()) {
    state.accounts = [];
    state.accountsLoadError =
      "Mode navigateur : pas de comptes ni de mails persistants. Lancez l’app bureau avec npm run tauri:dev.";
    if (!options?.silent) toast(state.accountsLoadError);
    return false;
  }
  try {
    const raw = await withTimeout(
      invoke<unknown[]>("list_accounts", {}),
      options?.timeoutMs ?? ACCOUNTS_BOOT_TIMEOUT_MS,
    );
    state.accounts = (Array.isArray(raw) ? raw : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
      state.selectedAccountId = state.accounts[0]?.id;
    }
    return state.accounts.length > 0;
  } catch (error) {
    console.error("list_accounts", error);
    state.accounts = [];
    state.accountsLoadError = tauriErrorMessage(error);
    if (!options?.silent) {
      toast(`Impossible de charger les comptes : ${state.accountsLoadError}`);
    }
    return false;
  }
}
