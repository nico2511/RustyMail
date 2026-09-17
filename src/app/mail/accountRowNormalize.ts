import type { Account, MailAuthKind, SecurityMode } from "../../accountSetup";

function normalizeServerSettings(raw: unknown): Account["imap"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sec = String(r.security ?? r.Security ?? "Tls");
  const security: SecurityMode = sec === "StartTls" ? "StartTls" : "Tls";
  return {
    host: String(r.host ?? "").trim(),
    port: Math.max(1, Math.floor(Number(r.port)) || 993),
    security,
    allowInvalidTls: Boolean(r.allowInvalidTls ?? r.allow_invalid_tls),
  };
}

function normalizeAuthKind(raw: unknown): MailAuthKind | undefined {
  const s = String(raw ?? "").trim();
  if (s === "oauthGoogle" || s === "oauth_google") return "oauthGoogle";
  if (s === "oauthMicrosoft" || s === "oauth_microsoft") return "oauthMicrosoft";
  if (s === "password") return "password";
  return undefined;
}

export function normalizeAccountRow(raw: unknown): Account | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const email = String(r.email ?? "").trim();
  if (!id && !email) return null;
  const displayName = String(r.displayName ?? r.display_name ?? email).trim();
  return {
    id: id || email.toLowerCase(),
    displayName: displayName || email,
    email: email || id,
    imap: normalizeServerSettings(r.imap),
    smtp: normalizeServerSettings(r.smtp),
    authKind: normalizeAuthKind(r.authKind ?? r.auth_kind),
  };
}
