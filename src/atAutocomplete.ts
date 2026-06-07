import { invoke } from "@tauri-apps/api/core";
import { findHashToken } from "./hashAutocomplete";
import { escapeHtml } from "./ui/sanitize";

export type AddressContactHit = {
  email: string;
  displayName: string;
  messageCount: number;
};

export type AtAutocompleteMode = "compose" | "search" | "mention";

export type AtAutocompleteOptions = {
  input: HTMLInputElement | HTMLTextAreaElement;
  accountId: string | undefined;
  mode: AtAutocompleteMode;
  isTauri: boolean;
  /** Si fourni et renvoie faux, la recherche contacts @ est ignorée. */
  isFeatureEnabled?: () => boolean;
  /** Destinataires en chips : la sélection ajoute un chip au lieu de remplir le champ texte. */
  composeChipMode?: boolean;
  /** Recherche : retire le jeton `@` et délègue au callback (contacts multiples). */
  searchChipMode?: boolean;
  onComposePick?: (email: string, displayName: string) => void;
  onSearchPick?: (email: string, displayName: string) => void;
  /** Corps compose : insère une mention sans modifier les filtres recherche. */
  onMentionPick?: (email: string, displayName: string) => void;
};

type TokenInfo = {
  tokenStart: number;
  tokenEnd: number;
  query: string;
};

const DEBOUNCE_MS = 120;

export function isAtAutocompletePanelOpen(): boolean {
  return Boolean(document.querySelector(".at-autocomplete:not(.hash-autocomplete)"));
}

function findAtToken(value: string, caret: number, mode: AtAutocompleteMode): TokenInfo | null {
  const before = value.slice(0, Math.min(caret, value.length));
  if (mode === "mention") {
    const at = before.lastIndexOf("@");
    if (at < 0) return null;
    if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null;
    const query = before.slice(at + 1);
    if (/\s/.test(query) || query.includes("<")) return null;
    return { tokenStart: at, tokenEnd: caret, query };
  }
  if (mode === "compose") {
    const comma = before.lastIndexOf(",");
    const segStart = comma >= 0 ? comma + 1 : 0;
    const segment = before.slice(segStart);
    const at = segment.indexOf("@");
    if (at < 0) return null;
    const tokenStart = segStart + at;
    const query = segment.slice(at + 1);
    if (query.includes(" ") || query.includes("<")) return null;
    return { tokenStart, tokenEnd: caret, query };
  }
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { tokenStart: at, tokenEnd: caret, query };
}

