/** Thread / mailbox list wire deps — barrel (open thread / mailbox actions). */
import { registerAppThreadWireMailboxDeps } from "./appThreadWireRegistryMailboxRun";
import { registerAppThreadWireOpenDeps } from "./appThreadWireRegistryOpenRun";

export function registerAppThreadWireDeps(): void {
  registerAppThreadWireOpenDeps();
  registerAppThreadWireMailboxDeps();
}
