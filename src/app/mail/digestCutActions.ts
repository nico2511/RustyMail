import { invoke } from "@tauri-apps/api/core";
import { buildDigestBenchSearchQuery } from "../../digestBenchQuery";
import type { DiscussionThreadView, ThreadListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { state } from "../state";
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

function clearCutResult(): void {
  digestCut.proposal = null;
  digestCut.yaml = "";
  digestCut.yamlReady = false;
  digestCut.previewApplicable = null;
  digestCut.previewHtml = "";
  digestCut.previewError = "";
  digestCut.showCode = false;
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
  const accountId = currentAccount()?.id?.trim() || state.selectedAccountId?.trim() || "";
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
  const query = buildDigestBenchSearchQuery({
    draft: digestCut.queryDraft,
    accountId,
    newsletterRules: state.newsletterRules,
    archiveRoot: state.appPrefs.general.archiveRoot ?? "Archive",
  });
  try {
    digestCut.threads = await invoke<ThreadListItem[]>("search_threads", { query });
    if (digestCut.threads.length === 0) {
      digestCut.searchError = "Aucun fil pour cette recherche. Essayez un autre domaine de votre boîte.";
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
    if (!view.proposal.explanationFr?.trim()) {
      view.proposal.explanationFr = explainZonesFr(view.proposal);
    }
    await syncYamlFromProposal();
    if (view.fromModel) {
      digestCut.notice =
        "Proposition du modèle local. Lisez l'explication, puis ajustez les zones. Même moteur que Paramètres → IA.";
    } else {
      const why = view.fallbackReason?.trim();
      digestCut.notice = why
        ? `Découpe structurelle (repli). Le modèle n'a pas renvoyé un JSON exploitable — ${why}`
        : "Découpe structurelle (repli). Le modèle n'a pas fourni de découpe. Vérifiez Paramètres → IA → Tester la connexion.";
    }
    await previewDigestCut();
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
  // Un seul remount via preview (évite un double reset de scroll settings).
  void syncYamlFromProposal().then(() => previewDigestCut());
}

export function toggleDigestCutCode(): void {
  captureDigestCutDom();
  digestCut.showCode = !digestCut.showCode;
  render();
}

export async function previewDigestCut(): Promise<void> {
  captureDigestCutDom();
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
    default:
      return false;
  }
}
