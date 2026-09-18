/** Compose + draft wire deps — barrel (close / draft / LLM). */
import { registerAppComposeWireCloseDeps } from "./appComposeWireRegistryCloseRun";
import { registerAppComposeWireDraftDeps } from "./appComposeWireRegistryDraftRun";
import { registerAppComposeWireLlmDeps } from "./appComposeWireRegistryLlmRun";

export { flushDraftRevisionPendingForCompose } from "./appComposeWireRegistryCloseRun";

export function registerAppComposeWireDeps(): void {
  registerAppComposeWireCloseDeps();
  registerAppComposeWireLlmDeps();
  registerAppComposeWireDraftDeps();
}
