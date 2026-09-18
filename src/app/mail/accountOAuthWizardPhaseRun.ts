import type { OAuthAccountWizardPhase } from "../../accountSetup";
import { render } from "../dispatch";
import { state } from "../state";

export function setOAuthWizardPhase(phase: OAuthAccountWizardPhase, message: string, error?: string | null): void {
  state.accountOAuthWizardPhase = phase;
  state.accountOAuthWizardMessage = message;
  state.accountOAuthWizardError = error ?? null;
  render();
}
