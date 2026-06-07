/** Pile de navigation interne (retour contextuel, sans History API). */

export type AppView =
  | "list"
  | "thread"
  | "compose"
  | "settings"
  | "contacts"
  | "contact"
  | "organization"
  | "organizationV2"
  | "folderManager";

export type NavListFilter = "all" | "unread" | "starred" | "focused" | "auto";

export type NavSettingsTab =
  | "accounts"
  | "general"
  | "appearance"
  | "autoSenders"
  | "ai"
  | "addressBook"
  | "storage"
  | "shortcuts"
  | "developer";

export type NavSnapshot = {
  view: AppView;
  /** Libellé du bouton retour vers cet écran (ex. « Carnet », « Réception »). */
  backLabel: string;
  /** Segments fil d'Ariane pour cet écran. */
  breadcrumb: string[];
  selectedThreadId?: string;
  selectedContactEmail?: string;
  settingsTab?: NavSettingsTab;
  selectedMailbox?: string;
  search?: string;
  searchDraft?: string;
  searchSenders?: string[];
  listFilter?: NavListFilter;
  searchScope?: "account" | "mailbox";
  searchNlMode?: "lexical" | "semantic" | "hybrid" | null;
  contactsListQuery?: string;
  contactsKeywordDraft?: string;
  listScrollY?: number;
  contactsScrollY?: number;
  aiOpen?: boolean;
  /** Dossier sélectionné dans la vue Dossiers (null = arbre seul). */
  folderManagerSelectedMailbox?: string | null;
};

const MAX_DEPTH = 40;
const backStack: NavSnapshot[] = [];
const forwardStack: NavSnapshot[] = [];

let pendingScroll: { listScrollY?: number; contactsScrollY?: number } | null = null;

export function navReset(): void {
  backStack.length = 0;
  forwardStack.length = 0;
}

export function navClearForward(): void {
  forwardStack.length = 0;
}

/** Nouvelle navigation (efface la pile « avant »). */
export function navPush(snapshot: NavSnapshot): void {
  navClearForward();
  navPushBackEntry(snapshot);
}

/** Retour arrière dans la pile « retour » sans toucher à « avant » (bouton Avancer). */
export function navPushBackEntry(snapshot: NavSnapshot): void {
  backStack.push(snapshot);
  if (backStack.length > MAX_DEPTH) backStack.shift();
}

export function navPop(): NavSnapshot | undefined {
  return backStack.pop();
}

export function navPushForward(snapshot: NavSnapshot): void {
  forwardStack.push(snapshot);
  if (forwardStack.length > MAX_DEPTH) forwardStack.shift();
}

export function navPopForward(): NavSnapshot | undefined {
  return forwardStack.pop();
}

export function navPeek(): NavSnapshot | undefined {
  return backStack[backStack.length - 1];
}

export function navCanGoBack(): boolean {
  return backStack.length > 0;
}

export function navCanGoForward(): boolean {
  return forwardStack.length > 0;
}

export function navBackLabel(fallback = "Boîte de réception"): string {
  const prev = navPeek();
  if (!prev?.backLabel) return fallback;
  return prev.backLabel.startsWith("←") ? prev.backLabel : `← ${prev.backLabel}`;
}

export type NavBreadcrumbTarget = "inbox" | "stack" | "current";

export type NavBreadcrumbItem = {
  label: string;
  target: NavBreadcrumbTarget;
  /** Index dans la pile « retour » (`-1` = boîte / inbox). */
  stackIndex?: number;
};

const SECONDARY_VIEWS: AppView[] = [
  "contacts",
  "contact",
  "settings",
  "organization",
  "organizationV2",
  "folderManager",
];

function navParentLeafLabel(): string | null {
  const prev = navPeek();
  if (!prev) return null;
  const trail = prev.breadcrumb.filter(Boolean);
  if (trail.length) return trail[trail.length - 1]!;
  return prev.backLabel?.replace(/^←\s*/, "").trim() || null;
}

function navInboxCrumbLabel(): string {
  const listSnap = backStack.find((s) => s.view === "list");
  if (listSnap) {
    const trail = listSnap.breadcrumb.filter(Boolean);
    const last = trail[trail.length - 1]?.trim();
    if (last) return last;
    const bl = listSnap.backLabel?.replace(/^←\s*/, "").trim();
    if (bl) return bl;
  }
  return "Boîte de réception";
}

