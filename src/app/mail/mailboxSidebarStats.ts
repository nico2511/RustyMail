import {
  isSavedDraftsVirtualMailbox,
  pickSystemMailboxes,
} from "../../mailboxKinds";
import type { MailboxFolderStatsRow } from "../types";
import { state } from "../state";
import { mailboxLogicalPathKey } from "./mailboxPathKeys";

export function mergeMailboxFolderStatsForUi(
  sidebarMailboxes: string[],
  rows: MailboxFolderStatsRow[],
): { unread: Record<string, number>; total: Record<string, number> } {
  const unread: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const mb of sidebarMailboxes) {
    const nk = mb.normalize("NFC");
    const exact = rows.find((r) => r.mailbox.normalize("NFC") === nk);
    if (exact) {
      unread[mb] = Math.max(0, Math.floor(Number(exact.unreadCount)) || 0);
      total[mb] = Math.max(0, Math.floor(Number(exact.totalThreads)) || 0);
      continue;
    }
    const k = mailboxLogicalPathKey(mb);
    const logicalMatches = rows.filter((r) => mailboxLogicalPathKey(r.mailbox) === k);
    if (logicalMatches.length === 1) {
      unread[mb] = Math.max(0, Math.floor(Number(logicalMatches[0].unreadCount)) || 0);
      total[mb] = Math.max(0, Math.floor(Number(logicalMatches[0].totalThreads)) || 0);
    }
  }
  return { unread, total };
}

export function sidebarFolderNamesForCounts(): string[] {
  const folders = state.mailboxes.length ? state.mailboxes : ["INBOX"];
  const system = pickSystemMailboxes(folders);
  const names = system.map((x) => x.name);
  const sel = state.selectedMailbox?.trim();
  if (sel && !isSavedDraftsVirtualMailbox(sel) && !names.includes(sel)) {
    names.push(sel);
  }
  return names;
}
