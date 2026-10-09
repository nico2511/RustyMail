import type { Draft } from "../types";
import { state } from "../state";

const SEND_ID_RE = /^[0-9a-fA-F-]{1,80}$/;
const STORAGE_PREFIX = "rustymail.sendAttempt.";
/** Même ordre de grandeur que le TTL `send_attempts` : un id oublié par le backend n'est pas réutilisé. */
const SEND_ID_TTL_MS = 60 * 60 * 1000;

export function isSendStillInFlightMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message === "Tauri command timeout" ||
    lower.includes("timeout") ||
    lower.includes("délai") ||
    lower.includes("déjà en cours") ||
    lower.includes("deja en cours")
  );
}

/** Empreinte côté UI : décide si l'on réutilise l'id de la tentative en cours. */
let memoryFingerprint = "";

function storageKey(draftKey: string): string {
  return `${STORAGE_PREFIX}${draftKey}`;
}

/** Clé stable : brouillon enregistré, sinon session, sinon id du payload. */
export function composeSendAttemptKey(draftId: string): string {
  const saved = state.savedDraftRecordId?.trim();
  if (saved) return `saved:${saved}`;
  const session = state.draftSessionId?.trim();
  if (session) return `session:${session}`;
  const id = draftId.trim();
  return `draft:${id || "local"}`;
}

export function clientSendFingerprint(draft: Draft): string {
  const emails = (list: Draft["to"] | undefined) =>
    (list ?? [])
      .map((addr) => (addr.email ?? "").trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("\n");
  const paths = [...(draft.attachmentPaths ?? [])]
    .map((path) => path.trim())
    .filter(Boolean)
    .sort()
    .join("\n");
  const refs = [...(draft.references ?? [])]
    .map((item) => item.trim())
    .filter(Boolean)
    .sort()
    .join("\n");
  return [
    draft.id ?? "",
    emails(draft.to),
    emails(draft.cc),
    emails(draft.bcc),
    (draft.subject ?? "").trim(),
    draft.markdownBody ?? "",
    paths,
    (draft.inReplyTo ?? "").trim(),
    refs,
    draft.sendHtml ? "1" : "0",
  ].join("\n--\n");
}

type StoredAttempt = { sendId: string; fingerprint: string; at: number };

function readStored(key: string): StoredAttempt | null {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sendId?: unknown; fingerprint?: unknown; at?: unknown };
    if (typeof parsed.sendId !== "string" || !SEND_ID_RE.test(parsed.sendId)) return null;
    if (typeof parsed.fingerprint !== "string") return null;
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > SEND_ID_TTL_MS) {
      removeStored(key);
      return null;
    }
    return { sendId: parsed.sendId, fingerprint: parsed.fingerprint, at: parsed.at };
  } catch {
    return null;
  }
}

function writeStored(key: string, sendId: string, fingerprint: string): void {
  try {
    window.localStorage.setItem(
      storageKey(key),
      JSON.stringify({ sendId, fingerprint, at: Date.now() }),
    );
  } catch {
    /* stockage indisponible : l'id mémoire suffit pour cette session */
  }
}

function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}

/** Oublie l'id en mémoire à l'ouverture d'un autre composer. Le stockage par brouillon reste. */
export function resetComposeSendId(): void {
  state.composeSendId = "";
  memoryFingerprint = "";
  state.sendDraftInFlight = false;
}

/**
 * Id de la tentative en cours pour ce brouillon.
 * Même contenu → même id (reprise après redémarrage). Contenu différent ou tentative
 * déjà acquittée → nouvel id, donc un envoi SMTP réel.
 */
export function sendIdForDraft(draft: Draft): string {
  const draftId = draft.id ?? "";
  const key = composeSendAttemptKey(draftId);
  const fingerprint = clientSendFingerprint(draft);
  const existing = state.composeSendId.trim();
  if (existing && SEND_ID_RE.test(existing) && (!memoryFingerprint || memoryFingerprint === fingerprint)) {
    memoryFingerprint = fingerprint;
    writeStored(key, existing, fingerprint);
    return existing;
  }
  const stored = readStored(key);
  if (stored && stored.fingerprint === fingerprint) {
    state.composeSendId = stored.sendId;
    memoryFingerprint = fingerprint;
    return stored.sendId;
  }
  const id = globalThis.crypto.randomUUID();
  state.composeSendId = id;
  memoryFingerprint = fingerprint;
  writeStored(key, id, fingerprint);
  return id;
}

/** Done ou Failed : le prochain clic est une nouvelle tentative. */
export function releaseSendAttempt(draftId: string): void {
  removeStored(composeSendAttemptKey(draftId));
  state.composeSendId = "";
  memoryFingerprint = "";
}
