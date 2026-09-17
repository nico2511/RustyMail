export type ComposeViewWireActionsDeps = {
  enterComposeView: (opts?: { skipHistory?: boolean }) => void;
  startNewDraftSession: () => void;
  syncPreviewOpenFromComposeLayout: () => void;
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
  composeView().startNewDraftSession();
}

export function syncPreviewOpenFromComposeLayout(): void {
  composeView().syncPreviewOpenFromComposeLayout();
}
