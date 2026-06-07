/**
 * Partie domaine après le dernier `@`, en minuscules.
 * Aligné sur la logique Rust `host_of_email` (rsplit_once sur `@`).
 */
export function domainFromEmail(email: string): string | null {
  const e = email.trim();
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return null;
  const host = e.slice(at + 1).trim().toLowerCase();
  return host || null;
}

/** Alias historique (configuration compte). */
export const emailDomain = domainFromEmail;
