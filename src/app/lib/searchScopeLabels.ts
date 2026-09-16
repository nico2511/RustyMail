import { threadMailboxListLabel } from "../../mailboxKinds";
import { truncateSearchBadgeLabel } from "./searchBadgeLabel";
import { state } from "../state";

export function searchScopeLabel(): string {
  if (state.searchScope === "mailbox") {
    const mb = state.selectedMailbox || "INBOX";
    const { full } = threadMailboxListLabel(mb);
    return `Dossier affiché (barre latérale) : ${full}`;
  }
  return "Tout le compte";
}

export function searchScopeBadgeShort(): string {
  if (state.searchScope === "account") return "Compte";
  const mb = state.selectedMailbox || "INBOX";
  const { label } = threadMailboxListLabel(mb);
  return truncateSearchBadgeLabel(label, 20);
}
