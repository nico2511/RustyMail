import { root as appShell } from "../dom";
import { wireEvents } from "./wireEventsDomOrchestratorRun";
import { currentComposeWireSignal } from "./wireEventsDomOrchestratorComposeRun";
import { state } from "../state";
import { wireFolderManagerDnD } from "./folderManagerDnD";
import { syncMailboxDigestPanelWithFeaturePref } from "./mailboxDigest";
import {
  captureAccountsFormBeforeRender,
  focusPromptsAfterRender,
  restoreScrollAfterRender,
  snapshotAppShellScroll,
} from "./appShellRenderChromeRun";
import {
  buildAppShellClassName,
  buildAppShellInnerHtml,
  readAppShellLayoutFlags,
} from "./appShellRenderMarkupRun";
import { commitAppShellHtml } from "./appShellRenderCommitRun";

export function renderAppShell(): void {
  syncMailboxDigestPanelWithFeaturePref();
  captureAccountsFormBeforeRender();

  const scrollPrev = snapshotAppShellScroll();
  const { isCompose, aiPanelExpanded, panelW } = readAppShellLayoutFlags();
  const { fullHtml, mainHtml } = buildAppShellInnerHtml({ isCompose, aiPanelExpanded, panelW });

  appShell.className = buildAppShellClassName({
    isCompose,
    aiPanelExpanded,
    sidebarCollapsed: state.sidebarCollapsed,
  });
  appShell.style.setProperty("--ai-width", aiPanelExpanded ? `${panelW}px` : "0px");
  const committed = commitAppShellHtml(appShell, fullHtml, mainHtml, state.view === "thread");
  if (!committed.domChanged) return;

  wireEvents();
  wireFolderManagerDnD(currentComposeWireSignal());
  focusPromptsAfterRender();
  restoreScrollAfterRender(scrollPrev);
}
