import {
  mountComposeRecipientChips,
  type ComposeRecipientChipsHandle,
  type ComposeRecipientField,
  type RecipientChip,
} from "../../composeRecipientChips";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import type { Draft } from "../types";
import { scheduleDraftRevisionSave } from "./composeDraftRevisionAutosave";

let composeChipsTo: ComposeRecipientChipsHandle | null = null;
let composeChipsCc: ComposeRecipientChipsHandle | null = null;
let composeChipsBcc: ComposeRecipientChipsHandle | null = null;

const composeRecipientPendingInput: Partial<Record<ComposeRecipientField, string>> = {};

function parseEmailList(value: string): Array<{ email: string; name?: string | null }> {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*<([^>]+)>$/);
      if (m) {
        const email = m[2].trim();
        const name = m[1].trim().replace(/^["']|["']$/g, "");
        return { email, name: name || null };
      }
      return { email: part };
    });
}

export function composeChipsHandle(field: ComposeRecipientField): ComposeRecipientChipsHandle | null {
  if (field === "to") return composeChipsTo;
  if (field === "cc") return composeChipsCc;
  return composeChipsBcc;
}

export function applyComposeRecipientsFromDom(draft: Draft): void {
  const shell = document.querySelector(".composer-mail-shell");
  const toEl = shell?.querySelector<HTMLInputElement>("#compose-to") ?? document.querySelector<HTMLInputElement>("#compose-to");
  const ccEl = shell?.querySelector<HTMLInputElement>("#compose-cc") ?? document.querySelector<HTMLInputElement>("#compose-cc");
  const bccEl = shell?.querySelector<HTMLInputElement>("#compose-bcc") ?? document.querySelector<HTMLInputElement>("#compose-bcc");
  if (composeChipsTo) draft.to = composeChipsTo.getRecipients();
  else if (toEl) draft.to = parseEmailList(toEl.value);
  if (composeChipsCc) draft.cc = composeChipsCc.getRecipients();
  else if (ccEl) draft.cc = parseEmailList(ccEl.value);
  if (composeChipsBcc) draft.bcc = composeChipsBcc.getRecipients();
  else if (bccEl) draft.bcc = parseEmailList(bccEl.value);
}

export function wireComposeRecipientChips(): void {
  if (composeChipsTo) composeRecipientPendingInput.to = composeChipsTo.getPendingInput();
  if (composeChipsCc) composeRecipientPendingInput.cc = composeChipsCc.getPendingInput();
  if (composeChipsBcc) composeRecipientPendingInput.bcc = composeChipsBcc.getPendingInput();
  composeChipsTo?.detach();
  composeChipsCc?.detach();
  composeChipsBcc?.detach();
  composeChipsTo = composeChipsCc = composeChipsBcc = null;
  if (state.view !== "compose" || !state.draft) {
    delete composeRecipientPendingInput.to;
    delete composeRecipientPendingInput.cc;
    delete composeRecipientPendingInput.bcc;
    return;
  }

  const mountField = (
    hostSel: string,
    field: ComposeRecipientField,
  ): ComposeRecipientChipsHandle | null => {
    const host = document.querySelector<HTMLElement>(hostSel);
    if (!host) return null;
    const initial: RecipientChip[] = state.draft![field] ?? [];
    const pendingInput = composeRecipientPendingInput[field];
    return mountComposeRecipientChips({
      container: host,
      field,
      initial,
      pendingInput,
      isTauri: isTauriRuntime(),
      onChange: (recipients) => {
        if (!state.draft) return;
        state.draft[field] = recipients;
        scheduleDraftRevisionSave();
      },
      onPendingInputChange: (raw) => {
        if (raw.trim()) composeRecipientPendingInput[field] = raw;
        else delete composeRecipientPendingInput[field];
      },
    });
  };

  composeChipsTo = mountField("#compose-to-host", "to");
  composeChipsCc = mountField("#compose-cc-host", "cc");
  composeChipsBcc = mountField("#compose-bcc-host", "bcc");
}
