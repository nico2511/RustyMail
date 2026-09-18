import { clearAccountOAuthWizard } from "../account/accountWizardState";
import { clearDiscoveredServerSnap } from "../account/discoveredServerSnap";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { Account } from "../../accountSetup";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { navigateToInbox } from "./appNavigationStack";
import { syncInbox } from "./syncInboxRun";
import { setOAuthWizardPhase } from "./accountOAuthWizardPhaseRun";

export async function finalizeOAuthNewAccountAfterSave(saved: Account): Promise<void> {
  clearDiscoveredServerSnap();
  state.accountFormOAuthPrefill = null;
  state.oauthLockedEmail = null;

  state.selectedAccountId = saved.id;
  state.settingsSelectedAccountId = saved.id;
  state.listFilter = "all";
  state.search = "";
  state.searchDraft = "";
  state.searchSenders = [];
  state.searchTags = [];
  state.searchLanguageFilter = null;
  state.searchNewsletterRule = null;
  state.searchModifiersTouched = false;
  state.searchMailboxPath = null;
  state.searchNlMode = null;
  state.selectedThreadId = undefined;
  state.selectedThread = undefined;
  navigateToInbox({ resetStack: true });

  if (isTauriRuntime()) {
    state.mailboxes = await safeInvoke<string[]>(
      "list_imap_mailboxes",
      { accountId: saved.id },
      [],
      BOOT_INVOKE_TIMEOUT_MS,
    );
    ensureValidSelectedMailbox();
  }

  setOAuthWizardPhase("sync", `Synchronisation de tous les dossiers · ${saved.email}…`);
  await syncInbox({ allMailboxes: true });

  clearAccountOAuthWizard();
  state.accountOAuthWizardRetry = null;
  state.accountMessage = `Compte ${saved.email} prêt.`;
  toast(`Compte ${saved.displayName || saved.email} ajouté et synchronisé.`);
  render();
}
