import { render } from "../dispatch";
import { renderSearchBadgesHtml } from "../ui/render/searchRender";
import { state } from "../state";

export type SearchBarUiDeps = {
  refreshSearchTagCatalog: () => Promise<void>;
  searchDraftDiffersFromCommitted: () => boolean;
};

let searchBarUiDeps: SearchBarUiDeps | null = null;

export function registerSearchBarUiDeps(deps: SearchBarUiDeps): void {
  searchBarUiDeps = deps;
}

function uiDeps(): SearchBarUiDeps {
  if (!searchBarUiDeps) throw new Error("registerSearchBarUiDeps not called");
  return searchBarUiDeps;
}

export function syncSearchBarChrome(): void {
  const html = renderSearchBadgesHtml();
  const showPending = uiDeps().searchDraftDiffersFromCommitted();
  const pendingHtml = `<span class="inbox-search-pending dim" title="Entrée pour lancer la recherche">↵</span>`;

  document.querySelectorAll<HTMLElement>(".search-bar-stack, .search-ctx-stack").forEach((stack) => {
    const host =
      stack.querySelector(".search-context-filters") ??
      stack.querySelector(".search-bar-meta__badges") ??
      stack.querySelector(".search-ctx-badges") ??
      stack;
    const existing = host.querySelector(".inbox-search-badges");
    if (html) {
      if (existing) existing.outerHTML = html;
      else host.insertAdjacentHTML("beforeend", html);
    } else {
      existing?.remove();
    }

    const label = stack.querySelector("label.inbox-search");
    const input =
      label?.querySelector<HTMLInputElement>("input[type='search']") ??
      stack.querySelector<HTMLInputElement>("input[type='search']");
    if (!input) return;

    const pending = input.parentElement?.querySelector(".inbox-search-pending");
    if (showPending && !pending) {
      input.insertAdjacentHTML("afterend", pendingHtml);
    } else if (!showPending && pending) {
      pending.remove();
    }
  });
}

export function openSearchModal(): void {
  state.searchModalOpen = true;
  void uiDeps().refreshSearchTagCatalog();
  render();
}

export function closeSearchModal(): void {
  if (!state.searchModalOpen) return;
  state.searchModalOpen = false;
  render();
}
