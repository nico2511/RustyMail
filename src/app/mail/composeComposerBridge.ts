export type ComposeComposerBridgeDeps = {
  loadComposeMarkdownIntoEditor: (markdown: string) => void;
  resetMarkdownEditorHistory: () => void;
  computePreview: () => void | Promise<void>;
  scheduleDraftRevisionSave: (delayMs?: number) => void;
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
