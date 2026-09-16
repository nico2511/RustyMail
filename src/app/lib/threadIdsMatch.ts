export function threadIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a == null ? "" : String(a).trim();
  const y = b == null ? "" : String(b).trim();
  return Boolean(x && y && x === y);
}
