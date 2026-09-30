/** État de l'éditeur de découpe (Paramètres), distinct du banc d'essai. */

export type DigestCutZoneName = "header" | "body" | "footer";
export type DigestCutZoneAction = "show" | "hide" | "collapse";
export type DigestCutProposalSource = "heuristic" | "llm";

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

export const digestCut = {
  sampleLoaded: false,
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
  notice: "",
};

export function captureDigestCutDom(): void {
  const yaml = document.querySelector<HTMLTextAreaElement>("#digest-cut-yaml");
  if (yaml) digestCut.yaml = yaml.value;
}
