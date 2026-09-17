import { mailboxDigestSlotInList } from "./mailboxDigest";
import { state } from "../state";

export function threadReadingIsSimpleLayout(): boolean {
  return true;
}

export function aiSidePanelExpandedForShell(): boolean {
  if (state.view === "contacts" || state.view === "contact") return false;
  return state.aiOpen || mailboxDigestSlotInList();
}
