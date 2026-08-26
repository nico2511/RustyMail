/** Autocomplétion `#` dans la barre de recherche (dossier, compte, tags, filtres…). */

import type { SearchBarTag } from "./searchBarParse";
import { escapeHtml } from "./ui/sanitize";

export type InboxFilterHit = {
  id: string;
  label: string;
  sublabel?: string;
  glyph?: string;
};

export type NewsletterRuleRef = {
  domain: string;
  localPart: string;
};

export type HashAccountRef = {
  id: string;
  email: string;
  displayName?: string;
};

export type HashAutocompleteOptions = {
  input: HTMLInputElement;
  getNewsletterRules: () => NewsletterRuleRef[];
  getMailboxes: () => string[];
  getAccounts: () => HashAccountRef[];
  getTags: () => SearchBarTag[];
  /** Charge les tags distincts (SQLite) avant suggestions `#tag` / `#source:`. */
  onPrefetchTags?: () => void | Promise<void>;
  /** Met à jour les critères (dossier, compte, tag…) après insertion dans la barre. */
  onApplyHit?: (hit: InboxFilterHit) => void;
};

type TokenInfo = {
  tokenStart: number;
  tokenEnd: number;
  query: string;
};

type HashMode = "mailbox" | "account" | "tag" | "preset";

const DEBOUNCE_MS = 60;

const PRESET_FILTERS: InboxFilterHit[] = [
  {
    id: "scope:account",
    label: "#compte",
    sublabel: "Tout le compte actif (tous dossiers synchronisés)",
    glyph: "⊕",
  },
  {
    id: "scope:mailbox",
    label: "#local",
    sublabel: "Dossier affiché dans la barre latérale",
    glyph: "▣",
  },
  {
    id: "hint:mailbox",
    label: "#local:nom",
    sublabel: "Dossier IMAP — tapez : puis le nom",
    glyph: "▣",
  },
  {
    id: "hint:account",
    label: "#compte:email",
    sublabel: "Compte — tapez : puis l’adresse",
    glyph: "⊕",
  },
  {
    id: "hint:tag",
    label: "#entity:valeur",
    sublabel: "Tag — familles source, kind, entity, state",
    glyph: "◇",
  },
  {
    id: "list:auto",
    label: "#auto",
    sublabel: "Newsletters, notifications, envois automatiques",
    glyph: "A",
  },
  {
    id: "list:focused",
    label: "#priorité",
    sublabel: "Masquer les expéditeurs auto",
    glyph: "◎",
  },
  {
    id: "list:unread",
    label: "#nonlus",
    sublabel: "Conversations non lues",
    glyph: "●",
  },
  {
    id: "list:starred",
    label: "#suivis",
    sublabel: "Fils marqués « Suivre »",
    glyph: "★",
  },
  {
    id: "list:all",
    label: "Tout afficher",
    sublabel: "Retirer le filtre de type",
    glyph: "∞",
  },
  {
    id: "facet:last7",
    label: "#last:7d",
    sublabel: "Messages des 7 derniers jours",
    glyph: "7",
  },
  {
    id: "facet:last30",
    label: "#last:30d",
    sublabel: "Messages des 30 derniers jours",
    glyph: "30",
  },
  {
    id: "facet:attachment",
    label: "#pj",
    sublabel: "Avec pièce jointe",
    glyph: "PJ",
  },
  {
    id: "facet:security",
    label: "#security:50",
    sublabel: "Score de sécurité ≥ 50",
    glyph: "§",
  },
  {
    id: "facet:archive",
    label: "#archive",
    sublabel: "Chercher sous le préfixe Archive",
    glyph: "Ar",
  },
];

const TAG_FAMILIES = ["source", "kind", "entity", "state"] as const;

/** Corrige pluriels / préfixes (`sources` → `source`). */
function normalizeTagFamily(head: string): string | null {
  const h = head.trim().toLowerCase();
  if (!h) return null;
  if (TAG_FAMILIES.includes(h as (typeof TAG_FAMILIES)[number])) return h;
  if (h.endsWith("s")) {
    const singular = h.slice(0, -1);
    if (TAG_FAMILIES.includes(singular as (typeof TAG_FAMILIES)[number])) return singular;
  }
  for (const f of TAG_FAMILIES) {
    if (f.startsWith(h) || h.startsWith(f)) return f;
  }
  return null;
}

export function isHashAutocompletePanelOpen(): boolean {
  return Boolean(document.querySelector(".hash-autocomplete"));
}

