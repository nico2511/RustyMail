/** Validation visuelle : balise HTML complète + ancrage résolvable + rôle heuristique. */

import {
  expandCutNode,
  findElementForPick,
  paintPickToAnchor,
  pickFromElement,
} from "./digestCutPaint";
import {
  digestCut,
  type DigestCutPaintPick,
  type DigestCutProposal,
  type DigestCutZoneCheck,
  type DigestCutZoneName,
} from "./digestCutState";

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

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

const SKIP_TAGS = new Set(["html", "head", "body", "script", "style", "svg", "path"]);

/** Vérifie que outerHTML est bien un seul élément `<tag…>…</tag>` (pas un fragment coupé). */
export function hasCompleteTagPair(el: Element): {
  ok: boolean;
  message: string;
} {
  const tag = el.tagName.toLowerCase();
  if (VOID_TAGS.has(tag)) {
    return {
      ok: false,
      message: `Balise vide <${tag}> — choisissez un bloc qui s’ouvre et se ferme.`,
    };
  }
  const html = el.outerHTML.trim();
  if (!new RegExp(`^<${tag}\\b`, "i").test(html)) {
    return { ok: false, message: "Ouverture de balise introuvable." };
  }
  if (!new RegExp(`</${tag}\\s*>$`, "i").test(html)) {
    return {
      ok: false,
      message: `Balisage incomplet : fermeture </${tag}> manquante.`,
    };
  }
  const probe = document.createElement("div");
  probe.innerHTML = html;
  if (probe.children.length !== 1 || probe.children[0].tagName.toLowerCase() !== tag) {
    return {
      ok: false,
      message: "Le fragment n’est pas un seul élément HTML complet.",
    };
  }
  return { ok: true, message: `Balise complète <${tag}>…</${tag}>.` };
}

/** Remonte jusqu’à un bloc découpable (pas du texte inline / balise vide). */
export function snapToCuttableBlock(start: Element, root: Element): Element | null {
  let cur: Element | null = start instanceof Element ? start : null;
  if (!cur) return null;
  while (cur && cur !== root) {
    const tag = cur.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag) || VOID_TAGS.has(tag) || INLINE_TAGS.has(tag)) {
      cur = cur.parentElement;
      continue;
    }
    const pair = hasCompleteTagPair(cur);
    if (!pair.ok) {
      cur = cur.parentElement;
      continue;
    }
    const expanded = expandCutNode(cur, root);
    if (expanded !== root && hasCompleteTagPair(expanded).ok) {
      return expanded;
    }
    return cur;
  }
  return null;
}

function roleHint(el: Element, zone: DigestCutZoneName | null): { fit: "ok" | "warn"; tip: string } {
  if (!zone) return { fit: "ok", tip: "Bloc structurel." };
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const cls = (el.getAttribute("class") ?? "").toLowerCase();
  const tag = el.tagName.toLowerCase();
  const footerCue =
    /footer|unsubscribe|désabon|mentions|copyright|©|legal|pied/.test(cls) ||
    /unsubscribe|désabon|mentions légales|copyright|©/.test(text.slice(0, 200));
  const headerCue =
    /header|logo|banner|titre|brand/.test(cls) ||
    tag === "header" ||
    tag === "h1" ||
    tag === "h2";
  if (zone === "footer") {
    if (footerCue) return { fit: "ok", tip: "Ressemble à un pied (liens / mentions)." };
    if (headerCue) return { fit: "warn", tip: "Plutôt en-tête — vérifiez avant de valider." };
    return { fit: "warn", tip: "Pied peu typique : confirmez ou affinez." };
  }
  if (zone === "header") {
    if (headerCue) return { fit: "ok", tip: "Ressemble à un en-tête." };
    if (footerCue) return { fit: "warn", tip: "Plutôt pied — vérifiez avant de valider." };
    return { fit: "ok", tip: "Bloc haut plausible." };
  }
  if (footerCue || headerCue) {
    return { fit: "warn", tip: "Ce bloc ressemble plus à en-tête/pied qu’au corps." };
  }
  return { fit: "ok", tip: "Bloc de contenu plausible." };
}

