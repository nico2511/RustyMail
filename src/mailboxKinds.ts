/** Classification des dossiers IMAP + boîte virtuelle des brouillons locaux. */

export const LOCAL_SAVED_DRAFTS_MAILBOX = "__LOCAL_SAVED_DRAFTS__";
export const UNIFIED_INBOX_MAILBOX = "__UNIFIED_INBOX__";
export const SAVED_DRAFT_THREAD_PREFIX = "saved-draft:";

export type MailboxKind = "inbox" | "drafts" | "sent" | "archive" | "spam" | "trash";

/** Aligné sur `is_inbox_like_mailbox` (Rust) — INBOX, `[Gmail]/Inbox`, etc. */
export function isInboxLikeMailbox(name: string): boolean {
  const n = String(name ?? "")
    .trim()
    .toLowerCase();
  return n === "inbox" || /^inbox\b/.test(n) || n.endsWith("/inbox");
}

export function mailboxKind(name: string): MailboxKind | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  const n = raw.toLowerCase();
  if (isInboxLikeMailbox(raw)) return "inbox";
  if (/(draft)/.test(n)) return "drafts";
  if (/(sent|sent items|outbox)/.test(n)) return "sent";
  if (/(archive|all mail|tous les messages)/.test(n)) return "archive";
  if (/(junk|spam|indésirable|indesirable)/.test(n)) return "spam";
  if (/(trash|deleted items|deleted|bin|corbeille|poubelle)/.test(n)) return "trash";
  return null;
}

export function mailboxKindIcon(kind: MailboxKind): string {
  switch (kind) {
    case "inbox":
      return "IN";
    case "drafts":
      return "DR";
    case "sent":
      return "SE";
    case "archive":
      return "AR";
    case "spam":
      return "SP";
    case "trash":
      return "TR";
  }
}

export function mailboxKindLabelFr(kind: MailboxKind): string {
  switch (kind) {
    case "inbox":
      return "Boîte de réception";
    case "drafts":
      return "Brouillons";
    case "sent":
      return "Envoyés";
    case "archive":
      return "Archive";
    case "spam":
      return "Indésirables";
    case "trash":
      return "Corbeille";
  }
}

/** Libellé court pour colonne « dossier » dans la liste (FR). */
export function threadMailboxListLabel(raw: string | undefined): { label: string; full: string } {
  const full = (raw ?? "").trim() || "INBOX";
  if (full === LOCAL_SAVED_DRAFTS_MAILBOX) {
    return { label: "Sauvés", full: LOCAL_SAVED_DRAFTS_MAILBOX };
  }
  if (full === UNIFIED_INBOX_MAILBOX) {
    return { label: "Tous les comptes", full: UNIFIED_INBOX_MAILBOX };
  }
  const k = mailboxKind(full);
  if (k === "inbox") return { label: "Réception", full };
  if (k === "drafts") return { label: "Brouillon", full };
  if (k === "sent") return { label: "Envoyés", full };
  if (k === "archive") return { label: "Archive", full };
  if (k === "spam") return { label: "Indésir.", full };
  if (k === "trash") return { label: "Corbeille", full };
  return { label: full, full };
}

export function threadMailboxColumnTitle(mbRaw: string): string {
  const { label, full } = threadMailboxListLabel(mbRaw);
  return label === full ? `Dossier : ${full}` : `Dossier : ${label} — ${full}`;
}

export function pickSystemMailboxes(all: string[]): Array<{ kind: MailboxKind; name: string }> {
  const seen = new Set<string>();
  const order: MailboxKind[] = ["inbox", "drafts", "sent", "archive", "spam", "trash"];
  const picked: Array<{ kind: MailboxKind; name: string }> = [];
  for (const kind of order) {
    const match = all.find((mb) => mailboxKind(mb) === kind);
    if (match && !seen.has(match)) {
      seen.add(match);
      picked.push({ kind, name: match });
    }
  }
  return picked;
}

export function preferredInboxMailboxName(mailboxes: string[]): string | undefined {
  const fromSystem = pickSystemMailboxes(mailboxes).find((x) => x.kind === "inbox");
  if (fromSystem) return fromSystem.name;
  return mailboxes.find((mb) => isInboxLikeMailbox(mb));
}

export function isSavedDraftsVirtualMailbox(mb: string | undefined): boolean {
  return String(mb ?? "").trim() === LOCAL_SAVED_DRAFTS_MAILBOX;
}

export function isUnifiedInboxMailbox(mb: string | undefined): boolean {
  return String(mb ?? "").trim() === UNIFIED_INBOX_MAILBOX;
}

export function isVirtualMailbox(mb: string | undefined): boolean {
  return isSavedDraftsVirtualMailbox(mb) || isUnifiedInboxMailbox(mb);
}

export function savedDraftIdFromThreadId(threadId: string): string | null {
  const tid = String(threadId ?? "");
  if (!tid.startsWith(SAVED_DRAFT_THREAD_PREFIX)) return null;
  const id = tid.slice(SAVED_DRAFT_THREAD_PREFIX.length).trim();
  return id.length ? id : null;
}

/** Dossiers proposés en cible de déplacement : on retire corbeille / envoyés (verrou côté backend aussi). */
export function mailboxesAllowedForMove(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names ?? []) {
    const name = (raw ?? "").trim();
    if (!name || name === LOCAL_SAVED_DRAFTS_MAILBOX || name === UNIFIED_INBOX_MAILBOX) continue;
    const k = mailboxKind(name);
    if (k === "trash" || k === "sent") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  out.sort((a, b) => {
    const ak = mailboxKind(a);
    const bk = mailboxKind(b);
    if (ak === "inbox" && bk !== "inbox") return -1;
    if (bk === "inbox" && ak !== "inbox") return 1;
    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });
  return out;
}
