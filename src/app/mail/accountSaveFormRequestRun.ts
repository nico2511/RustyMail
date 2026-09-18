import type { MailAuthKind, SecurityMode } from "../../accountSetup";
import { checkedValue, inputValue, numberValue, selectValue } from "../lib/domForm";
import { render } from "../dispatch";
import { state } from "../state";

export type AccountSaveInvokeRequest = {
  displayName: string;
  email: string;
  password: string;
  authKind: MailAuthKind;
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityMode;
  imapAllowInvalidTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityMode;
  smtpAllowInvalidTls: boolean;
  previousAccountId?: string;
};

export type ValidatedAccountSaveForm = {
  request: AccountSaveInvokeRequest;
  editingId: string | null;
  emailNorm: string;
};

export function readValidatedAccountSaveForm(): ValidatedAccountSaveForm | null {
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

  const request: AccountSaveInvokeRequest = {
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
    return null;
  }

  if (isNewProfile && state.accounts.some((a) => a.id === emailNorm)) {
    state.accountMessage = "Ce compte existe déjà. Sélectionnez-le dans la liste pour le modifier.";
    render();
    return null;
  }

  const oauthNew =
    isNewProfile && (authKindForSave === "oauthGoogle" || authKindForSave === "oauthMicrosoft");

  if (!request.password && isNewProfile && !oauthNew) {
    state.accountMessage = "Mot de passe ou app password requis pour un nouveau compte (mode mot de passe).";
    render();
    return null;
  }

  if (!request.imapHost || !request.smtpHost) {
    state.accountMessage = "Renseignez les hôtes IMAP et SMTP.";
    render();
    return null;
  }

  return { request, editingId, emailNorm };
}
