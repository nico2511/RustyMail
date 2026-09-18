import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { state } from "../state";
import type { ThreadListItem } from "../types";
import { isSearchActive } from "./searchQueryContext";
import { searchViewBatchThreads } from "./searchViewBatchContext";

export type SearchViewBulkPreflightOk = {
  account: NonNullable<ReturnType<typeof currentAccount>>;
  visible: ThreadListItem[];
};

export function requireSearchViewBulkPreflight(options?: {
  blockSavedDraftsMailbox?: boolean;
  tauriRequiredLabel?: string;
  imapOnlyLabel?: string;
}): SearchViewBulkPreflightOk | null {
  const tauriLabel = options?.tauriRequiredLabel ?? "Action lot";
  const imapOnlyLabel = options?.imapOnlyLabel ?? "Action lot";
  if (!isTauriRuntime()) {
    toast(`${tauriLabel} : IMAP requiert l’app Tauri.`);
    return null;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return null;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return null;
  }
  if (options?.blockSavedDraftsMailbox && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast(`${imapOnlyLabel} : actions IMAP uniquement.`);
    return null;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return null;
  }
  return { account, visible };
}
