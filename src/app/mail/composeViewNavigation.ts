import type { NavigateOpts, View } from "../types";
import { state } from "../state";
import { beginNavigation as beginNavigationImpl } from "./appNavigationStack";

export function enterComposeView(opts?: { skipHistory?: boolean }): void {
  if (!opts?.skipHistory && state.view !== "compose") beginNavigationImpl("compose");
  state.view = "compose";
  state.aiOpen = false;
}
