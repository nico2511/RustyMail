import { startNewDraftSession as startNewDraftSessionImpl } from "./composeDraftSession";
import { syncPreviewOpenFromComposeLayout as syncPreviewOpenFromComposeLayoutImpl } from "./composeLayoutState";
import { enterComposeView as enterComposeViewImpl } from "./composeViewNavigation";

export function enterComposeView(opts?: { skipHistory?: boolean }): void {
  enterComposeViewImpl(opts);
}

export function startNewDraftSession(): void {
  startNewDraftSessionImpl();
}

export function syncPreviewOpenFromComposeLayout(): void {
  syncPreviewOpenFromComposeLayoutImpl();
}
