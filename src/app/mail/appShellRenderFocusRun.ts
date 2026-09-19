import { isTextPromptOpen } from "../modals/promptConfirm";
import { state } from "../state";

export function focusPromptsAfterRender(): void {
  if (isTextPromptOpen()) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#text-prompt-input");
      if (inp) {
        inp.focus();
        inp.select();
      }
    });
  }
  if (state.searchModalOpen && !isTextPromptOpen()) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#search-modal-input");
      if (!inp) return;
      inp.focus();
      const len = state.searchDraft.length;
      try {
        inp.setSelectionRange(len, len);
      } catch {
        /* type=search */
      }
    });
  }
}
