/** Notifications discrètes (coin haut-droite). Pas de HTML dans le message. */

export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  /** Durée d’affichage. `0` laisse le toast jusqu’au dismiss. */
  durationMs?: number;
  action?: ToastAction;
};

export type ToastShow = (message: string, durationOrOptions?: number | ToastOptions) => void;

export type ToastApi = {
  /** Infère le type depuis le texte (messages dynamiques). */
  (message: string, durationMs?: number): void;
  info: ToastShow;
  success: ToastShow;
  warning: ToastShow;
  error: ToastShow;
};

const MAX_TOAST_STACK = 6;

const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  success: 3400,
  info: 4600,
  warning: 8000,
  error: 0,
};

const EXIT_MS = 180;

type LiveToast = {
  pause: () => void;
  resume: () => void;
  dismiss: (immediate?: boolean) => void;
};

const live = new Map<HTMLElement, LiveToast>();

function host(): HTMLDivElement {
  let box = document.querySelector<HTMLDivElement>("#toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.className = "toast-box";
    document.body.appendChild(box);
  }
  return box;
}

function evictOldest(box: HTMLElement) {
  while (box.children.length >= MAX_TOAST_STACK) {
    const oldest = box.firstElementChild as HTMLElement | null;
    if (!oldest) return;
    live.get(oldest)?.dismiss(true);
    if (oldest.isConnected) oldest.remove();
  }
}

function resolveDuration(kind: ToastKind, durationOrOptions?: number | ToastOptions): number {
  const raw =
    typeof durationOrOptions === "number"
      ? durationOrOptions
      : durationOrOptions?.durationMs;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  return DEFAULT_DURATION_MS[kind];
}

function resolveAction(durationOrOptions?: number | ToastOptions): ToastAction | undefined {
  if (!durationOrOptions || typeof durationOrOptions === "number") return undefined;
  const action = durationOrOptions.action;
  if (!action || !action.label.trim()) return undefined;
  return action;
}

function iconSvg(kind: ToastKind): string {
  const common = 'viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none"';
  if (kind === "success") {
    return `<svg ${common}><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.25"/><path d="M5.1 8.15 7.05 10.1 10.9 5.9" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (kind === "warning") {
    return `<svg ${common}><path d="M8 2.4 14.1 13.1H1.9L8 2.4Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><path d="M8 6.3v3.2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><circle cx="8" cy="11.15" r="0.7" fill="currentColor"/></svg>`;
  }
  if (kind === "error") {
    return `<svg ${common}><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.25"/><path d="M5.6 5.6 10.4 10.4M10.4 5.6 5.6 10.4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>`;
  }
  return `<svg ${common}><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.25"/><path d="M8 7.15V11" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><circle cx="8" cy="5.15" r="0.7" fill="currentColor"/></svg>`;
}

const CLOSE_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none"><path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>';

function show(message: string, kind: ToastKind, durationOrOptions?: number | ToastOptions) {
  if (!message.trim()) return;
  const box = host();
  evictOldest(box);

  const element = document.createElement("div");
  element.className = `toast toast--${kind}`;
  element.dataset.toastKind = kind;
  element.setAttribute("role", kind === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast__icon";
  icon.innerHTML = iconSvg(kind);

  const main = document.createElement("div");
  main.className = "toast__main";
  const text = document.createElement("p");
  text.className = "toast__text";
  text.textContent = message;
  main.appendChild(text);

  const action = resolveAction(durationOrOptions);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast__action";
    button.textContent = action.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      action.onClick();
      dismiss();
    });
    main.appendChild(button);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast__close";
  close.setAttribute("aria-label", "Fermer");
  close.innerHTML = CLOSE_SVG;
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    dismiss();
  });

  element.append(icon, main, close);
  box.appendChild(element);

  const duration = resolveDuration(kind, durationOrOptions);
  let remaining = duration;
  let started = 0;
  let timer = 0;
  let closed = false;

  function arm(ms: number) {
    if (ms <= 0) return;
    remaining = ms;
    started = performance.now();
    timer = window.setTimeout(() => dismiss(), ms);
  }

  function pause() {
    if (closed || timer === 0) return;
    window.clearTimeout(timer);
    timer = 0;
    remaining -= performance.now() - started;
    if (remaining < 0) remaining = 0;
  }

  function resume() {
    if (closed || duration <= 0) return;
    if (remaining <= 0) {
      dismiss();
      return;
    }
    arm(remaining);
  }

  function dismiss(immediate = false) {
    if (closed) return;
    closed = true;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    live.delete(element);
    if (immediate) {
      element.remove();
      return;
    }
    element.classList.add("toast--out");
    const remove = () => {
      element.remove();
    };
    element.addEventListener("animationend", remove, { once: true });
    window.setTimeout(remove, EXIT_MS + 40);
  }

  element.addEventListener("mouseenter", pause);
  element.addEventListener("mouseleave", resume);
  element.addEventListener("click", () => dismiss());
  live.set(element, { pause, resume, dismiss });
  arm(duration);
}

