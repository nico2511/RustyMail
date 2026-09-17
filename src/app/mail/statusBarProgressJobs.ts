import {
  renderStatusBarProgressInlineHtml,
  type StatusBarProgressJob,
} from "../../statusBarProgress";
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { render } from "../dispatch";
import { state } from "../state";

let statusBarProgressPaintQueued = false;

export function scheduleStatusBarProgressPaint(): void {
  if (statusBarProgressPaintQueued) return;
  statusBarProgressPaintQueued = true;
  requestAnimationFrame(() => {
    statusBarProgressPaintQueued = false;
    paintStatusBarProgressDom();
  });
}

export function upsertStatusBarJob(job: StatusBarProgressJob, renderNow = false): void {
  const idx = state.statusBarJobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) state.statusBarJobs[idx] = job;
  else state.statusBarJobs.push(job);
  if (renderNow) {
    render();
    return;
  }
  scheduleStatusBarProgressPaint();
}

export function clearStatusBarJob(id: string, renderNow = false): void {
  const before = state.statusBarJobs.length;
  state.statusBarJobs = state.statusBarJobs.filter((j) => j.id !== id);
  if (before === state.statusBarJobs.length && !renderNow) return;
  if (renderNow) render();
  else scheduleStatusBarProgressPaint();
}

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

export function paintStatusBarProgressDom(): void {
  const bar = document.querySelector<HTMLElement>(".status-bar-wrap > .status-bar");
  if (!bar) return;
  const jobs = gatherStatusBarProgressJobs();
  const html = renderStatusBarProgressInlineHtml(jobs, escapeHtml, escapeAttr);
  const existing = bar.querySelector(".status-bar-progress-slot");
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
    return;
  }
  const anchor = bar.querySelector(".status-bar-compact") ?? bar.querySelector(".status-bar-sep");
  if (anchor) anchor.insertAdjacentHTML("afterend", html);
  else bar.insertAdjacentHTML("beforeend", html);
}
