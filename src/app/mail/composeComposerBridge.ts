export type ComposeComposerBridgeDeps = {
  loadComposeMarkdownIntoEditor: (markdown: string) => void;
  resetMarkdownEditorHistory: () => void;
  computePreview: () => void | Promise<void>;
  scheduleDraftRevisionSave: (delayMs?: number) => void;
  schedulePreviewUpdate: (delayMs?: number) => void;
  setComposeFromTextareaValue: (textareaValue: string) => void;
  applyMarkdownAction: (action: string) => void | Promise<void>;
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

export function loadComposeMarkdownIntoEditor(markdown: string): void {
  composerBridge().loadComposeMarkdownIntoEditor(markdown);
}

export function resetMarkdownEditorHistory(): void {
  composerBridge().resetMarkdownEditorHistory();
}

export function computePreview(): void | Promise<void> {
  return composerBridge().computePreview();
}

export function scheduleDraftRevisionSave(delayMs?: number): void {
  composerBridge().scheduleDraftRevisionSave(delayMs);
}

export function schedulePreviewUpdate(delayMs?: number): void {
  composerBridge().schedulePreviewUpdate(delayMs);
}

export function setComposeFromTextareaValue(textareaValue: string): void {
  composerBridge().setComposeFromTextareaValue(textareaValue);
}

export function applyMarkdownAction(action: string): void | Promise<void> {
  return composerBridge().applyMarkdownAction(action);
}

export function bindComposerDropzone(): void {
  composerBridge().bindComposerDropzone();
}

export function wireComposeRecipientChips(): void {
  composerBridge().wireComposeRecipientChips();
}
