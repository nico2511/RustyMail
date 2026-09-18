import { invoke } from "@tauri-apps/api/core";
import { OAUTH_DESKTOP_LOGIN_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { setSkipAccountIdentityCaptureOnce } from "./wireEventsDepsContext";
import type { OAuthDesktopLoginOutcome } from "../types";
import { finishOAuthNewAccountAfterLogin } from "./accountSettingsRun";
import { warnOAuthEphemeralRedirect } from "./oauthEphemeralRedirectWarn";

export async function runOAuthDesktopConnect(
  invokeCmd: "oauth_google_desktop_login_cmd" | "oauth_microsoft_desktop_login_cmd",
  authKind: "oauthGoogle" | "oauthMicrosoft",
  providerLabel: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    toast("OAuth2 : lancez l’application bureau Tauri.");
    return;
  }
  try {
    const o = await withTimeout(invoke<OAuthDesktopLoginOutcome>(invokeCmd, {}), OAUTH_DESKTOP_LOGIN_TIMEOUT_MS);
    warnOAuthEphemeralRedirect(o);
    const email = (o.email ?? "").trim();
    if (!email.includes("@")) {
      toast(`OAuth ${providerLabel} : adresse e-mail absente ou invalide.`);
      return;
    }
    setSkipAccountIdentityCaptureOnce(true);
    await finishOAuthNewAccountAfterLogin(authKind, email, (o.displayName ?? "").trim());
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
