import { invoke } from "@tauri-apps/api/core";
import { resolveDigestSearchAccountId, searchDigestToolThreads } from "../../digestToolSearch";
import type { DiscussionThreadView } from "../types";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { state } from "../state";
import {
  ensurePaintProposalSkeleton,
  expandCutNode,
  findElementForPick,
  pickFromElement,
  shrinkCutNode,
} from "./digestCutPaint";
import {
  applyValidatedPickToZone,
  checkSummaryFr,
  hasCompleteTagPair,
  revalidateProposalFromHtml,
  snapToCuttableBlock,
  validateElementForZone,
  validatePaintPick,
} from "./digestCutValidate";
import {
  captureDigestCutDom,
  digestCut,
  explainZonesFr,
  type DigestCutProposal,
  type DigestCutSourceKind,
  type DigestCutZoneAction,
  type DigestCutZoneName,
} from "./digestCutState";

type MailView = {
  html: string;
  senderEmail: string;
  subject: string;
};

type ProposeView = {
  proposal: DigestCutProposal;
  fromModel: boolean;
  fallbackReason?: string | null;
};

type YamlView = { yaml: string };

type PreviewView = {
  applicable: boolean;
  html?: string | null;
  fixtureId?: string | null;
  error?: string | null;
};

type ReformatView = {
  proposal: DigestCutProposal;
  readingHtml: string;
  fromModel: boolean;
  fallbackReason?: string | null;
};

function clearCutResult(): void {
  digestCut.proposal = null;
  digestCut.yaml = "";
  digestCut.yamlReady = false;
  digestCut.previewApplicable = null;
  digestCut.previewHtml = "";
  digestCut.reformattedHtml = "";
  digestCut.reformatting = false;
  digestCut.previewError = "";
  digestCut.showCode = false;
  digestCut.paintZone = null;
  digestCut.paintPick = null;
  digestCut.paintCheck = null;
  digestCut.zoneChecks = { header: null, body: null, footer: null };
}

function mailRootEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-digest-cut-mail]");
}

export function loadDigestCutMail(input: {
  sourceKind: Exclude<DigestCutSourceKind, "none">;
  html: string;
  senderEmail: string;
  subject: string;
  notice: string;
  messageId?: string | null;
}): void {
  clearCutResult();
  digestCut.sourceKind = input.sourceKind;
  digestCut.html = input.html;
  digestCut.senderEmail = input.senderEmail;
  digestCut.subject = input.subject;
  digestCut.selectedMessageId = input.messageId ?? digestCut.selectedMessageId;
  digestCut.notice = input.notice;
}

export async function searchDigestCutMailbox(): Promise<void> {
  captureDigestCutDom();
  const accountId = resolveDigestSearchAccountId();
  if (!accountId) {
    digestCut.searchError = "Choisissez un compte avant de chercher dans la boîte.";
    digestCut.threads = [];
    render();
    return;
  }
  if (!digestCut.queryDraft.trim()) {
    digestCut.searchError = "Indiquez un domaine, par exemple @exemple.fr, ou un mot du sujet.";
    digestCut.threads = [];
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestCut.searchError = "La recherche réelle passe par l'application.";
    render();
    return;
  }
  digestCut.searching = true;
  digestCut.searchError = "";
  render();
  try {
    digestCut.threads = await searchDigestToolThreads({
      draft: digestCut.queryDraft,
      newsletterRules: state.newsletterRules,
      archiveRoot: state.appPrefs.general.archiveRoot ?? "Archive",
    });
    if (digestCut.threads.length === 0) {
      digestCut.searchError =
        "Aucun fil pour cette recherche. Essayez @domaine sans #dossier, ou un autre compte.";
    }
  } catch (error) {
    digestCut.threads = [];
    digestCut.searchError = tauriErrorMessage(error);
  } finally {
    digestCut.searching = false;
    render();
  }
}

