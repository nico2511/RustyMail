import "./styles.css";

import { applyAppearanceFromPrefs, ensureAppearanceSystemListener } from "./appearance";
import { registerAllAppModules } from "./app/mail/appModuleRegistry";
import { boot } from "./app/mail/appBootRun";
import { bindTauriNativeFileDropAsync } from "./app/mail/composeTauriNativeFileDrop";
import { defaultAppPrefs } from "./prefs_defaults";
import { state } from "./app/state";

applyAppearanceFromPrefs(defaultAppPrefs().general);
ensureAppearanceSystemListener(() => applyAppearanceFromPrefs(state.appPrefs.general));

registerAllAppModules();
void boot();

window.addEventListener(
  "load",
  () => window.setTimeout(() => void bindTauriNativeFileDropAsync(), 0),
  { once: true },
);
