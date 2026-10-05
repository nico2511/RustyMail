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

function isWordCharAt(source: string, index: number): boolean {
  if (index < 0 || index >= source.length) return false;
  const ch = source[index]!;
  return /\p{L}|\p{N}|['’]/u.test(ch);
}

/** Extrait court / homophone : ne matcher que comme mot entier (évite a→à dans « plastique »). */
export function grammarNeedleNeedsWordBoundary(needle: string): boolean {
  const t = needle.trim();
  if (!t) return false;
  const chars = [...t];
  if (chars.length <= 2) return true;
  if (/\s/.test(t)) return false;
  return /^(a|à|ou|où|la|là|du|dû|sur|sûr|des|dès)$/i.test(t);
}

export function spanHasWordBoundary(source: string, start: number, end: number): boolean {
  return !isWordCharAt(source, start - 1) && !isWordCharAt(source, end);
}

function filterBounded(source: string, spans: Span[], needle: string): Span[] {
  if (!grammarNeedleNeedsWordBoundary(needle)) return spans;
  return spans.filter((span) => spanHasWordBoundary(source, span.start, span.end));
}

/**
 * Accents seuls sur 1–2 lettres sans contexte (ex. « a » → « à ») : trop dangereux.
 * Accepte si l’extrait contient déjà plusieurs mots (contexte).
 */
export function grammarSuggestionTooAmbiguous(original: string, replacement: string): boolean {
  const o = original.trim();
  const r = replacement.trim();
  if (!o || !r || o === r) return false;
  if (/\s/.test(o)) return false;
  const oChars = [...o];
  if (oChars.length > 2) return false;
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (fold(o) === fold(r) && o !== r) return true;
  return /^(a|à|ou|où|la|là)$/i.test(o);
}

/** N× « tout remplacer » seulement si l’extrait n’est pas un homophone court. */
export function grammarAllowReplaceAll(original: string): boolean {
  return !grammarNeedleNeedsWordBoundary(original);
}

export function findGrammarSpans(source: string, suggestion: GrammarReplaceInput): Span[] {
  const raw = suggestion.original ?? "";
  const trimmed = raw.trim();
  const short = grammarNeedleNeedsWordBoundary(trimmed || raw);

  // Homophones courts : offset/length = position unique (pas de filtre frontière).
  if (short) {
    const positioned = offsetSpan(source, suggestion);
    if (positioned.length) return positioned;
  }

  const collect = (needle: string): Span[] => {
    if (!needle) return [];
    const exact = filterBounded(source, exactSpans(source, needle), needle);
    if (exact.length) return exact;
    return filterBounded(source, foldedSpans(source, needle), needle);
  };

  const exact = collect(raw);
  if (exact.length) return exact;
  if (trimmed && trimmed !== raw) {
    const trimmedHits = collect(trimmed);
    if (trimmedHits.length) return trimmedHits;
  }
  const unwrapped = unwrapQuotes(raw);
  if (unwrapped) {
    const unwrappedHits = collect(unwrapped);
    if (unwrappedHits.length) return unwrappedHits;
  }
  if (!short) {
    const positioned = offsetSpan(source, suggestion);
    if (positioned.length) return positioned;
  }
  return [];
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
const MAX_GRAMMAR_ORIGINAL_CHARS = 180;

export function grammarOriginalTooLong(original: string): boolean {
  return [...original.trim()].length > MAX_GRAMMAR_ORIGINAL_CHARS;
}

function endsWithSentenceMark(value: string): boolean {
  const trimmed = value.trimEnd();
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const c = trimmed[i]!;
    if (c === '"' || c === "'" || c === "’" || c === "»" || c === ")" || c === "]") continue;
    return c === "." || c === "!" || c === "?" || c === "…";
  }
  return false;
}

function hasSentenceMark(value: string): boolean {
  return /[.!?…]/.test(value);
}

/** Point final retiré (« Bonjour. » → « Bonjour »). « Bonjour. » → « Bonjour! » reste autorisé. */
export function replacementDropsCriticalPunct(original: string, replacement: string): boolean {
  return endsWithSentenceMark(original) && !hasSentenceMark(replacement);
}

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

/** Suggestions dont l’extrait est encore dans le texte visible. */
export function retainGrammarSuggestionsInText<T extends GrammarReplaceInput>(
  suggestions: readonly T[] | null | undefined,
  plain: string,
): T[] {
  if (!suggestions?.length) return [];
  return suggestions.filter((suggestion) => grammarOccurrenceCount(plain, plain, suggestion) > 0);
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
