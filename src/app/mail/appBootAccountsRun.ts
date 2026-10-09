import { listen } from "@tauri-apps/api/event";

import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import { loadAccountsFromBackend } from "./accountsLoadFromBackend";
import { refreshUiAfterImapPush } from "./syncInboxRun";

export async function bootLoadAccountsAndImapPush(): Promise<void> {
  await loadAccountsFromBackend({ silent: false });
  if (isTauriRuntime()) {
    await listen<{ accountId: string; mailbox: string; reason: string }>("imap-push", (ev) => {
      const accId = ev.payload.accountId?.trim();
      if (!accId || state.syncInProgress) return;
      const current = currentAccount()?.id?.trim();
      if (current && current !== accId) return;
      void refreshUiAfterImapPush(ev.payload.mailbox?.trim() || "INBOX");
    });
    // La sync IMAP démarre après le premier `loadMailView` (voir `bootLoadInitialMailData`)
    // pour ne pas saturer SQLite pendant l’affichage du cache local.
  }
  render();
}
