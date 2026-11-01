/** Fuseau IANA du poste (desktop) ; repli Europe/Paris. */
export function userTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    if (tz) return tz;
  } catch {
    /* ignore */
  }
  return "Europe/Paris";
}
