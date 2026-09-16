import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { render } from "../dispatch";
import { iconSvg } from "../lib/iconSvg";
import type { ConfirmModalSpec, TextPromptModalSpec } from "../types";

let confirmResolver: ((ok: boolean) => void) | null = null;

let confirmModal: ConfirmModalSpec | null = null;

let textPromptResolver: ((value: string | null) => void) | null = null;

let textPromptModal: TextPromptModalSpec | null = null;

export function openTextPromptModal(spec: TextPromptModalSpec): Promise<string | null> {
  textPromptModal = spec;
  render();
  return new Promise((resolve) => {
    textPromptResolver = resolve;
  });
}

export function finishTextPromptModal(value: string | null) {
  textPromptModal = null;
  const r = textPromptResolver;
  textPromptResolver = null;
  r?.(value);
  render();
}

export function openConfirmModal(spec: ConfirmModalSpec): Promise<boolean> {
  confirmModal = spec;
  render();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

export function finishConfirmModal(ok: boolean) {
  confirmModal = null;
  const r = confirmResolver;
  confirmResolver = null;
  r?.(ok);
  render();
}

export function renderTextPromptModal(): string {
  if (!textPromptModal) return "";
  const m = textPromptModal;
  return `
    <div class="modal-backdrop" data-action="text-prompt-cancel">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="text-prompt-title">
        <div class="modal-header">
          <strong id="text-prompt-title">${escapeHtml(m.title)}</strong>
          <button type="button" class="icon-pill" data-action="text-prompt-cancel" aria-label="Annuler">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:12px">
          ${m.body ? `<p class="dim" style="margin:0;line-height:1.45">${escapeHtml(m.body)}</p>` : ""}
          <label class="settings-field" style="display:grid;gap:6px;margin:0">
            <span>${escapeHtml(m.label)}</span>
            <input id="text-prompt-input" type="text" class="field-input" value="${escapeAttr(m.defaultValue)}" autocomplete="off" />
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="text-prompt-cancel">Annuler</button>
          <button type="button" class="primary-button" data-action="text-prompt-confirm">OK</button>
        </div>
      </div>
    </div>`;
}

export function renderConfirmModal(): string {
  if (!confirmModal) return "";
  const m = confirmModal;
  const okLabel = m.confirmLabel?.trim() || "Confirmer";
  const okClass = m.danger ? "primary-button danger-ok" : "primary-button";
  return `
    <div class="modal-backdrop" data-action="confirm-modal-no">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="modal-header">
          <strong id="confirm-modal-title">${escapeHtml(m.title)}</strong>
          <button type="button" class="icon-pill" data-action="confirm-modal-no" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px">
          <p style="margin:0;line-height:1.5">${escapeHtml(m.body)}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="confirm-modal-no">Annuler</button>
          <button type="button" class="${okClass}" data-action="confirm-modal-yes">${escapeHtml(okLabel)}</button>
        </div>
      </div>
    </div>`;
}

export function isTextPromptOpen(): boolean {
  return textPromptModal !== null;
}

export function isConfirmOpen(): boolean {
  return confirmModal !== null;
}
