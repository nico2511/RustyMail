import { isConfirmOpen, isTextPromptOpen } from "../modals/promptConfirm";
import { state } from "../state";

export function mouseNavBlockedByOverlay(): boolean {
  return Boolean(
    state.quoteFoldModal ||
      state.threadTagsModalOpen ||
      state.closeComposeModal ||
      state.resumeDraftModal ||
      state.imageModal ||
      state.splitSendConfirm ||
      state.moveOpen ||
      state.mailboxManageOpen ||
      state.searchModalOpen ||
      state.settingsAiModal ||
      isTextPromptOpen() ||
      isConfirmOpen(),
  );
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

export function singleKeyShortcutsBlocked(): boolean {
  return mouseNavBlockedByOverlay();
}

export function keyboardPlainKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}
