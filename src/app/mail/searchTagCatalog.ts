import { invoke } from "@tauri-apps/api/core";
import type { Tag } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";

export type SearchTagCatalogDeps = {
  tagFamilyForInvoke: (family: string) => Tag["family"];
};

let searchTagCatalogDeps: SearchTagCatalogDeps | null = null;

export function registerSearchTagCatalogDeps(deps: SearchTagCatalogDeps): void {
  searchTagCatalogDeps = deps;
}

function catalogDeps(): SearchTagCatalogDeps {
  if (!searchTagCatalogDeps) throw new Error("registerSearchTagCatalogDeps not called");
  return searchTagCatalogDeps;
}

export async function refreshSearchTagCatalog(): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !isTauriRuntime()) {
    state.searchTagCatalog = [];
    return;
  }
  try {
    const rows = await withTimeout(
      invoke<Array<{ family: string; value: string }>>("list_search_tags", { accountId }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
    state.searchTagCatalog = (rows ?? [])
      .map((t) => ({
        family: catalogDeps().tagFamilyForInvoke(String(t.family ?? "entity")),
        value: String(t.value ?? "").trim(),
      }))
      .filter((t) => t.value.length > 0);
  } catch (error) {
    console.error("list_search_tags", error);
    state.searchTagCatalog = [];
  }
}
