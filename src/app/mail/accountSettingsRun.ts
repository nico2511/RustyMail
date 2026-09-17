import { invoke } from "@tauri-apps/api/core";

import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  oauthProviderFallbackPreset,
  serverSidesFromDiscovery,
  serverSidesFromPreset,
  type Account,
  type DiscoverMailServersResult,
  type MailAuthKind,
  type OAuthAccountWizardPhase,
  type SecurityMode,
} from "../../accountSetup";
import {
  clearDiscoveredServerSnap,
  setDiscoveredServersFormSnap,
} from "../account/discoveredServerSnap";
import { clearAccountOAuthWizard } from "../account/accountWizardState";
import {
  ACCOUNT_INVOKE_TIMEOUT_MS,
  BOOT_INVOKE_TIMEOUT_MS,
  MAIL_ACTION_TIMEOUT_MS,
} from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { checkedValue, inputValue, numberValue, selectValue } from "../lib/domForm";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { normalizeAccountRow } from "./accountRowNormalize";
import { navigateToInbox } from "./appNavigationStack";
import { loadMailView, loadMailboxUnread } from "./mailListView";
import { syncInbox } from "./syncInboxRun";

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
      ACCOUNT_INVOKE_TIMEOUT_MS
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
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
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

function setOAuthWizardPhase(phase: OAuthAccountWizardPhase, message: string, error?: string | null) {
  state.accountOAuthWizardPhase = phase;
  state.accountOAuthWizardMessage = message;
  state.accountOAuthWizardError = error ?? null;
  render();
}

async function discoverServersSnapForEmail(
  email: string,
  authKind: MailAuthKind,
): Promise<{ snap: { imap: Account["imap"]; smtp: Account["smtp"] }; sourceLabel: string }> {
  accountFieldTouched.serverFields = false;
  let snap: { imap: Account["imap"]; smtp: Account["smtp"] } | null = null;
  let sourceLabel = "";

  const preset = applyDomainPresetIfSafe(email, {
    onApplied(_domain, p) {
      snap = serverSidesFromPreset(p);
      sourceLabel = "Préréglage domaine";
    },
  });
  if (preset && snap) {
    if (isTauriRuntime()) {
      try {
        const raw = await withTimeout(
          invoke<DiscoverMailServersResult>("discover_mail_servers", { email }),
          ACCOUNT_INVOKE_TIMEOUT_MS,
        );
        snap = serverSidesFromDiscovery(raw);
        sourceLabel = raw.sourceLabel;
      } catch {
        /* garde le préréglage */
      }
    }
    return { snap, sourceLabel };
  }

  if (isTauriRuntime()) {
    const raw = await withTimeout(
      invoke<DiscoverMailServersResult>("discover_mail_servers", { email }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    return { snap: serverSidesFromDiscovery(raw), sourceLabel: raw.sourceLabel };
  }

  const fallback = oauthProviderFallbackPreset(authKind);
  if (!fallback) {
    throw new Error("Impossible de déterminer les serveurs IMAP/SMTP pour cette adresse.");
  }
  return { snap: serverSidesFromPreset(fallback), sourceLabel: "Préréglage fournisseur OAuth" };
}

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

export async function finishOAuthNewAccountAfterLogin(
  authKind: "oauthGoogle" | "oauthMicrosoft",
  email: string,
  displayName: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    toast("OAuth2 : lancez l’application bureau Tauri.");
    return;
  }

  const emailNorm = email.trim().toLowerCase();
  state.accountPasswordSetupExpanded = false;
  state.accountFormAuthKind = authKind;
  state.oauthLockedEmail = emailNorm;
  state.accountFormOAuthPrefill = { email: email.trim(), displayName: displayName.trim() };
  state.accountOAuthWizardRetry = { authKind, email: email.trim(), displayName: displayName.trim() };
  accountFieldTouched.serverFields = false;
  state.accountMessage = "";

  try {
    setOAuthWizardPhase("discover", `Détection des serveurs pour ${email.trim()}…`);
    const { snap, sourceLabel } = await discoverServersSnapForEmail(email.trim(), authKind);
    setDiscoveredServersFormSnap(snap);
    state.accountMessage = sourceLabel;

    setOAuthWizardPhase("save", "Enregistrement du compte (SQLite + trousseau)…");
    const saved = await saveAccountProgrammatic({
      displayName: displayName.trim() || email.trim(),
      email: email.trim(),
      authKind,
      imap: snap.imap,
      smtp: snap.smtp,
    });
    if (!saved) {
      throw new Error("Enregistrement refusé par le serveur local.");
    }

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
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: saved.id }, [], BOOT_INVOKE_TIMEOUT_MS);
      ensureValidSelectedMailbox();
    }

    setOAuthWizardPhase("sync", `Synchronisation de tous les dossiers · ${saved.email}…`);
    await syncInbox({ allMailboxes: true });

    clearAccountOAuthWizard();
    state.accountOAuthWizardRetry = null;
    state.accountMessage = `Compte ${saved.email} prêt.`;
    toast(`Compte ${saved.displayName || saved.email} ajouté et synchronisé.`);
    render();
  } catch (e) {
    const text = tauriErrorMessage(e);
    state.accountOAuthWizardPhase = "error";
    state.accountOAuthWizardMessage = "La configuration automatique a échoué.";
    state.accountOAuthWizardError = text;
    state.accountMessage = text;
    state.accountServersPanelOpen = true;
    toast(text);
    render();
  }
}

