import type { NavigateOpts, View } from "../types";
import { state } from "../state";

export type ComposeViewNavigationDeps = {
  beginNavigation: (to: View, opts?: NavigateOpts) => void;
};

let composeViewNavigationDeps: ComposeViewNavigationDeps | null = null;

export function registerComposeViewNavigationDeps(deps: ComposeViewNavigationDeps): void {
  composeViewNavigationDeps = deps;
}

function navDeps(): ComposeViewNavigationDeps {
  if (!composeViewNavigationDeps) throw new Error("registerComposeViewNavigationDeps not called");
  return composeViewNavigationDeps;
}

export function enterComposeView(opts?: { skipHistory?: boolean }): void {
  if (!opts?.skipHistory && state.view !== "compose") navDeps().beginNavigation("compose");
  state.view = "compose";
  state.aiOpen = false;
}
