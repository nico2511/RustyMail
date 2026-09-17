import { invoke } from "@tauri-apps/api/core";

import { invokeAiCacheGet } from "../../ipc_bridge";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS, LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { CleanedMessageView, LlmTranslationResult } from "../types";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { withLlmQueue } from "./llmJobQueue";
import { translateThreadCore } from "./threadAiRun";
import { shouldOfferPerMessageTranslate, shouldOfferThreadTranslate } from "./threadLangGuess";
import { repairUtf8Mojibake } from "./threadViewUiHelpers";

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
      }),
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
      LLM_INVOKE_TIMEOUT_MS,
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
