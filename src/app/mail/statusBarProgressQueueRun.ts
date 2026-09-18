import type { StatusBarProgressJob } from "../../statusBarProgress";
import { render } from "../dispatch";
import { state } from "../state";
import { paintStatusBarProgressDom } from "./statusBarProgressPaintRun";

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
