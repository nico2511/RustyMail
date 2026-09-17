import type { OrgActionOverride } from "../../organizationView";
import { state } from "../state";

export function orgApplyStatusMessage(proposalId: string, actionOverride?: OrgActionOverride | null): string {
  if (actionOverride === "trash") return "Mise en corbeille (lot)…";
  if (actionOverride === "archive") return "Archivage (lot)…";
  if (actionOverride === "markRead") return "Marquage comme lu (lot)…";
  const p = state.organization.report?.proposals.find((x) => x.id === proposalId);
  if (!p) return "Traitement organisation…";
  switch (p.suggestedAction) {
    case "retag":
      return "Normalisation des tags (lot)…";
    case "archive":
      return "Archivage (lot)…";
    case "trash":
      return "Mise en corbeille (lot)…";
    case "markRead":
      return "Marquage comme lu (lot)…";
    case "move":
      return p.targetMailbox ? `Déplacement vers « ${p.targetMailbox} »…` : "Déplacement (lot)…";
    case "deleteMailbox":
      return "Suppression des dossiers vides…";
    default:
      return "Traitement organisation…";
  }
}
