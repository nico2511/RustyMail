import type { CleanedMessageView } from "../../types";

/** Callbacks laissés dans application.ts pour éviter les imports circulaires depuis les modules render. */
export type RenderDeps = {
  navCurrentBreadcrumbSegment: () => string | null;
  shouldShowDefaultAccountPrompt: () => boolean;
  defaultAccountIdFromPrefs: () => string | undefined;
  normalizeThreadSenderLabel: (sender: string) => string;
  formatThreadReadingWhen: (receivedAt: string) => string;
  sortMessagesByReceivedDescending: (messages: CleanedMessageView[]) => CleanedMessageView[];
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