export function findHashToken(value: string, caret: number): TokenInfo | null {
  const before = value.slice(0, Math.min(caret, value.length));
  const hash = before.lastIndexOf("#");
  if (hash < 0) return null;
  if (hash > 0 && !/\s/.test(before[hash - 1] ?? "")) return null;
  const query = before.slice(hash + 1);
  if (/\s/.test(query) || query.includes("<")) return null;
  return { tokenStart: hash, tokenEnd: caret, query };
}

function formatRuleLabel(rule: NewsletterRuleRef): string {
  const lp = (rule.localPart ?? "*").toLowerCase();
  if (lp === "*") return `*.${rule.domain}`;
  return `${rule.localPart}@${rule.domain}`;
}

function mailboxLeaf(mailbox: string): string {
  const parts = mailbox.split("/");
  return parts[parts.length - 1] || mailbox;
}

function tagFamilyLc(tag: SearchBarTag): string {
  return String(tag.family ?? "").toLowerCase();
}

function tagHitId(tag: SearchBarTag): string {
  return `tag:${tagFamilyLc(tag)}\0${tag.value}`;
}

function tagHitLabel(tag: SearchBarTag): string {
  return `#${tagFamilyLc(tag)}:${tag.value}`;
}

function resolveHashMode(q: string): HashMode {
  const lower = q.trim().toLowerCase();
  if (!lower) return "preset";

  const colon = lower.indexOf(":");
  const head = colon >= 0 ? lower.slice(0, colon) : lower;

  if (
    head === "local" ||
    head === "dossier" ||
    head === "ici" ||
    head.startsWith("loc") ||
    head.startsWith("dos")
  ) {
    return "mailbox";
  }

  if (head === "compte" || head.startsWith("compt") || (head.startsWith("com") && head.length >= 3)) {
    return "account";
  }

  if (head === "tag" || lower.startsWith("tag:")) return "tag";

  if (normalizeTagFamily(head)) return "tag";

  if (TAG_FAMILIES.some((f) => f.startsWith(head) || head.startsWith(f))) return "tag";

  if (TAG_FAMILIES.some((f) => lower.startsWith(`${f}:`))) return "tag";

  return "preset";
}

function buildMailboxHits(tail: string, mailboxes: string[]): InboxFilterHit[] {
  const q = tail.trim().toLowerCase();
  const hits = mailboxes
    .filter((mb) => {
      if (!q) return true;
      const leaf = mailboxLeaf(mb).toLowerCase();
      return mb.toLowerCase().includes(q) || leaf.includes(q);
    })
    .slice(0, 14)
    .map((mb) => ({
      id: `mailbox:${mb}`,
      label: `#local:${mailboxLeaf(mb)}`,
      sublabel: mb,
      glyph: "▣",
    }));
  if (hits.length) return hits;
  if (!q) {
    return [
      {
        id: "hint:mailbox",
        label: "#local:",
        sublabel: mailboxes.length ? "Choisissez un dossier ci-dessous" : "Aucun dossier IMAP chargé",
        glyph: "▣",
      },
    ];
  }
  return [];
}

function buildAccountHits(tail: string, accounts: HashAccountRef[]): InboxFilterHit[] {
  const q = tail.trim().toLowerCase();
  const list = accounts.length > 0 ? accounts : [];
  const hits = list
    .filter((a) => {
      if (!q) return true;
      const hay = `${a.email} ${a.displayName ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 10)
    .map((a) => ({
      id: `account:${a.id}`,
      label: `#compte:${a.email}`,
      sublabel: a.displayName?.trim() || a.id,
      glyph: "⊕",
    }));
  if (hits.length) return hits;
  if (!q) {
    return [
      { id: "scope:account", label: "#compte", sublabel: "Tout le compte actif", glyph: "⊕" },
      {
        id: "hint:account",
        label: "#compte:",
        sublabel: list.length ? "Sélectionnez un compte" : "Aucun compte configuré",
        glyph: "⊕",
      },
    ];
  }
  return [{ id: "scope:account", label: "#compte", sublabel: "Tout le compte actif", glyph: "⊕" }];
}

function countTagsInFamily(tags: SearchBarTag[], family: string): number {
  return tags.filter((t) => tagFamilyLc(t) === family).length;
}

