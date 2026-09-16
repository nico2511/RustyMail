export function mailboxLogicalPathKeySegments(name: string): string[] {
  const normalized = String(name ?? "").normalize("NFC");
  const segs: string[] = [];
  for (const part of normalized.split(/[/.]/g)) {
    const t = part.trim();
    if (t) segs.push(t.toLowerCase());
  }
  if (segs[0] === "inbox") segs.shift();
  return segs;
}

export function mailboxLogicalPathKey(name: string): string {
  return mailboxLogicalPathKeySegments(name).join("\0");
}
