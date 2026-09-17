import type { ComposeLayout } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";

export type CycleComposeLayoutDeps = {
  persistDraft: () => void;
  syncPreviewOpenFromComposeLayout: () => void;
  refreshDraftRevisions: (limit?: number) => void | Promise<void>;
  computePreview: () => void | Promise<void>;
};

let cycleComposeLayoutDeps: CycleComposeLayoutDeps | null = null;

export function registerCycleComposeLayoutDeps(deps: CycleComposeLayoutDeps): void {
  cycleComposeLayoutDeps = deps;
}

export async function cycleComposeLayout(): Promise<void> {
  const d = cycleComposeLayoutDeps;
  if (!d) throw new Error("registerCycleComposeLayoutDeps not called");
  d.persistDraft();
  const order: ComposeLayout[] = ["split", "write", "preview"];
  const fullOrder: ComposeLayout[] = isTauriRuntime() ? [...order, "historique"] : order;
  const idx = Math.max(0, fullOrder.indexOf(state.composeLayout));
  state.composeLayout = fullOrder[(idx + 1) % fullOrder.length];
  d.syncPreviewOpenFromComposeLayout();
  render();
  if (state.composeLayout === "historique") void d.refreshDraftRevisions(60);
  else if (state.composeLayout !== "write") await d.computePreview();
}