function familyHintHits(prefix: string, tags: SearchBarTag[]): InboxFilterHit[] {
  const p = prefix.trim().toLowerCase();
  return TAG_FAMILIES.filter((f) => !p || f.startsWith(p) || p.startsWith(f)).map((f) => {
    const n = countTagsInFamily(tags, f);
    return {
      id: `taghint:${f}`,
      label: `#${f}:`,
      sublabel: n > 0 ? `${n} valeur(s) en base — Tab pour compléter` : "Aucune valeur en base — saisissez après :",
      glyph: "◇",
    };
  });
}

/** Valeurs réelles du catalogue (toutes familles ou une seule). */
function tagValueHits(
  tags: SearchBarTag[],
  opts: { familyFilter?: string; valueFilter?: string; limit?: number }
): InboxFilterHit[] {
  const familyFilter = opts.familyFilter?.trim().toLowerCase() ?? "";
  const valueFilter = opts.valueFilter?.trim().toLowerCase() ?? "";
  const limit = opts.limit ?? 16;
  return tags
    .filter((t) => {
      const fam = tagFamilyLc(t);
      const val = t.value.toLowerCase();
      if (familyFilter && fam !== familyFilter) return false;
      if (!valueFilter) return true;
      return val.includes(valueFilter) || `${fam}:${val}`.includes(valueFilter);
    })
    .slice(0, limit)
    .map((t) => ({
      id: tagHitId(t),
      label: tagHitLabel(t),
      sublabel: `Tag ${tagFamilyLc(t)}`,
      glyph: "◇",
    }));
}

/** Valeurs `kind:` alignées sur la sync IMAP (`mailbox` complet en minuscules). */
function kindTagsFromMailboxes(mailboxes: string[]): SearchBarTag[] {
  const seen = new Set<string>();
  const out: SearchBarTag[] = [];
  for (const mb of mailboxes) {
    const v = mb.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push({ family: "kind", value: v });
  }
  return out;
}

function mergeTagSources(catalog: SearchBarTag[], mailboxes: string[]): SearchBarTag[] {
  const seen = new Set<string>();
  const out: SearchBarTag[] = [];
  for (const t of [...catalog, ...kindTagsFromMailboxes(mailboxes)]) {
    const key = `${String(t.family).toLowerCase()}:${t.value}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function parseTagQuery(query: string): { familyFilter: string; valueFilter: string } {
  const q = query.trim().toLowerCase();
  let familyFilter = "";
  let valueFilter = "";

  if (q === "tag" || q === "tags") {
    return { familyFilter: "", valueFilter: "" };
  }

  if (q.startsWith("tag:")) {
    const rest = q.slice(4);
    if (!rest) return { familyFilter: "", valueFilter: "" };
    const sep = rest.indexOf(":");
    if (sep >= 0) {
      familyFilter = rest.slice(0, sep);
      valueFilter = rest.slice(sep + 1);
    } else if (TAG_FAMILIES.includes(rest as (typeof TAG_FAMILIES)[number])) {
      familyFilter = rest;
    } else {
      const partial = normalizeTagFamily(rest);
      if (partial) familyFilter = partial;
      else if (TAG_FAMILIES.some((f) => f.startsWith(rest) || rest.startsWith(f))) {
        familyFilter = rest;
      } else {
        valueFilter = rest;
      }
    }
  } else {
    const sep = q.indexOf(":");
    if (sep >= 0) {
      familyFilter = q.slice(0, sep);
      valueFilter = q.slice(sep + 1);
    } else if (TAG_FAMILIES.includes(q as (typeof TAG_FAMILIES)[number])) {
      familyFilter = q;
    } else {
      const partial = normalizeTagFamily(q);
      if (partial) familyFilter = partial;
      else valueFilter = q;
    }
  }

  if (familyFilter && !TAG_FAMILIES.includes(familyFilter as (typeof TAG_FAMILIES)[number])) {
    const partial = normalizeTagFamily(familyFilter);
    if (partial) familyFilter = partial;
    else familyFilter = "";
  }

  return { familyFilter, valueFilter };
}

function buildTagHits(query: string, tags: SearchBarTag[], mailboxes: string[]): InboxFilterHit[] {
  const q = query.trim().toLowerCase();
  const { familyFilter, valueFilter } = parseTagQuery(query);

  if (q === "tag" || q === "tag:" || q === "tags") {
    const hints = familyHintHits("", tags);
    const samples = tagValueHits(tags, { limit: 10 });
    return [...hints, ...samples.filter((h) => !hints.some((x) => x.id === h.id))];
  }

  if (!familyFilter && !valueFilter && TAG_FAMILIES.some((f) => f.startsWith(q) || q.startsWith(f))) {
    return familyHintHits(q, tags);
  }

  const valueHits = tagValueHits(tags, { familyFilter, valueFilter });
  if (valueHits.length) return valueHits;

  if (familyFilter && !valueFilter) {
    const inFamily = countTagsInFamily(tags, familyFilter);
    const fallback = tagValueHits(tags, { valueFilter: "", limit: 12 });
    if (fallback.length) {
      const header: InboxFilterHit = {
        id: `taghint:${familyFilter}`,
        label: `#${familyFilter}:`,
        sublabel:
          inFamily > 0
            ? "Saisissez une valeur ou choisissez ci-dessous"
            : `Aucun tag ${familyFilter} en base — autres tags disponibles :`,
        glyph: "◇",
      };
      return [header, ...fallback];
    }
    return [
      {
        id: `taghint:${familyFilter}`,
        label: `#${familyFilter}:`,
        sublabel:
          tags.length > 0
            ? "Aucune valeur pour cette famille — saisissez après :"
            : "Aucun tag en base — synchronisez puis réessayez",
        glyph: "◇",
      },
    ];
  }

  if (!q) return familyHintHits("", tags);

  return familyHintHits(familyFilter || q, tags);
}

