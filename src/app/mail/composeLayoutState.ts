import { state } from "../state";

export function syncPreviewOpenFromComposeLayout(): void {
  state.previewOpen = state.composeLayout !== "write";
}
