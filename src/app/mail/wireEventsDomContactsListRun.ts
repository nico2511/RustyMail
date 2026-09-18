// @ts-nocheck — DOM wiring; tighten types incrementally.
import { currentAccount } from "../core/accountContext";
import {
  contactsListHasMore,
  isContactsListLoading,
  loadContactsList,
} from "../../contactsView";
import { render } from "../dispatch";
import { state } from "../state";

export function wireEventsDomContactsList(signal: AbortSignal): void {
  let contactsSearchDebounce: ReturnType<typeof setTimeout> | undefined;
  document.querySelector<HTMLInputElement>("#contacts-list-search")?.addEventListener(
    "input",
    (ev) => {
      const q = (ev.currentTarget as HTMLInputElement).value;
      const acc = currentAccount();
      if (!acc?.id) return;
      if (contactsSearchDebounce) clearTimeout(contactsSearchDebounce);
      contactsSearchDebounce = window.setTimeout(() => {
        void loadContactsList(acc.id!, { reset: true, query: q }).then(() => render());
      }, 280);
    },
    { signal }
  );

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
    { signal, passive: true }
  );
}
