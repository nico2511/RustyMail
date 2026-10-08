/** Sélection visuelle de nœuds HTML pour l'éditeur de découpe. */

import type { DigestCutAnchor, DigestCutPaintPick, DigestCutProposal, DigestCutZoneName } from "./digestCutState";
import { digestCut } from "./digestCutState";

const SKIP_TAGS = new Set(["html", "head", "body", "script", "style", "br", "hr", "img", "svg", "path"]);

const INLINE_TAGS = new Set([
  "span",
  "a",
  "b",
  "i",
  "em",
  "strong",
  "u",
  "font",
  "small",
  "mark",
  "label",
  "abbr",
  "cite",
  "code",
  "kbd",
  "samp",
  "var",
  "time",
  "sub",
  "sup",
  "button",
]);

function meaningfulClass(el: Element): string | null {
  const raw = el.getAttribute("class") ?? "";
  for (const token of raw.split(/\s+/)) {
    if (
      token &&
      token.length <= 40 &&
      /^[a-zA-Z][\w-]*$/.test(token) &&
      !/^(x_|mso|outlook|digest-cut__)/i.test(token)
    ) {
      return token;
    }
  }
  return null;
}

function nthOfType(el: Element): number {
  const tag = el.tagName;
  let n = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === tag) n += 1;
    sib = sib.previousElementSibling;
  }
  return n;
}

/** Classe stable, sinon chaîne `:nth-of-type` (jamais un `div`/`td` nu). */
function disambiguatedSelector(el: Element): string {
  const stop = el.closest("[data-digest-cut-mail]");
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== stop) {
    const tag = cur.tagName.toLowerCase();
    if (tag === "html" || tag === "body" || tag === "head") break;
    const cls = meaningfulClass(cur);
    if (cls) {
      parts.unshift(`${tag}.${cls}`);
      return parts.join(" > ");
    }
    parts.unshift(`${tag}:nth-of-type(${nthOfType(cur)})`);
    cur = cur.parentElement;
    if (parts.length > 8) break;
  }
  return parts.join(" > ");
}

/** Même notion que `child_elements` côté Rust (table → lignes via thead/tbody/tfoot). */
function structureChildren(root: Element): Element[] {
  const isTable = root.tagName.toLowerCase() === "table";
  const out: Element[] = [];
  for (const child of root.children) {
    if (child.hasAttribute("data-digest-cut-overlay")) continue;
    const name = child.tagName.toLowerCase();
    if (isTable && (name === "thead" || name === "tbody" || name === "tfoot")) {
      out.push(...[...child.children]);
    } else {
      out.push(child);
    }
  }
  return out;
}

function uniqueSelectorFor(el: Element): string {
  return disambiguatedSelector(el);
}

/** Remonte vers une balise utile (table, section, div classé, fin de ligne). */
export function expandCutNode(start: Element, root: Element): Element {
  let cur: Element | null = start;
  while (cur && cur !== root) {
    const tag = cur.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) {
      cur = cur.parentElement;
      continue;
    }
    if (tag === "table" || tag === "section" || tag === "article" || tag === "footer" || tag === "header") {
      return cur;
    }
    if ((tag === "div" || tag === "td" || tag === "tr") && meaningfulClass(cur)) {
      return cur;
    }
    const parent = cur.parentElement;
    if (!parent || parent === root) return cur;
    const siblings = [...parent.children].filter((c) => !SKIP_TAGS.has(c.tagName.toLowerCase()));
    if (siblings.length <= 1 && (parent.tagName === "TD" || parent.tagName === "DIV" || parent.tagName === "TR")) {
      cur = parent;
      continue;
    }
    return cur;
  }
  return start;
}

/** Descend d’un cran vers le premier sous-bloc utile (inverse d’élargir). */
export function shrinkCutNode(start: Element, _root: Element): Element {
  const kids = structureChildren(start).filter((c) => !SKIP_TAGS.has(c.tagName.toLowerCase()));
  if (kids.length === 0) return start;
  for (const kid of kids) {
    const tag = kid.tagName.toLowerCase();
    if (tag === "table" || tag === "section" || tag === "article" || tag === "footer" || tag === "header") {
      return kid;
    }
    if (meaningfulClass(kid)) return kid;
  }
  return kids[0];
}

export function findElementForPick(root: HTMLElement, pick: DigestCutPaintPick): Element | null {
  const scope = (pick.structureRoot && resolveStructureRootEl(root, pick.structureRoot)) || root;
  const candidates = structureChildren(scope).filter((el) => {
    if (el.tagName.toLowerCase() !== pick.tag) return false;
    if (!pick.classContains) return true;
    return (el.getAttribute("class") ?? "").split(/\s+/).includes(pick.classContains);
  });
  if (pick.index != null && pick.index >= 0 && pick.index < candidates.length) {
    return candidates[pick.index];
  }
  return candidates[0] ?? null;
}

