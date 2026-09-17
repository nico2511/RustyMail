import { invoke } from "@tauri-apps/api/core";
import {
  ACCOUNT_INVOKE_TIMEOUT_MS,
  BOOT_INVOKE_TIMEOUT_MS,
  MAIL_ACTION_TIMEOUT_MS,
} from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import type { Account } from "../../accountSetup";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { normalizeAccountRow } from "./accountRowNormalize";
import { loadMailView, loadMailboxUnread } from "./mailListView";

export async function deleteSettingsAccount() {
  if (!isTauriRuntime()) {
    toast("La suppression du compte requiert l’app Tauri (npm run tauri:dev).");
    return;
  }
  const id = state.settingsSelectedAccountId;
  if (id === "new") return;
  const confirmed = await openConfirmModal({
    title: "Supprimer ce compte ?",
    body:
      "Toutes les données locales de ce compte seront effacées : messages, pièces jointes en base, cache IMAP, et index de recherche sémantique (vecteurs embeddings) pour ces messages. Le mot de passe IMAP/SMTP sera retiré du trousseau. Les modèles IA téléchargés (ex. MiniLM ONNX) restent sur le disque tant qu’un autre compte peut les réutiliser. Les règles anti-newsletter sont globales au profil : elles ne sont pas supprimées avec un seul compte. Les fichiers enregistrés ailleurs (ex. Téléchargements) ne sont pas effacés.",
    danger: true,
    confirmLabel: "Supprimer le compte",
  });
  if (!confirmed) return;

  try {
    await withTimeout(
      invoke("delete_account", { accountId: id, destructiveAck: "delete-account" }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
    state.accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (state.selectedAccountId === id) {
      state.selectedAccountId = state.accounts[0]?.id;
    }
    if ((state.appPrefs.general.defaultAccountId ?? "").trim() === id) {
      delete state.appPrefs.general.defaultAccountId;
      try {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      } catch {
        /* ignore */
      }
    }
    state.settingsSelectedAccountId = state.accounts[0]?.id ?? "new";
    state.accountMessage = "Compte supprimé.";
    if (isTauriRuntime()) {
      state.mailboxes = await safeInvoke<string[]>(
        "list_imap_mailboxes",
        { accountId: currentAccount()?.id ?? null },
        [],
        BOOT_INVOKE_TIMEOUT_MS,
      );
      ensureValidSelectedMailbox();
      await loadMailView();
      await loadMailboxUnread();
    }
  } catch (error) {
    state.accountMessage = `Échec suppression : ${tauriErrorMessage(error)}`;
    console.error("delete_account", error);
    toast(state.accountMessage);
  }
  render();
}
