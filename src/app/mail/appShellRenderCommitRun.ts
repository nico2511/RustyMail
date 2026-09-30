/**
 * Met à jour le shell sans détacher les régions dont le HTML n’a pas changé.
 * `root.innerHTML = …` recréait sidebar, barre d’état et colonne de lecture à
 * chaque rendu : à la première ouverture (lu IMAP, compteurs, complément
 * sécurité) WebKit rejouait tout l’écran. Ici seul le nœud qui change est
 * remplacé. La colonne de lecture déjà à l’écran reste en place ; si son HTML
 * change, les corps HTML déjà hydratés (shadow) sont réinsérés.
 */

let lastThreadMainHtml = "";
let lastCommittedFullHtml = "";

export function resetAppShellMainCache(): void {
  lastThreadMainHtml = "";
  lastCommittedFullHtml = "";
}

export type ShellCommitResult = {
  domChanged: boolean;
};

function shellSlotBase(el: HTMLElement): string {
  if (el.classList.contains("noise")) return "noise";
  if (el.tagName === "MAIN") return "main";
  if (el.classList.contains("sidebar")) return "sidebar";
  if (el.classList.contains("ai-panel")) return "ai-panel";
  if (el.classList.contains("status-bar-wrap")) return "status";
  const aria = el.getAttribute("aria-label")?.trim();
  const cls = [...el.classList].join(".");
  return `${el.tagName}:${aria || cls || "node"}`;
}

function assignSlots(elements: HTMLElement[]): Map<HTMLElement, string> {
  const seen = new Map<string, number>();
  const slots = new Map<HTMLElement, string>();
  for (const el of elements) {
    const base = shellSlotBase(el);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slots.set(el, n === 0 ? base : `${base}#${n}`);
  }
  return slots;
}

function sameMailHost(previous: HTMLElement, incoming: HTMLElement): boolean {
  if ((previous.dataset.messageId ?? "") !== (incoming.dataset.messageId ?? "")) return false;
  if ((previous.dataset.emailHtmlB64 ?? "") !== (incoming.dataset.emailHtmlB64 ?? "")) return false;
  if ((previous.dataset.emailHtml ?? "") !== (incoming.dataset.emailHtml ?? "")) return false;
  const prevClean = previous.classList.contains("message-html--clean");
  const nextClean = incoming.classList.contains("message-html--clean");
  return prevClean === nextClean;
}

/** Déplace le shadow déjà peint dans le nouveau HTML du fil (pas de rechargement d’images). */
export function adoptHydratedMailHosts(previousMain: HTMLElement, incomingMain: HTMLElement): void {
  const scrollTop = previousMain.querySelector<HTMLElement>(".thread-messages")?.scrollTop ?? 0;
  const previousHosts = [...previousMain.querySelectorAll<HTMLElement>(".message-html")];
  for (const host of previousHosts) {
    if (!host.shadowRoot) continue;
    const messageId = host.dataset.messageId ?? "";
    if (!messageId) continue;
    const dest = [...incomingMain.querySelectorAll<HTMLElement>(".message-html")].find((node) =>
      sameMailHost(host, node),
    );
    if (!dest || dest === host) continue;
    dest.replaceWith(host);
  }
  const scroller = incomingMain.querySelector<HTMLElement>(".thread-messages");
  if (scroller && scrollTop > 0) scroller.scrollTop = scrollTop;
}

function reconcileElements(parent: HTMLElement, next: HTMLElement[]): boolean {
  const current = [...parent.children] as HTMLElement[];
  if (current.length === next.length && current.every((node, index) => node === next[index])) return false;

  const keep = new Set(next);
  for (const el of current) {
    if (!keep.has(el)) el.remove();
  }
  for (let i = 0; i < next.length; i++) {
    const node = next[i];
    if (!node) continue;
    if (parent.children[i] === node) continue;
    parent.insertBefore(node, parent.children[i] ?? null);
  }
  return true;
}

export function commitAppShellHtml(
  root: HTMLElement,
  fullHtml: string,
  mainHtml: string,
  parkThreadMain: boolean,
): ShellCommitResult {
  if (fullHtml === lastCommittedFullHtml && root.childElementCount > 0) {
    if (parkThreadMain) lastThreadMainHtml = mainHtml;
    else lastThreadMainHtml = "";
    return { domChanged: false };
  }

  const template = document.createElement("template");
  template.innerHTML = fullHtml;
  const incoming = [...template.content.children] as HTMLElement[];
  const existing = [...root.children] as HTMLElement[];
  const existingBySlot = new Map<string, HTMLElement>();
  const existingSlots = assignSlots(existing);
  for (const el of existing) {
    const slot = existingSlots.get(el);
    if (slot) existingBySlot.set(slot, el);
  }
  const incomingSlots = assignSlots(incoming);
  const keepMain =
    parkThreadMain && mainHtml.length > 0 && mainHtml === lastThreadMainHtml;

  const next = incoming.map((el) => {
    const slot = incomingSlots.get(el);
    const prev = slot ? existingBySlot.get(slot) : undefined;
    if (!prev) return el;
    if (el.tagName === "MAIN" && prev.tagName === "MAIN" && keepMain) return prev;
    if (el.tagName !== "MAIN" && prev.outerHTML === el.outerHTML) return prev;
    return el;
  });

  const previousMain = existing.find((el) => el.tagName === "MAIN") ?? null;
  const nextMain = next.find((el) => el.tagName === "MAIN") ?? null;
  const readingScroll =
    previousMain && nextMain && previousMain !== nextMain
      ? (previousMain.querySelector<HTMLElement>(".thread-messages")?.scrollTop ?? 0)
      : 0;
  if (previousMain && nextMain && previousMain !== nextMain) {
    adoptHydratedMailHosts(previousMain, nextMain);
  }

  const domChanged = reconcileElements(root, next);
  if (readingScroll > 0) {
    const scroller = root.querySelector<HTMLElement>("main.main .thread-messages");
    if (scroller) scroller.scrollTop = readingScroll;
  }
  if (parkThreadMain) lastThreadMainHtml = mainHtml;
  else lastThreadMainHtml = "";
  lastCommittedFullHtml = fullHtml;
  return { domChanged };
}
