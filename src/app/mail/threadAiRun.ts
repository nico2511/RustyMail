import { invoke } from "@tauri-apps/api/core";

import { invokeAiCacheGet } from "../../ipc_bridge";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { extractPartialJsonStringField, isLlmCancelledError, runLlmStreamJob } from "../../llmStream";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS, LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { CleanedMessageView, LlmTranslationResult, SummaryResult } from "../types";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { computePreview } from "./composeComposerBridge";
import { currentThreadIdForReply } from "./composeThreadReply";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { withLlmQueue } from "./llmJobQueue";
import {
  isMailboxDigestFeatureEnabled,
  mailboxDigestPanelEligible,
  openMailboxDigestPanel,
} from "./mailboxDigest";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import {
  applyThreadAiOutputIfLive,
  paintThreadAiSummaryDom,
  paintThreadQaStreamDom,
  threadAiSummaryScoped,
} from "./threadAiStreamDom";
import { threadIsAutoMail } from "./threadAutoMail";
import { shouldOfferPerMessageTranslate, shouldOfferThreadTranslate } from "./threadLangGuess";
import {
  repairSummaryResultStrings,
  repairUtf8Mojibake,
  summaryResultToZenText,
} from "./threadViewUiHelpers";

let senderBatchSummarizeAbort: AbortController | null = null;
let senderBatchSummarizeActive = false;

export function isSenderBatchSummarizeActive(): boolean {
  return senderBatchSummarizeActive;
}

export async function summarizeThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { toastOnDone?: boolean; toastOnCache?: boolean; prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const toastOnDone = !prefetchOnly && opts?.toastOnDone !== false;
  const toastOnCache = !prefetchOnly && opts?.toastOnCache !== false;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = "Aperçu synthétique du fil…";
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${threadId}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = repairSummaryResultStrings(JSON.parse(cached) as SummaryResult);
      if (applyThreadAiOutputIfLive(threadId, summaryResultToZenText(o))) {
        if (toastOnCache) toast("Synthèse (cache locale).");
        if (!prefetchOnly) render();
        return { status: "done" };
      }
      return { status: "done" };
    } catch {
      /* invalide : recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_summarize_thread",
        args: { threadId },
        signal,
        onChunk: (acc) => {
          if (applyThreadAiOutputIfLive(threadId, acc)) paintThreadAiSummaryDom(acc);
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (toastOnDone) toast("Synthèse annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    console.error("summarizeThreadCore", error);
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast(`Synthèse échouée : ${msg}`);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  if (done.summary) {
    const summary = repairSummaryResultStrings(done.summary as SummaryResult);
    applyThreadAiOutputIfLive(
      threadId,
      done.displayText?.trim() || summaryResultToZenText(summary)
    );
  } else if (done.displayText?.trim()) {
    applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(done.displayText));
  } else {
    const msg = "réponse vide du modèle";
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse terminée sans contenu exploitable.");
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (toastOnDone) toast("Synthèse terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}

export async function translateThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = `Traduction → ${targetLang}…`;
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${threadId}:${targetLang}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = JSON.parse(cached) as LlmTranslationResult;
      if (o.translatedText) {
        if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(o.translatedText))) {
          if (!prefetchOnly) {
            toast("Traduction (cache locale).");
            render();
          }
        }
        return { status: "done" };
      }
    } catch {
      /* recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_translate_thread",
        args: { threadId, targetLang },
        signal,
        onChunk: (acc) => {
          const preview = extractPartialJsonStringField(acc, "translatedText");
          if (!preview) return;
          if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(preview))) {
            paintThreadAiSummaryDom(repairUtf8Mojibake(preview));
          }
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (!prefetchOnly) toast("Traduction annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    if (!prefetchOnly) toast(`Traduction échouée : ${msg}`);
    console.warn("translateThreadCore", error);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (!prefetchOnly) toast("Traduction annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  const tx =
    done.translation?.translatedText?.trim() ||
    done.displayText?.trim() ||
    "";
  if (tx) applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(tx));
  if (!prefetchOnly) toast("Traduction terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}

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

export async function summarizeSenderThreadsLight() {
  if (state.searchSenders.length === 0) {
    toast("Filtrez d’abord par expéditeur (@ ou recherche NL).");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée dans les préférences IA.");
    return;
  }
  if (!state.threads.length) {
    toast("Aucun fil dans la liste filtrée — lancez une recherche.");
    return;
  }
  const topK = state.threads.slice(0, 5);
  const priorView = state.view;
  const priorThreadId = state.selectedThreadId;
  const priorThread = state.selectedThread;
  senderBatchSummarizeAbort?.abort();
  senderBatchSummarizeAbort = new AbortController();
  const signal = senderBatchSummarizeAbort.signal;
  senderBatchSummarizeActive = true;
  state.aiOpen = true;
  let okCount = 0;
  try {
    const ran = await withLlmQueue(`Synthèse fils (${topK.length})`, async (queueSignal) => {
      for (let i = 0; i < topK.length; i++) {
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const item = topK[i];
        const tid = String(item?.id ?? "");
        if (!tid) continue;
        const label = (item?.subject ?? "").trim() || `Fil ${i + 1}`;
        state.aiOutput = `Synthèse ${i + 1}/${topK.length} — ${label}…`;
        render();
        const exists = await fetchOpenThreadOrNotify(tid, { quiet: true });
        if (!exists) {
          toast(`Fil ignoré (non disponible en local) : ${label}`);
          continue;
        }
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const outcome = await summarizeThreadCore(tid, queueSignal, {
          toastOnDone: false,
          toastOnCache: false,
        });
        if (outcome.status === "cancelled") return "cancelled" as const;
        if (outcome.status === "error") {
          const detail = outcome.errorMessage?.trim();
          toast(
            detail
              ? `Synthèse échouée : ${label} — ${detail}`
              : `Synthèse échouée : ${label}`
          );
          continue;
        }
        okCount += 1;
      }
      return "done" as const;
    });
    if (ran === "cancelled") toast("Synthèse batch annulée.");
    else if (ran) {
      if (okCount === 0) toast("Aucune synthèse n’a abouti — vérifiez le moteur IA et la sync des fils.");
      else
        toast(
          `${okCount}/${topK.length} synthèse${okCount === 1 ? "" : "s"} — résultat du dernier fil dans le panneau IA (liste inchangée).`
        );
    }
  } finally {
    senderBatchSummarizeAbort = null;
    senderBatchSummarizeActive = false;
    state.view = priorView;
    state.selectedThreadId = priorThreadId;
    state.selectedThread = priorThread;
    if (okCount > 0 && threadAiSummaryScoped()) {
      state.aiOpen = true;
    }
    render();
  }
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

