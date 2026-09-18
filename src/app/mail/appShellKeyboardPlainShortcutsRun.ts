import { render } from "../dispatch";
import { state } from "../state";
import { handleAction } from "./handleActionRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { openSearchModal } from "./searchBarUi";

export function handleAppShellKeyboardPlainShortcuts(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (key === "n") {
    event.preventDefault();
    void handleAction("compose");
    return;
  }
  if (key === "r" && state.view === "thread") {
    event.preventDefault();
    void handleAction("reply");
    return;
  }
  if (key === "s" && state.view === "thread") {
    event.preventDefault();
    void handleAction("summarize");
    return;
  }
  if (key === "t" && state.view === "thread") {
    event.preventDefault();
    void handleAction("llm-translate-thread");
    return;
  }
  if (key === "m" && state.view === "compose") {
    event.preventDefault();
    void handleAction("toggle-preview");
    return;
  }
  if (key === "tab" && state.view === "thread") {
    event.preventDefault();
    void handleAction("toggle-ai");
    return;
  }
  if (key === "/") {
    event.preventDefault();
    if (state.view === "thread") clearThreadAiSummaryState();
    state.view = "list";
    render();
    const inboxSearch = document.querySelector<HTMLInputElement>("#search-input");
    if (inboxSearch) inboxSearch.focus();
    else openSearchModal();
  }
}
