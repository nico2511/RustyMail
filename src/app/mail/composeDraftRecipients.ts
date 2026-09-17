import type { Draft } from "../types";

export function draftHasRecipientsExtra(draft?: Draft): boolean {
  if (!draft) return false;
  const hasEmails = (list: Draft["to"]) => list.some((x) => Boolean(x.email?.trim()));
  return hasEmails(draft.cc) || hasEmails(draft.bcc);
}
