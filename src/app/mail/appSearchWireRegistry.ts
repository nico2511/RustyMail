/** Search + list loader wire deps — barrel (list / UI). */
import { registerAppSearchWireListDeps } from "./appSearchWireRegistryListRun";
import { registerAppSearchWireUiDeps } from "./appSearchWireRegistryUiRun";

export function registerAppSearchWireDeps(): void {
  registerAppSearchWireListDeps();
  registerAppSearchWireUiDeps();
}
