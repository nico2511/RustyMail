import { invoke } from "@tauri-apps/api/core";
import { escapeAttr, escapeHtml } from "./ui/sanitize";

export type RecipientChip = { email: string; name?: string | null };

export type ComposeRecipientField = "to" | "cc" | "bcc";

type ChipMountOptions = {
  container: HTMLElement;
  field: ComposeRecipientField;
  initial: RecipientChip[];
  /** Saisie non validée (Enter/blur) à restaurer après un re-render du compositeur. */
  pendingInput?: string;
  isTauri: boolean;
  onChange: (recipients: RecipientChip[]) => void;
  onPendingInputChange?: (raw: string) => void;
};

function formatChipLabel(r: RecipientChip): string {
  const name = r.name?.trim();
  if (name) return name;
  return r.email;
}

function chipHtml(r: RecipientChip, index: number): string {
  const label = formatChipLabel(r);
  const sub = r.name?.trim() ? r.email : "";
  return `<span class="compose-recipient-chip" data-chip-idx="${index}" tabindex="-1">
    <span class="compose-recipient-chip__label" title="${escapeAttr(r.email)}">${escapeHtml(label)}</span>
    ${sub ? `<span class="compose-recipient-chip__email">${escapeHtml(sub)}</span>` : ""}
    <button type="button" class="compose-recipient-chip__remove" data-chip-remove="${index}" aria-label="Retirer ${escapeAttr(label)}">×</button>
  </span>`;
}

async function parseRecipients(raw: string, isTauri: boolean): Promise<RecipientChip[]> {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (isTauri) {
    try {
      const parsed = await invoke<Array<{ email: string; name?: string | null }>>("parse_address_list_cmd", {
        raw: trimmed,
      });
      return (parsed ?? []).map((p) => ({ email: p.email.trim(), name: p.name ?? null }));
    } catch {
      /* fallback */
    }
  }
  return trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*<([^>]+)>$/);
      if (m) {
        return { email: m[2].trim(), name: m[1].trim().replace(/^["']|["']$/g, "") || null };
      }
      return { email: part };
    });
}

/** Fusionne des destinataires en dédupliquant par email (insensible à la casse). */
export function mergeComposeRecipients(existing: RecipientChip[], incoming: RecipientChip[]): RecipientChip[] {
  const out = [...existing];
  for (const r of incoming) {
    const e = r.email.trim().toLowerCase();
    if (!e || out.some((x) => x.email.toLowerCase() === e)) continue;
    out.push({ email: r.email.trim(), name: r.name ?? null });
  }
  return out;
}

export type ComposeRecipientChipsHandle = {
  detach: () => void;
  addRecipient: (email: string, displayName?: string) => void;
  getRecipients: () => RecipientChip[];
  /** Texte en cours dans le champ (pas encore validé en chip). */
  getPendingInput: () => string;
};

export function mountComposeRecipientChips(opts: ChipMountOptions): ComposeRecipientChipsHandle {
  const { container, field, isTauri, onChange } = opts;
  let recipients = [...opts.initial];

  const editor = document.createElement("div");
  editor.className = "compose-recipients-editor";
  editor.dataset.field = field;

  const chipsRow = document.createElement("div");
  chipsRow.className = "compose-recipients-chips";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "compose-recipients-input";
  input.setAttribute("autocomplete", "email");
  input.placeholder = field === "to" ? "Ajouter un destinataire…" : "Ajouter…";

  editor.append(chipsRow, input);
  container.replaceChildren(editor);
  if (opts.pendingInput?.trim()) {
    input.value = opts.pendingInput;
  }

  const syncDom = () => {
    chipsRow.innerHTML = recipients.map((r, i) => chipHtml(r, i)).join("");
    onChange(recipients);
  };

  const commitInputToken = async () => {
    const raw = input.value.trim().replace(/,$/, "");
    if (!raw) return;
    const parsed = await parseRecipients(raw, isTauri);
    if (parsed.length) {
      recipients = mergeComposeRecipients(recipients, parsed);
      input.value = "";
      opts.onPendingInputChange?.("");
      syncDom();
    }
  };

  const removeAt = (idx: number) => {
    if (idx < 0 || idx >= recipients.length) return;
    recipients = recipients.filter((_, i) => i !== idx);
    syncDom();
    input.focus();
  };

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === ",") {
      if (input.value.trim()) {
        ev.preventDefault();
        void commitInputToken();
      }
      return;
    }
    if (ev.key === "Backspace" && !input.value && recipients.length) {
      ev.preventDefault();
      removeAt(recipients.length - 1);
    }
  });

  input.addEventListener("input", () => {
    opts.onPendingInputChange?.(input.value);
  });

  input.addEventListener("blur", () => {
    void commitInputToken();
  });

  input.addEventListener("paste", (ev) => {
    const text = ev.clipboardData?.getData("text/plain") ?? "";
    if (!text.includes(",") && !text.includes("<") && !text.includes("@")) return;
    ev.preventDefault();
    void (async () => {
      const parsed = await parseRecipients(text, isTauri);
      if (parsed.length) {
        recipients = mergeComposeRecipients(recipients, parsed);
        input.value = "";
        syncDom();
      }
    })();
  });

  chipsRow.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-chip-remove]");
    if (!btn) return;
    ev.preventDefault();
    const idx = Number(btn.dataset.chipRemove);
    removeAt(idx);
  });

  syncDom();

  const addRecipient = (email: string, displayName?: string) => {
    const name = displayName?.trim() || null;
    recipients = mergeComposeRecipients(recipients, [{ email: email.trim(), name }]);
    input.value = "";
    opts.onPendingInputChange?.("");
    syncDom();
  };

  return {
    detach: () => {
      container.replaceChildren();
    },
    addRecipient,
    getRecipients: () => [...recipients],
    getPendingInput: () => input.value,
  };
}
