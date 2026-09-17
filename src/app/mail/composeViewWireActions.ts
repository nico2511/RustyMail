import { startNewDraftSession as startNewDraftSessionImpl } from "./composeDraftSession";
import { syncPreviewOpenFromComposeLayout as syncPreviewOpenFromComposeLayoutImpl } from "./composeLayoutState";

export type ComposeViewWireActionsDeps = {
  enterComposeView: (opts?: { skipHistory?: boolean }) => void;
};

let composeViewWireActionsDeps: ComposeViewWireActionsDeps | null = null;

export function registerComposeViewWireActionsDeps(deps: ComposeViewWireActionsDeps): void {
  composeViewWireActionsDeps = deps;
}

function composeView(): ComposeViewWireActionsDeps {
  if (!composeViewWireActionsDeps) throw new Error("registerComposeViewWireActionsDeps not called");
  return composeViewWireActionsDeps;
}

export function enterComposeView(opts?: { skipHistory?: boolean }): void {
  composeView().enterComposeView(opts);
}

export function startNewDraftSession(): void {
  startNewDraftSessionImpl();
}

export function syncPreviewOpenFromComposeLayout(): void {
  syncPreviewOpenFromComposeLayoutImpl();
}
