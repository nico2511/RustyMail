import { finishConfirmModal, finishTextPromptModal } from "../modals/promptConfirm";

export async function tryHandleModalsWire(action: string, _element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "text-prompt-confirm": {
      const raw = document.querySelector<HTMLInputElement>("#text-prompt-input")?.value ?? "";
      finishTextPromptModal(raw);
      return true;
    }
    case "text-prompt-cancel":
      finishTextPromptModal(null);
      return true;
    case "confirm-modal-yes":
      finishConfirmModal(true);
      return true;
    case "confirm-modal-no":
      finishConfirmModal(false);
      return true;
    default:
      return false;
  }
}
