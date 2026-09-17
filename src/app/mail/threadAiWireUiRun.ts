import { invoke } from "@tauri-apps/api/core";

import { invokeAiCacheGet } from "../../ipc_bridge";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { extractPartialJsonStringField, runLlmStreamJob } from "../../llmStream";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS, LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { CleanedMessageView, LlmTranslationResult } from "../types";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { computePreview } from "./composeComposerBridge";
import { currentThreadIdForReply } from "./composeThreadReply";
import { withLlmQueue } from "./llmJobQueue";
import {
  isMailboxDigestFeatureEnabled,
  mailboxDigestPanelEligible,
  openMailboxDigestPanel,
} from "./mailboxDigest";
import { paintThreadQaStreamDom } from "./threadAiStreamDom";
import { threadIsAutoMail } from "./threadAutoMail";
import { shouldOfferPerMessageTranslate, shouldOfferThreadTranslate } from "./threadLangGuess";
import { repairUtf8Mojibake } from "./threadViewUiHelpers";
import { summarizeThreadCore, translateThreadCore } from "./threadAiRun";

/** Wire/UI entry points for thread LLM features (actions, toasts, queue). */
export async function summarizeThread() {
  const threadId =
    state.view === "thread" && state.selectedThreadId?.trim() ?
      state.selectedThreadId.trim()
    : currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Résumé du fil : lancez l’application RustyMail (Tauri), pas le navigateur seul.");
    state.aiOpen = true;
    state.aiOutput =
      "La synthèse utilise la base locale et les commandes Tauri ; elle n’est pas disponible en prévisualisation web seule.";
    render();
    return;
  }
  const ran = await withLlmQueue("Synthèse fil", (signal) => summarizeThreadCore(threadId, signal));
  if (ran === null) return;
}

export async function llmTranslateThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil à traduire.");
    return;
  }
  const thread = state.selectedThread;
  const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (thread && !shouldOfferThreadTranslate(thread, mother)) {
    toast("Fil déjà dans la langue mère — traduction inutile.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled")) {
    toast("Traduction de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Traduire LLM : lancez Tauri.");
    return;
  }
  const ran = await withLlmQueue("Traduction fil", async (signal) => {
    await translateThreadCore(threadId, signal, { prefetchOnly: false });
  });
  if (ran === null) return;
}

