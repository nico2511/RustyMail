// @ts-nocheck — DOM wiring; tighten types incrementally.
import { currentAccount } from "../core/accountContext";
import {
  contactsListHasMore,
  isContactsListLoading,
  loadContactsList,
} from "../../contactsView";
import { render } from "../dispatch";
import { state } from "../state";

export function wireEventsDomContactsListScroll(signal: AbortSignal): void {
  const contactsListEl = document.querySelector<HTMLElement>("#contacts-thread-list");
  contactsListEl?.addEventListener(
    "scroll",
    () => {
      if (state.view !== "contacts" || isContactsListLoading() || !contactsListHasMore()) return;
      const el = contactsListEl;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
      if (!nearBottom) return;
      const acc = currentAccount();
      if (!acc?.id) return;
      void loadContactsList(acc.id).then(() => render());
    },
    { signal, passive: true },
  );
}