export async function openDigestCutThread(threadId: string): Promise<void> {
  captureDigestCutDom();
  const tid = threadId.trim();
  if (!tid || !isTauriRuntime()) return;
  digestCut.selectedThreadId = tid;
  digestCut.notice = "";
  try {
    const view = await invoke<DiscussionThreadView>("open_thread", { threadId: tid });
    digestCut.threadSubject = view.subject;
    digestCut.messages = view.messages.map((message) => ({
      id: message.messageId,
      sender: message.sender,
      senderEmail: message.senderEmail,
      receivedAt: message.receivedAt,
      html: message.htmlBody ?? "",
    }));
    const first = digestCut.messages.find((message) => message.html.trim()) ?? digestCut.messages[0];
    digestCut.selectedMessageId = first?.id ?? null;
    render();
    if (first?.html.trim()) await loadDigestCutMessage(first.id);
  } catch (error) {
    digestCut.notice = tauriErrorMessage(error);
    render();
  }
}

export async function loadDigestCutMessage(messageId: string): Promise<void> {
  captureDigestCutDom();
  const message = digestCut.messages.find((item) => item.id === messageId);
  if (!message) return;
  digestCut.selectedMessageId = messageId;
  if (!message.html.trim()) {
    digestCut.notice = "Ce message n'a pas de HTML. Choisissez un autre message du fil, ou importez un .eml.";
    render();
    return;
  }
  loadDigestCutMail({
    sourceKind: "mailbox",
    html: message.html,
    senderEmail: message.senderEmail,
    subject: digestCut.threadSubject || message.sender,
    messageId,
    notice: "Message chargé depuis la boîte. Proposez la découpe : explication en français, puis ajustez les zones.",
  });
  render();
}

export function loadDigestCutFromOpenMessage(): void {
  captureDigestCutDom();
  const thread = state.selectedThread;
  const messages = thread?.messages ?? [];
  const withHtml = [...messages].reverse().find((message) => (message.htmlBody ?? "").trim());
  if (!thread || !withHtml) {
    digestCut.notice = messages.length
      ? "Le mail ouvert n'a pas de HTML. Choisissez un autre message ou importez un .eml."
      : "Ouvrez un mail dans la lecture, puis revenez ici. Vous pouvez aussi chercher un domaine dans la boîte.";
    render();
    return;
  }
  loadDigestCutMail({
    sourceKind: "open",
    html: withHtml.htmlBody ?? "",
    senderEmail: withHtml.senderEmail,
    subject: thread.subject,
    messageId: withHtml.messageId,
    notice: "Mail déjà ouvert dans la lecture. Proposez la découpe pour une explication en français.",
  });
  render();
}

export async function importDigestCutEmlBase64(emlBase64: string): Promise<void> {
  captureDigestCutDom();
  if (!emlBase64.trim()) {
    digestCut.notice = "Fichier .eml vide.";
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestCut.notice = "L'import .eml passe par l'application.";
    render();
    return;
  }
  try {
    const mail = await invoke<MailView>("digest_cut_parse_eml", { payload: { emlBase64 } });
    loadDigestCutMail({
      sourceKind: "eml",
      html: mail.html,
      senderEmail: mail.senderEmail,
      subject: mail.subject,
      notice: "Fichier .eml chargé. Proposez la découpe pour une explication en français.",
    });
  } catch (error) {
    digestCut.notice = tauriErrorMessage(error);
  }
  render();
}

