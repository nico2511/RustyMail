import {
  currentAccount,
  render,
  state,
  toast,
  invoke,
  t,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  withTimeout,
  tauriErrorMessage,
} from "./depsCore";
import {
  searchThreads,
} from "./depsSearchMail";
import {
  ipcThrottleMs,
  syncLlmEnginePrefsToDom,
  applyEngineConnectionMode,
  refreshSemanticEmbeddingCounts,
  persistAiPrefsFromDom,
  refreshLlmRuntimeStatus,
  autoDetectLlamaServerBinary,
  paintLlmPrefetchProgressDom,
  paintStatusBarProgressDom,
  requestMicStream,
  mediaBlobToWav16kMonoPcm16,
  bytesToBase64,
  micPermissionErrorMessage,
} from "./depsSettingsAccount";

export async function tryHandleSettingsAiWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "save-ai-prefs":
      void persistAiPrefsFromDom();
      return true;
    case "refresh-llm-runtime-status": {
      void refreshLlmRuntimeStatus(false).then(() => {
        render();
        toast("Statut LLM actualisé.");
      });
      return true;
    }
    case "refresh-llm-hardware-rescan": {
      void refreshLlmRuntimeStatus(true).then(() => {
        render();
        toast("Mémoire de l’ordinateur : nouvelle analyse effectuée.");
      });
      return true;
    }
    case "llm-apply-recommended-weights": {
      const st = state.llmRuntimeStatus;
      if (!st?.recommendedRepo?.trim()) {
        toast("Aucune recommandation pour l’instant — essayez « Analyser la mémoire ».");
        return true;
      }
      state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
      if (st.recommendedFile?.trim()) {
        state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
      }
      void persistAiPrefsFromDom({ silent: true, skipRender: true });
      toast("Modèle recommandé appliqué.");
      render();
      return true;
    }
    case "llm-setup-recommended": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Configuration recommandée : lancez l’app Tauri.");
          return;
        }
        await refreshLlmRuntimeStatus(true);
        const st = state.llmRuntimeStatus;
        if (st?.recommendedRepo?.trim()) {
          state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
          if (st.recommendedFile?.trim()) {
            state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
          }
          state.appPrefs.ai.localLlmEnabled = true;
        }
        await autoDetectLlamaServerBinary({ silent: true, persist: false });
        try {
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        } catch (e) {
          toast(tauriErrorMessage(e));
          return;
        }
        await refreshLlmRuntimeStatus(false);
        toast("Configuration recommandée appliquée.");
        render();
      })();
      return true;
    }
    case "ai-engine-mode": {
      const mode = element?.dataset.engineMode?.trim();
      if (mode !== "local" && mode !== "cloud" && mode !== "hybrid") return true;
      state.aiEngineSettingsTab = mode;
      if (mode === "local") {
        applyEngineConnectionMode(state.appPrefs.ai, "local");
      } else if (mode === "hybrid") {
        applyEngineConnectionMode(state.appPrefs.ai, "hybrid");
      }
      syncLlmEnginePrefsToDom(state.appPrefs.ai);
      render();
      void (async () => {
        if (mode === "local" || mode === "hybrid") {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          } catch (e) {
            toast(tauriErrorMessage(e));
            return;
          }
        }
        toast(
          mode === "local"
            ? "Mode Sur mon PC."
            : mode === "cloud"
              ? "Mode Cloud."
              : "Mode Hybride enregistré.",
        );
        await refreshLlmRuntimeStatus(false);
        render();
      })();
      return true;
    }
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
    case "dictation-test-mic": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Test micro : lancez l’app Tauri.");
          return;
        }
        // Enregistre 3s et envoie un WAV 16kHz mono PCM16 au backend Whisper.
        toast("Test micro : enregistrement 3s…");
        let stream: MediaStream | null = null;
        let recorder: MediaRecorder | null = null;
        const chunks: Blob[] = [];
        try {
          stream = await requestMicStream();
          if (!stream) {
            toast("Micro inaccessible.");
            return;
          }
          const mimeOpt =
            typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : "audio/webm";
          recorder = new MediaRecorder(stream, { mimeType: mimeOpt });
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
          };
          recorder.start(250);
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const blob: Blob = await new Promise((resolve, reject) => {
            const r = recorder!;
            r.onerror = () => reject(new Error("Enregistrement interrompu"));
            r.onstop = () => resolve(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
            r.stop();
          });
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          recorder = null;
          const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
          const audioWavBase64 = bytesToBase64(wavBytes);
          toast("Test micro : transcription…");
          const res = await withTimeout(
            invoke<{ durationS: number; rms: number; elapsedMs: number; text?: string | null; error?: { kind: string; seconds?: number; rms?: number; message?: string } | null }>(
              "dictation_test_run",
              { audioWavBase64 }
            ),
            180_000
          );
          if (res.error) {
            const msg =
              res.error.kind === "audio_too_short"
                ? `Audio trop court (${(res.error.seconds ?? res.durationS).toFixed(2)}s).`
                : res.error.kind === "audio_silent"
                  ? `Audio quasi silencieux (RMS=${(res.error.rms ?? res.rms).toFixed(4)}).`
                  : res.error.message
                    ? res.error.message
                    : "Échec transcription.";
            toast(`Test micro : ${msg}`);
          } else {
            toast(
              `Test micro OK (${res.durationS.toFixed(2)}s, RMS=${res.rms.toFixed(4)}, ${Math.round(res.elapsedMs)}ms) : ${String(res.text ?? "").slice(0, 140)}`
            );
          }
        } catch (e) {
          toast(`Test micro : ${micPermissionErrorMessage(e)}`);
        } finally {
          try {
            recorder?.stop();
          } catch {
            // ignore
          }
          stream?.getTracks().forEach((t) => t.stop());
        }
        render();
      })();
      return true;
    }
    default:
      return false;
  }
}