/** Segments cliquables ; n’affiche pas l’écran cible du bouton « Retour » (évite Réception ×2). */
export function navBuildBreadcrumbItems(currentLabel: string): NavBreadcrumbItem[] {
  const items: NavBreadcrumbItem[] = [];
  const parentLeaf = navParentLeafLabel();
  const hasSecondaryInStack = backStack.some((s) => SECONDARY_VIEWS.includes(s.view));
  /** Racine boîte seulement s’il y a au moins un écran intermédiaire (sinon le bouton Retour suffit). */
  const needsInboxCrumb = hasSecondaryInStack && backStack.length > 1;

  const push = (label: string, target: NavBreadcrumbTarget, stackIndex?: number) => {
    const t = label.trim();
    if (!t || t === parentLeaf) return;
    if (items[items.length - 1]?.label === t) return;
    items.push({ label: t, target, stackIndex });
  };

  if (needsInboxCrumb) push(navInboxCrumbLabel(), "inbox", -1);

  for (let i = 0; i < backStack.length; i++) {
    const snap = backStack[i];
    for (const label of snap.breadcrumb) {
      if (needsInboxCrumb && snap.view === "list") continue;
      if (label === "Boîte" && needsInboxCrumb) continue;
      push(label, "stack", i);
    }
  }

  push(currentLabel, "current");
  return items;
}

/**
 * Saute à un écran de la pile « retour » ; les écrans sautés vont dans « avant ».
 * `stackIndex === -1` : géré par l’appelant (`navigateToInbox`).
 */
export function navJumpToStackIndex(
  stackIndex: number,
  currentSnapshot: NavSnapshot
): NavSnapshot | null {
  if (stackIndex < 0 || stackIndex >= backStack.length) return null;
  const target = backStack[stackIndex];
  const forwardTail = [currentSnapshot, ...backStack.slice(stackIndex + 1)];
  backStack.length = stackIndex;
  navClearForward();
  for (let i = forwardTail.length - 1; i >= 0; i--) navPushForward(forwardTail[i]!);
  return target;
}

export function navRenderBreadcrumbHtml(
  currentLabel: string,
  escHtml: (s: string) => string,
  escAttr: (s: string) => string
): string {
  const items = navBuildBreadcrumbItems(currentLabel);
  if (items.length < 2) return "";
  const inner = items
    .map((item, i) => {
      const sep = i > 0 ? `<span class="nav-crumb-sep" aria-hidden="true">›</span>` : "";
      if (item.target === "current") {
        return `${sep}<span class="nav-crumb nav-crumb--current" aria-current="page">${escHtml(item.label)}</span>`;
      }
      const idx = item.stackIndex ?? -1;
      const title = idx < 0 ? "Retour à la boîte de réception" : `Retour à ${item.label}`;
      return `${sep}<button type="button" class="nav-crumb-btn" data-action="nav-crumb" data-nav-index="${escAttr(String(idx))}" title="${escAttr(title)}">${escHtml(item.label)}</button>`;
    })
    .join("");
  return `<nav class="nav-breadcrumb dim" aria-label="Fil de navigation">${inner}</nav>`;
}

export type NavTrailRenderOpts = {
  /** Classes supplémentaires sur `.thread-reading-nav` (ex. `secondary-view-nav`). */
  navClass?: string;
  /** Boutons à droite du fil (`.thread-reading-nav-actions`). */
  actionsHtml?: string;
};

/** Retour + fil d’Ariane (+ actions optionnelles) — même structure partout. */
export function navRenderTrailHtml(
  currentLabel: string,
  escHtml: (s: string) => string,
  escAttr: (s: string) => string,
  opts: NavTrailRenderOpts = {}
): string {
  const navClass = ["thread-reading-nav", opts.navClass?.trim()].filter(Boolean).join(" ");
  const actions = opts.actionsHtml?.trim()
    ? `<div class="thread-reading-nav-actions">${opts.actionsHtml}</div>`
    : "";
  return `<div class="${navClass}">
      <div class="thread-reading-nav__trail">
        <button type="button" class="thread-back-link" data-action="back">${escHtml(navBackLabel())}</button>
        ${navRenderBreadcrumbHtml(currentLabel, escHtml, escAttr)}
      </div>
      ${actions}
    </div>`;
}

export function navQueueScrollRestore(snap: NavSnapshot): void {
  pendingScroll = {
    listScrollY: snap.listScrollY,
    contactsScrollY: snap.contactsScrollY,
  };
}

export function navApplyPendingScrollRestore(): void {
  const p = pendingScroll;
  if (!p) return;
  pendingScroll = null;
  if (p.listScrollY != null && p.listScrollY > 0) {
    const el = document.querySelector<HTMLElement>(".inbox-thread-list");
    if (el) el.scrollTop = p.listScrollY;
  }
  if (p.contactsScrollY != null && p.contactsScrollY > 0) {
    const el = document.querySelector<HTMLElement>("#contacts-thread-list");
    if (el) el.scrollTop = p.contactsScrollY;
  }
}

export function readListScrollY(): number {
  return document.querySelector<HTMLElement>(".inbox-thread-list")?.scrollTop ?? 0;
}

export function readContactsScrollY(): number {
  return document.querySelector<HTMLElement>("#contacts-thread-list")?.scrollTop ?? 0;
}
