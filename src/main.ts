import "./styles.css";

import { registerAllAppModules } from "./app/mail/appModuleRegistry";
import { boot } from "./app/mail/appBootRun";
import { bindTauriNativeFileDropAsync } from "./app/mail/composeTauriNativeFileDrop";

registerAllAppModules();
void boot();

window.addEventListener(
  "load",
  () => window.setTimeout(() => void bindTauriNativeFileDropAsync(), 0),
  { once: true },
);
