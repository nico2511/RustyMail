// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  serverFieldSelectors,
  serverSidesFromPreset,
} from "../../../accountSetup";
import { isAtAutocompletePanelOpen } from "../../../atAutocomplete";
import { isHashAutocompletePanelOpen } from "../../../hashAutocomplete";
import { setDiscoveredServersFormSnap } from "../account/discoveredServerSnap";
import { commitSearchQuery } from "./searchCommitQuery";
import { syncSearchBarChrome } from "./searchBarUi";
import { refreshSearchTagCatalog } from "./searchTagCatalog";
import { normalizeMailHrefForOpen, openExternalFromMailHref } from "./mailLinkOpen";
import { sendQuickReply } from "./composeSendQuickReply";
import { switchActiveAccount } from "./settingsWireActions";
import {
  loadComposeMarkdownIntoEditor,
  scheduleDraftRevisionSave,
  schedulePreviewUpdate,
  setComposeFromTextareaValue,
  applyMarkdownAction,
  bindComposerDropzone,
} from "./composeComposerBridge";
import {
  pickImgSrcForLightbox,
  resolveSrcForMailImageLightbox,
} from "./mailContentWireActions";
import { state } from "../state";
import { render } from "../dispatch";

export function wireEventsDomComposeSearchAccount(signal: AbortSignal): void {
  document.querySelector<HTMLElement>(".composer-body .preview")?.addEventListener(
    "click",
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const a = t.closest("a[href]") as HTMLAnchorElement | null;
      if (a) {
        const raw = a.getAttribute("href")?.trim() ?? "";
        const normalized = normalizeMailHrefForOpen(raw);
        if (normalized) {
          ev.preventDefault();
          void openExternalFromMailHref(normalized);
        }
        return;
      }
      if (t.tagName !== "IMG") return;
      const img = t as HTMLImageElement;
      const src = pickImgSrcForLightbox(img);
      if (!src) return;
      const alt = (img.getAttribute("alt") || "").trim();
      void resolveSrcForMailImageLightbox(src, null).then((resolved) => {
        state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
        render();
      });
    },
    { signal }
  );
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchInputEl) => {
    const fromModal = searchInputEl.id === "search-modal-input";
    searchInputEl.addEventListener(
      "focus",
      () => {
        void refreshSearchTagCatalog();
      },
      { signal }
    );
    searchInputEl.addEventListener(
      "input",
      (event) => {
        state.searchDraft = (event.currentTarget as HTMLInputElement).value;
        syncSearchBarChrome();
        if (/#(?:tag|source|kind|entity|state)/i.test(state.searchDraft)) {
          void refreshSearchTagCatalog();
        }
      },
      { signal }
    );
    searchInputEl.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Tab") return;
        if (event.key !== "Enter") return;
        if (isHashAutocompletePanelOpen() || isAtAutocompletePanelOpen()) return;
        event.preventDefault();
        commitSearchQuery({ fromModal });
      },
      { signal }
    );
    searchInputEl.addEventListener(
      "search",
      () => {
        commitSearchQuery({ fromModal });
      },
      { signal }
    );
  });
  document.querySelector<HTMLSelectElement>("#account-select")?.addEventListener("change", (event) => {
    void (async () => {
      const id = (event.currentTarget as HTMLSelectElement).value || state.accounts[0]?.id || "";
      await switchActiveAccount(id);
      render();
    })();
  });
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "input",
    (event) => {
      setComposeFromTextareaValue((event.currentTarget as HTMLTextAreaElement).value);
      schedulePreviewUpdate();
      scheduleDraftRevisionSave();
    },
    { signal }
  );
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "paste",
    (event) => {
      const e = event as ClipboardEvent;
      const textarea = e.currentTarget as HTMLTextAreaElement | null;
      if (!textarea) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((it) => it.kind === "file" && (it.type || "").startsWith("image/"));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl.startsWith("data:image/")) return;
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const nlBefore = start > 0 && textarea.value[start - 1] !== "\n" ? "\n" : "";
        const nlAfter = end < textarea.value.length && textarea.value[end] !== "\n" ? "\n" : "";
        const stamp = new Date().toLocaleString();
        const snippet = `${nlBefore}![Capture ${stamp}](${dataUrl})${nlAfter}\n`;
        textarea.setRangeText(snippet, start, end, "end");
        loadComposeMarkdownIntoEditor(textarea.value);
        textarea.value = state.composeBody;
        schedulePreviewUpdate(0);
        textarea.focus();
      };
      reader.readAsDataURL(file);
    },
    { signal }
  );
  document.querySelector<HTMLInputElement>("#compose-subject")?.addEventListener(
    "input",
    () => {
      scheduleDraftRevisionSave();
    },
    { signal }
  );
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "keydown",
    (event) => {
      const evk = event as KeyboardEvent;
      if (!(evk.ctrlKey || evk.metaKey)) return;
      const key = evk.key.toLowerCase();
      if (key === "b") {
        evk.preventDefault();
        void applyMarkdownAction("bold");
      } else if (key === "i") {
        evk.preventDefault();
        void applyMarkdownAction("italic");
      } else if (key === "k") {
        evk.preventDefault();
        void applyMarkdownAction("link");
      } else if (key === "u") {
        evk.preventDefault();
        void applyMarkdownAction("underline");
      }
    },
    { signal }
  );
  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        void applyMarkdownAction(button.dataset.md ?? "");
      },
      { signal }
    );
  });
  bindComposerDropzone();
  document.querySelector<HTMLInputElement>("[data-quick-reply]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendQuickReply("reply");
    }
  });

  document.querySelector<HTMLInputElement>("#account-email")?.addEventListener("input", (event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    applyDomainPresetIfSafe(value, {
      onApplied(domain, preset) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(preset));
        state.accountMessage = `Préréglage local pour « ${domain} ».`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
  });
  for (const selector of serverFieldSelectors()) {
    document.querySelector<HTMLElement>(selector)?.addEventListener("input", () => {
      accountFieldTouched.serverFields = true;
    });
    document.querySelector<HTMLElement>(selector)?.addEventListener("change", () => {
      accountFieldTouched.serverFields = true;
    });
  }
}

export function wireEventsDomThreadQaInput(signal: AbortSignal): void {
  document.querySelector<HTMLTextAreaElement>("#thread-qa-input")?.addEventListener(
    "input",
    (ev) => {
      state.threadQaDraft = (ev.currentTarget as HTMLTextAreaElement).value;
    },
    { signal }
  );
}
