import { isUnifiedInboxMailbox, preferredInboxMailboxName } from "../../mailboxKinds";

/** Teintes muettes des maquettes productivité. Le cuivre reste l’accent chrome, pas l’identité d’un compte. */
export const ACCOUNT_HUES = ["slate", "olive", "plum"] as const;
export type AccountHue = (typeof ACCOUNT_HUES)[number];

/** Position dans la liste des comptes : 1ʳᵉ ardoise, 2ᵉ olive, 3ᵉ prune, puis on recommence. */
export function accountHueAt(index: number): AccountHue {
  const n = ACCOUNT_HUES.length;
  const i = ((Math.floor(index) % n) + n) % n;
  return ACCOUNT_HUES[i] ?? "slate";
}

export function accountHueForId(accountId: string, orderedIds: readonly string[]): AccountHue {
  const idx = orderedIds.findIndex((id) => id === accountId);
  return accountHueAt(idx < 0 ? orderedIds.length : idx);
}

export function accountShortLabel(account: { displayName?: string; email?: string }): string {
  const name = account.displayName?.trim();
  if (name) return name;
  const email = account.email?.trim() ?? "";
  const at = email.indexOf("@");
  if (at > 0) return email.slice(0, at);
  return email || "Compte";
}

export function accountMonogram(label: string): string {
  const ch = label.trim().charAt(0);
  return ch ? ch.toLocaleUpperCase("fr") : "?";
}

export function unreadCountLabelFr(count: number): string {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  return n === 1 ? "1 non lu" : `${n} non lus`;
}

export type InboxUnreadLookup = {
  selectedAccountId?: string;
  mailboxes: string[];
  mailboxUnread: Record<string, number>;
  /** Compteurs INBOX des autres comptes, remplis par `mailbox_unread_counts`. */
  accountInboxUnread: Record<string, number>;
};

/**
 * Non-lus de la réception d’un compte.
 * Le compte sélectionné reprend le compteur déjà affiché sur son dossier INBOX.
 * Les autres lisent `accountInboxUnread` (même commande IPC, un appel par compte).
 */
export function inboxUnreadForAccount(accountId: string, opts: InboxUnreadLookup): number {
  if (opts.selectedAccountId && opts.selectedAccountId === accountId) {
    const inbox = preferredInboxMailboxName(opts.mailboxes);
    if (inbox && Object.prototype.hasOwnProperty.call(opts.mailboxUnread, inbox)) {
      return Math.max(0, Math.floor(Number(opts.mailboxUnread[inbox])) || 0);
    }
  }
  return Math.max(0, Math.floor(Number(opts.accountInboxUnread[accountId])) || 0);
}

export function sumInboxUnread(accountIds: string[], lookup: InboxUnreadLookup): number {
  let total = 0;
  for (const id of accountIds) total += inboxUnreadForAccount(id, lookup);
  return total;
}

/** `all` = vue unifiée. Sinon l’id du compte dont la boîte est affichée. */
export function resolveInboxScope(args: {
  accountCount: number;
  selectedMailbox: string;
  selectedAccountId?: string;
}): "all" | string {
  if (args.accountCount > 1 && isUnifiedInboxMailbox(args.selectedMailbox)) return "all";
  return args.selectedAccountId ?? "";
}
