import { state } from "../state";

export function threadIsAutoMail(
  thread?: { isNewsletterThread?: boolean } | null,
  threadId?: string | null,
): boolean {
  if (thread?.isNewsletterThread) return true;
  const tid = threadId ?? state.selectedThreadId;
  if (!tid) return false;
  const row = state.threads.find((t) => String(t.id) === String(tid));
  return Boolean(row?.isNewsletterThread);
}
