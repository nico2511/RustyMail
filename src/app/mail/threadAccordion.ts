/** Sentinelles : `latest` (défaut), `all`, `none`. Toute autre valeur est un messageId ouvert. */
export type ThreadAccordionMode = "latest" | "all" | "none" | (string & {});

export function messageAccordionOpen(
  mode: string,
  messageId: string,
  messageIdsDesc: string[],
): boolean {
  if (messageIdsDesc.length === 0) return false;
  if (mode === "all") return true;
  if (mode === "none") return false;
  const explicit = mode !== "latest" && messageIdsDesc.includes(mode) ? mode : messageIdsDesc[0];
  return explicit === messageId;
}

/** Un seul message ouvert à la fois. Rouvrir le message déjà ouvert le replie. */
export function nextAccordionAfterToggle(
  mode: string,
  messageId: string,
  messageIdsDesc: string[],
): ThreadAccordionMode {
  if (!messageId || !messageIdsDesc.includes(messageId)) return mode === "none" ? "none" : "latest";
  if (mode === "all") return messageId;
  if (messageAccordionOpen(mode, messageId, messageIdsDesc)) return "none";
  return messageId;
}

export function threadMessageFoldPreview(text: string, max = 96): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "Message vide";
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 1))}…`;
}
