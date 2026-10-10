import type { CleanedMessageView, MailSecurityLlmContext } from "../types";

const MAX_BODY_CHARS = 2_400;
const MAX_HOSTS = 20;
const MAX_ATTS = 12;

function extractLinkHosts(blob: string): string[] {
  const hosts: string[] = [];
  const seen = new Set<string>();
  const re = /https?:\/\/([^/\s"'<>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    const host = (m[1] ?? "").trim().toLowerCase().replace(/\.$/, "");
    if (!host || seen.has(host)) continue;
    seen.add(host);
    hosts.push(host);
    if (hosts.length >= MAX_HOSTS) break;
  }
  return hosts;
}

const MAX_HTML_HOST_SCAN_CHARS = 12_000;

/** Construit le contexte LLM à partir du message ouvert (pas seulement les heuristiques). */
export function buildMailSecurityLlmContext(
  message: CleanedMessageView,
  threadSubject?: string | null,
): MailSecurityLlmContext {
  const body = (message.cleanedText || message.sourceText || "").trim();
  // Ne pas concaténer le HTML complet (newsletters multi‑Mo → lag à l’ouverture).
  const htmlHead = (message.cleanedHtmlBody || message.htmlBody || "")
    .trim()
    .slice(0, MAX_HTML_HOST_SCAN_CHARS);
  const blob = htmlHead ? `${body}\n${htmlHead}` : body;
  const attachmentNames = (message.attachments ?? [])
    .map((a) => (a.fileName || "").trim())
    .filter(Boolean)
    .slice(0, MAX_ATTS);
  return {
    subject: (threadSubject ?? "").trim(),
    fromName: (message.sender || "").trim(),
    fromEmail: (message.senderEmail || "").trim(),
    replyTo: [],
    bodyExcerpt: body.slice(0, MAX_BODY_CHARS),
    attachmentNames,
    linkHosts: extractLinkHosts(blob),
  };
}
