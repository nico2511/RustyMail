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

/** Aperçu local immédiat (le moteur Tauri le remplace quand il répond). */
export function fallbackDraftPreview(markdown: string): DraftPreview {
  return {
    textPlain: markdown,
    html: `<p>${escapeHtml(markdown).replace(/\n/g, "<br />")}</p>`,
  };
}

let previewGeneration = 0;

export async function computePreview() {
  const generation = ++previewGeneration;
  previewDeps().persistDraft();
  const md = state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody;
  const preview = await safeInvoke<DraftPreview>("preview_draft", { markdownBody: md }, fallbackDraftPreview(md));
  if (generation !== previewGeneration) return;
  state.preview = preview;
  if (state.view === "compose" && composePreviewPaneActive() && applyComposerPreviewDom(state.preview?.html ?? "")) {
    return;
  }
  if (generation !== previewGeneration) return;
  render();
}

export function schedulePreviewUpdate(delayMs: number = 250) {
  if (!composePreviewPaneActive()) return;
  if (previewTimer) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void computePreview(), delayMs);
}
