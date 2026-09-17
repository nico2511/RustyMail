export type SettingsWireActionsDeps = {
  openSettingsView: () => void | Promise<void>;
  ensureValidSelectedMailbox: () => void;
  refreshSemanticEmbeddingCounts: () => Promise<void>;
  refreshSettingsPathsFromBackend: () => void | Promise<void>;
  openEnginesAiSettingsModal: () => void | Promise<void>;
  finalizeSettingsAiModalClose: () => void;
  persistDefaultAccountId: (id: string) => Promise<void>;
  switchActiveAccount: (id: string) => Promise<void>;
  syncActivityRecordingPrefs: () => void;
  defaultListFilterFromPrefs: () => import("../types").State["listFilter"];
  persistAiPrefsFromDom: (opts?: { silent?: boolean; skipRender?: boolean }) => void | Promise<void>;
  refreshLlmRuntimeStatus: (forceHardwareRescan?: boolean) => Promise<void>;
  autoDetectLlamaServerBinary: (opts?: { silent?: boolean; persist?: boolean }) => Promise<boolean>;
  paintLlmPrefetchProgressDom: () => void;
  paintStatusBarProgressDom: () => void;
  requestMicStream: () => Promise<MediaStream>;
  mediaBlobToWav16kMonoPcm16: (blob: Blob) => Promise<Uint8Array>;
  bytesToBase64: (bytes: Uint8Array) => string;
  micPermissionErrorMessage: (error: unknown) => string;
  discoverMailServersAction: () => void | Promise<void>;
  warnOAuthEphemeralRedirect: (outcome: import("../types").OAuthDesktopLoginOutcome) => void;
  finishOAuthNewAccountAfterLogin: (
    authKind: "oauthGoogle" | "oauthMicrosoft",
    email: string,
    displayName: string,
  ) => void | Promise<void>;
  deleteSettingsAccount: () => void | Promise<void>;
};

let settingsWireActionsDeps: SettingsWireActionsDeps | null = null;

export function registerSettingsWireActionsDeps(deps: SettingsWireActionsDeps): void {
  settingsWireActionsDeps = deps;
}

function settings(): SettingsWireActionsDeps {
  if (!settingsWireActionsDeps) throw new Error("registerSettingsWireActionsDeps not called");
  return settingsWireActionsDeps;
}

export function openSettingsView(): void | Promise<void> {
  return settings().openSettingsView();
}

export function ensureValidSelectedMailbox(): void {
  settings().ensureValidSelectedMailbox();
}

export function refreshSemanticEmbeddingCounts(): Promise<void> {
  return settings().refreshSemanticEmbeddingCounts();
}

export function refreshSettingsPathsFromBackend(): void | Promise<void> {
  return settings().refreshSettingsPathsFromBackend();
}

export function openEnginesAiSettingsModal(): void | Promise<void> {
  return settings().openEnginesAiSettingsModal();
}

export function finalizeSettingsAiModalClose(): void {
  settings().finalizeSettingsAiModalClose();
}

export function persistDefaultAccountId(id: string): Promise<void> {
  return settings().persistDefaultAccountId(id);
}

export function switchActiveAccount(id: string): Promise<void> {
  return settings().switchActiveAccount(id);
}

export function syncActivityRecordingPrefs(): void {
  settings().syncActivityRecordingPrefs();
}

export function defaultListFilterFromPrefs(): import("../types").State["listFilter"] {
  return settings().defaultListFilterFromPrefs();
}

export function persistAiPrefsFromDom(opts?: { silent?: boolean; skipRender?: boolean }): void | Promise<void> {
  return settings().persistAiPrefsFromDom(opts);
}

export function refreshLlmRuntimeStatus(forceHardwareRescan?: boolean): Promise<void> {
  return settings().refreshLlmRuntimeStatus(forceHardwareRescan);
}

export function autoDetectLlamaServerBinary(opts?: {
  silent?: boolean;
  persist?: boolean;
}): Promise<boolean> {
  return settings().autoDetectLlamaServerBinary(opts);
}

export function paintLlmPrefetchProgressDom(): void {
  settings().paintLlmPrefetchProgressDom();
}

export function paintStatusBarProgressDom(): void {
  settings().paintStatusBarProgressDom();
}

export function requestMicStream(): Promise<MediaStream> {
  return settings().requestMicStream();
}

export function mediaBlobToWav16kMonoPcm16(blob: Blob): Promise<Uint8Array> {
  return settings().mediaBlobToWav16kMonoPcm16(blob);
}

export function bytesToBase64(bytes: Uint8Array): string {
  return settings().bytesToBase64(bytes);
}

export function micPermissionErrorMessage(error: unknown): string {
  return settings().micPermissionErrorMessage(error);
}

export function discoverMailServersAction(): void | Promise<void> {
  return settings().discoverMailServersAction();
}

export function warnOAuthEphemeralRedirect(outcome: import("../types").OAuthDesktopLoginOutcome): void {
  settings().warnOAuthEphemeralRedirect(outcome);
}

export function finishOAuthNewAccountAfterLogin(
  authKind: "oauthGoogle" | "oauthMicrosoft",
  email: string,
  displayName: string,
): void | Promise<void> {
  return settings().finishOAuthNewAccountAfterLogin(authKind, email, displayName);
}

export function deleteSettingsAccount(): void | Promise<void> {
  return settings().deleteSettingsAccount();
}