export async function hydrateMessageTranslationsFromCacheForThread(messages: CleanedMessageView[]): Promise<void> {
  if (!isTauriRuntime()) return;
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const seg = await aiCacheKeySegment();
  const batchSize = 12;
  for (let i = 0; i < messages.length; i += batchSize) {
    const slice = messages.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (m) => {
        const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
        if (!shouldOfferPerMessageTranslate(m, mother)) return;
        const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:msg:${m.messageId}:${targetLang}`;
        try {
          const raw = await invokeAiCacheGet(ck, {
            timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
            withTimeout,
          });
          if (!raw?.trim()) return;
          const o = JSON.parse(raw) as LlmTranslationResult;
          const tx = o.translatedText?.trim();
          if (!tx) return;
          state.messageTranslations[`${m.messageId}|${targetLang}`] = repairUtf8Mojibake(tx);
        } catch {
          /* cache absent ou JSON invalide */
        }
      })
    );
  }
  render();
}

export async function llmTranslateMessageUi(messageId: string, forceRefresh = false) {
  const threadId = state.selectedThreadId?.trim();
  const mid = messageId.trim();
  if (!threadId || !mid) {
    toast("Ouvre un message dans un fil.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureMessageTranslateEnabled")) {
    toast("Traduction par message désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Traduire un message : lancez Tauri.");
    return;
  }
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const msg = state.selectedThread?.messages.find((m) => m.messageId === mid);
  if (!forceRefresh && msg && !shouldOfferPerMessageTranslate(msg, targetLang)) {
    toast("Message déjà dans la langue mère — traduction inutile.");
    return;
  }
  const seg = await aiCacheKeySegment();
  const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:msg:${mid}:${targetLang}`;
  const mapKey = `${mid}|${targetLang}`;
  state.messageTranslationBusy[mid] = true;
  render();
  try {
    let cached: string | null = null;
    if (!forceRefresh) {
      cached = await invokeAiCacheGet(ck, {
        timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
        withTimeout,
      });
    }
    if (cached?.trim()) {
      try {
        const o = JSON.parse(cached) as LlmTranslationResult;
        const tx = o.translatedText?.trim();
        if (tx) {
          state.messageTranslations[mapKey] = repairUtf8Mojibake(tx);
          toast("Traduction du message (cache locale).");
          return;
        }
      } catch {
        /* requête LLM */
      }
    }
    const res = await withTimeout(
      invoke<LlmTranslationResult>("llm_translate_message", { threadId, messageId: mid, targetLang }),
      LLM_INVOKE_TIMEOUT_MS
    );
    const tx = res.translatedText?.trim();
    if (tx) state.messageTranslations[mapKey] = repairUtf8Mojibake(tx);
    toast("Message traduit.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    delete state.messageTranslationBusy[mid];
    render();
  }
}

export async function llmQuickRepliesThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil.");
    return;
  }
  if (threadIsAutoMail(state.selectedThread, threadId)) {
    toast("Réponses rapides désactivées pour les messages automatiques / newsletters.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyThreadEnabled")) {
    toast("Réponses rapides (fil) désactivées — activez-les dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue("Réponses rapides", async (signal) => {
    if (signal.aborted) return;
    state.aiOpen = true;
    state.aiOutput = "";
    state.quickReplySuggestions = [];
    render();
    const res = await withTimeout(
      invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_thread", { threadId }),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    state.quickReplySuggestions = res.suggestions ?? [];
    state.aiThreadScope = String(threadId);
    toast("Réponses rapides prêtes.");
    render();
  });
  if (ran === null) return;
}

export async function llmQuickRepliesComposeUi() {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur pour les réponses rapides.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyComposeEnabled")) {
    toast("Réponses rapides (compositeur) désactivées — activez-les dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue("Réponses rapides", async (signal) => {
    if (signal.aborted) return;
    toast("Génération des suggestions…");
    const res = await withTimeout(
      invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_compose", {}),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    const first = res.suggestions?.[0]?.text?.trim();
    if (!first) {
      toast("Aucune suggestion.");
      return;
    }
    const add = `${first}\n\n`;
    state.composeBody = `${add}${state.composeBody}`;
    state.composeCanonicalBody = state.composeBody;
    const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
    if (ta) ta.value = state.composeBody;
    void computePreview();
    toast("Suggestion insérée — modifiez avant envoi.");
    render();
  });
  if (ran === null) return;
}

export async function llmQaThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled")) {
    toast("Q&A fil désactivé — activez-le dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast("Q&A fil : Tauri requis.");
  const qaInput = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
  const question = (qaInput?.value ?? state.threadQaDraft).trim();
  if (!question) {
    toast("Saisissez une question.");
    return;
  }
  state.threadQaDraft = question;
  const ran = await withLlmQueue("Q&A fil", async (signal) => {
    state.aiOpen = true;
    state.threadQaAnswer = null;
    state.threadQaStreamText = "Réponse en cours…";
    render();
    const done = await runLlmStreamJob({
      command: "llm_stream_qa_thread",
      args: { threadId, question },
      signal,
      onChunk: (acc) => {
        const preview = extractPartialJsonStringField(acc, "answer");
        state.threadQaStreamText = preview || "Réponse en cours…";
        if (preview) paintThreadQaStreamDom(preview);
      },
    });
    state.threadQaStreamText = "";
    if (done === "cancelled") {
      toast("Question annulée.");
      render();
      return;
    }
    if (done.qa?.answer?.trim()) {
      state.threadQaAnswer = {
        answer: repairUtf8Mojibake(done.qa.answer),
        evidenceMessageIds: done.qa.evidenceMessageIds ?? [],
      };
      state.aiThreadScope = String(threadId);
      toast("Réponse prête.");
    } else {
      toast("Réponse IA illisible — réessayez.");
    }
    render();
  });
  if (ran === null) return;
}

export async function llmInboxDigestUi() {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!isTauriRuntime()) return void toast("Brief d’action : Tauri requis.");
  if (!currentAccount()?.id?.trim()) return void toast("Sélectionne un compte.");
  if (!mailboxDigestPanelEligible()) {
    toast("Ouvre la liste d’un dossier IMAP pour le brief d’action.");
    return;
  }
  openMailboxDigestPanel(true);
}

