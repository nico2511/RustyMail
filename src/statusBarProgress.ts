/** Barre de progression globale (pied d’écran) — rendu pur + helpers. */

export type StatusBarProgressJob = {
  id: string;
  label: string;
  done: number;
  /** `null` = progression indéterminée (sync, LLM, etc.). */
  total: number | null;
};

export function statusBarProgressPercent(job: StatusBarProgressJob): number | null {
  if (job.total == null || job.total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((job.done / job.total) * 100)));
}

export function statusBarProgressCountLabel(job: StatusBarProgressJob): string {
  if (job.total != null && job.total > 0) return `${Math.min(job.done, job.total)}/${job.total}`;
  if (job.done > 0) return String(job.done);
  return "";
}

function renderProgressItem(job: StatusBarProgressJob, escapeHtml: (s: string) => string, escapeAttr: (s: string) => string): string {
  const pct = statusBarProgressPercent(job);
  const count = statusBarProgressCountLabel(job);
  const indeterminate = pct == null;
  const ariaNow = indeterminate ? undefined : pct;
  const fillStyle = indeterminate ? "" : ` style="width:${pct}%"`;
  const trackClass = indeterminate ? "status-bar-progress-track status-bar-progress-track--indeterminate" : "status-bar-progress-track";
  return `<div class="status-bar-progress-item" data-status-job-id="${escapeAttr(job.id)}" title="${escapeAttr(job.label)}">
    <div class="status-bar-progress-item__head">
      <span class="status-bar-progress-label">${escapeHtml(job.label)}</span>
      ${count ? `<span class="status-bar-progress-count dim">${escapeHtml(count)}</span>` : ""}
    </div>
    <div class="${trackClass}" role="progressbar"${
      ariaNow != null ? ` aria-valuenow="${ariaNow}" aria-valuemin="0" aria-valuemax="100"` : ` aria-busy="true"`
    }>
      <div class="status-bar-progress-fill"${fillStyle}></div>
    </div>
  </div>`;
}

export function renderStatusBarProgressStripHtml(
  jobs: StatusBarProgressJob[],
  escapeHtml: (s: string) => string,
  escapeAttr: (s: string) => string,
): string {
  if (!jobs.length) return "";
  const visible = jobs.slice(0, 4);
  const extra = jobs.length - visible.length;
  const items = visible.map((j) => renderProgressItem(j, escapeHtml, escapeAttr)).join("");
  const more =
    extra > 0 ?
      `<span class="status-bar-progress-more dim" title="${escapeAttr(`${extra} autre(s) tâche(s)`)}">+${extra}</span>`
    : "";
  return `<div class="status-bar-progress" role="region" aria-label="Tâches en cours">${items}${more}</div>`;
}

/** Progression compacte dans la barre d’état (une tâche principale, hauteur fixe). */
export function renderStatusBarProgressInlineHtml(
  jobs: StatusBarProgressJob[],
  escapeHtml: (s: string) => string,
  escapeAttr: (s: string) => string,
): string {
  if (!jobs.length) return "";
  const job = jobs[0]!;
  const pct = statusBarProgressPercent(job);
  const count = statusBarProgressCountLabel(job);
  const indeterminate = pct == null;
  const ariaNow = indeterminate ? undefined : pct;
  const fillStyle = indeterminate ? "" : ` style="width:${pct}%"`;
  const trackClass = indeterminate
    ? "status-bar-progress-track status-bar-progress-track--indeterminate"
    : "status-bar-progress-track";
  const short =
    job.label.length > 28 ? `${job.label.slice(0, 26)}…` : job.label;
  const extra = jobs.length > 1 ? ` (+${jobs.length - 1})` : "";
  return `<span class="status-bar-progress-slot" role="status" aria-live="polite" title="${escapeAttr(job.label)}">
    <span class="status-bar-progress-inline-label">${escapeHtml(short)}${escapeHtml(extra)}</span>
    ${count ? `<span class="status-bar-progress-inline-count dim">${escapeHtml(count)}</span>` : ""}
    <span class="${trackClass}" role="progressbar"${
      ariaNow != null ? ` aria-valuenow="${ariaNow}" aria-valuemin="0" aria-valuemax="100"` : ` aria-busy="true"`
    }><span class="status-bar-progress-fill"${fillStyle}></span></span>
  </span>`;
}
