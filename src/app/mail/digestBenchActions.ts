import { invoke } from "@tauri-apps/api/core";
import { buildDigestBenchSearchQuery } from "../../digestBenchQuery";
import type { DiscussionThreadView, ThreadListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { state } from "../state";
import { captureDigestBenchDom, digestBench, type DigestBenchCompare } from "./digestBenchState";

type BenchStatus = {
  accepted: boolean;
  acceptedFixtureId?: string | null;
  readingEnabled: boolean;
  readingFixtureId?: string | null;
  builtinYaml: string;
};

type PreviewView = {
  applicable: boolean;
  html?: string | null;
  fixtureId?: string | null;
  error?: string | null;
};

function applyStatus(status: BenchStatus): void {
  digestBench.accepted = status.accepted;
  digestBench.acceptedFixtureId = status.acceptedFixtureId ?? null;
  digestBench.readingEnabled = status.readingEnabled;
  digestBench.readingFixtureId = status.readingFixtureId ?? null;
  if (!digestBench.yamlReady) {
    digestBench.yaml = status.builtinYaml;
    digestBench.yamlReady = true;
  }
}

export async function refreshDigestBenchStatus(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const status = await invoke<BenchStatus>("digest_bench_status");
    applyStatus(status);
  } catch (error) {
    digestBench.notice = tauriErrorMessage(error);
  }
}

export async function searchDigestBench(): Promise<void> {
  captureDigestBenchDom();
  const accountId = currentAccount()?.id?.trim() || state.selectedAccountId?.trim() || "";
  if (!accountId) {
    digestBench.searchError = "Choisissez un compte avant de chercher dans la boîte.";
    digestBench.threads = [];
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestBench.searchError = "La recherche réelle passe par l'application.";
    render();
    return;
  }
  digestBench.searching = true;
  digestBench.searchError = "";
  render();
  const query = buildDigestBenchSearchQuery({
    draft: digestBench.queryDraft,
    accountId,
    newsletterRules: state.newsletterRules,
    archiveRoot: state.appPrefs.general.archiveRoot ?? "Archive",
  });
  try {
    digestBench.threads = await invoke<ThreadListItem[]>("search_threads", { query });
    if (digestBench.threads.length === 0) {
      digestBench.searchError = "Aucun fil. Le filtre @domaine élargit la liste ; il n'applique pas la découpe.";
    }
  } catch (error) {
    digestBench.threads = [];
    digestBench.searchError = tauriErrorMessage(error);
  } finally {
    digestBench.searching = false;
    render();
  }
}

export async function openDigestBenchThread(threadId: string): Promise<void> {
  captureDigestBenchDom();
  const tid = threadId.trim();
  if (!tid || !isTauriRuntime()) return;
  digestBench.selectedThreadId = tid;
  digestBench.notice = "";
  try {
    const view = await invoke<DiscussionThreadView>("open_thread", { threadId: tid });
    digestBench.threadSubject = view.subject;
    digestBench.messages = view.messages.map((message) => ({
      id: message.messageId,
      sender: message.sender,
      senderEmail: message.senderEmail,
      receivedAt: message.receivedAt,
      html: message.htmlBody ?? "",
    }));
    const first = digestBench.messages[0];
    digestBench.selectedMessageId = first?.id ?? null;
    render();
    if (first) await previewDigestBenchMessage(first.id);
  } catch (error) {
    digestBench.notice = tauriErrorMessage(error);
    render();
  }
}

export async function previewDigestBenchMessage(messageId: string): Promise<void> {
  captureDigestBenchDom();
  const message = digestBench.messages.find((item) => item.id === messageId);
  if (!message) return;
  digestBench.selectedMessageId = messageId;
  if (!message.html.trim()) {
    digestBench.previewApplicable = false;
    digestBench.previewHtml = "";
    digestBench.previewError = "Ce message n'a pas de HTML.";
    render();
    return;
  }
  if (!isTauriRuntime()) {
    digestBench.previewError = "L'aperçu de découpe passe par l'application.";
    render();
    return;
  }
  digestBench.previewing = true;
  digestBench.previewError = "";
  render();
  try {
    const preview = await invoke<PreviewView>("digest_fixture_preview", {
      payload: {
        yaml: digestBench.yaml,
        html: message.html,
        senderEmail: message.senderEmail,
      },
    });
    digestBench.previewApplicable = preview.applicable;
    digestBench.previewHtml = preview.html ?? "";
    digestBench.previewError = preview.error ?? "";
  } catch (error) {
    digestBench.previewApplicable = false;
    digestBench.previewHtml = "";
    digestBench.previewError = tauriErrorMessage(error);
  } finally {
    digestBench.previewing = false;
    render();
  }
}

