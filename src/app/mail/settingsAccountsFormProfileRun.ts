import type { Account } from "../../accountSetup";
import { accountFieldTouched } from "../../accountSetup";
import { state } from "../state";
import { getDiscoveredServersFormSnap } from "../account/discoveredServerSnap";
import { getAccountsFormIdentityScratch } from "./settingsAccountsFormState";

export function settingsDraftProfile(): Account | undefined {
  if (state.settingsSelectedAccountId === "new") return undefined;
  return state.accounts.find((a) => a.id === state.settingsSelectedAccountId);
}

export function mergedProfileForAccountsForm(): Account | undefined {
  const base = settingsDraftProfile();
  const scratch = state.accountFormOAuthPrefill ?? getAccountsFormIdentityScratch();
  if (!getDiscoveredServersFormSnap() || accountFieldTouched.serverFields) {
    return base;
  }

  const displayName = scratch?.displayName?.trim() ?? base?.displayName ?? "";
  const email = scratch?.email?.trim() ?? base?.email ?? "";
  const snapImap = getDiscoveredServersFormSnap()!.imap;
  const snapSmtp = getDiscoveredServersFormSnap()!.smtp;
  if (base) {
    return { ...base, imap: snapImap, smtp: snapSmtp };
  }
  return {
    id: "__draft__",
    displayName,
    email,
    imap: snapImap,
    smtp: snapSmtp,
    authKind: state.accountFormAuthKind,
  };
}
