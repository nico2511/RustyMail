import type { MicActionOpts } from "../../types";

export type AppWireFacadesDeps = {
  enterComposeView: (opts?: { skipHistory?: boolean }) => void;
  startNewDraftSession: () => void;
  syncPreviewOpenFromComposeLayout: () => void;
  openContactDetailView: (email: string, opts?: { skipHistory?: boolean }) => void | Promise<void>;
  openOrganizationV2View: () => void | Promise<void>;
  loadAddressBookSidebarCount: () => Promise<void>;
  refreshAddressBookList: () => Promise<void>;
  agentPrepareReplyStart: () => void | Promise<void>;
  agentPrepareReplyContinue: () => void | Promise<void>;
  stopAgentTelemetry: () => void | Promise<void>;
  agentInsertDraftIntoCompose: (extra?: string) => void | Promise<void>;
  summarizeSenderThreadsLight: () => void | Promise<void>;
  llmQuickRepliesComposeUi: () => void | Promise<void>;
  micAction: (opts?: MicActionOpts) => void | Promise<void>;
  saveAccount: () => void | Promise<void>;
  saveDraftToSavedListNow: (opts?: { silentToast?: boolean }) => Promise<boolean>;
  refreshSavedDraftsMailboxCount: () => Promise<void>;
};

let appWireFacadesDeps: AppWireFacadesDeps | null = null;

export function registerAppWireFacades(deps: AppWireFacadesDeps): void {
  appWireFacadesDeps = deps;
}

function wireFacades(): AppWireFacadesDeps {
  if (!appWireFacadesDeps) throw new Error("registerAppWireFacades not called");
  return appWireFacadesDeps;
}

export function enterComposeView(opts?: { skipHistory?: boolean }): void {
  wireFacades().enterComposeView(opts);
}

export function startNewDraftSession(): void {
  wireFacades().startNewDraftSession();
}

export function syncPreviewOpenFromComposeLayout(): void {
  wireFacades().syncPreviewOpenFromComposeLayout();
}

export function openContactDetailView(email: string, opts?: { skipHistory?: boolean }): void | Promise<void> {
  return wireFacades().openContactDetailView(email, opts);
}

export function openOrganizationV2View(): void | Promise<void> {
  return wireFacades().openOrganizationV2View();
}

export function loadAddressBookSidebarCount(): Promise<void> {
  return wireFacades().loadAddressBookSidebarCount();
}

export function refreshAddressBookList(): Promise<void> {
  return wireFacades().refreshAddressBookList();
}

export function agentPrepareReplyStart(): void | Promise<void> {
  return wireFacades().agentPrepareReplyStart();
}

export function agentPrepareReplyContinue(): void | Promise<void> {
  return wireFacades().agentPrepareReplyContinue();
}

export function stopAgentTelemetry(): void | Promise<void> {
  return wireFacades().stopAgentTelemetry();
}

export function agentInsertDraftIntoCompose(extra?: string): void | Promise<void> {
  return wireFacades().agentInsertDraftIntoCompose(extra);
}

export function summarizeSenderThreadsLight(): void | Promise<void> {
  return wireFacades().summarizeSenderThreadsLight();
}

export function llmQuickRepliesComposeUi(): void | Promise<void> {
  return wireFacades().llmQuickRepliesComposeUi();
}

export function micAction(opts?: MicActionOpts): void | Promise<void> {
  return wireFacades().micAction(opts);
}

export function saveAccount(): void | Promise<void> {
  return wireFacades().saveAccount();
}

export function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  return wireFacades().saveDraftToSavedListNow(opts);
}

export function refreshSavedDraftsMailboxCount(): Promise<void> {
  return wireFacades().refreshSavedDraftsMailboxCount();
}
