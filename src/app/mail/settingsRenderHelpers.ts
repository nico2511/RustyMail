import type { Account } from "../../accountSetup";
import { accountFieldTouched } from "../../accountSetup";
import { t } from "../../i18n";
import type { SettingsAiPanelDeps } from "../../settingsAiPanel";
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { settingsExplainHtml } from "../lib/settingsExplainHtml";
import { iconSvg } from "../lib/iconSvg";
import { state } from "../state";
import { getDiscoveredServersFormSnap } from "../account/discoveredServerSnap";
import { formatWhisperPttKeyLabel } from "./composeMicPtt";
import { getAccountsFormIdentityScratch } from "./settingsAccountsFormState";

export function settingsDraftProfile(): Account | undefined {
  if (state.settingsSelectedAccountId === "new") return undefined;
  return state.accounts.find((a) => a.id === state.settingsSelectedAccountId);
}

export function mergedProfileForAccountsForm(): Account | undefined {
  const base = settingsDraftProfile();
  const scratch = state.accountFormOAuthPrefill ?? getAccountsFormIdentityScratch();
  if (!getDiscoveredServersFormSnap() || accountFieldTouched.serverFields) {
    return base;
  }

  const displayName = scratch?.displayName?.trim() ?? base?.displayName ?? "";
  const email = scratch?.email?.trim() ?? base?.email ?? "";
  const snapImap = getDiscoveredServersFormSnap()!.imap;
  const snapSmtp = getDiscoveredServersFormSnap()!.smtp;
  if (base) {
    return { ...base, imap: snapImap, smtp: snapSmtp };
  }
  return {
    id: "__draft__",
    displayName,
    email,
    imap: snapImap,
    smtp: snapSmtp,
    authKind: state.accountFormAuthKind,
  };
}

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

export function buildSettingsAiPanelDeps(): SettingsAiPanelDeps {
  return {
    ai: state.appPrefs.ai,
    escapeHtml,
    escapeAttr,
    iconSvg,
    settingsExplainHtml,
    formatWhisperPttKeyLabel,
    isTauri: isTauriRuntime(),
    semanticStatsBlock: buildSemanticStatsBlockHtml(),
    semOk: state.semanticModelAvailable,
    keyHint:
      state.openrouterApiKeySet || state.dictationApiKeySet
        ? "Clé cloud enregistrée dans le trousseau."
        : "Aucune clé cloud.",
    dictationApiKeySet: state.dictationApiKeySet,
    openrouterApiKeySet: state.openrouterApiKeySet,
    llamaServerApiKeySet: state.llamaServerApiKeySet,
    llmRuntimeStatus: state.llmRuntimeStatus,
    llmPrefetchPercent: state.llmPrefetchPercent,
    llmPrefetchInFlight: state.llmPrefetchInFlight,
    llmCachedGgufFilenames: state.llmCachedGgufFilenames,
    bootstrapModelsCompleted: Boolean(state.appPrefs.general.bootstrapModelsCompleted),
    engineSettingsTab: state.aiEngineSettingsTab,
  };
}
