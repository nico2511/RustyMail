import {
  currentAccount,
  invoke,
  navCanGoBack,
  render,
  state,
  toast,
  tauriErrorMessage,
  goBack,
  navigateToInbox,
} from "./depsCore";
import {
  enterComposeView,
  getContactDetail,
  getContactsKeywordDraft,
  isAiFeatureEnabled,
  launchContactMailSearch,
  launchDomainMailSearch,
  loadAddressBookSidebarCount,
  loadContactDetail,
  loadContactProfile,
  loadContactsList,
  openContactDetailView,
  openThread,
  refreshAddressBookList,
  setContactsKeywordDraft,
  startNewDraftSession,
  syncPreviewOpenFromComposeLayout,
} from "./depsSearchMail";

export async function tryHandleContactsWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "contacts-back-list":
      if (navCanGoBack()) void goBack();
      else {
        state.view = "contacts";
        state.selectedContactEmail = undefined;
        render();
      }
      return true;
    case "contacts-back-inbox":
      navigateToInbox();
      return true;
    case "contacts-refresh-list": {
      const acc = currentAccount();
      if (acc?.id) {
        void loadContactsList(acc.id, { reset: true })
          .then(() => loadAddressBookSidebarCount())
          .then(() => render());
      }
      return true;
    }
    case "contacts-load-more": {
      const acc = currentAccount();
      if (acc?.id) void loadContactsList(acc.id).then(() => render());
      return true;
    }
    case "contacts-open-detail": {
      const email = element?.dataset.email?.trim();
      if (email) void openContactDetailView(email);
      return true;
    }
    case "contacts-open-thread": {
      const tid = element?.dataset.threadId?.trim();
      if (tid) void openThread(tid);
      return true;
    }
    case "contacts-compose": {
      const d = getContactDetail();
      const to = d?.email || state.selectedContactEmail;
      if (!to) return true;
      enterComposeView();
      startNewDraftSession();
      state.draft = {
        id: "draft-local",
        kind: "New",
        to: [{ email: to }],
        cc: [],
        bcc: [],
        subject: "",
        markdownBody: "",
        sendHtml: true,
        inReplyTo: null,
        references: [],
        attachmentPaths: [],
        threadId: null,
      };
      state.composeBody = "";
      state.composeCanonicalBody = "";
      state.composeLayout = "split";
      syncPreviewOpenFromComposeLayout();
      state.preview = undefined;
      render();
      return true;
    }
    case "contacts-toggle-fav": {
      const acc = currentAccount();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      const d = getContactDetail();
      if (!acc?.id || !email || !d) return true;
      void (async () => {
        try {
          await invoke("upsert_manual_contact_cmd", {
            payload: {
              accountId: acc.id,
              email,
              displayName: d.displayName,
              notes: d.notes,
              isFavorite: !d.isFavorite,
            },
          });
          await loadContactDetail(acc.id, email);
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "contacts-llm-profile": {
      if (!isAiFeatureEnabled(state.appPrefs.ai, "featureContactProfileEnabled")) {
        toast("Activez « Profil IA contact » dans les réglages IA.");
        return true;
      }
      const acc = currentAccount();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      if (!acc?.id || !email) return true;
      void (async () => {
        await loadContactProfile(acc.id!, email);
        render();
        toast("Profil IA chargé.");
      })();
      return true;
    }
    case "contacts-search-domain": {
      const domain = element?.dataset.domain?.trim();
      if (domain) void launchDomainMailSearch(domain);
      return true;
    }
    case "contacts-search-all":
    case "contacts-search-unread":
    case "contacts-search-focused":
    case "contacts-search-auto":
    case "contacts-search-keyword":
    case "contacts-search-hybrid": {
      const email = state.selectedContactEmail || getContactDetail()?.email;
      if (!email) return true;
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
      return true;
    }
    case "address-book-export-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        return true;
      }
      void (async () => {
        try {
          const path = await invoke<string>("export_address_contacts_vcard_cmd", {
            accountId: acc.id,
          });
          toast(`Carnet exporté : ${path}`);
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      return true;
    }
    case "address-book-import-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        return true;
      }
      void (async () => {
        try {
          const res = await invoke<{ imported: number; skippedDuplicates: number; errors: string[] }>(
            "import_address_contacts_vcard_cmd",
            { payload: { accountId: acc.id, merge: true } }
          );
          await refreshAddressBookList();
          const errN = res.errors?.length ?? 0;
          toast(
            `Import : ${res.imported} contact(s), ${res.skippedDuplicates} ignoré(s)${errN ? `, ${errN} erreur(s)` : ""}.`
          );
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
