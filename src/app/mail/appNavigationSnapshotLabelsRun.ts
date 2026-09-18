import { getContactDetail } from "../../contactsView";
import { threadMailboxListLabel } from "../../mailboxKinds";
import type { View } from "../types";
import { state } from "../state";
import { navMailboxSegment } from "./navBreadcrumbSegments";

export function navSnapshotLabelsForView(view: View): { backLabel: string; breadcrumb: string[] } {
  switch (view) {
    case "list":
      return { backLabel: navMailboxSegment(), breadcrumb: [navMailboxSegment()] };
    case "thread":
      return { backLabel: navMailboxSegment(), breadcrumb: [navMailboxSegment()] };
    case "contacts":
      return { backLabel: "Carnet", breadcrumb: ["Carnet"] };
    case "contact": {
      const name = getContactDetail()?.displayName?.trim() || state.selectedContactEmail || "Contact";
      return { backLabel: "Contact", breadcrumb: ["Carnet", name] };
    }
    case "settings":
      return { backLabel: "Paramètres", breadcrumb: ["Paramètres"] };
    case "organization":
      return { backLabel: "Organiser", breadcrumb: ["Organiser"] };
    case "organizationV2":
      return { backLabel: "Organiser V2", breadcrumb: ["Organiser V2"] };
    case "folderManager": {
      const mb = state.folderManager.selectedMailbox?.trim();
      if (mb) {
        const label = threadMailboxListLabel(mb).label;
        return { backLabel: label, breadcrumb: ["Dossiers", label] };
      }
      return { backLabel: "Dossiers", breadcrumb: ["Dossiers"] };
    }
    case "compose":
      return {
        backLabel: state.selectedThread ? "Fil" : navMailboxSegment(),
        breadcrumb: state.selectedThread ? ["Fil", "Composer"] : [navMailboxSegment(), "Composer"],
      };
    default:
      return { backLabel: "Boîte de réception", breadcrumb: ["Boîte"] };
  }
}
