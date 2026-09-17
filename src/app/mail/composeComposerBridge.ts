export {
  applyMarkdownAction,
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  setComposeFromTextareaValue,
} from "./composeMarkdownEditor";
export { computePreview, composePreviewPaneActive, schedulePreviewUpdate } from "./composeDraftPreview";

export type ComposeComposerBridgeDeps = {
  scheduleDraftRevisionSave: (delayMs?: number) => void;
  bindComposerDropzone: () => void;
  wireComposeRecipientChips: () => void;
};

let composeComposerBridgeDeps: ComposeComposerBridgeDeps | null = null;

export function registerComposeComposerBridgeDeps(deps: ComposeComposerBridgeDeps): void {
  composeComposerBridgeDeps = deps;
}

function composerBridge(): ComposeComposerBridgeDeps {
  if (!composeComposerBridgeDeps) throw new Error("registerComposeComposerBridgeDeps not called");
  return composeComposerBridgeDeps;
}

export function scheduleDraftRevisionSave(delayMs?: number): void {
  composerBridge().scheduleDraftRevisionSave(delayMs);
}

export function bindComposerDropzone(): void {
  composerBridge().bindComposerDropzone();
}

export function wireComposeRecipientChips(): void {
  composerBridge().wireComposeRecipientChips();
}
