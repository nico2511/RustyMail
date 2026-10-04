/** Même phrase que `SUMMARY_UNREADABLE_FR` dans `ai_summary.rs`. */
export const SUMMARY_PARSE_FAILED_FR =
  "Résumé indisponible : la réponse du modèle n’a pas pu être lue.";

export const SUMMARY_DRAFTING_FR = "Rédaction du résumé…";

export type SalvagedSummary = {
  title: string;
  bullets: string[];
};

function jsonKeyPositions(text: string, key: string): number[] {
  const pattern = `"${key}"`;
  const out: number[] = [];
  let search = 0;
  while (search < text.length && out.length < 16) {
    const idx = text.indexOf(pattern, search);
    if (idx < 0) break;
    const prev = idx === 0 ? "" : text[idx - 1]!;
    if (idx === 0 || !/[A-Za-z0-9_]/.test(prev)) out.push(idx);
    search = idx + pattern.length;
  }
  return out;
}

function valueStartAfterKey(text: string, keyIdx: number, key: string): number | null {
  const after = keyIdx + key.length + 2;
  if (after > text.length) return null;
  let i = after;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  if (text[i] !== ":") return null;
  i += 1;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  return i;
}

function readJsonString(
  text: string,
  quoteIdx: number,
): { value: string; next: number; closed: boolean } | null {
  if (text[quoteIdx] !== '"') return null;
  let i = quoteIdx + 1;
  let out = "";
  let escape = false;
  while (i < text.length) {
    const c = text[i]!;
    if (escape) {
      if (c === "u") {
        const hex = text.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 5;
          escape = false;
          continue;
        }
        out += "u";
      } else if (c === "n") out += "\n";
      else if (c === "r") out += "\r";
      else if (c === "t") out += "\t";
      else out += c;
      escape = false;
      i += 1;
      continue;
    }
    if (c === "\\") {
      escape = true;
      i += 1;
      continue;
    }
    if (c === '"') return { value: out, next: i + 1, closed: true };
    if (c === "\n" || c === "\r") {
      const trimmed = out.trim();
      if (!trimmed) return null;
      return { value: trimmed, next: i, closed: false };
    }
    out += c;
    i += 1;
  }
  const trimmed = out.trim();
  if (!trimmed) return null;
  return { value: trimmed, next: text.length, closed: false };
}

function readStringArray(text: string, bracketIdx: number): string[] {
  if (text[bracketIdx] !== "[") return [];
  let i = bracketIdx + 1;
  const out: string[] = [];
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i += 1;
    if (i >= text.length) break;
    const c = text[i]!;
    if (c === "]") break;
    if (c === ",") {
      i += 1;
      continue;
    }
    if (c === '"') {
      const read = readJsonString(text, i);
      if (!read) break;
      const t = read.value.trim();
      if (t) out.push(t);
      if (read.next <= i) break;
      i = read.next;
      continue;
    }
    const relComma = text.indexOf(",", i);
    const relEnd = text.indexOf("]", i);
    if (relComma >= 0 && (relEnd < 0 || relComma < relEnd)) {
      i = relComma + 1;
      continue;
    }
    break;
  }
  return out;
}

function bestStringArray(text: string, key: string): { at: number; items: string[] } | null {
  let best: { at: number; items: string[] } | null = null;
  for (const idx of jsonKeyPositions(text, key)) {
    const vstart = valueStartAfterKey(text, idx, key);
    if (vstart == null || text[vstart] !== "[") continue;
    const items = readStringArray(text, vstart);
    if (items.length && (!best || items.length > best.items.length)) {
      best = { at: idx, items };
    }
  }
  return best;
}

function stringFieldBefore(text: string, key: string, before: number): string | null {
  let found: string | null = null;
  for (const idx of jsonKeyPositions(text, key)) {
    if (idx >= before) break;
    const vstart = valueStartAfterKey(text, idx, key);
    if (vstart == null || text[vstart] !== '"') continue;
    const read = readJsonString(text, vstart);
    if (read?.value.trim()) found = read.value;
  }
  return found;
}

function firstStringField(text: string, key: string): string | null {
  return stringFieldBefore(text, key, Number.MAX_SAFE_INTEGER);
}

