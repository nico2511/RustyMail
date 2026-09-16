export function truncateSearchBadgeLabel(text: string, max = 26): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