export function validateElementForZone(
  el: Element,
  mailRoot: HTMLElement,
  zone: DigestCutZoneName | null,
  source: DigestCutZoneCheck["source"] = "heuristic",
): DigestCutZoneCheck {
  const pair = hasCompleteTagPair(el);
  if (!pair.ok) {
    return {
      status: "bad",
      source,
      completeMarkup: false,
      resolvable: false,
      message: pair.message,
    };
  }
  const pick = pickFromElement(el, mailRoot);
  if (!pick) {
    return {
      status: "bad",
      source,
      completeMarkup: true,
      resolvable: false,
      message: "Impossible de décrire ce bloc pour le moteur de découpe.",
    };
  }
  const roundTrip = findElementForPick(mailRoot, pick);
  const resolvable = roundTrip === el || (roundTrip != null && roundTrip.contains(el));
  if (!resolvable) {
    return {
      status: "bad",
      source,
      completeMarkup: true,
      resolvable: false,
      message: "Ce bloc ne se rattache pas proprement à la structure du mail.",
    };
  }
  const role = roleHint(el, zone);
  const status = role.fit === "warn" ? "warn" : "ok";
  return {
    status,
    source,
    completeMarkup: true,
    resolvable: true,
    message: `${pair.message} ${role.tip}`,
  };
}

export function validatePaintPick(
  pick: DigestCutPaintPick,
  mailRoot: HTMLElement,
  zone: DigestCutZoneName | null,
  source: DigestCutZoneCheck["source"] = "heuristic",
): DigestCutZoneCheck {
  const el = findElementForPick(mailRoot, pick);
  if (!el) {
    return {
      status: "bad",
      source,
      completeMarkup: false,
      resolvable: false,
      message: "Bloc introuvable dans le mail affiché.",
    };
  }
  return validateElementForZone(el, mailRoot, zone, source);
}

export function revalidateProposalZones(
  proposal: DigestCutProposal,
  mailRoot: HTMLElement | null,
  source: DigestCutZoneCheck["source"] = "heuristic",
): void {
  const zones: DigestCutZoneName[] = ["header", "body", "footer"];
  if (!mailRoot) {
    for (const zone of zones) digestCut.zoneChecks[zone] = null;
    return;
  }
  for (const zone of zones) {
    const anchors = proposal.zones[zone].anchors;
    if (!anchors.length) {
      digestCut.zoneChecks[zone] = {
        status: "warn",
        source,
        completeMarkup: false,
        resolvable: false,
        message: "Aucun bloc assigné.",
      };
      continue;
    }
    const anchor = anchors[0];
    const pick: DigestCutPaintPick = {
      tag: (anchor.selector ?? "div").toLowerCase(),
      classContains: anchor.classContains ?? null,
      index: anchor.index ?? null,
      label: zone,
      structureRoot: proposal.match.structureRoot,
      textContainsAny: anchor.textContainsAny,
    };
    digestCut.zoneChecks[zone] = validatePaintPick(pick, mailRoot, zone, source);
  }
}

/** Valide depuis le HTML source (avant remount du panneau). */
export function revalidateProposalFromHtml(
  proposal: DigestCutProposal,
  html: string,
  source: DigestCutZoneCheck["source"] = "heuristic",
): void {
  const wrap = document.createElement("div");
  // Même chemin que le panneau mail (DOM navigateur = balises complètes).
  wrap.innerHTML = html;
  revalidateProposalZones(proposal, wrap, source);
}

export function checkSummaryFr(check: DigestCutZoneCheck | null | undefined): string {
  if (!check) return "";
  if (check.status === "ok") {
    return "Structure OK";
  }
  if (check.status === "warn") return "À confirmer";
  return "Incomplet";
}

/** Met à jour rationale + zoneChecks après une assignation peinte. */
export function applyValidatedPickToZone(
  zone: DigestCutZoneName,
  pick: DigestCutPaintPick,
  mailRoot: HTMLElement,
): DigestCutZoneCheck {
  const check = validatePaintPick(pick, mailRoot, zone, "heuristic");
  digestCut.zoneChecks[zone] = check;
  digestCut.paintCheck = check;
  if (check.status === "bad") return check;
  const proposal = digestCut.proposal;
  if (!proposal) return check;
  const nextRoot = pick.structureRoot?.trim() ?? "";
  const prevRoot = (proposal.zones[zone].structureRoot ?? "").trim();
  if (nextRoot && prevRoot && nextRoot !== prevRoot) {
    proposal.zones[zone].anchors = [];
  }
  const anchor = paintPickToAnchor(pick);
  const anchors = proposal.zones[zone].anchors;
  const key = `${anchor.selector ?? ""}|${anchor.index ?? ""}|${anchor.classContains ?? ""}`;
  const already = anchors.some(
    (item) => `${item.selector ?? ""}|${item.index ?? ""}|${item.classContains ?? ""}` === key,
  );
  if (!already) anchors.push(anchor);
  proposal.zones[zone].rationale = `${checkSummaryFr(check)} — ${check.message}`;
  if (pick.structureRoot?.trim()) {
    proposal.zones[zone].structureRoot = pick.structureRoot.trim();
  }
  if (!digestCut.lockedZones.includes(zone)) digestCut.lockedZones.push(zone);
  proposal.source = "heuristic";
  return check;
}
