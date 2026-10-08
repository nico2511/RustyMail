import { escapeHtml } from "../../ui/sanitize";

const ATTRIBUTION =
  /^(?:On\s+.+\bwrote:?|Le\s.+a\s+[éeèê]crit\s*:?)\s*$/i;
const BANNER =
  /^(?:-{2,}\s*)?(?:original message|message d['’]origine|forwarded message|begin forwarded message|début du message transféré)\b/i;
const HEADER =
  /^(?:de|from|envoy[ée]e?(?:\s+le)?|sent|à|to|cc|cci|bcc|objet|subject)\s*:/i;
const FROM = /^(?:de|from)\s*:/i;

type HistoryTurn = { kicker: string | null; body: string };

/** FNV-1a 32 bits, même formule que `sender_hue_slot` côté Rust. */
export function senderHueSlot(email: string): number {
  let h = 2166136261;
  const key = (email.trim().toLowerCase() || "unknown");
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 6) + 1;
}

function emailFromKicker(kicker: string | null): string {
  if (!kicker) return "";
  const m = kicker.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : "";
}

/** Historique cité, séparé du dernier message et lisible une fois ouvert. */
export function renderHistoryFold(blocks: readonly string[] | undefined): string {
  const text = (blocks ?? [])
    .map((s) => s.replace(/\r/g, "").replace(/[ \t]+$/g, ""))
    .filter((s) => s.trim())
    .join("\n\n");
  if (!text.trim()) return "";
  const turns = splitHistoryTurns(text);
  const body = turns
    .map((turn, index) => {
      const depth = index + 1;
      const hue = senderHueSlot(emailFromKicker(turn.kicker));
      const parity = depth % 2 === 0 ? "even" : "odd";
      const over = depth > 4 ? ` data-depth-over="1"` : "";
      const badge = depth > 4 ? `<span class="rm-hist-depth-badge">${depth}</span>` : "";
      const kicker = turn.kicker
        ? `<p class="rm-history-kicker">${escapeHtml(turn.kicker).replace(/\n/g, "<br>")}</p>`
        : "";
      const prose = turn.body
        ? `<div class="rm-history-turn__body">${escapeHtml(turn.body)}</div>`
        : "";
      return `<section class="rm-history-turn" data-depth="${depth}" data-depth-parity="${parity}" data-sender-hue="${hue}"${over}>${badge}${kicker}${prose}</section>`;
    })
    .join("");
  return `<details class="rm-history-fold"><summary>Historique</summary><div class="rm-history-fold__panel">${body}</div></details>`;
}

export function splitHistoryTurns(text: string): HistoryTurn[] {
  const lines = text.split("\n");
  const turns: HistoryTurn[] = [];
  let kicker: string[] = [];
  let body: string[] = [];
  let mode: "seek" | "header" | "body" = "seek";

  const flush = () => {
    const k = kicker.join("\n").trim();
    const b = trimEdgeBlank(body).join("\n").trim();
    kicker = [];
    body = [];
    if (!k && !b) return;
    turns.push({ kicker: k || null, body: b });
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (mode === "header") {
      if (!t) {
        mode = "body";
        continue;
      }
      if (HEADER.test(t)) {
        kicker.push(t);
        continue;
      }
      mode = "body";
    }
    if (mode === "body" && (isAttribution(t) || FROM.test(t))) {
      flush();
    }
    if (mode === "seek" || (kicker.length === 0 && body.length === 0)) {
      if (!t) continue;
      if (isAttribution(t)) {
        kicker = [t];
        mode = "body";
        continue;
      }
      if (FROM.test(t)) {
        kicker = [t];
        mode = "header";
        continue;
      }
    }
    body.push(raw);
    mode = "body";
  }
  flush();
  return turns;
}

function isAttribution(line: string): boolean {
  return ATTRIBUTION.test(line) || BANNER.test(line);
}

function trimEdgeBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}
