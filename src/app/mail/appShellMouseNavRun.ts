import { navCanGoForward } from "../../navigation";
import { goBack, goForward } from "./appNavigationStack";
import { mouseNavBlockedByOverlay } from "./appShellInputGuards";

export function bindMouseNavigation(): void {
  const handleMouseNav = (event: MouseEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (mouseNavBlockedByOverlay()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 3) void goBack();
    else if (navCanGoForward()) void goForward();
  };

  document.addEventListener("auxclick", handleMouseNav, { capture: true });
  document.addEventListener(
    "mouseup",
    (event) => {
      if (event.button !== 3 && event.button !== 4) return;
      if (event.defaultPrevented) return;
      handleMouseNav(event);
    },
    { capture: true },
  );
}