/** Construit un pick depuis un élément déjà choisi (sans remonter). */
export function pickFromElement(el: Element, mailRoot: HTMLElement): DigestCutPaintPick | null {
  if (!mailRoot.contains(el) || el === mailRoot) return null;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;
  const { structureRoot, index, classContains } = indexAmongStructureSiblings(el);
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
  const label = `${tag}${classContains ? `.${classContains}` : index != null ? `[${index}]` : ""}${text ? ` — ${text}${text.length >= 48 ? "…" : ""}` : ""}`;
  return {
    tag,
    classContains,
    index,
    label,
    structureRoot,
    textContainsAny: textNeedlesFrom(el),
  };
}

/**
 * Index parmi les **enfants directs** du parent (comme le moteur Rust sous structureRoot).
 * Pas un parcours global du panneau mail.
 */
function indexAmongStructureSiblings(el: Element): {
  structureRoot: string;
  index: number | null;
  classContains: string | null;
} {
  const parent = el.parentElement;
  const classContains = meaningfulClass(el);
  if (!parent) {
    return { structureRoot: "div", index: classContains ? null : 0, classContains };
  }
  if (classContains) {
    return { structureRoot: uniqueSelectorFor(parent), index: null, classContains };
  }
  const tag = el.tagName.toLowerCase();
  const kids = structureChildren(parent);
  let i = 0;
  for (const kid of kids) {
    if (kid.tagName.toLowerCase() !== tag) continue;
    if (kid === el) {
      return { structureRoot: uniqueSelectorFor(parent), index: i, classContains: null };
    }
    i += 1;
  }
  return { structureRoot: uniqueSelectorFor(parent), index: 0, classContains: null };
}

function textNeedlesFrom(el: Element): string[] {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(" ").filter((w) => w.length >= 4).slice(0, 2);
  return words.length ? [words.join(" ").slice(0, 40)] : [text.slice(0, 24)];
}

export function pickFromMailClick(target: EventTarget | null, mailRoot: HTMLElement): DigestCutPaintPick | null {
  if (!(target instanceof Element) || !mailRoot.contains(target)) return null;
  const range = snapDragRange(mailRoot, target, target);
  const el = range[0];
  if (!el) return null;
  return pickFromElement(el, mailRoot);
}

function blockChildren(el: Element): Element[] {
  return structureChildren(el).filter((child) => {
    const tag = child.tagName.toLowerCase();
    return !SKIP_TAGS.has(tag) && tag !== "body" && tag !== "html";
  });
}

function structureParent(el: Element, root: Element): Element | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const tag = parent.tagName.toLowerCase();
  if ((tag === "thead" || tag === "tbody" || tag === "tfoot") && parent.parentElement) {
    const table = parent.parentElement;
    if (table.tagName.toLowerCase() === "table") return table === root ? root : table;
  }
  return parent;
}

/** Descend les enveloppes à un seul enfant. Le nœud utile est le bloc intérieur. */
export function unwrapSingleChildWrappers(el: Element, root: Element): Element {
  let cur = el;
  while (cur !== root) {
    const kids = blockChildren(cur).filter((kid) => !INLINE_TAGS.has(kid.tagName.toLowerCase()));
    if (kids.length !== 1) break;
    cur = kids[0];
  }
  return cur === root ? el : cur;
}

function climbToCutBoundary(start: Element, root: Element): Element | null {
  let cur: Element | null = start;
  while (cur && cur !== root) {
    const tag = cur.tagName.toLowerCase();
    if (tag === "body" || tag === "html" || SKIP_TAGS.has(tag) || INLINE_TAGS.has(tag)) {
      cur = cur.parentElement;
      continue;
    }
    const unwrapped = unwrapSingleChildWrappers(cur, root);
    return unwrapped === root ? null : unwrapped;
  }
  return null;
}

/**
 * Bloc minimal sous le pointeur, ou plage de frères contigus.
 * Jamais `body` ni la racine du mail. Les classes d'éditeur ne servent pas de frontière.
 */
export function snapDragRange(root: HTMLElement, start: Element, end: Element): Element[] {
  if (!root.contains(start) || start === root) return [];
  const focus = root.contains(end) && end !== root ? end : start;
  const a = climbToCutBoundary(start, root);
  const b = climbToCutBoundary(focus, root);
  if (!a || !b || a === root || b === root) return [];
  if (a === b || a.contains(b)) return [b];
  if (b.contains(a)) return [a];

  const chain = new Set<Element>();
  for (let node: Element | null = a; node && node !== root; node = structureParent(node, root)) {
    chain.add(node);
  }
  let lca: Element | null = null;
  for (let node: Element | null = b; node && node !== root; node = structureParent(node, root)) {
    if (chain.has(node)) {
      lca = node;
      break;
    }
  }
  const parent = lca ?? root;
  const childOf = (node: Element): Element => {
    let cur = node;
    while (cur !== parent) {
      const up = structureParent(cur, root);
      if (!up || up === cur) break;
      if (up === parent) return cur;
      cur = up;
    }
    return cur;
  };
  const left = childOf(a);
  const right = childOf(b);
  if (structureParent(left, root) !== parent || structureParent(right, root) !== parent) return [a];
  const kids = blockChildren(parent);
  const i1 = kids.indexOf(left);
  const i2 = kids.indexOf(right);
  if (i1 < 0 || i2 < 0) return [a];
  const lo = Math.min(i1, i2);
  const hi = Math.max(i1, i2);
  const range: Element[] = [];
  for (const kid of kids.slice(lo, hi + 1)) {
    if (kid === root || kid.tagName.toLowerCase() === "body") continue;
    if (!range.includes(kid)) range.push(kid);
  }
  return range;
}

