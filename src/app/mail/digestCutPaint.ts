/** Sélection visuelle de nœuds HTML pour l'éditeur de découpe. */

import type { DigestCutAnchor, DigestCutPaintPick, DigestCutProposal, DigestCutZoneName } from "./digestCutState";
import { digestCut } from "./digestCutState";

const SKIP_TAGS = new Set(["html", "head", "body", "script", "style", "br", "hr", "img", "svg", "path"]);

function meaningfulClass(el: Element): string | null {
  const raw = el.getAttribute("class") ?? "";
  for (const token of raw.split(/\s+/)) {
    if (
      token &&
      token.length <= 40 &&
      /^[a-zA-Z][\w-]*$/.test(token) &&
      !/^(x_|mso|outlook)/i.test(token)
    ) {
      return token;
    }
  }
  return null;
}

/** Même notion que `child_elements` côté Rust (table → lignes via thead/tbody/tfoot). */
function structureChildren(root: Element): Element[] {
  const isTable = root.tagName.toLowerCase() === "table";
  const out: Element[] = [];
  for (const child of root.children) {
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
  const tag = el.tagName.toLowerCase();
  const cls = meaningfulClass(el);
  if (cls) return `${tag}.${cls}`;
  return tag;
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
  const expanded = expandCutNode(target, mailRoot);
  if (expanded === mailRoot) return null;
  return pickFromElement(expanded, mailRoot);
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

/** Surligne les ancres connues + la sélection courante dans un clone DOM. */
export function decorateMailHtmlForCut(rawHtml: string): string {
  if (!rawHtml.trim()) return rawHtml;
  const wrap = document.createElement("div");
  wrap.innerHTML = rawHtml;
  const proposal = digestCut.proposal;
  if (proposal) {
    const zones: DigestCutZoneName[] = ["header", "body", "footer"];
    for (const zone of zones) {
      for (const anchor of proposal.zones[zone].anchors) {
        markAnchorMatches(wrap, anchor, zone, proposal.match.structureRoot);
      }
    }
  }
  if (digestCut.paintPick) {
    markPaintPick(wrap, digestCut.paintPick);
  }
  return wrap.innerHTML;
}

function markAnchorMatches(
  root: HTMLElement,
  anchor: DigestCutAnchor,
  zone: DigestCutZoneName,
  structureRoot: string,
): void {
  const tag = (anchor.selector ?? "").trim().toLowerCase();
  if (!tag) return;
  const scope = resolveStructureRootEl(root, structureRoot) ?? root;
  const classNeedle = (anchor.classContains ?? "").trim().toLowerCase();
  const candidates = structureChildren(scope).filter((el) => {
    if (el.tagName.toLowerCase() !== tag) return false;
    if (!classNeedle) return true;
    return (el.getAttribute("class") ?? "").toLowerCase().split(/\s+/).some((t) => t.includes(classNeedle));
  });
  const el =
    anchor.index != null && anchor.index >= 0 && anchor.index < candidates.length
      ? candidates[anchor.index]
      : candidates[0];
  if (!el) return;
  el.classList.add("digest-cut__zone-hl", `digest-cut__zone-hl--${zone}`);
  el.setAttribute("data-digest-cut-zone", zone);
  el.setAttribute(
    "data-digest-cut-label",
    zone === "header" ? "En-tête" : zone === "body" ? "Corps" : "Pied",
  );
  const check = digestCut.zoneChecks[zone];
  if (check) {
    el.setAttribute("data-digest-cut-check", check.status);
  }
  if (digestCut.paintZone === zone) {
    el.classList.add("digest-cut__zone-hl--active");
  }
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

function markPaintPick(root: HTMLElement, pick: DigestCutPaintPick): void {
  const el = findElementForPick(root, pick);
  if (!el) return;
  el.classList.add("digest-cut__paint-pick");
}
