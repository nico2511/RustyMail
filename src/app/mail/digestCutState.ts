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
  previewing: false,
  previewApplicable: null as boolean | null,
  previewHtml: "",
  previewError: "",
  showCode: false,
  notice: "",
};

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
