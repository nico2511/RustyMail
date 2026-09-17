import { escapeAttr } from "../../ui/sanitize";
import { state } from "../state";
import { isMailboxDigestFeatureEnabled } from "./mailboxDigestContext";
import { mailboxDigestPanelEligible, mailboxDigestSlotInList } from "./mailboxDigestPanelRun";

export function renderMailboxDigestTriggerButton(extraClass = ""): string {
  if (!isMailboxDigestFeatureEnabled()) return "";
  if (!mailboxDigestPanelEligible()) return "";
  const open = mailboxDigestSlotInList();
  const busy = state.mailboxDigestRefreshing && open;
  const title = open ? "Fermer le brief d’action du dossier" : "Ouvrir le brief d’action IA du dossier";
  const cls = ["ghost-button", "status-bar-digest-trigger", extraClass, open ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="${cls}" data-action="toggle-mailbox-digest-panel" aria-expanded="${open ? "true" : "false"}" title="${escapeAttr(title)}">${
    busy ? `<span class="mini-sync"><span class="spinner" aria-hidden="true"></span><span>Brief</span></span>` : "Brief"
  }</button>`;
}
