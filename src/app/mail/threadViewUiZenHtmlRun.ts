import { escapeHtml } from "../../ui/sanitize";
import {
  SUMMARY_DRAFTING_FR,
  SUMMARY_PARSE_FAILED_FR,
  isInProgressSummaryJson,
  isNoiseBullet,
  isUnreadableSummaryJson,
  salvageSummaryFields,
} from "./threadSummaryFormat";
import { repairUtf8Mojibake } from "./threadViewUiMojibakeRun";

function statusHtml(message: string): string {
  return `<p class="thread-zen-par dim" role="status">${escapeHtml(message)}</p>`;
}

function renderStructuredSummary(title: string, bullets: string[]): string {
  const chunks: string[] = [];
  if (title.trim()) {
    chunks.push(`<p class="thread-zen-par">${escapeHtml(title.trim())}</p>`);
  }
  if (bullets.length) {
    const items = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    chunks.push(`<ul class="thread-zen-list">${items}</ul>`);
  }
  return chunks.join("") || statusHtml(SUMMARY_PARSE_FAILED_FR);
}

export function zenSummaryHtmlFragments(text: string): string {
  const repaired = repairUtf8Mojibake(text ?? "").replace(/\r\n/g, "\n");
  const salvaged = salvageSummaryFields(repaired);
  if (salvaged && (salvaged.title || salvaged.bullets.length)) {
    return renderStructuredSummary(salvaged.title, salvaged.bullets);
  }
  if (isInProgressSummaryJson(repaired)) {
    return statusHtml(SUMMARY_DRAFTING_FR);
  }
  if (isUnreadableSummaryJson(repaired)) {
    return statusHtml(SUMMARY_PARSE_FAILED_FR);
  }

  const lines = repaired.split("\n");
  const chunks: string[] = [];
  let inList = false;
  let sawNoise = false;
  let sawBullet = false;
  const closeList = (): void => {
    if (!inList) return;
    chunks.push("</ul>");
    inList = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const bullet = /^[-•]\s+([\s\S]+)$/.exec(t);
    const body = (bullet ? bullet[1] : t).trim();
    if (body === SUMMARY_PARSE_FAILED_FR || body === SUMMARY_DRAFTING_FR) {
      closeList();
      chunks.push(statusHtml(body));
      continue;
    }
    if (isNoiseBullet(body)) {
      sawNoise = true;
      continue;
    }
    if (bullet) {
      sawBullet = true;
      if (!inList) {
        chunks.push('<ul class="thread-zen-list">');
        inList = true;
      }
      chunks.push(`<li>${escapeHtml(body)}</li>`);
    } else {
      closeList();
      chunks.push(`<p class="thread-zen-par">${escapeHtml(t)}</p>`);
    }
  }
  closeList();
  if (!chunks.length) {
    if (!repaired.trim()) return `<p class="thread-zen-par">${escapeHtml(text ?? "")}</p>`;
    return statusHtml(SUMMARY_PARSE_FAILED_FR);
  }
  if (sawNoise && !sawBullet) chunks.push(statusHtml(SUMMARY_PARSE_FAILED_FR));
  return chunks.join("");
}
