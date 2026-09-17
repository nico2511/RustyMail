import { getContactDetail } from "../../contactsView";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { state } from "../state";

export function navMailboxSegment(mailbox?: string): string {
  const { label } = threadMailboxListLabel(mailbox ?? state.selectedMailbox);
  return label;
}

export function navCurrentBreadcrumbSegment(): string | null {
  switch (state.view) {
    case "list":
      return navMailboxSegment();
    case "thread": {
      const subj = state.selectedThread?.subject?.trim();
      return subj ? (subj.length > 36 ? `${subj.slice(0, 33)}…` : subj) : "Fil";
    }
    case "compose":
      return "Composer";
    case "settings":
      return "Paramètres";
    case "contacts":
      return "Carnet";
    case "contact": {
      const em = state.selectedContactEmail ?? getContactDetail()?.email;
      const name = getContactDetail()?.displayName?.trim();
      return name || em || "Contact";
    }
    case "organization":
      return "Organiser";
    case "organizationV2":
      return "Organiser V2";
    case "folderManager":
      return "Dossiers";
    default:
      return null;
  }
}