function buildHits(
  query: string,
  rules: NewsletterRuleRef[],
  mailboxes: string[],
  accounts: HashAccountRef[],
  tags: SearchBarTag[]
): InboxFilterHit[] {
  const q = query.trim().toLowerCase();
  const mode = resolveHashMode(q);
  const colon = q.indexOf(":");
  const tail = colon >= 0 ? q.slice(colon + 1) : "";

  if (mode === "mailbox") return buildMailboxHits(tail, mailboxes);
  if (mode === "account") return buildAccountHits(tail, accounts);
  if (mode === "tag") return buildTagHits(q, tags, mailboxes);

  const presets = PRESET_FILTERS.filter((p) => {
    if (p.id.startsWith("hint:")) {
      if (!q) return true;
      return p.label.toLowerCase().includes(q);
    }
    if (!q) return p.id !== "list:all";
    const hay = `${p.label} ${p.sublabel ?? ""}`.toLowerCase();
    if (hay.includes(q)) return true;
    if (q.startsWith("aut") && p.id === "list:auto") return true;
    if ((q.startsWith("loc") || q === "dossier") && (p.id === "scope:mailbox" || p.id === "hint:mailbox"))
      return true;
    if ((q.startsWith("com") || q.startsWith("all") || q === "tout") && (p.id === "scope:account" || p.id === "hint:account"))
      return true;
    if (
      (q.startsWith("tag") ||
        q.startsWith("ent") ||
        q.startsWith("sou") ||
        q.startsWith("kin") ||
        q.startsWith("sta")) &&
      p.id === "hint:tag"
    )
      return true;
    if ((q.startsWith("last") || q === "7d" || q === "30d") && p.id.startsWith("facet:last"))
      return true;
    if (
      (q.startsWith("pj") || q.startsWith("attach") || q.startsWith("piece") || q.startsWith("pièce")) &&
      p.id === "facet:attachment"
    )
      return true;
    if ((q.startsWith("sec") || q.startsWith("security")) && p.id === "facet:security") return true;
    if (q.startsWith("arc") && p.id === "facet:archive") return true;
    return false;
  });

  const ruleHits: InboxFilterHit[] = rules
    .map((r) => ({
      id: `rule:${r.domain}\0${r.localPart ?? "*"}`,
      label: formatRuleLabel(r),
      sublabel: "Règle expéditeur auto",
      glyph: "▸",
    }))
    .filter((h) => !q || h.label.toLowerCase().includes(q));

  const seen = new Set<string>();
  const out: InboxFilterHit[] = [];
  for (const h of [...presets, ...ruleHits]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out.slice(0, 18);
}

export function attachHashAutocomplete(opts: HashAutocompleteOptions): () => void {
  const { input, getNewsletterRules, getMailboxes, getAccounts, getTags, onPrefetchTags, onApplyHit } = opts;
  let panel: HTMLDivElement | null = null;
  let items: InboxFilterHit[] = [];
  let active = -1;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let token: TokenInfo | null = null;
  let tagsPrefetch: Promise<void> = Promise.resolve();

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
    panel.style.minWidth = `${Math.max(r.width, 280)}px`;
  };

  /** Insère la suggestion dans la barre (style Excel) sans lancer la recherche. */
  const insertCompletion = (hit: InboxFilterHit | undefined) => {
    if (!hit || !token) return;
    const insert = hit.label.trim();
    if (!insert) return;
    const before = input.value.slice(0, token.tokenStart);
    const after = input.value.slice(token.tokenEnd);
    const trail = insert.endsWith(":") ? "" : " ";
    input.value = `${before}${insert}${trail}${after.trimStart()}`.replace(/\s{2,}/g, " ");
    const pos = before.length + insert.length + trail.length;
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    onApplyHit?.(hit);
    if (insert.endsWith(":")) {
      window.setTimeout(() => updateToken(true), 0);
    } else {
      removePanel();
    }
  };

  const hitForKeyboardComplete = (): InboxFilterHit | undefined => {
    if (!items.length) return undefined;
    if (active >= 0 && items[active]) return items[active];
    return items.find((h) => !h.id.startsWith("hint:")) ?? items[0];
  };

  const completeActive = () => {
    insertCompletion(hitForKeyboardComplete());
  };

  const showPanel = () => {
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "at-autocomplete hash-autocomplete";
      panel.setAttribute("role", "listbox");
      document.body.appendChild(panel);
    }
    positionPanel();
    if (items.length === 0) {
      panel.innerHTML = '<div class="at-autocomplete__empty">Aucune suggestion</div>';
      return;
    }
    panel.innerHTML = items
      .map((hit, i) => {
        const sub = hit.sublabel?.trim() ?? "";
        const hintOnly = hit.id.startsWith("hint:") || hit.id.startsWith("taghint:");
        return `<button type="button" class="at-autocomplete__item${i === active ? " is-active" : ""}${hintOnly ? " at-autocomplete__item--hint" : ""}" data-idx="${i}" role="option">
          ${hit.glyph ? `<span class="at-autocomplete__glyph" aria-hidden="true">${escapeHtml(hit.glyph)}</span>` : ""}
          <span class="at-autocomplete__label">${escapeHtml(hit.label)}</span>
          ${sub ? `<span class="at-autocomplete__sub">${escapeHtml(sub)}</span>` : ""}
        </button>`;
      })
      .join("");
    panel.querySelectorAll<HTMLButtonElement>(".at-autocomplete__item").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        insertCompletion(items[Number(btn.dataset.idx)]);
      });
    });
  };

  const syncRefresh = () => {
    if (!token) return;
    const mailboxes = getMailboxes();
    const tags = mergeTagSources(getTags(), mailboxes);
    items = buildHits(token.query, getNewsletterRules(), mailboxes, getAccounts(), tags);
    active = items.length ? 0 : -1;
    showPanel();
  };

  const refreshItems = async () => {
    if (!token) return;
    const mode = resolveHashMode(token.query);
    if (mode === "tag" && onPrefetchTags) {
      tagsPrefetch = tagsPrefetch.then(() => Promise.resolve(onPrefetchTags()));
      await tagsPrefetch;
    }
    syncRefresh();
  };

  const scheduleRefresh = (immediate = false) => {
    if (debounce) clearTimeout(debounce);
    if (immediate) {
      void refreshItems();
      return;
    }
    debounce = setTimeout(() => void refreshItems(), DEBOUNCE_MS);
  };

  const updateToken = (immediate = false) => {
    const caret = input.selectionStart ?? input.value.length;
    token = findHashToken(input.value, caret);
    if (!token) {
      removePanel();
      return;
    }
    scheduleRefresh(immediate);
  };

  const onInput = () => updateToken(false);

  const onKeyDown = (ev: Event) => {
    if (!(ev instanceof KeyboardEvent)) return;

    if (ev.key === "#" || ev.key === ":") {
      window.setTimeout(() => updateToken(true), 0);
    }

    if (ev.key === "Tab" && token && items.length > 0) {
      ev.preventDefault();
      ev.stopPropagation();
      completeActive();
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
    if (ev.key === "Enter" && items.length > 0) {
      ev.preventDefault();
      ev.stopPropagation();
      completeActive();
    }
  };

  const onBlur = () => {
    window.setTimeout(removePanel, 150);
  };

  const onScroll = () => positionPanel();

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown, true);
  input.addEventListener("click", () => updateToken(true));
  input.addEventListener("blur", onBlur);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);

  return () => {
    if (debounce) clearTimeout(debounce);
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKeyDown, true);
    input.removeEventListener("click", () => updateToken(true));
    input.removeEventListener("blur", onBlur);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
    removePanel();
  };
}
