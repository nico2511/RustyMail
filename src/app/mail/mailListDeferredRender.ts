import { render } from "../dispatch";
import { state } from "../state";

let deferredRenderRaf = 0;

/** Un seul rendu après compteurs filtre + brouillons (évite deux paints complets). */
export function scheduleMailListSecondaryRender(): void {
  if (typeof requestAnimationFrame !== "function") {
    if (state.view === "list") render();
    return;
  }
  if (deferredRenderRaf) cancelAnimationFrame(deferredRenderRaf);
  deferredRenderRaf = requestAnimationFrame(() => {
    deferredRenderRaf = 0;
    if (state.view === "list") render();
  });
}

export function resetMailListDeferredRenderForTests(): void {
  if (deferredRenderRaf) cancelAnimationFrame(deferredRenderRaf);
  deferredRenderRaf = 0;
}
