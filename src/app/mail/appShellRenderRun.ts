import { root as appShell } from "../dom";
import { wireEvents } from "./wireEventsDomOrchestratorRun";
import { state } from "../state";
import { wireFolderManagerDnD } from "./folderManagerDnD";
import { syncMailboxDigestPanelWithFeaturePref } from "./mailboxDigest";
import {
  captureAccountsFormBeforeRender,
  focusPromptsAfterRender,
  restoreScrollAfterRender,
  snapshotAppShellScroll,
} from "./appShellRenderChromeRun";
import { shouldShowIntegratedWindowChrome } from "../ui/windowChrome";
import {
  buildAppShellClassName,
  buildAppShellInnerHtml,
  readAppShellLayoutFlags,
} from "./appShellRenderMarkupRun";
import { commitAppShellHtml, restoreParkedMain } from "./appShellRenderCommitRun";

export function renderAppShell(): void {
  syncMailboxDigestPanelWithFeaturePref();
  captureAccountsFormBeforeRender();

  const scrollPrev = snapshotAppShellScroll();
  const { isCompose, aiPanelExpanded, panelW } = readAppShellLayoutFlags();
  const windowChrome = shouldShowIntegratedWindowChrome();
  const { fullHtml, mainHtml } = buildAppShellInnerHtml({
    isCompose,
    aiPanelExpanded,
    panelW,
    windowChrome,
  });

  appShell.className = buildAppShellClassName({
    isCompose,
    aiPanelExpanded,
    sidebarCollapsed: state.sidebarCollapsed,
    windowChrome,
  });
  appShell.style.setProperty("--ai-width", aiPanelExpanded ? `${panelW}px` : "0px");
  const parkedMain = commitAppShellHtml(appShell, fullHtml, mainHtml, state.view === "thread");

  wireEvents();
  wireFolderManagerDnD();
  focusPromptsAfterRender();
  restoreScrollAfterRender(scrollPrev);
  restoreParkedMain(appShell, parkedMain);
}
