import { getContactDetail, getContactsKeywordDraft, setContactsKeywordDraft } from "../../contactsView";
import { state } from "../state";
import { launchContactMailSearch } from "./searchLaunchPresetsRun";

export function handleContactsSearchFromDetail(action: string): void {
  const email = state.selectedContactEmail || getContactDetail()?.email;
  if (!email) return;
  const kwInput = document.querySelector<HTMLInputElement>("#contacts-search-keyword");
  if (kwInput) setContactsKeywordDraft(kwInput.value);
  const filter =
    action === "contacts-search-unread"
      ? "unread"
      : action === "contacts-search-focused"
        ? "focused"
        : action === "contacts-search-auto"
          ? "auto"
          : "all";
  launchContactMailSearch({
    email,
    listFilter: filter,
    text: getContactsKeywordDraft(),
    hybrid: action === "contacts-search-hybrid",
  });
}

export function isContactsSearchWireAction(action: string): boolean {
  return (
    action === "contacts-search-all" ||
    action === "contacts-search-unread" ||
    action === "contacts-search-focused" ||
    action === "contacts-search-auto" ||
    action === "contacts-search-keyword" ||
    action === "contacts-search-hybrid"
  );
}
