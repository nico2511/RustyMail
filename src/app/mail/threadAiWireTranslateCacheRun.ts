import { invokeAiCacheGet } from "../../ipc_bridge";
import { AI_CACHE_PROMPT_REVISION, BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { render } from "../dispatch";
import { state } from "../state";
import type { CleanedMessageView, LlmTranslationResult } from "../types";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { shouldOfferPerMessageTranslate } from "./threadLangGuess";
import { repairUtf8Mojibake } from "./threadViewUiHelpers";
import { translationVisibleText } from "./llmMetaGuard";

export async function hydrateMessageTranslationsFromCacheForThread(messages: CleanedMessageView[]): Promise<void> {
  if (!isTauriRuntime()) return;
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const seg = await aiCacheKeySegment();
  const batchSize = 12;
  let applied = 0;
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
          const visible = tx ? translationVisibleText(m.cleanedText || "", tx) : null;
          if (!visible) return;
          const key = `${m.messageId}|${targetLang}`;
          const repaired = repairUtf8Mojibake(visible);
          if (state.messageTranslations[key] === repaired) return;
          state.messageTranslations[key] = repaired;
          applied += 1;
        } catch {
          /* cache absent ou JSON invalide */
        }
      }),
    );
  }
  if (applied > 0 && state.view === "thread") render();
}