function findEnclosingObjectStart(text: string, idx: number): number | null {
  let inString = false;
  let escape = false;
  const stack: number[] = [];
  for (let i = 0; i < idx && i < text.length; ) {
    const c = text[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") stack.push(i);
    else if (c === "}") stack.pop();
    i += 1;
  }
  return stack.length ? stack[stack.length - 1]! : null;
}

function balancedEndFrom(text: string, start: number): number | null {
  if (text[start] !== "{" && text[start] !== "[") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth += 1;
    else if (c === "}" || c === "]") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

function objectSpanContaining(text: string, idx: number): [number, number] {
  const start = findEnclosingObjectStart(text, idx) ?? 0;
  const end = balancedEndFrom(text, start) ?? text.length;
  return [start, Math.max(start, Math.min(end, text.length))];
}

function lenientSummary(text: string): SalvagedSummary | null {
  const found = bestStringArray(text, "bullets");
  if (!found) {
    const bullets = (firstStringField(text, "bullets") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const title = firstStringField(text, "title")?.trim() ?? "";
    if (!title && !bullets.length) return null;
    return { title, bullets };
  }
  const [start, end] = objectSpanContaining(text, found.at);
  const slice = text.slice(start, end);
  const bullets = bestStringArray(slice, "bullets")?.items ?? found.items;
  const title = firstStringField(slice, "title")?.trim() ?? "";
  if (!title && !bullets.length) return null;
  return { title, bullets };
}

function escapeControlsInJsonStrings(raw: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (const c of raw) {
    if (inString) {
      if (escape) {
        out += c;
        escape = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        out += c;
        continue;
      }
      if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else out += c;
      continue;
    }
    if (c === '"') inString = true;
    out += c;
  }
  return out;
}

function unescapeEmbeddedQuotes(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i]!;
    const next = raw[i + 1];
    if (c === "\\" && (next === '"' || next === "\\")) {
      out += next;
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

function pushUnique(out: string[], value: string): void {
  const t = value.trim();
  if (t.length < 12 || out.includes(t) || out.length >= 24) return;
  out.push(t);
}

function summaryJsonCandidates(raw: string): string[] {
  const bases = [raw, escapeControlsInJsonStrings(raw)];
  if (raw.includes('\\"')) bases.push(unescapeEmbeddedQuotes(raw));
  const out: string[] = [];
  for (const base of bases) {
    pushUnique(out, base);
    let braces = 0;
    for (let i = 0; i < base.length && braces < 8; i += 1) {
      if (base[i] !== "{") continue;
      pushUnique(out, base.slice(i));
      braces += 1;
    }
    const titleAt = jsonKeyPositions(base, "title")[0];
    if (titleAt != null) {
      const from = base.slice(titleAt).trimStart();
      if (!from.startsWith("{")) pushUnique(out, `{${from}`);
    }
    if (out.length >= 24) break;
  }
  return out;
}

export function markerLine(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || !t.startsWith("===") || !t.endsWith("===")) return false;
  const inner = t.replace(/^=+/, "").replace(/=+$/, "").trim();
  return /^\[\d+\]/.test(inner);
}

export function isConversationIndexMarker(text: string): boolean {
  const t = text.trim();
  if (markerLine(t)) return true;
  const colon = t.lastIndexOf(":");
  if (colon >= 0 && markerLine(t.slice(colon + 1))) return true;
  return false;
}

export function isRawSummaryJson(text: string): boolean {
  const t = text.trim().replace(/^\(extrait modèle\)\s*/, "");
  return (
    (t.includes('"title"') && t.includes('"bullets"')) ||
    (t.includes('\\"title\\"') && t.includes('\\"bullets\\"'))
  );
}

export function isNoiseBullet(text: string): boolean {
  const t = text.trim();
  if (
    !t ||
    t.startsWith("(extrait modèle)") ||
    isConversationIndexMarker(t) ||
    isRawSummaryJson(t)
  ) {
    return true;
  }
  const lower = t.toLowerCase();
  // Fuite de schéma JSON / ids techniques dans les puces affichées.
  if (
    lower === "sourcemessageids" ||
    lower.startsWith("sourcemessageids") ||
    lower.includes('"sourcemessageids"') ||
    lower.includes("source_message_ids") ||
    lower.includes("[message_id=") ||
    (lower.includes("message_id") && t.length < 80)
  ) {
    return true;
  }
  return false;
}

export function cleanBulletText(text: string): string {
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim().replace(/^[-•]\s+/, "").trim();
    if (!t) continue;
    if (isNoiseBullet(t)) break;
    kept.push(t);
  }
  return kept.join(" ");
}

/** Extrait `title` + `bullets` d’un JSON de synthèse, même préfixé, tronqué ou encapsulé. */
export function salvageSummaryFields(raw: string): SalvagedSummary | null {
  let best: SalvagedSummary & { score: number; chars: number } | null = null;
  for (const cand of summaryJsonCandidates(raw)) {
    const dto = lenientSummary(cand);
    if (!dto) continue;
    const bullets = dto.bullets
      .map((b) => cleanBulletText(b).slice(0, 300))
      .filter((b) => b && !isNoiseBullet(b))
      .slice(0, 8);
    const title = dto.title.trim().slice(0, 260);
    const titleOk = Boolean(title) && !isNoiseBullet(title);
    const score = bullets.length * 10 + (titleOk ? 4 : 0);
    const chars = (titleOk ? title.length : 0) + bullets.reduce((n, b) => n + b.length, 0);
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && chars > best.chars)) {
      best = { title: titleOk ? title : "", bullets, score, chars };
    }
  }
  if (!best) return null;
  return { title: best.title, bullets: best.bullets };
}

/** JSON de synthèse encore incomplet (flux) : ne pas coller le brut, ni annoncer un échec définitif. */
export function isInProgressSummaryJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("```")) return false;
  if (t.includes("(extrait modèle)") || t.includes("=== [")) return false;
  return !t.endsWith("}") && !t.endsWith("```");
}

/** Document JSON terminé qu’on n’a pas pu lire comme une synthèse. */
export function isUnreadableSummaryJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("```")) return false;
  return !isInProgressSummaryJson(t);
}
