import { renderFolderManagerView } from "../../folderManagerView";
import { renderOrganizationView } from "../../organizationView";
import { renderOrganizationV2View } from "../../organizationViewV2";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { iconSvg } from "../lib/iconSvg";
import { renderList } from "../ui/render/listRender";
import { renderOrgThreadSampleRow } from "../ui/render/orgSampleRowRender";
import { state } from "../state";

export function renderOrganizationPageForState(): string {
  return renderOrganizationView(state.organization, {
    escapeHtml,
    escapeAttr,
    iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
    renderThreadSample: renderOrgThreadSampleRow,
    mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
  });
}

export function renderOrganizationV2PageForState(): string {
  return renderOrganizationV2View(state.organizationV2, {
    escapeHtml,
    escapeAttr,
    iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
    renderThreadSample: renderOrgThreadSampleRow,
    mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
  });
}

export function renderFolderManagerPageForState(): string {
  return renderFolderManagerView(state.folderManager, {
    escapeHtml,
    escapeAttr,
    iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
    mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
    renderSearchFilters: () => renderList("filters-only"),
    renderListPanel: () => renderList("threads-only"),
  });
}