export async function proposeDigestCutZones(refine = false): Promise<void> {
  captureDigestCutDom();
  if (!digestCut.html.trim()) {
    digestCut.notice = "Chargez d'abord un mail de votre boîte, le mail déjà ouvert, ou un fichier .eml.";
    render();
    return;
  }
  if (refine && !digestCut.proposal) {
    digestCut.notice = "Proposez d'abord une découpe, ajustez les zones, puis affinez.";
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestCut.notice = "La proposition passe par l'application.";
    render();
    return;
  }
  digestCut.proposing = true;
  digestCut.notice = refine ? "Affinage avec le modèle local…" : "Proposition en cours…";
  render();
  try {
    const view = await invoke<ProposeView>("digest_cut_propose_zones", {
      payload: {
        html: digestCut.html,
        senderEmail: digestCut.senderEmail,
        useLlm: true,
        current: refine ? digestCut.proposal : null,
      },
    });
    digestCut.proposal = view.proposal;
    digestCut.reformattedHtml = "";
    if (!view.proposal.explanationFr?.trim()) {
      view.proposal.explanationFr = explainZonesFr(view.proposal);
    }
    revalidateProposalFromHtml(
      view.proposal,
      digestCut.html,
      view.fromModel ? "llm" : "heuristic",
    );
    await syncYamlFromProposal();
    await previewDigestCut();
    if (view.fromModel) {
      digestCut.notice =
        "Zones proposées. Ajustez si besoin, puis Reformater le texte (IA).";
    } else {
      const why = view.fallbackReason?.trim() ?? "";
      if (/contexte trop|n_ctx/i.test(why)) {
        digestCut.notice = `Découpe structurelle (repli). ${why}`;
      } else if (why) {
        digestCut.notice = `Découpe structurelle (repli). Le modèle n'a pas renvoyé un JSON exploitable — ${why}`;
      } else {
        digestCut.notice =
          "Découpe structurelle (repli). Blocs complets validés localement. Vérifiez Paramètres → IA pour l’IA.";
      }
    }
  } catch (error) {
    digestCut.notice = tauriErrorMessage(error);
  } finally {
    digestCut.proposing = false;
    render();
  }
}

export async function syncYamlFromProposal(): Promise<void> {
  if (!digestCut.proposal || !isTauriRuntime()) return;
  try {
    const view = await invoke<YamlView>("digest_cut_proposal_yaml", {
      payload: { proposal: digestCut.proposal },
    });
    digestCut.yaml = view.yaml;
    digestCut.yamlReady = true;
  } catch (error) {
    digestCut.previewError = tauriErrorMessage(error);
  }
}

export function setDigestCutZoneAction(zone: DigestCutZoneName, action: DigestCutZoneAction): void {
  captureDigestCutDom();
  if (!digestCut.proposal) return;
  digestCut.proposal.zones[zone].action = action;
  digestCut.proposal.explanationFr = explainZonesFr(digestCut.proposal);
  digestCut.reformattedHtml = "";
  // Un seul remount via preview (évite un double reset de scroll settings).
  void syncYamlFromProposal().then(() => previewDigestCut());
}

function zoneLabelFr(zone: DigestCutZoneName): string {
  return zone === "header" ? "En-tête" : zone === "body" ? "Corps" : "Pied";
}

function applyPaintPickAndPreview(): void {
  const zone = digestCut.paintZone;
  const pick = digestCut.paintPick;
  const root = mailRootEl();
  if (!zone || !pick || !root) {
    render();
    return;
  }
  ensurePaintProposalSkeleton();
  const check = applyValidatedPickToZone(zone, pick, root);
  if (check.status === "bad") {
    digestCut.notice = `Refusé — ${check.message}`;
    render();
    return;
  }
  digestCut.reformattedHtml = "";
  if (digestCut.proposal) {
    digestCut.proposal.explanationFr = explainZonesFr(digestCut.proposal);
  }
  digestCut.notice =
    check.status === "warn"
      ? `« ${zoneLabelFr(zone)} » : ${checkSummaryFr(check)} — ${check.message}`
      : `« ${zoneLabelFr(zone)} » ${checkSummaryFr(check).toLowerCase()}.`;
  void syncYamlFromProposal().then(() => previewDigestCut());
}

export function setDigestCutPaintZone(zone: DigestCutZoneName): void {
  captureDigestCutDom();
  digestCut.paintZone = digestCut.paintZone === zone ? null : zone;
  if (digestCut.paintZone) {
    ensurePaintProposalSkeleton();
    digestCut.notice = `Survolez le mail, puis cliquez un bloc complet pour « ${zoneLabelFr(zone)} ».`;
  } else {
    digestCut.notice = "Sélection annulée.";
  }
  render();
}

