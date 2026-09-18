/** List, org pages, nav breadcrumb for shell `RenderDeps`. */
import { currentAccount } from "../core/accountContext";
import type { RenderDeps } from "../ui/render/renderDeps";
import { renderList } from "../ui/render/listRender";
import {
  renderFolderManagerPageForState,
  renderOrganizationPageForState,
  renderOrganizationV2PageForState,
} from "./appRenderRegistryPagesRun";
import { folderManagerPanelMailbox } from "./mailboxPanelContext";
import { threadsVisibleInList, threadListFollowed } from "./mailListThreadFilter";
import { navCurrentBreadcrumbSegment } from "./navBreadcrumbSegments";
import { sourceMailboxForThread } from "./threadListActions";

export function buildShellListRenderDepsFragment(): Pick<
  RenderDeps,
  | "navCurrentBreadcrumbSegment"
  | "sourceMailboxForThread"
  | "currentAccount"
  | "renderOrganizationPage"
  | "renderOrganizationV2Page"
  | "renderFolderManagerPage"
  | "renderList"
  | "threadsVisibleInList"
  | "folderManagerPanelMailbox"
  | "threadListFollowed"
> {
  return {
    navCurrentBreadcrumbSegment,
    sourceMailboxForThread,
    currentAccount,
    renderOrganizationPage: renderOrganizationPageForState,
    renderOrganizationV2Page: renderOrganizationV2PageForState,
    renderFolderManagerPage: renderFolderManagerPageForState,
    renderList,
    threadsVisibleInList,
    folderManagerPanelMailbox,
    threadListFollowed,
  };
}
