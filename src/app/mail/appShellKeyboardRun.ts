import {
  isEditableKeyboardTarget,
  keyboardPlainKey,
  singleKeyShortcutsBlocked,
} from "./appShellInputGuards";
import { handleAppShellKeyboardChords } from "./appShellKeyboardChordsRun";
import { handleAppShellKeyboardEscape } from "./appShellKeyboardEscapeRun";
import { handleAppShellKeyboardPlainShortcuts } from "./appShellKeyboardPlainShortcutsRun";

export function bindKeyboard(): void {
  document.addEventListener("keydown", (event) => {
    if (handleAppShellKeyboardChords(event)) return;
    if (handleAppShellKeyboardEscape(event)) return;
    if (isEditableKeyboardTarget(event.target)) return;
    if (singleKeyShortcutsBlocked()) return;
    if (!keyboardPlainKey(event)) return;
    handleAppShellKeyboardPlainShortcuts(event);
  });
}
