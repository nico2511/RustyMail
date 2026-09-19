// @ts-nocheck — DOM wiring; tighten types incrementally.
import { currentAccount } from "../core/accountContext";
import { loadContactsList } from "../../contactsView";
import { render } from "../dispatch";

export function wireEventsDomContactsListSearch(signal: AbortSignal): void {
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
    { signal },
  );
}
