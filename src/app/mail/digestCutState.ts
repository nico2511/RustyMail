/** État de l'éditeur de découpe (Paramètres). Le mail vient de la boîte, du message ouvert, ou d'un .eml. */

import type { ThreadListItem } from "../types";

export type DigestCutZoneName = "header" | "body" | "footer";
export type DigestCutZoneAction = "show" | "hide" | "collapse";
export type DigestCutProposalSource = "heuristic" | "llm";
export type DigestCutSourceKind = "none" | "mailbox" | "open" | "eml";

export type DigestCutAnchor = {
  selector?: string | null;
  classContains?: string | null;
  index?: number | null;
  textContainsAny?: string[];
  role?: "title" | "amount" | null;
};

export type DigestCutZone = {
  action: DigestCutZoneAction;
  presentation?: "prominent" | "key_value" | "as_is" | null;
  anchors: DigestCutAnchor[];
  detailsHeading?: string | null;
  rowSelector?: string | null;
  rationale?: string | null;
};

export type DigestCutProposal = {
  fixtureId: string;
  ruleSetVersion: string;
  source: DigestCutProposalSource;
  explanationFr?: string;
  match: {
    senderDomains: Array<{ exact?: string | null; suffix?: string | null }>;
    structureRoot: string;
    minChildren: number;
  };
  zones: {
    header: DigestCutZone;
    body: DigestCutZone;
    footer: DigestCutZone;
  };
};

export type DigestCutMessage = {
  id: string;
  sender: string;
  senderEmail: string;
  receivedAt: string;
  html: string;
};

export type DigestCutPaintPick = {
  tag: string;
  classContains: string | null;
  index: number | null;
  label: string;
  /** Sélecteur du parent (= structureRoot côté moteur Rust). */
  structureRoot?: string;
  textContainsAny?: string[];
};

/** Contrôle local (ou après IA) qu’une zone vise un balisage complet et cohérent. */
export type DigestCutZoneCheck = {
  status: "ok" | "warn" | "bad";
  source: "heuristic" | "llm";
  completeMarkup: boolean;
  resolvable: boolean;
  message: string;
};

export const digestCut = {
  sourceKind: "none" as DigestCutSourceKind,
  queryDraft: "",
  searching: false,
  searchError: "",
  threads: [] as ThreadListItem[],
  selectedThreadId: null as string | null,
  threadSubject: "",
  messages: [] as DigestCutMessage[],
  selectedMessageId: null as string | null,
  html: "",
  senderEmail: "",
  subject: "",
  proposal: null as DigestCutProposal | null,
  yaml: "",
  yamlReady: false,
  proposing: false,
  reformatting: false,
  previewing: false,
  previewApplicable: null as boolean | null,
  previewHtml: "",
  /** Lecture réécrite par l’IA (prioritaire sur l’aperçu fixture). */
  reformattedHtml: "",
  previewError: "",
  showCode: false,
  notice: "",
  /** Zone en cours de peinture visuelle (null = navigation seule). */
  paintZone: null as DigestCutZoneName | null,
  /** Nœud sélectionné dans le panneau Mail. */
  paintPick: null as DigestCutPaintPick | null,
  /** Contrôle du bloc sous le curseur / sélection. */
  paintCheck: null as DigestCutZoneCheck | null,
  /** Contrôle par zone après proposition ou assignation. */
  zoneChecks: {
    header: null as DigestCutZoneCheck | null,
    body: null as DigestCutZoneCheck | null,
    footer: null as DigestCutZoneCheck | null,
  },
};

export function formatAnchorSummary(anchors: DigestCutAnchor[]): string {
  if (!anchors.length) return "—";
  return anchors
    .slice(0, 4)
    .map((a) => {
      const bits: string[] = [];
      if (a.selector) bits.push(a.selector);
      if (a.classContains) bits.push(`.…${a.classContains}`);
      if (a.index != null) bits.push(`[${a.index}]`);
      if (a.role) bits.push(`role=${a.role}`);
      if (a.textContainsAny?.length) bits.push(`«${a.textContainsAny[0]}»`);
      return bits.join("") || "?";
    })
    .join(", ");
}

export function captureDigestCutDom(): void {
  const query = document.querySelector<HTMLInputElement>("#digest-cut-query");
  const yaml = document.querySelector<HTMLTextAreaElement>("#digest-cut-yaml");
  if (query) digestCut.queryDraft = query.value;
  if (yaml) digestCut.yaml = yaml.value;
}

const ZONE_LABEL: Record<DigestCutZoneName, string> = {
  header: "En-tête",
  body: "Corps",
  footer: "Pied",
};

export function explainZonesFr(proposal: DigestCutProposal): string {
  const line = (name: DigestCutZoneName) => {
    const zone = proposal.zones[name];
    const verb = zone.action === "hide" ? "masqué" : zone.action === "collapse" ? "replié" : "affiché";
    const why = zone.rationale?.trim();
    return why ? `${ZONE_LABEL[name]} ${verb} — ${why}` : `${ZONE_LABEL[name]} ${verb}.`;
  };
  return `${line("header")} ${line("body")} ${line("footer")} La lecture des mails ne change pas depuis cet écran.`;
}
