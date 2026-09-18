import { navCanGoBack } from "../../navigation";
import { render } from "../dispatch";
import { state } from "../state";
import { goBack } from "./appNavigationStack";
import {
  dismissMailboxDigestPanel,
  mailboxDigestSlotInList,
} from "./mailboxDigest";
import { closeSearchModal } from "./searchBarUi";
import { finalizeSettingsAiModalClose } from "./settingsWireActions";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

/** @returns true if Escape was handled */
export function handleAppShellKeyboardEscape(event: KeyboardEvent): boolean {
  if (event.key !== "Escape") return false;
  if (state.settingsAiModal) {
    event.preventDefault();
    finalizeSettingsAiModalClose();
    state.settingsAiModal = null;
    render();
    return true;
  }
  if (state.resumeDraftModal) {
    event.preventDefault();
    state.resumeDraftModal = null;
    render();
    return true;
  }
  if (state.closeComposeModal) {
    event.preventDefault();
    state.closeComposeModal = null;
    render();
    return true;
  }
  if (state.searchModalOpen) {
    event.preventDefault();
    closeSearchModal();
    return true;
  }
  if (state.quoteFoldModal) {
    state.quoteFoldModal = null;
    event.preventDefault();
    render();
    return true;
  }
  if (state.threadTagsModalOpen) {
    state.threadTagsModalOpen = false;
    event.preventDefault();
    render();
    return true;
  }
  if (navCanGoBack() || state.view !== "list") {
    event.preventDefault();
    if (state.view === "thread") clearThreadAiSummaryState();
    void goBack();
    return true;
  }
  if (state.aiOpen || state.aiQuickPanelOpen || state.mailboxDigestPanelOpen) {
    event.preventDefault();
    state.aiOpen = false;
    state.aiQuickPanelOpen = false;
    if (mailboxDigestSlotInList()) dismissMailboxDigestPanel();
    render();
    return true;
  }
  return false;
}
