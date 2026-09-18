import { invoke } from "@tauri-apps/api/core";
import type { Account, MailAuthKind } from "../../accountSetup";
import { ACCOUNT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";
import { normalizeAccountRow } from "./accountRowNormalize";

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
