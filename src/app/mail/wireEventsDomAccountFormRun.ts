// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  serverFieldSelectors,
  serverSidesFromPreset,
} from "../../accountSetup";
import { setDiscoveredServersFormSnap } from "../account/discoveredServerSnap";
import { switchActiveAccount } from "./settingsWireActions";
import { state } from "../state";
import { render } from "../dispatch";

export function wireEventsDomAccountForm(signal: AbortSignal): void {
  document.querySelector<HTMLSelectElement>("#account-select")?.addEventListener("change", (event) => {
    void (async () => {
      const id = (event.currentTarget as HTMLSelectElement).value || state.accounts[0]?.id || "";
      await switchActiveAccount(id);
      render();
    })();
  });

  document.querySelector<HTMLInputElement>("#account-email")?.addEventListener("input", (event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    applyDomainPresetIfSafe(value, {
      onApplied(domain, preset) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(preset));
        state.accountMessage = `Préréglage local pour « ${domain} ».`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
  });
  for (const selector of serverFieldSelectors()) {
    document.querySelector<HTMLElement>(selector)?.addEventListener("input", () => {
      accountFieldTouched.serverFields = true;
    });
    document.querySelector<HTMLElement>(selector)?.addEventListener("change", () => {
      accountFieldTouched.serverFields = true;
    });
  }
}
