import { invoke } from "@tauri-apps/api/core";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { tagFamilyForInvoke } from "../lib/tagFamilyForInvoke";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";

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
        family: tagFamilyForInvoke(String(t.family ?? "entity")),
        value: String(t.value ?? "").trim(),
      }))
      .filter((t) => t.value.length > 0);
  } catch (error) {
    console.error("list_search_tags", error);
    state.searchTagCatalog = [];
  }
}
