import { bytesToBase64 as bytesToBase64Impl, mediaBlobToWav16kMonoPcm16 as mediaBlobToWavImpl } from "./micAudioUtil";
import { micPermissionErrorMessage as micPermissionErrorMessageImpl, requestMicStream as requestMicStreamImpl } from "./micStreamAccess";
import {
  defaultListFilterFromPrefs as defaultListFilterFromPrefsImpl,
  ensureValidSelectedMailbox as ensureValidSelectedMailboxImpl,
  persistDefaultAccountId as persistDefaultAccountIdImpl,
} from "./accountDefaultPrefs";
import {
  finalizeSettingsAiModalClose as finalizeSettingsAiModalCloseImpl,
  persistAiPrefsFromDom as persistAiPrefsFromDomImpl,
  schedulePersistAiPrefsFromDom as schedulePersistAiPrefsFromDomImpl,
} from "./settingsAiPrefsPersistDom";
import { paintLlmPrefetchProgressDom as paintLlmPrefetchProgressDomImpl } from "./llmPrefetchProgressDom";
import {
  applyContextSliderIndex as applyContextSliderIndexImpl,
  autoDetectLlamaServerBinary as autoDetectLlamaServerBinaryImpl,
  openEnginesAiSettingsModal as openEnginesAiSettingsModalImpl,
  persistEngineCheckboxToggle as persistEngineCheckboxToggleImpl,
  refreshLlmRuntimeStatus as refreshLlmRuntimeStatusImpl,
} from "./settingsLlmRuntime";
import { openSettingsView as openSettingsViewImpl } from "./settingsOpenView";
import { refreshSemanticEmbeddingCounts as refreshSemanticEmbeddingCountsImpl } from "./settingsSemanticEmbeddingCounts";
import { refreshSettingsPathsFromBackend as refreshSettingsPathsFromBackendImpl } from "./settingsPathsRefresh";
import { paintStatusBarProgressDom as paintStatusBarProgressDomImpl } from "./statusBarProgressJobs";
import { warnOAuthEphemeralRedirect as warnOAuthEphemeralRedirectImpl } from "./oauthEphemeralRedirectWarn";
import { switchActiveAccount as switchActiveAccountImpl } from "./switchActiveAccountAction";

export type SettingsWireActionsDeps = {
  syncActivityRecordingPrefs: () => void;
  discoverMailServersAction: () => void | Promise<void>;
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

export function openSettingsView(): void {
  openSettingsViewImpl();
}

export function ensureValidSelectedMailbox(): void {
  return ensureValidSelectedMailboxImpl();
}

export function refreshSemanticEmbeddingCounts(): Promise<void> {
  return refreshSemanticEmbeddingCountsImpl();
}

export function refreshSettingsPathsFromBackend(): Promise<void> {
  return refreshSettingsPathsFromBackendImpl();
}

export function openEnginesAiSettingsModal(): Promise<void> {
  return openEnginesAiSettingsModalImpl();
}

export function finalizeSettingsAiModalClose(): void {
  finalizeSettingsAiModalCloseImpl();
}

export function persistDefaultAccountId(id: string): Promise<void> {
  return persistDefaultAccountIdImpl(id);
}

export function switchActiveAccount(id: string): Promise<void> {
  return switchActiveAccountImpl(id);
}

export function syncActivityRecordingPrefs(): void {
  settings().syncActivityRecordingPrefs();
}

export function defaultListFilterFromPrefs(): import("../types").State["listFilter"] {
  return defaultListFilterFromPrefsImpl();
}

export function persistAiPrefsFromDom(opts?: { silent?: boolean; skipRender?: boolean }): void | Promise<void> {
  return persistAiPrefsFromDomImpl(opts);
}

export function refreshLlmRuntimeStatus(forceHardwareRescan?: boolean): Promise<void> {
  return refreshLlmRuntimeStatusImpl(forceHardwareRescan);
}

export function autoDetectLlamaServerBinary(opts?: {
  silent?: boolean;
  persist?: boolean;
}): Promise<boolean> {
  return autoDetectLlamaServerBinaryImpl(opts);
}

export function paintLlmPrefetchProgressDom(): void {
  paintLlmPrefetchProgressDomImpl();
}

export function paintStatusBarProgressDom(): void {
  paintStatusBarProgressDomImpl();
}

export function requestMicStream(): Promise<MediaStream> {
  return requestMicStreamImpl();
}

export function mediaBlobToWav16kMonoPcm16(blob: Blob): Promise<Uint8Array> {
  return mediaBlobToWavImpl(blob);
}

export function bytesToBase64(bytes: Uint8Array): string {
  return bytesToBase64Impl(bytes);
}

export function micPermissionErrorMessage(error: unknown): string {
  return micPermissionErrorMessageImpl(error);
}

export function discoverMailServersAction(): void | Promise<void> {
  return settings().discoverMailServersAction();
}

export function warnOAuthEphemeralRedirect(outcome: import("../types").OAuthDesktopLoginOutcome): void {
  warnOAuthEphemeralRedirectImpl(outcome);
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

export function schedulePersistAiPrefsFromDom(opts?: { skipDomCapture?: boolean }): void {
  schedulePersistAiPrefsFromDomImpl(opts);
}

export function applyContextSliderIndex(idx: number): void {
  applyContextSliderIndexImpl(idx);
}

export function persistEngineCheckboxToggle(message: string): void | Promise<void> {
  return persistEngineCheckboxToggleImpl(message);
}
