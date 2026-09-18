/** Re-exports for settings wire facades (split modules). */
export {
  registerSettingsWireActionsDeps,
  syncActivityRecordingPrefs,
  type SettingsWireActionsDeps,
} from "./settingsWireActionsContext";
export {
  defaultListFilterFromPrefs,
  ensureValidSelectedMailbox,
  persistDefaultAccountId,
  deleteSettingsAccount,
  discoverMailServersAction,
  finishOAuthNewAccountAfterLogin,
  switchActiveAccount,
  warnOAuthEphemeralRedirect,
  openSettingsView,
  refreshSettingsPathsFromBackend,
  refreshSemanticEmbeddingCounts,
} from "./settingsWireActionsAccountRun";
export {
  finalizeSettingsAiModalClose,
  persistAiPrefsFromDom,
  schedulePersistAiPrefsFromDom,
  applyContextSliderIndex,
  autoDetectLlamaServerBinary,
  openEnginesAiSettingsModal,
  persistEngineCheckboxToggle,
  refreshLlmRuntimeStatus,
  paintLlmPrefetchProgressDom,
  paintStatusBarProgressDom,
} from "./settingsWireActionsAiRun";
export {
  bytesToBase64,
  mediaBlobToWav16kMonoPcm16,
  micPermissionErrorMessage,
  requestMicStream,
} from "./settingsWireActionsMicRun";
