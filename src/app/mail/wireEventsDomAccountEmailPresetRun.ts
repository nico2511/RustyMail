// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  serverFieldSelectors,
  serverSidesFromPreset,
} from "../../accountSetup";
import { setDiscoveredServersFormSnap } from "../account/discoveredServerSnap";
import { state } from "../state";
import { render } from "../dispatch";

export function wireEventsDomAccountEmailPreset(signal: AbortSignal): void {
  document.querySelector<HTMLInputElement>("#account-email")?.addEventListener(
    "input",
    (event) => {
      const value = (event.currentTarget as HTMLInputElement).value;
      applyDomainPresetIfSafe(value, {
        onApplied(domain, preset) {
          setDiscoveredServersFormSnap(serverSidesFromPreset(preset));
          state.accountMessage = `Préréglage local pour « ${domain} ».`;
          accountFieldTouched.serverFields = false;
          render();
        },
      });
    },
    { signal },
  );
  for (const selector of serverFieldSelectors()) {
    document.querySelector<HTMLElement>(selector)?.addEventListener(
      "input",
      () => {
        accountFieldTouched.serverFields = true;
      },
      { signal },
    );
    document.querySelector<HTMLElement>(selector)?.addEventListener(
      "change",
      () => {
        accountFieldTouched.serverFields = true;
      },
      { signal },
    );
  }
}
