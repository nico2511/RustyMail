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
import { shouldShowIntegratedWindowChrome } from "../ui/windowChrome";
import {
  buildAppShellClassName,
  buildAppShellInnerHtml,
  readAppShellLayoutFlags,
} from "./appShellRenderMarkupRun";
import { commitAppShellHtml } from "./appShellRenderCommitRun";

export function renderAppShell(): void {
  if (state.dbLockedMessage) {
    appShell.className = "app";
    appShell.innerHTML = `<div class="db-locked" role="alert" style="max-width:36rem;margin:12vh auto;padding:28px 24px;font-family:system-ui,sans-serif">
      <h1 style="font-size:1.35rem;margin:0 0 12px">Base verrouillée</h1>
      <p style="margin:0 0 18px;line-height:1.45">${state.dbLockedMessage}</p>
      <button type="button" id="db-locked-retry">Réessayer</button>
    </div>`;
    appShell.querySelector<HTMLButtonElement>("#db-locked-retry")?.addEventListener("click", () => {
      window.location.reload();
    });
    return;
  }
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
  const committed = commitAppShellHtml(appShell, fullHtml, mainHtml, state.view === "thread");
  if (!committed.domChanged) return;

  wireEvents();
  wireFolderManagerDnD(currentComposeWireSignal());
  focusPromptsAfterRender();
  restoreScrollAfterRender(scrollPrev);
}
