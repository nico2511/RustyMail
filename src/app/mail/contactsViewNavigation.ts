import { recordActivity } from "../../activity";
import { clearContactProfile, loadContactDetail, loadContactsList } from "../../contactsView";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { beginNavigation } from "./appNavigationStack";
import { loadAddressBookSidebarCount } from "./loadAddressBookSidebarCount";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export async function openContactsView(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour le carnet.");
    return;
  }
  beginNavigation("contacts", { resetStack: true });
  state.view = "contacts";
  state.selectedContactEmail = undefined;
  clearContactProfile();
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  clearThreadAiSummaryState();
  render();
  try {
    await loadContactsList(acc.id, { reset: true });
    await loadAddressBookSidebarCount();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

export async function openContactDetailView(email: string, opts?: { skipHistory?: boolean }): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const em = email.trim().toLowerCase();
  if (!em) return;
  beginNavigation("contact", { skipHistory: opts?.skipHistory });
  state.view = "contact";
  state.selectedContactEmail = em;
  clearContactProfile();
  render();
  try {
    await loadContactDetail(acc.id, em);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  recordActivity({ eventType: "contact_opened", senderEmail: em });
  render();
}