export function handleDigestCutMailClick(target: EventTarget | null): void {
  const root = mailRootEl();
  if (!root || !(target instanceof Element)) return;

  const zoneEl = target.closest<HTMLElement>("[data-digest-cut-zone]");
  if (zoneEl && root.contains(zoneEl) && !digestCut.paintZone) {
    const zone = zoneEl.getAttribute("data-digest-cut-zone");
    if (zone === "header" || zone === "body" || zone === "footer") {
      const snapped = snapToCuttableBlock(zoneEl, root) ?? zoneEl;
      const pick = pickFromElement(snapped, root);
      if (!pick) return;
      digestCut.paintZone = zone;
      digestCut.paintPick = pick;
      digestCut.paintCheck = validateElementForZone(snapped, root, zone);
      digestCut.notice = `Zone « ${zoneLabelFr(zone)} » — Plus grand / Plus petit, ou Valider avec l’IA.`;
      render();
      return;
    }
  }

  const snapped = snapToCuttableBlock(target, root);
  if (!snapped) {
    digestCut.notice = "Cliquez un bloc HTML complet (balise ouverte et fermée), pas un mot isolé.";
    render();
    return;
  }
  const pick = pickFromElement(snapped, root);
  if (!pick) return;
  digestCut.paintPick = pick;
  digestCut.paintCheck = validateElementForZone(snapped, root, digestCut.paintZone);
  if (digestCut.paintZone) {
    applyPaintPickAndPreview();
    return;
  }
  const pair = hasCompleteTagPair(snapped);
  digestCut.notice = pair.ok
    ? "Bloc complet sélectionné — assignez-le (→ En-tête / Corps / Pied) ou ajustez sa taille."
    : pair.message;
  render();
}

export function expandDigestCutPaintPick(): void {
  const root = mailRootEl();
  const pick = digestCut.paintPick;
  if (!root || !pick) return;
  const el = findElementForPick(root, pick);
  if (!el?.parentElement || el.parentElement === root) return;
  const expanded = snapToCuttableBlock(el.parentElement, root) ?? expandCutNode(el.parentElement, root);
  if (!hasCompleteTagPair(expanded).ok) {
    digestCut.notice = "Impossible d’agrandir sans casser le balisage.";
    render();
    return;
  }
  const next = pickFromElement(expanded, root);
  if (!next || next.label === pick.label) return;
  digestCut.paintPick = next;
  digestCut.paintCheck = validatePaintPick(next, root, digestCut.paintZone);
  applyPaintPickAndPreview();
}

export function shrinkDigestCutPaintPick(): void {
  const root = mailRootEl();
  const pick = digestCut.paintPick;
  if (!root || !pick) return;
  const el = findElementForPick(root, pick);
  if (!el) return;
  const shrunk = shrinkCutNode(el, root);
  if (shrunk === el || !hasCompleteTagPair(shrunk).ok) {
    digestCut.notice = "Impossible de réduire tout en gardant une balise complète.";
    render();
    return;
  }
  const next = pickFromElement(shrunk, root);
  if (!next) return;
  digestCut.paintPick = next;
  digestCut.paintCheck = validatePaintPick(next, root, digestCut.paintZone);
  applyPaintPickAndPreview();
}

export function clearDigestCutPaint(): void {
  digestCut.paintPick = null;
  digestCut.paintZone = null;
  digestCut.paintCheck = null;
  render();
}

export function toggleDigestCutCode(): void {
  captureDigestCutDom();
  digestCut.showCode = !digestCut.showCode;
  render();
}

