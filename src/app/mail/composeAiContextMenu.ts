/** Menu clic droit du compositeur : corriger / transformer la sélection. */

import { composeRewriteStyleFromTone, rewriteStyleLabelFr } from "../core/composeTone";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { state } from "../state";
import { hasComposeTextSelection } from "./composeBodyEditor";
import { composeAiGrammar, composeAiRewrite } from "./composeAiWireActions";

const MENU_ID = "compose-ai-context-menu";

function closeComposeAiContextMenu(): void {
  document.getElementById(MENU_ID)?.remove();
}

function placeMenu(menu: HTMLElement, clientX: number, clientY: number): void {
  const pad = 8;
  menu.style.left = `${Math.min(clientX, window.innerWidth - 220)}px`;
  menu.style.top = `${Math.min(clientY, window.innerHeight - 160)}px`;
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - pad) {
      menu.style.left = `${Math.max(pad, window.innerWidth - rect.width - pad)}px`;
    }
    if (rect.bottom > window.innerHeight - pad) {
      menu.style.top = `${Math.max(pad, window.innerHeight - rect.height - pad)}px`;
    }
  });
}

export function wireComposeAiContextMenu(signal: AbortSignal): void {
  const onDocClick = () => closeComposeAiContextMenu();
  document.addEventListener("click", onDocClick, { signal });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeComposeAiContextMenu();
  }, { signal });

  document.addEventListener(
    "contextmenu",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const host = target.closest("#compose-body, .compose-tiptap__surface, .ProseMirror");
      if (!host || state.view !== "compose") return;
      if (target.closest("img, .compose-image-resize")) return;
      if (!hasComposeTextSelection()) return;

      const grammarOn = isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled");
      const rewriteOn = isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled");
      if (!grammarOn && !rewriteOn) return;

      event.preventDefault();
      closeComposeAiContextMenu();

      const tone = composeRewriteStyleFromTone();
      const toneLabel = rewriteStyleLabelFr(tone);
      const menu = document.createElement("div");
      menu.id = MENU_ID;
      menu.className = "compose-ai-context-menu";
      menu.setAttribute("role", "menu");
      menu.innerHTML = [
        grammarOn
          ? `<button type="button" class="compose-ai-context-menu__item" data-ctx="grammar" role="menuitem">Corriger la sélection</button>`
          : "",
        rewriteOn
          ? `<button type="button" class="compose-ai-context-menu__item" data-ctx="rewrite" role="menuitem">Réécrire (${toneLabel})</button>
             <button type="button" class="compose-ai-context-menu__item" data-ctx="shorten" role="menuitem">Raccourcir la sélection</button>`
          : "",
      ]
        .filter(Boolean)
        .join("");

      menu.addEventListener("click", (e) => {
        const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-ctx]");
        if (!btn) return;
        e.stopPropagation();
        closeComposeAiContextMenu();
        const kind = btn.dataset.ctx;
        if (kind === "grammar") void composeAiGrammar("selection");
        else if (kind === "rewrite") void composeAiRewrite(tone, "selection");
        else if (kind === "shorten") void composeAiRewrite("Concise", "selection");
      });

      document.body.appendChild(menu);
      placeMenu(menu, event.clientX, event.clientY);
    },
    { signal },
  );
}
