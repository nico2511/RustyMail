import { attachAtAutocomplete } from "../../atAutocomplete";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";
import { requireSearchAtAutocompleteWireDeps } from "./searchAtAutocompleteWireContext";

export function wireComposeAtAutocompleteFields(detachers: Array<() => void>): void {
  const d = requireSearchAtAutocompleteWireDeps();
  const accountId = currentAccount()?.id;
  const addressAutocompleteOn = () =>
    isAiFeatureEnabled(state.appPrefs.ai, "featureAddressAutocompleteEnabled");
  const chipSpecs: Array<{
    host: string;
    field: "to" | "cc" | "bcc";
  }> = [
    { host: "#compose-to-host", field: "to" },
    { host: "#compose-cc-host", field: "cc" },
    { host: "#compose-bcc-host", field: "bcc" },
  ];
  for (const spec of chipSpecs) {
    const el = document
      .querySelector<HTMLElement>(spec.host)
      ?.querySelector<HTMLInputElement>(".compose-recipients-input");
    if (!el) continue;
    detachers.push(
      attachAtAutocomplete({
        input: el,
        accountId,
        mode: "compose",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        composeChipMode: true,
        onComposePick: (email, displayName) => {
          const handle = d.composeChipsHandle(spec.field);
          handle?.addRecipient(email, displayName);
          if (state.draft) {
            state.draft[spec.field] = handle?.getRecipients() ?? state.draft[spec.field];
          }
          d.scheduleDraftRevisionSave();
        },
      }),
    );
  }
  const composeBody = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (composeBody) {
    detachers.push(
      attachAtAutocomplete({
        input: composeBody,
        accountId,
        mode: "mention",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        onMentionPick: () => {
          d.scheduleDraftRevisionSave();
        },
      }),
    );
  }
}
