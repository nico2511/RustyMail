import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { loadContactDetail, loadContactProfile, getContactDetail } from "../../contactsView";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { launchDomainMailSearch } from "./searchLaunchPresetsRun";

export async function handleContactsToggleFavorite(element?: HTMLElement): Promise<void> {
  const acc = currentAccount();
  const email = element?.dataset.email?.trim() || state.selectedContactEmail;
  const d = getContactDetail();
  if (!acc?.id || !email || !d) return;
  try {
    await invoke("upsert_manual_contact_cmd", {
      payload: {
        accountId: acc.id,
        email,
        displayName: d.displayName,
        notes: d.notes,
        isFavorite: !d.isFavorite,
      },
    });
    await loadContactDetail(acc.id, email);
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function handleContactsLlmProfile(element?: HTMLElement): Promise<void> {
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureContactProfileEnabled")) {
    toast("Activez « Profil IA contact » dans les réglages IA.");
    return;
  }
  const acc = currentAccount();
  const email = element?.dataset.email?.trim() || state.selectedContactEmail;
  if (!acc?.id || !email) return;
  await loadContactProfile(acc.id!, email);
  render();
  toast("Profil IA chargé.");
}

export function handleContactsSearchDomain(element?: HTMLElement): void {
  const domain = element?.dataset.domain?.trim();
  if (domain) void launchDomainMailSearch(domain);
}
