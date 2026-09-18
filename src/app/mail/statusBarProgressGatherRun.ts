import type { StatusBarProgressJob } from "../../statusBarProgress";
import { state } from "../state";

export function gatherStatusBarProgressJobs(): StatusBarProgressJob[] {
  const byId = new Map<string, StatusBarProgressJob>();
  const put = (job: StatusBarProgressJob) => {
    byId.set(job.id, job);
  };

  for (const j of state.statusBarJobs) put(j);

  const batch = state.searchViewBatchJob;
  if (batch) {
    const target = batch.target.trim() || "dossier";
    put({
      id: "search-view-batch",
      label: batch.phase === "create" ? `Création « ${target} »` : `Déplacement → ${target}`,
      done: batch.done,
      total: batch.total,
    });
  }

  if (state.syncInProgress) {
    const batchProg = state.syncProgressBatch;
    put({
      id: "imap-sync",
      label: (state.syncMessage || "Synchronisation IMAP").replace(/^Sync…\s*/i, "").trim() || "Synchronisation IMAP",
      done: batchProg?.current ?? 0,
      total: batchProg?.total ?? null,
    });
  }

  if (state.organization.scanning) {
    put({ id: "org-scan", label: "Analyse Organiser", done: 0, total: null });
  } else if (state.organization.applying) {
    const msg = (state.organization.applyMessage || "Application Organiser").replace(/…+$/, "").trim();
    put({ id: "org-apply", label: msg || "Application Organiser", done: 0, total: null });
  }

  if (state.organizationV2.scanning) {
    put({ id: "org-v2-scan", label: "Analyse Organiser V2", done: 0, total: null });
  } else if (state.organizationV2.applying) {
    const msg = (state.organizationV2.applyMessage || "Application Organiser V2").replace(/…+$/, "").trim();
    put({
      id: "org-v2-apply",
      label: msg || "Application Organiser V2",
      done: state.organizationV2.applyDone,
      total: state.organizationV2.applyTotal,
    });
  }

  if (state.folderManager.archiveProgress?.trim()) {
    put({
      id: "folder-archive",
      label: state.folderManager.archiveProgress.replace(/…+$/, "").trim() || "Archivage dossier",
      done: 0,
      total: null,
    });
  }

  if (state.llmJobLabel?.trim()) {
    put({
      id: "llm-queue",
      label: state.llmJobLabel.trim(),
      done: 0,
      total: null,
    });
  }

  if (state.llmPrefetchPercent != null) {
    put({
      id: "llm-prefetch",
      label: "Téléchargement modèle LLM",
      done: state.llmPrefetchPercent,
      total: 100,
    });
  }

  return Array.from(byId.values());
}