export async function acceptDigestBench(): Promise<void> {
  captureDigestBenchDom();
  if (!isTauriRuntime()) {
    digestBench.notice = "Accepter enregistre le verdict dans l'application. Ce geste n'active pas la lecture.";
    render();
    return;
  }
  try {
    const status = await invoke<BenchStatus>("digest_bench_accept", {
      payload: {
        yaml: digestBench.yaml,
        sampleThreadId: digestBench.selectedThreadId,
      },
    });
    applyStatus(status);
    digestBench.notice =
      "Fixture acceptée pour le banc. La lecture n'est pas modifiée. « Activer en lecture » est un geste séparé.";
  } catch (error) {
    digestBench.notice = tauriErrorMessage(error);
  }
  render();
}

export async function rejectDigestBench(): Promise<void> {
  captureDigestBenchDom();
  if (!isTauriRuntime()) {
    digestBench.notice = "Refuser enregistre le verdict dans l'application. Une lecture déjà activée ne s'éteint pas ici.";
    render();
    return;
  }
  try {
    const status = await invoke<BenchStatus>("digest_bench_reject");
    applyStatus(status);
    digestBench.notice =
      "Fixture refusée pour le banc. Une lecture déjà activée reste en place tant que vous ne la désactivez pas.";
  } catch (error) {
    digestBench.notice = tauriErrorMessage(error);
  }
  render();
}

export function tweakDigestBench(): void {
  captureDigestBenchDom();
  digestBench.notice =
    "Ajustez le YAML, puis relancez l'aperçu. Accepter n'enregistre pas ce brouillon tant que vous ne le validez pas.";
  render();
  document.querySelector<HTMLTextAreaElement>("#digest-bench-yaml")?.focus();
}

export async function enableDigestBenchReading(): Promise<void> {
  captureDigestBenchDom();
  if (!isTauriRuntime()) {
    digestBench.notice =
      "Activer en lecture installe la fixture déjà acceptée, pas le brouillon. Ce geste passe par l'application.";
    render();
    return;
  }
  try {
    const status = await invoke<BenchStatus>("digest_bench_enable_reading");
    applyStatus(status);
    digestBench.notice =
      "Lecture activée avec la fixture acceptée (pas le brouillon s'il a changé depuis). Les fils personne-à-personne sans match restent génériques.";
  } catch (error) {
    digestBench.notice = tauriErrorMessage(error);
  }
  render();
}

export async function disableDigestBenchReading(): Promise<void> {
  captureDigestBenchDom();
  if (!isTauriRuntime()) {
    digestBench.notice = "Désactiver la lecture locale passe par l'application.";
    render();
    return;
  }
  try {
    const status = await invoke<BenchStatus>("digest_bench_disable_reading");
    applyStatus(status);
    digestBench.notice = "Lecture locale désactivée. La fixture embarquée Deblock, si le mail lui correspond, reste en place.";
  } catch (error) {
    digestBench.notice = tauriErrorMessage(error);
  }
  render();
}

export function setDigestBenchCompare(mode: DigestBenchCompare): void {
  captureDigestBenchDom();
  digestBench.compareMode = mode;
  render();
}

export function markDigestBenchRole(messageId: string, role: "sample" | "validation"): void {
  captureDigestBenchDom();
  if (role === "sample") digestBench.sampleMessageId = messageId;
  else digestBench.validationMessageId = messageId;
  render();
}

export async function handleDigestBenchAction(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "digest-bench-search":
      await searchDigestBench();
      return true;
    case "digest-bench-open-thread":
      await openDigestBenchThread(element?.dataset.threadId ?? "");
      return true;
    case "digest-bench-open-message":
      await previewDigestBenchMessage(element?.dataset.messageId ?? "");
      return true;
    case "digest-bench-sample":
      markDigestBenchRole(element?.dataset.messageId ?? "", "sample");
      return true;
    case "digest-bench-validation":
      markDigestBenchRole(element?.dataset.messageId ?? "", "validation");
      return true;
    case "digest-bench-preview": {
      const id = digestBench.selectedMessageId;
      if (id) await previewDigestBenchMessage(id);
      else {
        captureDigestBenchDom();
        digestBench.notice = "Ouvrez un message du résultat de recherche.";
        render();
      }
      return true;
    }
    case "digest-bench-accept":
      await acceptDigestBench();
      return true;
    case "digest-bench-reject":
      await rejectDigestBench();
      return true;
    case "digest-bench-tweak":
      tweakDigestBench();
      return true;
    case "digest-bench-enable":
      await enableDigestBenchReading();
      return true;
    case "digest-bench-disable":
      await disableDigestBenchReading();
      return true;
    case "digest-bench-compare": {
      const mode = element?.dataset.compare;
      if (mode === "split" || mode === "raw" || mode === "cut") setDigestBenchCompare(mode);
      return true;
    }
    default:
      return false;
  }
}
