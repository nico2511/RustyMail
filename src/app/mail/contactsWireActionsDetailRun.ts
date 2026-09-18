import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import {
  getContactDetail,
  getContactsKeywordDraft,
  loadContactDetail,
  loadContactProfile,
  setContactsKeywordDraft,
} from "../../contactsView";
import { enterComposeView, startNewDraftSession, syncPreviewOpenFromComposeLayout } from "./composeViewWireActions";
import { launchContactMailSearch, launchDomainMailSearch } from "./searchLaunchPresetsRun";

export async function tryHandleContactsDetailWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
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
    default:
      return false;
  }
}
