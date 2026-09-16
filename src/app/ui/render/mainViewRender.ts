import { state } from "../../state";
import { renderDeps } from "./renderDeps";

export function renderMain(): string {
  const d = renderDeps();
  if (state.view === "thread") return d.renderThread();
  if (state.view === "compose") return d.renderComposer();
  if (state.view === "settings") return d.renderSettings();
  if (state.view === "contacts") {
    const acc = d.currentAccount();
    return d.renderContactsListPage(acc?.displayName || acc?.email || "Compte");
  }
  if (state.view === "contact") return d.renderContactDetailPage();
  if (state.view === "organization") return d.renderOrganizationPage();
  if (state.view === "organizationV2") return d.renderOrganizationV2Page();
  if (state.view === "folderManager") return d.renderFolderManagerPage();
  return d.renderList();
}
