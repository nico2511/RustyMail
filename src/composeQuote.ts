/** Construit le bloc citation Markdown pour « répondre à ce message ». */
export function quoteMessageAsMarkdown(header: string, body: string): string {
  const quoted = body
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
  return `> ${header}\n${quoted}\n\n`;
}

/** Concatène l’intro prepare_reply + citation du message ciblé. */
export function appendQuotedMessageToDraft(intro: string, header: string, body: string): string {
  const base = intro.trimEnd();
  const quote = quoteMessageAsMarkdown(header, body);
  return base ? `${base}\n\n${quote}` : quote;
}
