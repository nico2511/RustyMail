import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { setWindowChromeMaximized, shouldShowIntegratedWindowChrome } from "../ui/windowChrome";

function isWindowsPlatformFromNav(): boolean {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const uaData = nav as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  const platform = nav?.platform ?? "";
  const userAgent = nav?.userAgent ?? "";
  const uaPlatform = uaData?.userAgentData?.platform ?? "";
  return /^Win/i.test(platform) || /Windows/i.test(userAgent) || /^Win/i.test(uaPlatform);
}

async function syncMaximizedFromOs(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    setWindowChromeMaximized(await getCurrentWindow().isMaximized());
  } catch (error) {
    console.error("window chrome", error);
  }
}

let bound = false;

/** Écoute le redimensionnement OS pour basculer Agrandir / Restaurer. */
export async function bindWindowChrome(): Promise<void> {
  if (bound || !isTauriRuntime() || !isWindowsPlatformFromNav()) return;
  if (!shouldShowIntegratedWindowChrome()) return;
  bound = true;
  try {
    const win = getCurrentWindow();
    await syncMaximizedFromOs();
    await win.onResized(() => {
      void syncMaximizedFromOs();
    });
  } catch (error) {
    bound = false;
    console.error("window chrome", error);
  }
}

export async function tryHandleWindowChrome(action: string): Promise<boolean> {
  switch (action) {
    case "window-minimize":
    case "window-toggle-maximize":
    case "window-close":
      break;
    default:
      return false;
  }
  if (!isTauriRuntime()) return true;
  try {
    const win = getCurrentWindow();
    if (action === "window-minimize") await win.minimize();
    else if (action === "window-close") await win.close();
    else {
      await win.toggleMaximize();
      setWindowChromeMaximized(await win.isMaximized());
    }
  } catch (error) {
    console.error("window chrome", error);
  }
  return true;
}
