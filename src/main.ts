import { boot } from "./app/application";
import { bindTauriNativeFileDropAsync } from "./app/mail/composeTauriNativeFileDrop";

boot();

window.addEventListener(
  "load",
  () => window.setTimeout(() => void bindTauriNativeFileDropAsync(), 0),
  { once: true },
);
