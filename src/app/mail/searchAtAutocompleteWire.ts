import { isTauriRuntime } from "../lib/tauriRuntime";
import { wireSearchAtAutocompleteFields } from "./searchAtAutocompleteSearchFieldsRun";
import { wireComposeAtAutocompleteFields } from "./searchAtAutocompleteComposeFieldsRun";

export {
  registerSearchAtAutocompleteWireDeps,
  type SearchAtAutocompleteWireDeps,
} from "./searchAtAutocompleteWireContext";

let atAutocompleteDetach: (() => void) | null = null;

export function wireAtAutocompleteFields(): void {
  atAutocompleteDetach?.();
  atAutocompleteDetach = null;
  if (!isTauriRuntime()) return;
  const detachers: Array<() => void> = [];
  wireSearchAtAutocompleteFields(detachers);
  wireComposeAtAutocompleteFields(detachers);
  if (detachers.length) {
    atAutocompleteDetach = () => {
      for (const detach of detachers) detach();
    };
  }
}
