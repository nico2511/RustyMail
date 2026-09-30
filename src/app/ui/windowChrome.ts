import { isTauriRuntime } from "../lib/tauriRuntime";

export type WindowChromeEnv = {
  tauri: boolean;
  platform: string;
  userAgent: string;
  uaPlatform?: string;
  search: string;
  dev: boolean;
};

/** Bureau Windows (décorations natives déjà coupées) ou aperçu `?windowChrome=1` en dev. */
export function integratedWindowChromeEnabled(env: WindowChromeEnv): boolean {
  const windows =
    /^Win/i.test(env.platform) ||
    /Windows/i.test(env.userAgent) ||
    /^Win/i.test(env.uaPlatform ?? "");
  if (env.tauri && windows) return true;
  if (env.dev && new URLSearchParams(env.search).get("windowChrome") === "1") return true;
  return false;
}

export function shouldShowIntegratedWindowChrome(): boolean {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const uaData = nav as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  return integratedWindowChromeEnabled({
    tauri: isTauriRuntime(),
    platform: nav?.platform ?? "",
    userAgent: nav?.userAgent ?? "",
    uaPlatform: uaData?.userAgentData?.platform ?? "",
    search: typeof location !== "undefined" ? location.search : "",
    dev: Boolean(import.meta.env.DEV),
  });
}

let maximized = false;

export function windowChromeMaximized(): boolean {
  return maximized;
}

function glyph(paths: string): string {
  return `<svg class="window-chrome__glyph" width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export function windowChromeMinimizeGlyph(): string {
  return glyph(`<path d="M1.4 5h7.2" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>`);
}

export function windowChromeMaximizeGlyph(): string {
  return glyph(
    `<rect x="1.35" y="1.35" width="7.3" height="7.3" stroke="currentColor" stroke-width="1.15"/>`,
  );
}

export function windowChromeRestoreGlyph(): string {
  return glyph(
    `<path d="M3.1 1.4h5.5V6.9M1.4 3.1h5.5v5.5H1.4V3.1Z" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>`,
  );
}

export function windowChromeCloseGlyph(): string {
  return glyph(
    `<path d="M2.1 2.1 7.9 7.9M7.9 2.1 2.1 7.9" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>`,
  );
}

/** Met à jour l’icône Agrandir / Restaurer sans reconstruire le shell. */
export function setWindowChromeMaximized(next: boolean): void {
  maximized = next;
  const btn = document.querySelector<HTMLButtonElement>('[data-action="window-toggle-maximize"]');
  if (!btn) return;
  const label = next ? "Restaurer" : "Agrandir";
  btn.classList.toggle("is-maximized", next);
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", next ? "true" : "false");
  btn.innerHTML = next ? windowChromeRestoreGlyph() : windowChromeMaximizeGlyph();
}

export function renderWindowChromeHtml(opts: { maximized: boolean }): string {
  const maxLabel = opts.maximized ? "Restaurer" : "Agrandir";
  return `<header class="window-chrome">
    <div class="window-chrome__drag" data-tauri-drag-region></div>
    <div class="window-chrome__controls" role="group" aria-label="Fenêtre">
      <button type="button" class="window-chrome__btn" data-action="window-minimize" aria-label="Réduire" title="Réduire" tabindex="-1">${windowChromeMinimizeGlyph()}</button>
      <button type="button" class="window-chrome__btn${opts.maximized ? " is-maximized" : ""}" data-action="window-toggle-maximize" aria-label="${maxLabel}" title="${maxLabel}" aria-pressed="${opts.maximized ? "true" : "false"}" tabindex="-1">${opts.maximized ? windowChromeRestoreGlyph() : windowChromeMaximizeGlyph()}</button>
      <button type="button" class="window-chrome__btn window-chrome__btn--close" data-action="window-close" aria-label="Fermer" title="Fermer" tabindex="-1">${windowChromeCloseGlyph()}</button>
    </div>
  </header>`;
}
