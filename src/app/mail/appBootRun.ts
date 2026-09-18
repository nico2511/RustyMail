import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { bootLoadAccountsAndImapPush } from "./appBootAccountsRun";
import { bootDeferredLlmStatusAndPrefetch } from "./appBootLlmDeferRun";
import { bootLoadInitialMailData } from "./appBootMailDataRun";
import { bootInitShellAndRuntime } from "./appBootRuntimeRun";

export async function boot(): Promise<void> {
  try {
    await bootInitShellAndRuntime();
    await bootLoadAccountsAndImapPush();
    await bootLoadInitialMailData();
    await bootDeferredLlmStatusAndPrefetch();
  } catch (error) {
    const msg = `boot failed: ${tauriErrorMessage(error)}`;
    render();
    toast(msg);
  }
}
