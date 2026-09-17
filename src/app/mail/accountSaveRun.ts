import { invoke } from "@tauri-apps/api/core";
import type { Account, MailAuthKind, SecurityMode } from "../../accountSetup";
import { clearAccountOAuthWizard } from "../account/accountWizardState";
import { clearDiscoveredServerSnap } from "../account/discoveredServerSnap";
import { ACCOUNT_INVOKE_TIMEOUT_MS, BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { checkedValue, inputValue, numberValue, selectValue } from "../lib/domForm";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { normalizeAccountRow } from "./accountRowNormalize";
import { navigateToInbox } from "./appNavigationStack";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { syncInbox } from "./syncInboxRun";

export async function saveAccountProgrammatic(profile: {
  displayName: string;
  email: string;
  authKind: MailAuthKind;
  imap: Account["imap"];
  smtp: Account["smtp"];
}): Promise<Account | null> {
  const emailNorm = profile.email.trim().toLowerCase();
  if (!profile.email.includes("@")) {
    throw new Error("E-mail invalide.");
  }
  if (state.accounts.some((a) => a.id === emailNorm)) {
    throw new Error("Ce compte existe déjà — sélectionnez-le dans la liste.");
  }
  const request = {
    displayName: profile.displayName.trim() || profile.email,
    email: profile.email.trim(),
    password: "",
    authKind: profile.authKind,
    imapHost: profile.imap.host,
    imapPort: profile.imap.port,
    imapSecurity: profile.imap.security,
    imapAllowInvalidTls: profile.imap.allowInvalidTls,
    smtpHost: profile.smtp.host,
    smtpPort: profile.smtp.port,
    smtpSecurity: profile.smtp.security,
    smtpAllowInvalidTls: profile.smtp.allowInvalidTls,
  };
  const savedRaw = await withTimeout(invoke<unknown>("save_account", { request }), ACCOUNT_INVOKE_TIMEOUT_MS);
  const saved = normalizeAccountRow(savedRaw);
  const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
  const accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
    .map((row) => normalizeAccountRow(row))
    .filter((a): a is Account => a !== null);
  state.accounts = accounts.length ? accounts : saved ? [saved] : [];
  if (saved) {
    if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
      state.selectedAccountId = saved.id;
    }
    state.settingsSelectedAccountId = saved.id;
  }
  return saved;
}

export async function saveAccount() {
  if (!isTauriRuntime()) {
    state.accountMessage =
      "L’enregistrement du compte sur disque requiert l’app Tauri (npm run tauri:dev), pas le navigateur seul.";
    render();
    toast(state.accountMessage);
    return;
  }

  const emailRaw = inputValue("account-email").trim();
  const emailNorm = emailRaw.toLowerCase();
  const editingId =
    state.view === "settings" && state.settingsTab === "accounts" && state.settingsSelectedAccountId !== "new"
      ? state.settingsSelectedAccountId.trim().toLowerCase()
      : null;
  const isNewProfile = editingId === null;

  const persistedEdit = editingId != null ? state.accounts.find((a) => a.id === editingId) : undefined;
  const authKindForSave: MailAuthKind =
    editingId != null
      ? state.oauthLockedEmail != null || state.accountFormAuthKind !== "password"
        ? state.accountFormAuthKind
        : (persistedEdit?.authKind ?? "password")
      : state.accountFormAuthKind;

  const request = {
    displayName: inputValue("account-display-name"),
    email: emailRaw,
    password: inputValue("account-password"),
    authKind: authKindForSave,
    imapHost: inputValue("imap-host"),
    imapPort: numberValue("imap-port", 993),
    imapSecurity: selectValue("imap-security", "Tls") as SecurityMode,
    imapAllowInvalidTls: checkedValue("imap-allow-invalid-tls"),
    smtpHost: inputValue("smtp-host"),
    smtpPort: numberValue("smtp-port", 587),
    smtpSecurity: selectValue("smtp-security", "StartTls") as SecurityMode,
    smtpAllowInvalidTls: checkedValue("smtp-allow-invalid-tls"),
    ...(editingId ? { previousAccountId: editingId } : {}),
  };

  if (!request.email.includes("@")) {
    state.accountMessage = "E-mail invalide.";
    render();
    return;
  }

  if (isNewProfile && state.accounts.some((a) => a.id === emailNorm)) {
    state.accountMessage = "Ce compte existe déjà. Sélectionnez-le dans la liste pour le modifier.";
    render();
    return;
  }

  const oauthNew =
    isNewProfile && (authKindForSave === "oauthGoogle" || authKindForSave === "oauthMicrosoft");

  if (!request.password && isNewProfile && !oauthNew) {
    state.accountMessage = "Mot de passe ou app password requis pour un nouveau compte (mode mot de passe).";
    render();
    return;
  }

  if (!request.imapHost || !request.smtpHost) {
    state.accountMessage = "Renseignez les hôtes IMAP et SMTP.";
    render();
    return;
  }

  state.accountMessage = "Enregistrement en cours (SQLite + trousseau)…";
  render();

  try {
    const savedRaw = await withTimeout(invoke<unknown>("save_account", { request }), ACCOUNT_INVOKE_TIMEOUT_MS);
    const saved = normalizeAccountRow(savedRaw);
    const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
    const accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (accounts.length === 0) {
      state.accountMessage =
        "Compte enregistré côté commande, mais la liste rechargée est vide — vérifiez les logs Tauri.";
      state.accounts = saved ? [saved] : [];
    } else {
      state.accounts = accounts;
      if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
        state.selectedAccountId = state.accounts[0]?.id;
      }
      state.accountMessage = `Compte enregistré : ${saved?.email ?? accounts[0]?.email ?? ""} (${accounts.length} dans SQLite).`;
    }
    if (editingId && state.selectedAccountId === editingId && saved) {
      state.selectedAccountId = saved.id;
    }
    if (state.view === "settings" && state.settingsTab === "accounts" && saved) {
      state.settingsSelectedAccountId = saved.id;
    }
    clearDiscoveredServerSnap();
    state.accountFormOAuthPrefill = null;
    state.oauthLockedEmail = null;
    clearAccountOAuthWizard();
    state.accountOAuthWizardRetry = null;
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
    const text = tauriErrorMessage(error);
    state.accountMessage = `Échec enregistrement : ${text}`;
    console.error("save_account / list_accounts", error);
    toast(state.accountMessage);
  }
  render();
}
