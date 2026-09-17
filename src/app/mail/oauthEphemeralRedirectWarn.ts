import { OAUTH_LOOPBACK_DEFAULT_PORT } from "../core/timeouts";
import { toast } from "../lib/toast";
import type { OAuthDesktopLoginOutcome } from "../types";

export function warnOAuthEphemeralRedirect(outcome: OAuthDesktopLoginOutcome): void {
  if (!outcome.ephemeralRedirect) return;
  const uri = (outcome.redirectUri ?? "").trim();
  toast(
    `OAuth : le port ${OAUTH_LOOPBACK_DEFAULT_PORT} est occupé — redirect éphémère ${uri || "(inconnu)"}. ` +
      `N’utilisez pas ce flux sans ajouter cette URI dans Entra, ou fermez l’autre RustyMail / libérez le port ` +
      `(netstat -ano | findstr :${OAUTH_LOOPBACK_DEFAULT_PORT}).`,
    18_000,
  );
}
