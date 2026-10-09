import { DB_LOCKED_MESSAGE, tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
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
    const detail = tauriErrorMessage(error);
    if (detail.includes("Base verrouillée")) {
      state.dbLockedMessage = DB_LOCKED_MESSAGE;
      render();
      return;
    }
    const msg = `boot failed: ${detail}`;
    render();
    toast(msg);
  }
}