function call(kind: ToastKind, message: string, durationOrOptions?: number | ToastOptions) {
  show(message, kind, durationOrOptions);
}

/** Classe un message libre (compte, sync, assistant) sans type explicite. */
export function inferToastKind(message: string): ToastKind {
  const s = message.toLowerCase();
  const recovered = /conservée|restent actives/.test(s);
  const hard =
    /impossible|échou|échec|invalide|introuvable|inaccessible|interrompu/.test(s) ||
    /[1-9]\d*\s*erreurs?\b/.test(s);
  if (hard && !recovered) return "error";
  if (/^(portée|dossier|compte|tag|information)\s*:/.test(s)) return "info";
  if (/mise à jour\b/.test(s) && /disponible/.test(s)) return "info";
  if (/…|\.\.\.|en cours/.test(s)) return "info";
  if (/— lancez|– lancez/.test(s) && /ajout[eé]|enregistr[eé]/.test(s)) return "success";

  const blocked =
    /lancez|\blance\b|requiert|requis(?:e|es)?(?![a-zà-ÿ])|disponible|configurez|activez|désactiv|exécutez|\bouvre[zr]?\b|\bouvrir\b|choisissez|collez|saisissez|renseignez|indiquez|enregistrez|sélectionne|occup[eé]|indisponible|inutile|déjà vide|uniquement|pas pour |absent|absente|manquant|au moins|pas utilisable|est vide|incomplet|vérifiez|verifiez|volumineux|reformulez|not implemented|partiel|annul|en erreur|n’existe plus|n'existe plus|ne s’appliquent|ne s'appliquent|doit être|filtrez|illisible|pas plusieurs|pas de synchronisation|sans contenu|utilisez|ignoré|aucun|aucune|application bureau|navigateur seul/.test(
      s,
    );
  if (blocked) return "warning";

  const ok =
    /enregistr[eé]e?s?(?![a-zà-ÿ])|ajout[eé]e?s?(?![a-zà-ÿ])|synchronisé(?![a-zà-ÿ])|prêts?(?![a-zà-ÿ])|prête|déplac[eé]e?s?(?![a-zà-ÿ])|archiv[eé]e?s?(?![a-zà-ÿ])|supprim[eé]e?s?(?![a-zà-ÿ])|envoy[eé]e?s?(?![a-zà-ÿ])|réécrit(?![a-zà-ÿ])|copié|créé|renomm[eé]|exporté|importé|termin[eé]e?s?(?![a-zà-ÿ])|activées?(?![a-zà-ÿ])|détecté|à jour|retir[eé]e?s?(?![a-zà-ÿ])|marquée|traduit|inséré|repris|downloaded|opened|conservé|désarchivé|réindexé|réintégré|exclu de|appliqué|effectuée|reportée|test micro ok|profil ia chargé/.test(
      s,
    );
  if (ok && !/recherche appliquée/.test(s)) return "success";
  return "info";
}

function toastBase(message: string, durationMs?: number) {
  show(message, inferToastKind(message), durationMs);
}

export const toast: ToastApi = Object.assign(toastBase, {
  info: (message: string, durationOrOptions?: number | ToastOptions) =>
    call("info", message, durationOrOptions),
  success: (message: string, durationOrOptions?: number | ToastOptions) =>
    call("success", message, durationOrOptions),
  warning: (message: string, durationOrOptions?: number | ToastOptions) =>
    call("warning", message, durationOrOptions),
  error: (message: string, durationOrOptions?: number | ToastOptions) =>
    call("error", message, durationOrOptions),
});
