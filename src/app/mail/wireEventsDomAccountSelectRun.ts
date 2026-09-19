// @ts-nocheck — DOM wiring; tighten types incrementally.
import { switchActiveAccount } from "./settingsWireActions";
import { state } from "../state";
import { render } from "../dispatch";

export function wireEventsDomAccountSelect(): void {
  document.querySelector<HTMLSelectElement>("#account-select")?.addEventListener("change", (event) => {
    void (async () => {
      const id = (event.currentTarget as HTMLSelectElement).value || state.accounts[0]?.id || "";
      await switchActiveAccount(id);
      render();
    })();
  });
}
