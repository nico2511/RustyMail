/** Group collapsed quote lines by attribution headers (On … wrote, Le … a écrit, etc.). */
export function groupCollapsedQuotesByAttribution(lines: string[]): string[] {
  const trimmed = lines.map((s) => s.replace(/\r$/, ""));
  if (!trimmed.length) return [];

  const isAttributionHeader = (raw: string) => {
    const t = raw.trim();
    return (
      /^On\s+.+\bwrote:?/i.test(t) ||
      /^Le\s.+a\s+[éeè]crit\s*:?/i.test(t) ||
      /^[\s_*-]*(forwarded message|original message|\|)\s*[:\-_]?\s*$/i.test(t) ||
      /^[\s_-]{3,}.{0,80}(forwarded|message original)/i.test(t)
    );
  };

  const groups: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    const joined = buf.join("\n").trimEnd();
    buf = [];
    if (joined.length) groups.push(joined);
  };

  for (const line of trimmed) {
    if (isAttributionHeader(line) && buf.length > 0) flush();
    buf.push(line);
  }
  flush();
  return groups;
}