export function cutRangeLabel(elements: Element[]): string {
  if (elements.length === 0) return "";
  if (elements.length === 1) {
    const el = elements[0];
    const tag = el.tagName.toLowerCase();
    const cls = meaningfulClass(el);
    return cls ? `${tag}.${cls}` : tag;
  }
  return `${elements.length} blocs`;
}

export function adjacentCutElement(el: Element, delta: -1 | 1): Element | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const kids = blockChildren(parent).filter((kid) => !INLINE_TAGS.has(kid.tagName.toLowerCase()));
  const idx = kids.indexOf(el);
  if (idx < 0) return null;
  return kids[idx + delta] ?? null;
}

function indexAmongShape(el: Element): number | null {
  const parent = el.parentElement;
  if (!parent) return 0;
  const tag = el.tagName.toLowerCase();
  const cls = meaningfulClass(el);
  const kids = structureChildren(parent).filter((kid) => {
    if (kid.tagName.toLowerCase() !== tag) return false;
    if (!cls) return true;
    return (kid.getAttribute("class") ?? "").split(/\s+/).includes(cls);
  });
  const idx = kids.indexOf(el);
  return idx >= 0 ? idx : null;
}

/** Ancres d'une plage : index distincts pour que chaque frère reste résolvable. */
export function picksFromElements(elements: Element[], root: HTMLElement): DigestCutPaintPick[] {
  const picks: DigestCutPaintPick[] = [];
  for (const el of elements) {
    const pick = pickFromElement(el, root);
    if (!pick) continue;
    const indexed = indexAmongShape(el);
    if (indexed != null) pick.index = indexed;
    picks.push(pick);
  }
  return picks;
}

export function paintPickToAnchor(pick: DigestCutPaintPick): DigestCutAnchor {
  return {
    selector: pick.tag,
    classContains: pick.classContains,
    index: pick.index,
    textContainsAny: pick.textContainsAny ?? [],
    role: null,
  };
}

export function ensurePaintProposalSkeleton(): DigestCutProposal {
  if (digestCut.proposal) return digestCut.proposal;
  const domain = digestCut.senderEmail.includes("@")
    ? digestCut.senderEmail.split("@").pop()!.toLowerCase()
    : "exemple.fr";
  const slug = domain.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "mail";
  digestCut.proposal = {
    fixtureId: slug,
    ruleSetVersion: "1",
    source: "heuristic",
    explanationFr: "Sélection visuelle : assignez des zones sur le mail, puis lancez l'aperçu.",
    match: {
      senderDomains: [{ exact: domain }],
      structureRoot: "div",
      minChildren: 2,
    },
    zones: {
      header: { action: "show", presentation: "as_is", anchors: [], rationale: "À peindre" },
      body: { action: "show", presentation: "as_is", anchors: [], rationale: "À peindre" },
      footer: { action: "hide", anchors: [], rationale: "À peindre" },
    },
  };
  return digestCut.proposal;
}

const ZONE_RANK: Record<DigestCutZoneName, number> = { header: 0, body: 1, footer: 2 };

function visibleText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Deux cadres sur le même titre : on n’en garde qu’un, le plus précis. */
export function exclusiveZoneHits(
  hits: Array<{ zone: DigestCutZoneName; el: Element }>,
): Array<{ zone: DigestCutZoneName; el: Element }> {
  const sorted = [...hits].sort((a, b) => {
    const len = visibleText(a.el).length - visibleText(b.el).length;
    if (len !== 0) return len;
    return ZONE_RANK[a.zone] - ZONE_RANK[b.zone];
  });
  const kept: Array<{ zone: DigestCutZoneName; el: Element }> = [];
  for (const hit of sorted) {
    const text = visibleText(hit.el);
    const overlaps = kept.some((other) => {
      if (other.el === hit.el) return true;
      const outer = other.el.contains(hit.el) ? other.el : hit.el.contains(other.el) ? hit.el : null;
      const inner = outer === other.el ? hit.el : outer === hit.el ? other.el : null;
      if (!outer || !inner) return false;
      const outerText = visibleText(outer);
      const innerText = visibleText(inner);
      return innerText.length > 0 && outerText.length <= innerText.length + 24;
    });
    if (!overlaps && text.length > 0) kept.push(hit);
  }
  return kept;
}

/** HTML affiché : aucune classe d'éditeur n'est écrite dans les nœuds du mail. */
export function decorateMailHtmlForCut(rawHtml: string): string {
  if (!rawHtml.trim()) return rawHtml;
  return rawHtml.replace(/\s*digest-cut__[\w-]*/g, "");
}

function resolveStructureRootEl(root: HTMLElement, selector: string): Element | null {
  const sel = selector.trim();
  if (!sel) return null;
  try {
    return root.querySelector(sel);
  } catch {
    return null;
  }
}

