import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { bootLoadAccountsAndImapPush } from "./appBootAccountsRun";
import { bootDeferredLlmStatusAndPrefetch } from "./appBootLlmDeferRun";
import { bootLoadInitialMailData } from "./appBootMailDataRun";
import { bootInitShellAndRuntime } from "./appBootRuntimeRun";
import { quietStartupUpdateCheck } from "./desktopUpdate";

export async function boot(): Promise<void> {
  try {
    await bootInitShellAndRuntime();
    await bootLoadAccountsAndImapPush();
    await bootLoadInitialMailData();
    await bootDeferredLlmStatusAndPrefetch();
    quietStartupUpdateCheck();
  } catch (error) {
    const msg = `boot failed: ${tauriErrorMessage(error)}`;
    render();
    toast(msg);
  }
}
