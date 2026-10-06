/** Menu clic droit du compositeur : corriger / transformer / traduire la sélection. */

import { composeRewriteStyleFromTone, rewriteStyleLabelFr } from "../core/composeTone";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { state } from "../state";
import {
  captureComposeSelectionSnapshot,
  type ComposeSelectionSnapshot,
} from "./composeBodyEditor";
import { composeAiGrammar, composeAiRewrite, composeAiTranslate } from "./composeAiWireActions";
import {
  COMPOSE_TRANSLATE_LANGS,
  composeTranslateLangLabel,
  normalizeComposeTranslateLang,
} from "./composeTranslateLangs";

const MENU_ID = "compose-ai-context-menu";

function closeComposeAiContextMenu(): void {
  document.getElementById(MENU_ID)?.remove();
}

function placeMenu(menu: HTMLElement, clientX: number, clientY: number): void {
  const pad = 8;
  menu.style.left = `${Math.min(clientX, window.innerWidth - 240)}px`;
  menu.style.top = `${Math.min(clientY, window.innerHeight - 280)}px`;
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

function translateFeatureOn(): boolean {
  return (
    isAiFeatureEnabled(state.appPrefs.ai, "featureMessageTranslateEnabled") ||
    isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled")
  );
}

function translateMenuItemsHtml(mother: string): string {
  const motherLabel = composeTranslateLangLabel(mother);
  const others = COMPOSE_TRANSLATE_LANGS.filter((l) => l.code !== mother)
    .map(
      (l) =>
        `<button type="button" class="compose-ai-context-menu__item" data-ctx="translate" data-translate-lang="${l.code}" role="menuitem">Traduire en ${l.label}</button>`,
    )
    .join("");
  return `<div class="compose-ai-context-menu__sep" role="separator"></div>
    <button type="button" class="compose-ai-context-menu__item compose-ai-context-menu__item--primary" data-ctx="translate" data-translate-lang="${mother}" role="menuitem">Traduire (${motherLabel})</button>
    ${others}`;
}

export function wireComposeAiContextMenu(signal: AbortSignal): void {
  let pendingSelection: ComposeSelectionSnapshot | null = null;

  const onDocClick = () => {
    closeComposeAiContextMenu();
  };
  document.addEventListener("click", onDocClick, { signal });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        closeComposeAiContextMenu();
        pendingSelection = null;
      }
    },
    { signal },
  );

  document.addEventListener(
    "contextmenu",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const host = target.closest("#compose-body, .compose-tiptap__surface, .ProseMirror");
      if (!host || state.view !== "compose") return;
      if (target.closest("img, .compose-image-resize")) return;

      const snap = captureComposeSelectionSnapshot();
      if (!snap) return;

      const grammarOn = isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled");
      const rewriteOn = isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled");
      const translateOn = translateFeatureOn();
      if (!grammarOn && !rewriteOn && !translateOn) return;

      event.preventDefault();
      closeComposeAiContextMenu();
      pendingSelection = snap;

      const tone = composeRewriteStyleFromTone();
      const toneLabel = rewriteStyleLabelFr(tone);
      const mother = normalizeComposeTranslateLang(state.appPrefs.general.motherLanguage);
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
        translateOn ? translateMenuItemsHtml(mother) : "",
      ]
        .filter(Boolean)
        .join("");

      menu.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });

      menu.addEventListener("click", (e) => {
        const btn = (e.target as Element | null)?.closest<HTMLElement>("[data-ctx]");
        if (!btn) return;
        e.stopPropagation();
        const kind = btn.dataset.ctx;
        const selection = pendingSelection;
        pendingSelection = null;
        closeComposeAiContextMenu();
        if (!selection) return;
        if (kind === "grammar") void composeAiGrammar("selection", selection);
        else if (kind === "rewrite") void composeAiRewrite(tone, "selection", selection);
        else if (kind === "shorten") void composeAiRewrite("Concise", "selection", selection);
        else if (kind === "translate") {
          const lang = normalizeComposeTranslateLang(btn.dataset.translateLang || mother);
          void composeAiTranslate(lang, "selection", selection);
        }
      });

      document.body.appendChild(menu);
      placeMenu(menu, event.clientX, event.clientY);
    },
    { signal },
  );
}
