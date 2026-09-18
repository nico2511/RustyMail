import { t } from "../../i18n";
import { escapeHtml } from "../../ui/sanitize";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";

export function buildSemanticStatsBlockHtml(): string {
  const accForStats = currentAccount();
  const mbNorm = (state.selectedMailbox || "INBOX").toLowerCase();
  const cnt = state.semanticEmbeddingCounts;
  const countsOk = Boolean(
    cnt &&
      accForStats &&
      cnt.accountId === accForStats.id &&
      cnt.mailbox.trim().toLowerCase() === mbNorm,
  );
  const mailboxSide = state.selectedMailbox || "INBOX";
  if (!isTauriRuntime()) {
    return `<p class="settings-explain settings-explain--lead" role="status">${escapeHtml(t("semantic.tauriOnly"))}</p>`;
  }
  if (!accForStats) {
    return `<p class="settings-explain settings-explain--lead" role="status">${escapeHtml(t("semantic.pickAccount"))}</p>`;
  }
  if (!countsOk || !cnt) {
    return `<p class="settings-explain settings-explain--lead" role="status">${escapeHtml(t("semantic.loading", { mailbox: mailboxSide }))}</p>`;
  }
  const c = cnt;
  return `<div class="settings-semantic-stats surface-sm" role="status" style="margin:0 0 14px;padding:12px 14px;border-radius:var(--radius-lg);font-size:13px;line-height:1.55">
            <strong>${escapeHtml(t("semantic.title", { model: c.modelId }))}</strong>
            <ul style="margin:8px 0 0;padding-left:1.15em">
              <li>${escapeHtml(t("semantic.mailboxLine", { mailbox: c.mailbox, embedded: c.embeddingsInMailbox, cached: c.messagesInMailboxCached }))}</li>
              <li>${escapeHtml(t("semantic.accountLine", { total: c.embeddingsTotalForAccount }))}</li>
            </ul>
            <p class="dim" style="margin:10px 0 0;font-size:12px;line-height:1.5">${escapeHtml(t("semantic.hint"))}</p>
          </div>`;
}
