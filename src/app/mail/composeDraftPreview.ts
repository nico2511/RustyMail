import { escapeHtml } from "../../ui/sanitize";
import type { DraftPreview } from "../types";
import { safeInvoke } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";

export type ComposeDraftPreviewDeps = {
  persistDraft: () => void;
  sanitizePreviewHtml: (htmlRaw: string) => string;
};

let composeDraftPreviewDeps: ComposeDraftPreviewDeps | null = null;

export function registerComposeDraftPreviewDeps(deps: ComposeDraftPreviewDeps): void {
  composeDraftPreviewDeps = deps;
}

function previewDeps(): ComposeDraftPreviewDeps {
  if (!composeDraftPreviewDeps) throw new Error("registerComposeDraftPreviewDeps not called");
  return composeDraftPreviewDeps;
}

let previewTimer: number | undefined;

export function composePreviewPaneActive(): boolean {
  return state.view === "compose" && state.composeLayout !== "write" && state.composeLayout !== "historique";
}

function applyComposerPreviewDom(htmlRaw: string) {
  const node = document.querySelector<HTMLElement>(".composer-body .preview");
  if (!node) return false;
  node.innerHTML = previewDeps().sanitizePreviewHtml(htmlRaw);
  return true;
}

export async function computePreview() {
  previewDeps().persistDraft();
  const md = state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody;
  state.preview = await safeInvoke<DraftPreview>(
    "preview_draft",
    { markdownBody: md },
    {
      textPlain: md,
      html: `<p>${escapeHtml(md).replace(/\n/g, "<br />")}</p>`,
    },
  );
  if (state.view === "compose" && composePreviewPaneActive() && applyComposerPreviewDom(state.preview?.html ?? "")) {
    return;
  }
  render();
}

export function schedulePreviewUpdate(delayMs: number = 250) {
  if (!composePreviewPaneActive()) return;
  if (previewTimer) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void computePreview(), delayMs);
}
