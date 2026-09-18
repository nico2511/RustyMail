import { navCanGoBack } from "../../navigation";
import { render } from "../dispatch";
import { state } from "../state";
import { goBack } from "./appNavActions";
import { requireComposeCloseFlowDeps } from "./composeCloseFlowContext";

export async function leaveComposeViewAfterClose(): Promise<void> {
  const d = requireComposeCloseFlowDeps();
  if (navCanGoBack()) {
    await goBack();
    return;
  }
  state.view = state.selectedThread ? "thread" : "list";
  if (state.view === "thread" && state.selectedThread && d.threadReadingIsSimpleLayout()) {
    state.aiOpen = true;
  }
  render();
}
