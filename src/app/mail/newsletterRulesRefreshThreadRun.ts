import { state } from "../state";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";

export async function refreshSelectedThreadAfterNewsletterRuleChange(): Promise<void> {
  if (!state.selectedThreadId) return;
  const tid = state.selectedThreadId;
  const refreshed = await fetchOpenThreadOrNotify(tid);
  if (refreshed) state.selectedThread = refreshed;
}
