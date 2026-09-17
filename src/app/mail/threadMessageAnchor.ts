export function threadMessageAnchorId(messageId: string, index: number): string {
  const raw = messageId.trim();
  const tail = raw ? encodeURIComponent(raw).replace(/%/g, "_") : "empty";
  const base = `msg-${index}-${tail}`;
  return base.length > 240 ? base.slice(0, 240) : base;
}
