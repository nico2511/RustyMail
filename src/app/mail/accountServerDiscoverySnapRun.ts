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
} from "../../accountSetup";
import { ACCOUNT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";

export async function discoverServersSnapForEmail(
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
