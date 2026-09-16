export function isTauriRuntime(): boolean {
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}
