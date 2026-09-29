/** Remplacement littéral d’une suggestion « Correction de texte » (première occurrence). */

export type GrammarReplaceInput = {
  original: string;
  replacement: string;
  offset?: number;
  length?: number;
};

export type GrammarReplaceResult = {
  text: string;
  /** 1 si une tranche a été remplacée, sinon 0. */
  replaced: number;
  /** Nombre d’occurrences trouvées avant remplacement. */
  occurrences: number;
};

type Span = { start: number; end: number };

function isZeroWidth(cp: number): boolean {
  return cp === 0xfeff || cp === 0x2060 || (cp >= 0x200b && cp <= 0x200d);
}

function isSpace(cp: number): boolean {
  if (cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x0c || cp === 0xa0) return true;
  if (cp >= 0x2000 && cp <= 0x200a) return true;
  return cp === 0x202f || cp === 0x205f || cp === 0x3000 || cp === 0x1680;
}

/** Apostrophes et guillemets typographiques → forme ASCII, espaces homogènes. */
function foldCodePoint(cp: number): string | null {
  if (isZeroWidth(cp)) return null;
  if (isSpace(cp)) return " ";
  if (
    cp === 0x27 ||
    cp === 0x60 ||
    cp === 0xb4 ||
    cp === 0x2018 ||
    cp === 0x2019 ||
    cp === 0x201a ||
    cp === 0x201b ||
    cp === 0x2032 ||
    cp === 0x2035
  ) {
    return "'";
  }
  if (cp === 0x22 || cp === 0x201c || cp === 0x201d || cp === 0x201e || cp === 0x201f) return '"';
  return String.fromCodePoint(cp);
}

type Folded = { text: string; spans: Span[] };

function foldForMatch(source: string): Folded {
  let text = "";
  const spans: Span[] = [];
  let i = 0;
  while (i < source.length) {
    const cp = source.codePointAt(i)!;
    const width = cp > 0xffff ? 2 : 1;
    if (isZeroWidth(cp)) {
      i += width;
      continue;
    }
    if (isSpace(cp)) {
      const start = i;
      i += width;
      while (i < source.length) {
        const next = source.codePointAt(i)!;
        const nextWidth = next > 0xffff ? 2 : 1;
        if (isZeroWidth(next)) {
          i += nextWidth;
          continue;
        }
        if (!isSpace(next)) break;
        i += nextWidth;
      }
      text += " ";
      spans.push({ start, end: i });
      continue;
    }
    text += foldCodePoint(cp);
    spans.push({ start: i, end: i + width });
    i += width;
  }
  return { text, spans };
}

function exactSpans(source: string, needle: string): Span[] {
  if (!needle) return [];
  const out: Span[] = [];
  let from = 0;
  while (from <= source.length) {
    const at = source.indexOf(needle, from);
    if (at < 0) break;
    out.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
  return out;
}

function foldedSpans(source: string, needle: string): Span[] {
  const foldedNeedle = foldForMatch(needle.trim()).text.trim();
  if (!foldedNeedle) return [];
  const hay = foldForMatch(source);
  const out: Span[] = [];
  let from = 0;
  while (from <= hay.text.length) {
    const at = hay.text.indexOf(foldedNeedle, from);
    if (at < 0) break;
    const last = hay.spans[at + foldedNeedle.length - 1];
    const first = hay.spans[at];
    if (first && last && last.end > first.start) out.push({ start: first.start, end: last.end });
    from = at + foldedNeedle.length;
  }
  return out;
}

function unwrapQuotes(value: string): string | null {
  const t = value.trim();
  if (t.length < 2) return null;
  const open = t[0];
  const close = t[t.length - 1];
  const pairs: Record<string, string> = { '"': '"', "'": "'", "«": "»", "“": "”", "‘": "’" };
  if (pairs[open] !== close) return null;
  const inner = t.slice(1, -1).trim();
  return inner && inner !== value ? inner : null;
}

function offsetSpan(source: string, suggestion: GrammarReplaceInput): Span[] {
  const off = suggestion.offset ?? 0;
  const len = suggestion.length ?? 0;
  if (!Number.isFinite(off) || !Number.isFinite(len) || len <= 0 || off < 0) return [];
  if (off + len > source.length) return [];
  const slice = source.slice(off, off + len);
  const want = foldForMatch((suggestion.original ?? "").trim()).text.trim();
  if (!want) return [];
  if (foldForMatch(slice).text.trim() !== want) return [];
  return [{ start: off, end: off + len }];
}

export function findGrammarSpans(source: string, suggestion: GrammarReplaceInput): Span[] {
  const raw = suggestion.original ?? "";
  const exact = exactSpans(source, raw);
  if (exact.length) return exact;
  const trimmed = raw.trim();
  if (trimmed && trimmed !== raw) {
    const trimmedHits = exactSpans(source, trimmed);
    if (trimmedHits.length) return trimmedHits;
  }
  const unwrapped = unwrapQuotes(raw);
  if (unwrapped) {
    const unwrappedHits = exactSpans(source, unwrapped);
    if (unwrappedHits.length) return unwrappedHits;
  }
  const folded = foldedSpans(source, raw);
  if (folded.length) return folded;
  if (unwrapped) {
    const foldedInner = foldedSpans(source, unwrapped);
    if (foldedInner.length) return foldedInner;
  }
  return offsetSpan(source, suggestion);
}

function contentTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.replace(/'/g, ""))
    .filter((token) => token.length >= 2);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

function tokensSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  return levenshtein(a, b) <= Math.max(2, Math.floor(a.length / 3));
}

/**
 * Vrai si le remplacement est surtout l’extrait d’origine avec un mot de contenu en moins.
 * Une reformulation (« salu moi c'est nicolas » → « Bonjour, je m'appelle Nicolas ») reste autorisée.
 */
export function replacementDropsWords(original: string, replacement: string): boolean {
  const orig = contentTokens(original);
  const repl = contentTokens(replacement);
  if (!repl.length) return orig.some((token) => token.length >= 4);
  const missing = orig.some(
    (token) => token.length >= 4 && !repl.some((next) => tokensSimilar(token, next)),
  );
  if (!missing) return false;
  const preserved = repl.filter((token) => orig.some((prev) => tokensSimilar(token, prev))).length;
  const coverage = preserved / repl.length;
  return coverage >= 0.75 && repl.length < orig.length;
}

export function grammarTextsMatch(a: string, b: string): boolean {
  return foldForMatch(a).text.trim() === foldForMatch(b).text.trim();
}

export function countGrammarOccurrences(source: string, suggestion: GrammarReplaceInput): number {
  return findGrammarSpans(source, suggestion).length;
}

/** Occurrences dans le texte affiché, sinon dans le markdown canonique (images inline). */
export function grammarOccurrenceCount(display: string, canonical: string, suggestion: GrammarReplaceInput): number {
  const inDisplay = countGrammarOccurrences(display, suggestion);
  if (inDisplay > 0) return inDisplay;
  if (canonical && canonical !== display) return countGrammarOccurrences(canonical, suggestion);
  return 0;
}

/**
 * Remplace uniquement la première occurrence.
 * Le remplacement est collé tel quel (`$` n’est pas interprété).
 */
export function applyGrammarReplacement(source: string, suggestion: GrammarReplaceInput): GrammarReplaceResult {
  const spans = findGrammarSpans(source, suggestion);
  if (!spans.length) return { text: source, replaced: 0, occurrences: 0 };
  const first = spans[0]!;
  const text = source.slice(0, first.start) + (suggestion.replacement ?? "") + source.slice(first.end);
  return { text, replaced: 1, occurrences: spans.length };
}
