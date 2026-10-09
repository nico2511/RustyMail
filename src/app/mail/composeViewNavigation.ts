import type { NavigateOpts, View } from "../types";
import { state } from "../state";
import { beginNavigation as beginNavigationImpl } from "./appNavigationStack";
import { resetComposeSendId } from "./composeSendId";

export function enterComposeView(opts?: { skipHistory?: boolean }): void {
  if (!opts?.skipHistory && state.view !== "compose") beginNavigationImpl("compose");
  if (!opts?.skipHistory) resetComposeSendId();
  state.view = "compose";
  state.aiOpen = false;
}
