// @ts-nocheck — DOM wiring; tighten types incrementally.

function wireOrgConfirmCheckbox(checkSel: string, btnSel: string, signal: AbortSignal): void {
  const check = document.querySelector<HTMLInputElement>(checkSel);
  const confirm = document.querySelector<HTMLButtonElement>(btnSel);
  if (!check || !confirm) return;
  const sync = () => {
    confirm.disabled = !check.checked;
  };
  sync();
  check.addEventListener("change", sync, { signal });
}

export function wireEventsDomOrgConfirmModals(signal: AbortSignal): void {
  wireOrgConfirmCheckbox("#org-trash-check", "#org-trash-confirm-btn", signal);
  wireOrgConfirmCheckbox("#org-delete-mailbox-check", "#org-delete-mailbox-confirm-btn", signal);
  wireOrgConfirmCheckbox("#org-v2-trash-check", "#org-v2-trash-confirm-btn", signal);
  wireOrgConfirmCheckbox("#org-v2-delete-mailbox-check", "#org-v2-delete-mailbox-confirm-btn", signal);
}
