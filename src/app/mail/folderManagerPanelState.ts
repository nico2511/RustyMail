import { isVirtualMailbox } from "../../mailboxKinds";
import { defaultListFilterFromPrefs } from "./accountDefaultPrefs";
import { state } from "../state";

export function resetFolderManagerPanelSearchState(): void {
  state.listFilter = defaultListFilterFromPrefs();
}

export function mailboxPathPrefixForCreate(): string {
  const m = (state.selectedMailbox ?? "").trim();
  if (!m || isVirtualMailbox(m)) return "";
  return m.endsWith("/") ? m : `${m}/`;
}