export async function reformatDigestCutReading(): Promise<void> {
  captureDigestCutDom();
  if (!digestCut.proposal || !digestCut.html.trim()) {
    digestCut.notice = "Proposez ou peignez d’abord les zones, puis reformatez le texte.";
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestCut.notice = "Le reformatage passe par l'application.";
    render();
    return;
  }
  digestCut.reformatting = true;
  digestCut.notice = "Reformatage du texte (IA)…";
  render();
  try {
    const view = await invoke<ReformatView>("digest_cut_reformat", {
      payload: {
        html: digestCut.html,
        senderEmail: digestCut.senderEmail,
        current: digestCut.proposal,
      },
    });
    digestCut.proposal = view.proposal;
    if (!view.proposal.explanationFr?.trim()) {
      view.proposal.explanationFr = explainZonesFr(view.proposal);
    }
    digestCut.reformattedHtml = view.readingHtml?.trim() ?? "";
    revalidateProposalFromHtml(view.proposal, digestCut.html, view.fromModel ? "llm" : "heuristic");
    await syncYamlFromProposal();
    if (digestCut.reformattedHtml) {
      digestCut.previewApplicable = true;
      digestCut.previewHtml = digestCut.reformattedHtml;
      digestCut.previewError = "";
    } else {
      await previewDigestCut();
    }
    if (view.fromModel) {
      digestCut.notice =
        "Texte reformatté par l’IA : titre/détails clarifiés à droite. Les zones restent celles choisies.";
    } else {
      const why = view.fallbackReason?.trim() ?? "";
      digestCut.notice = why
        ? `Reformatage local (repli). ${why}`
        : "Reformatage structurel local (sans modèle).";
    }
  } catch (error) {
    digestCut.notice = tauriErrorMessage(error);
  } finally {
    digestCut.reformatting = false;
    render();
  }
}

export async function previewDigestCut(): Promise<void> {
  captureDigestCutDom();
  if (digestCut.reformattedHtml.trim()) {
    digestCut.previewApplicable = true;
    digestCut.previewHtml = digestCut.reformattedHtml;
    digestCut.previewError = "";
    render();
    return;
  }
  if (!digestCut.yaml.trim() || !digestCut.html.trim()) {
    digestCut.previewApplicable = null;
    digestCut.previewHtml = "";
    digestCut.previewError = "";
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestCut.previewError = "L'aperçu passe par l'application.";
    render();
    return;
  }
  digestCut.previewing = true;
  digestCut.previewError = "";
  render();
  try {
    const view = await invoke<PreviewView>("digest_cut_preview", {
      payload: {
        yaml: digestCut.yaml,
        html: digestCut.html,
        senderEmail: digestCut.senderEmail,
      },
    });
    digestCut.previewApplicable = view.applicable;
    digestCut.previewHtml = view.html ?? "";
    digestCut.previewError = view.error ?? "";
  } catch (error) {
    digestCut.previewApplicable = null;
    digestCut.previewHtml = "";
    digestCut.previewError = tauriErrorMessage(error);
  } finally {
    digestCut.previewing = false;
    render();
  }
}

export async function handleDigestCutAction(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "digest-cut-search":
      await searchDigestCutMailbox();
      return true;
    case "digest-cut-open-thread":
      await openDigestCutThread(element?.dataset.threadId ?? "");
      return true;
    case "digest-cut-open-message":
      await loadDigestCutMessage(element?.dataset.messageId ?? "");
      return true;
    case "digest-cut-open-current":
      loadDigestCutFromOpenMessage();
      return true;
    case "digest-cut-propose":
      await proposeDigestCutZones(false);
      return true;
    case "digest-cut-refine":
      await proposeDigestCutZones(true);
      return true;
    case "digest-cut-reformat":
      await reformatDigestCutReading();
      return true;
    case "digest-cut-preview":
      await previewDigestCut();
      return true;
    case "digest-cut-toggle-code":
      toggleDigestCutCode();
      return true;
    case "digest-cut-zone": {
      const zone = element?.dataset.zone as DigestCutZoneName | undefined;
      const zoneAction = element?.dataset.zoneAction as DigestCutZoneAction | undefined;
      if (zone && zoneAction) setDigestCutZoneAction(zone, zoneAction);
      return true;
    }
    case "digest-cut-paint-zone": {
      const zone = element?.dataset.zone as DigestCutZoneName | undefined;
      if (zone) setDigestCutPaintZone(zone);
      return true;
    }
    case "digest-cut-paint-assign": {
      const zone = element?.dataset.zone as DigestCutZoneName | undefined;
      if (zone && digestCut.paintPick) {
        digestCut.paintZone = zone;
        applyPaintPickAndPreview();
      }
      return true;
    }
    case "digest-cut-paint-expand":
      expandDigestCutPaintPick();
      return true;
    case "digest-cut-paint-shrink":
      shrinkDigestCutPaintPick();
      return true;
    case "digest-cut-paint-clear":
      clearDigestCutPaint();
      return true;
    default:
      return false;
  }
}
