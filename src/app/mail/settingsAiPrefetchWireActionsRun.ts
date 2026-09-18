import { invoke } from "@tauri-apps/api/core";
import { applyEngineConnectionMode } from "../../settingsAiPanel";
import { ipcThrottleMs } from "../../ipc_bridge";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { paintLlmPrefetchProgressDom } from "./llmPrefetchProgressDom";
import { paintStatusBarProgressDom } from "./statusBarProgressJobs";
import { searchThreads } from "./searchThreadsRun";
import {
  refreshLlmRuntimeStatus,
  refreshSemanticEmbeddingCounts,
} from "./settingsWireActions";

export async function tryHandleSettingsAiPrefetchWire(action: string, _element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "cancel-llm-prefetch": {
      if (!isTauriRuntime()) return true;
      void (async () => {
        try {
          await invoke("cancel_prefetch_llm_model", {});
          toast("Téléchargement du modèle annulé.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "prefetch-llm-model": {
      if (!isTauriRuntime()) {
        toast("Téléchargement du modèle : ouvrez l’application de bureau (Tauri).");
        return true;
      }
      if (state.llmPrefetchInFlight) {
        toast("Un téléchargement est déjà en cours — utilisez Annuler pour l’arrêter.");
        return true;
      }
      state.llmPrefetchInFlight = true;
      state.llmPrefetchPercent = 0;
      paintLlmPrefetchProgressDom();
      paintStatusBarProgressDom();
      toast("Téléchargement du modèle en arrière-plan — vous pouvez continuer à utiliser l’app.");
      void (async () => {
        try {
          const msg = await withTimeout(invoke<string>("prefetch_llm_model", {}), 1_800_000);
          toast(msg || "Fichier modèle prêt.");
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!/annulé/i.test(msg)) toast(msg);
        } finally {
          state.llmPrefetchInFlight = false;
          if (state.llmPrefetchPercent == null) {
            paintLlmPrefetchProgressDom();
            paintStatusBarProgressDom();
          }
          void refreshLlmRuntimeStatus(false).then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        }
      })();
      return true;
    }
    case "prefetch-semantic-minilm": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement MiniLM : lancez l’app Tauri.");
          return;
        }
        toast("Téléchargement all-MiniLM-L6-v2 (ONNX + tokenizer)…");
        try {
          const msg = await withTimeout(invoke<string>("prefetch_semantic_minilm_model", {}), 900_000);
          toast(msg);
          try {
            state.semanticModelAvailable = await withTimeout(invoke<boolean>("semantic_model_available", {}), MAIL_ACTION_TIMEOUT_MS);
          } catch {
            state.semanticModelAvailable = false;
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    case "reindex-semantic-account": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Réindexation : lancez l’app Tauri.");
          return;
        }
        if (!ipcThrottleMs("reindex_semantic_account_ui", 3500)) {
          toast("Une réindexation vient d’être demandée — patiente quelques secondes.");
          return;
        }
        const aid = state.selectedAccountId?.trim() || currentAccount()?.id?.trim();
        if (!aid) {
          toast("Sélectionne un compte actif avant de réindexer.");
          return;
        }
        if (!state.semanticModelAvailable) {
          toast("Modèle MiniLM absent (model.onnx + tokenizer.json).");
          return;
        }
        try {
          toast("Réindexation sémantique (tout le compte, dossiers présents localement)…");
          const stats = await withTimeout(
            invoke<{ indexed: number; skipped: number; errors: number }>("reindex_semantic_account_cmd", {
              accountId: aid,
            }),
            1_800_000
          );
          toast(`Index sémantique : ${stats.indexed} ligne(s), ${stats.errors} erreur(s).`);
          await searchThreads();
          await refreshSemanticEmbeddingCounts();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "refresh-semantic-embedding-counts": {
      void refreshSemanticEmbeddingCounts();
      return true;
    }
    case "prefetch-whisper-models": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement GGML : lancez l’app Tauri.");
          return;
        }
        toast("Téléchargement du GGML Whisper (HF) selon tes réglages…");
        try {
          const msg = await withTimeout(invoke<string>("prefetch_whisper_dictation_model", {}), 900_000);
          toast(msg);
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    }
    default:
      return false;
  }
}
