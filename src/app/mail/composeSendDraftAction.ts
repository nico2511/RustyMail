export type ComposeSendDraftActionDeps = {
  sendDraft: () => Promise<void>;
};

let composeSendDraftActionDeps: ComposeSendDraftActionDeps | null = null;

export function registerComposeSendDraftActionDeps(deps: ComposeSendDraftActionDeps): void {
  composeSendDraftActionDeps = deps;
}

export function sendDraft(): Promise<void> {
  if (!composeSendDraftActionDeps) throw new Error("registerComposeSendDraftActionDeps not called");
  return composeSendDraftActionDeps.sendDraft();
}
