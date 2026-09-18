import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { state } from "../state";
import { applySavedSearchView } from "./savedSearchViews";
import { closeSearchModal, openSearchModal } from "./searchBarUi";
import { syncInbox } from "./syncInboxRun";

export function handleAppShellKeyboardChords(event: KeyboardEvent): boolean {
  if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code)) {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return false;
    }
    const code = event.code;
    const byShortcut = state.savedSearches.find((s) => (s.shortcut || "").trim() === code);
    const idx = Number(code.replace("Digit", "")) - 1;
    const byIndex = !byShortcut ? state.savedSearches[idx] : undefined;
    const hit = byShortcut || byIndex;
    if (hit?.id) {
      event.preventDefault();
      void applySavedSearchView(hit.id);
      return true;
    }
    return false;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    if (state.searchModalOpen) closeSearchModal();
    else openSearchModal();
    return true;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "F5") {
    event.preventDefault();
    if (!isTauriRuntime()) {
      toast("Sync IMAP : disponible dans l’app Tauri.");
      return true;
    }
    if (state.syncInProgress) {
      toast("Synchronisation déjà en cours.");
      return true;
    }
    void syncInbox({ background: state.view === "thread" });
    return true;
  }
  return false;
}