export function attachAtAutocomplete(opts: AtAutocompleteOptions): () => void {
  const {
    input,
    accountId,
    mode,
    isTauri,
    isFeatureEnabled,
    composeChipMode,
    searchChipMode,
    onComposePick,
    onSearchPick,
    onMentionPick,
  } = opts;
  let panel: HTMLDivElement | null = null;
  let items: AddressContactHit[] = [];
  let active = -1;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let token: TokenInfo | null = null;
  let gen = 0;

  const removePanel = () => {
    panel?.remove();
    panel = null;
    items = [];
    active = -1;
    token = null;
  };

  const positionPanel = () => {
    if (!panel) return;
    const r = input.getBoundingClientRect();
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.bottom + 4}px`;
    panel.style.minWidth = `${Math.max(r.width, 220)}px`;
  };

  const pick = (hit: AddressContactHit | undefined) => {
    if (!hit || !token) return;
    if (mode === "compose") {
      if (composeChipMode) {
        const before = input.value.slice(0, token.tokenStart);
        const after = input.value.slice(token.tokenEnd);
        input.value = `${before}${after}`.trimStart();
        onComposePick?.(hit.email, hit.displayName);
      } else {
        const before = input.value.slice(0, token.tokenStart);
        const after = input.value.slice(token.tokenEnd);
        const insert = hit.email;
        const needsComma = after.length > 0 && !after.startsWith(",");
        input.value = `${before}${insert}${needsComma ? ", " : ""}${after.replace(/^\s*,\s*/, "")}`;
        const pos = before.length + insert.length + (needsComma ? 2 : 0);
        input.setSelectionRange(pos, pos);
        onComposePick?.(hit.email, hit.displayName);
      }
    } else if (mode === "mention") {
      const before = input.value.slice(0, token.tokenStart);
      const after = input.value.slice(token.tokenEnd);
      const label = hit.displayName?.trim();
      const insert = label ? `${label} <${hit.email}>` : hit.email;
      const spacer = after.startsWith(" ") || after.length === 0 ? "" : " ";
      input.value = `${before}${insert}${spacer}${after}`;
      const pos = before.length + insert.length + spacer.length;
      input.setSelectionRange(pos, pos);
      onMentionPick?.(hit.email, hit.displayName);
    } else if (mode === "search") {
      const before = input.value.slice(0, token.tokenStart);
      const after = input.value.slice(token.tokenEnd);
      const insert = hit.email.trim();
      input.value = `${before}${insert} ${after.trimStart()}`.replace(/\s{2,}/g, " ");
      const pos = before.length + insert.length + 1;
      input.setSelectionRange(pos, pos);
      onSearchPick?.(hit.email, hit.displayName);
    } else {
      onSearchPick?.(hit.email, hit.displayName);
    }
    removePanel();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const showPanel = () => {
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "at-autocomplete";
      panel.setAttribute("role", "listbox");
      document.body.appendChild(panel);
    }
    positionPanel();
    if (items.length === 0) {
      panel.innerHTML = '<div class="at-autocomplete__empty">Aucun contact</div>';
      return;
    }
    panel.innerHTML = items
      .map((hit, i) => {
        const label = hit.displayName?.trim() || hit.email;
        const sub = hit.displayName?.trim() ? hit.email : "";
        return `<button type="button" class="at-autocomplete__item${i === active ? " is-active" : ""}" data-idx="${i}" role="option">
          <span class="at-autocomplete__label">${escapeHtml(label)}</span>
          ${sub ? `<span class="at-autocomplete__sub">${escapeHtml(sub)}</span>` : ""}
          ${hit.messageCount > 1 ? `<span class="at-autocomplete__count">${hit.messageCount}</span>` : ""}
        </button>`;
      })
      .join("");
    panel.querySelectorAll<HTMLButtonElement>(".at-autocomplete__item").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(btn.dataset.idx);
        pick(items[idx]);
      });
    });
  };

  const fetchHits = async (q: string, myGen: number) => {
    if (!isTauri || !accountId?.trim() || (isFeatureEnabled && !isFeatureEnabled())) {
      items = [];
      showPanel();
      return;
    }
    try {
      const hits = await invoke<AddressContactHit[]>("search_address_contacts_cmd", {
        accountId: accountId.trim(),
        query: q,
        limit: 12,
      });
      if (myGen !== gen) return;
      items = hits ?? [];
      active = items.length ? 0 : -1;
      showPanel();
    } catch {
      if (myGen !== gen) return;
      items = [];
      showPanel();
    }
  };

  const onInput = () => {
    const caret = input.selectionStart ?? input.value.length;
    token = findAtToken(input.value, caret, mode);
    if (!token) {
      removePanel();
      return;
    }
    if (isFeatureEnabled && !isFeatureEnabled()) {
      removePanel();
      return;
    }
    if (mode === "search") {
      const hashTok = findHashToken(input.value, caret);
      if (hashTok) {
        removePanel();
        return;
      }
    }
    if (debounce) clearTimeout(debounce);
    const myGen = ++gen;
    debounce = setTimeout(() => {
      void fetchHits(token!.query, myGen);
    }, DEBOUNCE_MS);
  };

  const onKeyDown = (ev: Event) => {
    if (!(ev instanceof KeyboardEvent)) return;

    if (ev.key === "Tab" && panel && token && items[active]) {
      ev.preventDefault();
      ev.stopPropagation();
      pick(items[active]);
      return;
    }

    if (!panel || !token) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      removePanel();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (items.length) active = (active + 1) % items.length;
      showPanel();
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      if (items.length) active = (active - 1 + items.length) % items.length;
      showPanel();
      return;
    }
    if (ev.key === "Enter" && active >= 0 && items[active]) {
      ev.preventDefault();
      ev.stopPropagation();
      pick(items[active]);
    }
  };

  const onBlur = () => {
    window.setTimeout(removePanel, 150);
  };

  const onScroll = () => positionPanel();

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown, true);
  input.addEventListener("blur", onBlur);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);

  return () => {
    if (debounce) clearTimeout(debounce);
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKeyDown, true);
    input.removeEventListener("blur", onBlur);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
    removePanel();
  };
}
