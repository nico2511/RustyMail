import { runOAuthDesktopConnect } from "./accountOAuthDesktopConnectCoreRun";

export async function connectOAuthGoogleDesktop(): Promise<void> {
  await runOAuthDesktopConnect("oauth_google_desktop_login_cmd", "oauthGoogle", "Google");
}

export async function connectOAuthMicrosoftDesktop(): Promise<void> {
  await runOAuthDesktopConnect("oauth_microsoft_desktop_login_cmd", "oauthMicrosoft", "Microsoft");
}
