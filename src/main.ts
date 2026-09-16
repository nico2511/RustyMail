import { boot, bindTauriNativeFileDropAsync } from "./app/application";

boot();

window.addEventListener(
  "load",
  () => window.setTimeout(() => void bindTauriNativeFileDropAsync(), 0),
  { once: true },
);
