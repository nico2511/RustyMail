import { invoke } from "@tauri-apps/api/core";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import {
  captureDigestCutDom,
  digestCut,
  type DigestCutProposal,
  type DigestCutZoneAction,
  type DigestCutZoneName,
} from "./digestCutState";

type SampleView = {
  html: string;
  senderEmail: string;
  subject: string;
};

type YamlView = { yaml: string };

type PreviewView = {
  applicable: boolean;
  html?: string | null;
  fixtureId?: string | null;
  error?: string | null;
};

export async function loadDigestCutSample(): Promise<void> {
  if (!isTauriRuntime()) {
    digestCut.notice = "L'échantillon embarqué est disponible dans l'application bureau.";
    render();
    return;
  }
  try {
    const sample = await invoke<SampleView>("digest_cut_builtin_sample");
    digestCut.html = sample.html;
    digestCut.senderEmail = sample.senderEmail;
    digestCut.subject = sample.subject;
    digestCut.sampleLoaded = true;
    digestCut.notice = "";
  } catch (error) {
    digestCut.notice = tauriErrorMessage(error);
  }
  render();
}

export async function proposeDigestCutZones(forceLlm = false): Promise<void> {
  captureDigestCutDom();
  if (!digestCut.html.trim()) {
    digestCut.notice = "Chargez l'échantillon Deblock avant de proposer une découpe.";
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestCut.notice = "La proposition structurelle passe par l'application.";
    render();
    return;
  }
  digestCut.proposing = true;
  digestCut.notice = "";
  render();
  try {
    const proposal = await invoke<DigestCutProposal>("digest_cut_propose_zones", {
      html: digestCut.html,
      senderEmail: digestCut.senderEmail,
      useLlm: forceLlm,
    });
    digestCut.proposal = proposal;
    await syncYamlFromProposal();
    digestCut.notice =
      proposal.source === "llm"
        ? "Proposition IA (structure DOM). Ajustez les zones avant d'activer en lecture sur le banc."
        : "Proposition heuristique (structure DOM). Le modèle local peut affiner si configuré.";
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
    const view = await invoke<YamlView>("digest_cut_proposal_yaml", { proposal: digestCut.proposal });
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
  void syncYamlFromProposal().then(() => previewDigestCut());
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
      yaml: digestCut.yaml,
      html: digestCut.html,
      senderEmail: digestCut.senderEmail,
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
    case "digest-cut-load-sample":
      await loadDigestCutSample();
      return true;
    case "digest-cut-propose":
      await proposeDigestCutZones(false);
      return true;
    case "digest-cut-propose-llm":
      await proposeDigestCutZones(true);
      return true;
    case "digest-cut-preview":
      await previewDigestCut();
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
