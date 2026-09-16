import type { Account } from "../../../accountSetup";
import type { CleanedMessageView } from "../../types";
import type { SavedSearchListItem } from "../../../savedSearches";
import type { StatusBarProgressJob } from "../../../statusBarProgress";

/** Callbacks laissés dans application.ts pour éviter les imports circulaires depuis les modules render. */
export type RenderDeps = {
  navCurrentBreadcrumbSegment: () => string | null;
  shouldShowDefaultAccountPrompt: () => boolean;
  defaultAccountIdFromPrefs: () => string | undefined;
  normalizeThreadSenderLabel: (sender: string) => string;
  formatThreadReadingWhen: (receivedAt: string) => string;
  sortMessagesByReceivedDescending: (messages: CleanedMessageView[]) => CleanedMessageView[];
  effectiveSearchMailboxPath: () => string | null;
  inboxSearchContextActive: () => boolean;
  canSaveSearchView: () => boolean;
  canSaveSearchViewInModal: () => boolean;
  searchDraftDiffersFromCommitted: () => boolean;
  activeSavedSearchItem: () => SavedSearchListItem | undefined;
  searchViewCanOpenOrganizer: () => boolean;
  searchViewCanAffinerFlux: () => boolean;
  sourceMailboxForThread: (threadId: string) => string;
  gatherStatusBarProgressJobs: () => StatusBarProgressJob[];
  currentAccount: () => Account | undefined;
  activeMessageTranslationJobCount: () => number;
  activeSecurityLlmAugmentCount: () => number;
};

let deps: RenderDeps | null = null;

export function registerRenderDeps(next: RenderDeps): void {
  deps = next;
}

export function renderDeps(): RenderDeps {
  if (!deps) {
    throw new Error("renderDeps: registerRenderDeps() must run before render modules are used");
  }
  return deps;
}
