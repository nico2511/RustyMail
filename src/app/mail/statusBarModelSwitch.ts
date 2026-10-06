import { invoke } from "@tauri-apps/api/core";
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { engineConnectionMode } from "../../settingsAiPanel";
import { openSettingsView } from "./settingsOpenView";
import { persistAiPrefsFromDom } from "./settingsAiPrefsPersistDom";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import { statusBarActiveModelChip } from "./statusBarModelLabel";

const POPOVER_ID = "status-bar-model-popover";
const CACHE_TTL_MS = 30_000;

let cachedModels: { at: number; models: string[] } | null = null;
let outsideClickBound: ((ev: MouseEvent) => void) | null = null;
let keydownBound: ((ev: KeyboardEvent) => void) | null = null;

export function closeStatusBarModelPopover(): void {
  document.getElementById(POPOVER_ID)?.remove();
  if (outsideClickBound) {
    document.removeEventListener("mousedown", outsideClickBound, true);
    outsideClickBound = null;
  }
  if (keydownBound) {
    document.removeEventListener("keydown", keydownBound, true);
    keydownBound = null;
  }
}

function invalidateOllamaModelsCache(): void {
  cachedModels = null;
}

async function fetchOllamaModels(): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && now - cachedModels.at < CACHE_TTL_MS) {
    return cachedModels.models;
  }
  const models = await withTimeout(invoke<string[]>("list_ollama_models", {}), 8_000);
  cachedModels = { at: now, models };
  return models;
}

function positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const gap = 6;
  popover.style.left = `${Math.max(8, rect.left)}px`;
  popover.style.bottom = `${Math.max(8, window.innerHeight - rect.top + gap)}px`;
  popover.style.top = "auto";
}

function bindPopoverDismiss(popover: HTMLElement, anchor: HTMLElement): void {
  outsideClickBound = (ev: MouseEvent) => {
    const t = ev.target as Node | null;
    if (!t) return;
    if (popover.contains(t) || anchor.contains(t)) return;
    closeStatusBarModelPopover();
  };
  keydownBound = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") closeStatusBarModelPopover();
  };
  window.setTimeout(() => {
    if (outsideClickBound) document.addEventListener("mousedown", outsideClickBound, true);
    if (keydownBound) document.addEventListener("keydown", keydownBound, true);
  }, 0);
}

async function selectOllamaModel(model: string): Promise<void> {
  const name = model.trim();
  if (!name) return;
  closeStatusBarModelPopover();
  if (!isTauriRuntime()) {
    toast.warning("Changement de modèle : lancez l’app Tauri.");
    return;
  }
  state.appPrefs.ai.ollamaModel = name;
  state.appPrefs.ai.ollamaEnabled = true;
  try {
    await persistAiPrefsFromDom({ silent: true, skipDomCapture: true, skipRender: true });
    invalidateOllamaModelsCache();
    await refreshLlmRuntimeStatus(false);
    render();
  } catch (e) {
    toast.error(tauriErrorMessage(e));
  }
}

function renderPopoverHtml(models: string[], current: string, error: string | null): string {
  if (error) {
    return `<div class="status-bar-model-popover__head">Modèles Ollama</div>
      <p class="status-bar-model-popover__err dim">${escapeHtml(error)}</p>
      <button type="button" class="ghost-button status-bar-model-popover__settings" data-role="open-settings">Paramètres → IA</button>`;
  }
  if (models.length === 0) {
    return `<div class="status-bar-model-popover__head">Modèles Ollama</div>
      <p class="dim status-bar-model-popover__empty">Aucun modèle. Lancez <code>ollama pull …</code>.</p>
      <button type="button" class="ghost-button status-bar-model-popover__settings" data-role="open-settings">Paramètres → IA</button>`;
  }
  const items = models
    .map((m) => {
      const active = m === current;
      return `<button type="button" class="status-bar-model-popover__item${active ? " is-active" : ""}" data-model="${escapeAttr(m)}" role="option" aria-selected="${active ? "true" : "false"}">
        <span class="status-bar-model-popover__name">${escapeHtml(m)}</span>
        ${active ? `<span class="status-bar-model-popover__check" aria-hidden="true">✓</span>` : ""}
      </button>`;
    })
    .join("");
  return `<div class="status-bar-model-popover__head">Modèles Ollama</div>
    <div class="status-bar-model-popover__list" role="listbox">${items}</div>`;
}

function wirePopoverActions(popover: HTMLElement): void {
  popover.querySelectorAll<HTMLButtonElement>("[data-model]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void selectOllamaModel(btn.dataset.model ?? "");
    });
  });
  popover.querySelectorAll<HTMLButtonElement>('[data-role="open-settings"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      closeStatusBarModelPopover();
      openSettingsView({ settingsTab: "ai" });
    });
  });
}

async function openOllamaPopover(anchor: HTMLElement): Promise<void> {
  closeStatusBarModelPopover();
  const current = state.appPrefs.ai.ollamaModel.trim();
  const popover = document.createElement("div");
  popover.id = POPOVER_ID;
  popover.className = "status-bar-model-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Choisir un modèle Ollama");
  popover.innerHTML = `<div class="status-bar-model-popover__head">Modèles Ollama</div>
    <p class="dim status-bar-model-popover__empty">Chargement…</p>`;
  document.body.appendChild(popover);
  positionPopover(popover, anchor);
  bindPopoverDismiss(popover, anchor);

  let models: string[] = [];
  let error: string | null = null;
  try {
    if (!isTauriRuntime()) {
      error = "Liste Ollama disponible dans l’app Tauri.";
    } else {
      models = await fetchOllamaModels();
    }
  } catch (e) {
    error = tauriErrorMessage(e);
    invalidateOllamaModelsCache();
  }

  if (!document.body.contains(popover)) return;
  popover.innerHTML = renderPopoverHtml(models, current, error);
  positionPopover(popover, anchor);
  wirePopoverActions(popover);
}

/** Action barre de statut : popover Ollama ou Paramètres → IA. */
export async function openStatusBarModelSwitch(anchor?: HTMLElement | null): Promise<void> {
  const chip = statusBarActiveModelChip(state.appPrefs.ai);
  const mode = engineConnectionMode(state.appPrefs.ai);
  if (chip.ollamaSwitch || mode === "ollama") {
    const el =
      anchor ??
      document.querySelector<HTMLElement>('[data-action="status-bar-model-open"]');
    if (!el) {
      openSettingsView({ settingsTab: "ai" });
      return;
    }
    if (document.getElementById(POPOVER_ID)) {
      closeStatusBarModelPopover();
      return;
    }
    await openOllamaPopover(el);
    return;
  }
  closeStatusBarModelPopover();
  openSettingsView({ settingsTab: "ai" });
}
