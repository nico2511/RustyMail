import { state } from "../state";
import { captureAccountsFormIdentityFromDom } from "./settingsAccountsFormState";
import { skipAccountIdentityCaptureOnceRef } from "./appShellRenderRefs";

export function captureAccountsFormBeforeRender(): void {
  if (state.view === "settings" && state.settingsTab === "accounts") {
    captureAccountsFormIdentityFromDom(skipAccountIdentityCaptureOnceRef.current);
    if (skipAccountIdentityCaptureOnceRef.current) {
      skipAccountIdentityCaptureOnceRef.current = false;
    }
  } else {
    captureAccountsFormIdentityFromDom(true);
  }
}