export async function discoverMailServersAction(): Promise<void> {
  const emailRaw = inputValue("account-email").trim();
  if (!emailRaw.includes("@")) {
    toast("Saisissez une adresse e-mail complète avant la détection.");
    return;
  }
  if (accountFieldTouched.serverFields) {
    const ok = await openConfirmModal({
      title: "Remplacer les serveurs ?",
      body: "Les serveurs ont été modifiés à la main. Les remplacer par le résultat de la détection ?",
      confirmLabel: "Remplacer",
    });
    if (!ok) return;
    accountFieldTouched.serverFields = false;
  }

  if (!isTauriRuntime()) {
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(p));
        state.accountMessage = `Préréglage local (${domain}) — lancez RustyMail en mode bureau pour ISPDB, .well-known et autoconfig.`;
        accountFieldTouched.serverFields = false;
        state.accountServersPanelOpen = true;
        render();
      },
    });
    if (!preset) {
      toast("Aucun préréglage local pour ce domaine · lancement en application bureau nécessaire pour la détection automatique étendue.");
    }
    return;
  }

  try {
    toast("Détection des serveurs (ISPDB Mozilla, .well-known, autoconfig, préréglages locaux…)…");
    const raw = await withTimeout(
      invoke<DiscoverMailServersResult>("discover_mail_servers", { email: emailRaw }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    setDiscoveredServersFormSnap(serverSidesFromDiscovery(raw));
    accountFieldTouched.serverFields = false;
    state.accountMessage = raw.sourceLabel;
    state.accountServersPanelOpen = true;
    render();
  } catch (err) {
    const text = tauriErrorMessage(err);
    toast(text);
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(p));
        state.accountMessage = `Préréglage local (${domain}) après échec : ${text}`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
    if (!preset) {
      state.accountMessage = text;
      render();
    }
  }
}

export async function saveAccount() {
  if (!isTauriRuntime()) {
    state.accountMessage = "L’enregistrement du compte sur disque requiert l’app Tauri (npm run tauri:dev), pas le navigateur seul.";
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
    editingId != null ?
      state.oauthLockedEmail != null || state.accountFormAuthKind !== "password" ?
        state.accountFormAuthKind
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
    ...(editingId ? { previousAccountId: editingId } : {})
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
      state.accountMessage = "Compte enregistré côté commande, mais la liste rechargée est vide — vérifiez les logs Tauri.";
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
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
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

