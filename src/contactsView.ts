import { invoke } from "@tauri-apps/api/core";
import { localeTag } from "./i18n";
import { navRenderTrailHtml } from "./navigation";
import { escapeAttr, escapeHtml } from "./ui/sanitize";

export type AddressContactRow = {
  accountId: string;
  email: string;
  displayName: string;
  messageCount: number;
  lastSeenAt: string;
  isFavorite: boolean;
  notes: string;
  source: string;
};

export type AddressContactListRow = {
  row: AddressContactRow;
  autoSenderKind: string;
};

/** Normalise la réponse Tauri (nested `row` ou champs aplatis legacy). */
function contactRowFromItem(item: AddressContactListRow & Partial<AddressContactRow>): AddressContactRow {
  if (item.row?.email) return item.row;
  return {
    accountId: String(item.accountId ?? ""),
    email: String(item.email ?? "").trim().toLowerCase(),
    displayName: String(item.displayName ?? ""),
    messageCount: Number(item.messageCount ?? 0) || 0,
    lastSeenAt: String(item.lastSeenAt ?? ""),
    isFavorite: Boolean(item.isFavorite),
    notes: String(item.notes ?? ""),
    source: String(item.source ?? ""),
  };
}

export type ContactDetailDto = {
  accountId: string;
  email: string;
  displayName: string;
  messageCount: number;
  lastSeenAt: string;
  isFavorite: boolean;
  notes: string;
  source: string;
  domain: string;
  autoSenderKind: string;
  autoThreadRatio: number;
  matchedRuleLabels: string[];
  recentThreads: Array<{
    threadId: string;
    subject: string;
    lastActivity: string;
    messageCount: number;
    unread: boolean;
    isNewsletterThread: boolean;
  }>;
  extractedEntities: Array<{ kind: string; value: string }>;
  phones: string[];
};

export type ContactMailSearchLaunch = {
  listFilter?: "all" | "unread" | "focused" | "auto";
  text?: string;
  hybrid?: boolean;
};

let contactsListQuery = "";
let contactsListOffset = 0;
let contactsListRows: AddressContactListRow[] = [];
let contactsListTotal = 0;
let contactsListLoading = false;
let contactsDetail: ContactDetailDto | null = null;
let contactsDetailLoading = false;
let contactsKeywordDraft = "";

export type ContactProfileResult = {
  summary: string;
  topics: string[];
  suggestedTone: string;
  isAutoLikely: boolean;
};

let contactsProfile: ContactProfileResult | null = null;
let contactsProfileLoading = false;

export function clearContactProfile(): void {
  contactsProfile = null;
  contactsProfileLoading = false;
}

export async function loadContactProfile(accountId: string, email: string): Promise<void> {
  contactsProfileLoading = true;
  contactsProfile = null;
  try {
    contactsProfile = await invoke<ContactProfileResult>("llm_contact_profile", {
      payload: { accountId, email },
    });
  } catch {
    contactsProfile = null;
  } finally {
    contactsProfileLoading = false;
  }
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatContactListDate(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t.slice(0, 10);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(localeTag(), { day: "numeric", month: "short" });
}

function autoBadge(kind: string): string {
  const k = kind.trim().toLowerCase();
  if (k === "auto") {
    return `<span class="contact-badge contact-badge--auto" title="Expéditeur automatique">Auto</span>`;
  }
  if (k === "mixed") {
    return `<span class="contact-badge contact-badge--mixed" title="Mélange humain / automatique">Mixte</span>`;
  }
  return `<span class="contact-badge contact-badge--human" title="Correspondance humaine">Humain</span>`;
}

function contactListPreview(row: AddressContactRow): string {
  const notes = row.notes?.trim();
  if (notes) return notes.length > 120 ? `${notes.slice(0, 117)}…` : notes;
  if (row.messageCount > 0) return `${row.messageCount} message${row.messageCount === 1 ? "" : "s"}`;
  return row.email;
}

function renderContactListRow(item: AddressContactListRow): string {
  const r = item.row;
  const label = r.displayName?.trim() || r.email;
  const unreadCls = "";
  const activityDisplay = formatContactListDate(r.lastSeenAt);
  const activityTip = escapeAttr(r.lastSeenAt || "");
  const messageN = Math.max(0, Math.floor(Number(r.messageCount) || 0));
  const threadAria = `${messageN} message${messageN === 1 ? "" : "s"}`;
  const threadGlyph =
    messageN > 0
      ? `<span class="inbox-thread-count-hint dim" role="img" aria-label="${escapeAttr(threadAria)}" title="${escapeAttr(threadAria)}">#<span class="inbox-thread-count-badge">${messageN}</span></span>`
      : "";

  return `
    <div class="thread-row inbox-thread-row contacts-inbox-row ${unreadCls}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-action="contacts-open-detail" data-email="${escapeAttr(r.email)}">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.2);color:var(--sm-primary)">${escapeHtml(initials(label))}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(label)}</span>
            <time class="inbox-thread-time inbox-thread-time-narrow-only dim" title="${activityTip}">${escapeHtml(activityDisplay)}</time>
          </span>
          <span class="inbox-thread-subject">
            ${r.isFavorite ? '<span class="contact-badge contact-badge--fav" aria-label="Favori">★</span> ' : ""}
            <strong class="mono">${escapeHtml(r.email)}</strong>
            ${threadGlyph}
          </span>
          <p class="thread-preview inbox-thread-preview dim">${escapeHtml(contactListPreview(r))}</p>
        </span>
      </button>
      <div class="inbox-thread-date-col" title="${activityTip}">
        <time class="inbox-thread-date-label dim">${escapeHtml(activityDisplay)}</time>
      </div>
      <div class="inbox-thread-folder-col contacts-inbox-row-meta" title="${escapeAttr(item.autoSenderKind)}">
        ${autoBadge(item.autoSenderKind)}
      </div>
    </div>`;
}

function renderContactThreadRow(t: ContactDetailDto["recentThreads"][number]): string {
  const tid = String(t.threadId);
  const unreadCls = t.unread ? "thread-row--unread" : "";
  const activityDisplay = formatContactListDate(t.lastActivity);
  const activityTip = escapeAttr(t.lastActivity || "");
  const messageN = Math.max(1, Math.floor(Number(t.messageCount) || 1));
  const threadAria = `Conversation, ${messageN} messages`;
  const threadGlyph =
    messageN > 1
      ? `<span class="inbox-thread-count-hint dim" role="img" aria-label="${escapeAttr(threadAria)}" title="${escapeAttr(threadAria)}">#<span class="inbox-thread-count-badge">${messageN}</span></span>`
      : "";

  return `
    <div class="thread-row inbox-thread-row contacts-thread-inbox-row ${unreadCls}" data-thread-id="${escapeAttr(tid)}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-action="contacts-open-thread" data-thread-id="${escapeAttr(tid)}">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.15);color:var(--sm-primary)">↪</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(t.subject || "(sans objet)")}</span>
            <time class="inbox-thread-time inbox-thread-time-narrow-only dim" title="${activityTip}">${escapeHtml(activityDisplay)}</time>
          </span>
          <span class="inbox-thread-subject">
            ${t.unread ? '<span class="inbox-unread-dot" aria-hidden="true"></span>' : ""}
            ${t.isNewsletterThread ? `<span class="contact-badge contact-badge--auto">Auto</span>` : ""}
            ${threadGlyph}
          </span>
        </span>
      </button>
    </div>`;
}

export function getContactsListQuery(): string {
  return contactsListQuery;
}

export function setContactsListQuery(q: string): void {
  contactsListQuery = q;
}

export function getContactsKeywordDraft(): string {
  return contactsKeywordDraft;
}

export function setContactsKeywordDraft(v: string): void {
  contactsKeywordDraft = v;
}

export async function loadContactsList(
  accountId: string,
  opts?: { reset?: boolean; query?: string }
): Promise<void> {
  if (opts?.reset) {
    contactsListOffset = 0;
    contactsListRows = [];
  }
  if (opts?.query !== undefined) contactsListQuery = opts.query;
  contactsListLoading = true;
  try {
    const res = await invoke<{ items: Array<AddressContactListRow & Partial<AddressContactRow>>; total: number }>(
      "list_address_contacts_scoped_cmd",
      {
        accountId,
        query: contactsListQuery,
        offset: contactsListOffset,
        limit: 60,
      }
    );
    const items = (res?.items ?? []).map((item) => ({
      row: contactRowFromItem(item),
      autoSenderKind: String(item.autoSenderKind ?? "human"),
    }));
    contactsListTotal = res?.total ?? 0;
    if (contactsListOffset === 0) contactsListRows = items;
    else contactsListRows = [...contactsListRows, ...items];
    contactsListOffset = contactsListRows.length;
  } catch (err) {
    if (contactsListOffset === 0) {
      contactsListRows = [];
      contactsListTotal = 0;
    }
    console.warn("loadContactsList", err);
  } finally {
    contactsListLoading = false;
  }
}

export async function loadContactDetail(accountId: string, email: string): Promise<ContactDetailDto | null> {
  contactsDetailLoading = true;
  contactsDetail = null;
  try {
    contactsDetail = await invoke<ContactDetailDto>("get_address_contact_detail_cmd", {
      accountId,
      email,
    });
    return contactsDetail;
  } catch {
    contactsDetail = null;
    return null;
  } finally {
    contactsDetailLoading = false;
  }
}

export function getContactDetail(): ContactDetailDto | null {
  return contactsDetail;
}

export function isContactsDetailLoading(): boolean {
  return contactsDetailLoading;
}

export function isContactsListLoading(): boolean {
  return contactsListLoading;
}

export function contactsListHasMore(): boolean {
  return contactsListRows.length < contactsListTotal;
}

export function renderContactsListPage(accountLabel: string): string {
  const rows = contactsListRows;
  const hasMore = contactsListHasMore();
  const loadMoreBtn =
    hasMore ?
      '<button type="button" class="ghost-button inbox-load-more" data-action="contacts-load-more">Charger plus</button>'
    : "";
  const endHint =
    !hasMore && contactsListTotal > 0
      ? `<span class="inbox-end-hint dim">Fin de liste (${contactsListTotal})</span>`
      : "";
  const listBody =
    rows.length ?
      rows.map((item) => renderContactListRow(item)).join("")
    : !contactsListLoading ?
      `<div class="inbox-empty">
          <p class="inbox-empty-title">Aucun contact</p>
          <p class="inbox-empty-hint dim">Synchronisez la boîte ou réindexez dans Paramètres → Carnet.</p>
        </div>`
    : "";
  return `
    <section class="thread-view inbox-index contacts-index" aria-label="Carnet d'adresses">
      <header class="inbox-appbar contacts-appbar">
        <div class="inbox-appbar-top">
          <div class="inbox-appbar-intro">
            ${navRenderTrailHtml("Carnet", escapeHtml, escapeAttr, { navClass: "secondary-view-nav" })}
            <h1 class="inbox-mailbox-title">Carnet</h1>
            <p class="inbox-mailbox-sub">
              ${rows.length} sur ${contactsListTotal} contact${contactsListTotal === 1 ? "" : "s"}
              ${contactsListLoading ? " · chargement…" : ""}
              · ${escapeHtml(accountLabel)}
            </p>
          </div>
          <div class="inbox-appbar-actions">
            <button type="button" class="ghost-button inbox-toolbar-btn" data-action="contacts-refresh-list">Actualiser</button>
          </div>
        </div>
        <label class="inbox-search surface-sm contacts-view__search-wrap">
          <input type="search" class="settings-ctl contacts-view__search" id="contacts-list-search"
            placeholder="Rechercher un contact…" value="${escapeAttr(contactsListQuery)}" autocomplete="off" />
        </label>
      </header>
      <div class="inbox-panel surface contacts-inbox-panel">
        <div class="inbox-thread-list" id="contacts-thread-list" role="list">
          ${listBody}
        </div>
        <div class="inbox-panel-footer">
          <div class="inbox-panel-footer__row">
            <div class="inbox-panel-footer__lead">${loadMoreBtn}</div>
            <div class="inbox-panel-footer__center"></div>
            <div class="inbox-panel-footer__trail">${endHint}</div>
          </div>
        </div>
      </div>
    </section>`;
}

function renderContactEntityListItem(kind: string, value: string): string {
  const k = kind.trim().toLowerCase();
  const v = value.trim();
  if (!v) return "";
  if (k === "email" && v.includes("@")) {
    return `<li><span class="dim">${escapeHtml(kind)}</span> · <button type="button" class="contacts-entity-link" data-action="contacts-entity-mailto" data-email="${escapeAttr(v)}" title="Écrire à ${escapeAttr(v)}">${escapeHtml(v)}</button></li>`;
  }
  if (k === "link" && /^https?:\/\//i.test(v)) {
    return `<li><span class="dim">${escapeHtml(kind)}</span> · <button type="button" class="contacts-entity-link" data-action="contacts-entity-open" data-href="${escapeAttr(v)}" title="${escapeAttr(v)}">${escapeHtml(v)}</button></li>`;
  }
  return `<li><span class="dim">${escapeHtml(kind)}</span> · ${escapeHtml(v)}</li>`;
}

export function renderContactDetailPage(): string {
  const d = contactsDetail;
  if (contactsDetailLoading || !d) {
    return `
    <section class="thread-view inbox-index contacts-view contacts-view--detail" aria-label="Fiche contact">
      <header class="thread-reading-head contacts-view__head">
        ${navRenderTrailHtml("Contact", escapeHtml, escapeAttr, { navClass: "secondary-view-nav" })}
      </header>
      <p class="dim contacts-view__status">${contactsDetailLoading ? "Chargement…" : "Contact introuvable."}</p>
    </section>`;
  }
  const label = d.displayName?.trim() || d.email;
  const entities = d.extractedEntities.map((e) => renderContactEntityListItem(e.kind, e.value)).join("");
  const phones = d.phones.map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  const rules = d.matchedRuleLabels.map((r) => `<li class="mono">${escapeHtml(r)}</li>`).join("");
  const profileBlock = contactsProfileLoading
    ? `<p class="dim">Profil IA…</p>`
    : contactsProfile
      ? `<h2 class="thread-kicker">Profil IA</h2>
          <p>${escapeHtml(contactsProfile.summary)}</p>
          ${
            contactsProfile.topics.length
              ? `<p class="dim">Sujets : ${contactsProfile.topics.map((t) => escapeHtml(t)).join(" · ")}</p>`
              : ""
          }
          <p class="dim">Ton suggéré : ${escapeHtml(contactsProfile.suggestedTone)}${
            contactsProfile.isAutoLikely ? " · expéditeur probablement automatique" : ""
          }</p>`
      : "";

  const threads = d.recentThreads.map((t) => renderContactThreadRow(t)).join("");
  const domainBtn =
    d.domain?.trim() ?
      `<button type="button" class="ghost-button contacts-domain-link" data-action="contacts-search-domain" data-domain="${escapeAttr(d.domain)}">@${escapeHtml(d.domain)}</button>`
    : `<span class="dim">—</span>`;

  return `
    <section class="thread-view inbox-index contacts-view contacts-view--detail" aria-label="Fiche contact">
      <header class="thread-reading-head contacts-view__head">
        ${navRenderTrailHtml(label, escapeHtml, escapeAttr, { navClass: "secondary-view-nav" })}
      </header>
      <div class="contacts-detail-scroll">
      <div class="contacts-detail-hero surface-sm">
        <span class="avatar large contacts-detail-hero__avatar">${escapeHtml(initials(label))}</span>
        <div>
          <h1 class="contacts-detail-hero__title">${escapeHtml(label)}</h1>
          <p class="mono dim">${escapeHtml(d.email)}</p>
          <p class="contacts-detail-hero__badges">
            ${autoBadge(d.autoSenderKind)}
            ${d.isFavorite ? `<span class="contact-badge contact-badge--fav">★ Favori</span>` : ""}
            ${d.source === "manual" ? `<span class="contact-badge">Manuel</span>` : ""}
          </p>
        </div>
        <div class="contacts-detail-hero__actions">
          <button type="button" class="primary-button" data-action="contacts-compose">Composer</button>
          <button type="button" class="ghost-button" data-action="contacts-toggle-fav" data-email="${escapeAttr(d.email)}">
            ${d.isFavorite ? "Retirer favori" : "★ Favori"}
          </button>
          <button type="button" class="ghost-button" data-action="contacts-llm-profile" data-email="${escapeAttr(d.email)}">Profil IA</button>
        </div>
      </div>

      <div class="contacts-detail-grid">
        ${profileBlock ? `<div class="contacts-detail-card surface-sm contacts-profile-ia">${profileBlock}</div>` : ""}
        <div class="contacts-detail-card surface-sm">
          <h2 class="thread-kicker">Activité</h2>
          <p class="dim">${d.messageCount} message${d.messageCount === 1 ? "" : "s"} · dernier : ${escapeHtml(d.lastSeenAt || "—")}</p>
          <p class="dim">Domaine : ${domainBtn}</p>
          ${d.notes?.trim() ? `<p>${escapeHtml(d.notes)}</p>` : ""}
        </div>

        <div class="contacts-detail-card surface-sm">
          <h2 class="thread-kicker">Rechercher les mails</h2>
          <div class="contacts-search-actions">
            <button type="button" class="ghost-button" data-action="contacts-search-all">Tous les mails</button>
            <button type="button" class="ghost-button" data-action="contacts-search-unread">Non lus</button>
            <button type="button" class="ghost-button" data-action="contacts-search-focused">Priorité</button>
            <button type="button" class="ghost-button" data-action="contacts-search-auto">Auto seulement</button>
          </div>
          <div class="contacts-search-keyword">
            <input type="text" class="settings-ctl" id="contacts-search-keyword" placeholder="Mot-clé + de: contact"
              value="${escapeAttr(contactsKeywordDraft)}" />
            <button type="button" class="ghost-button" data-action="contacts-search-keyword">Rechercher</button>
            <button type="button" class="ghost-button" data-action="contacts-search-hybrid">Sémantique</button>
          </div>
        </div>

        ${
          rules
            ? `<div class="contacts-detail-card surface-sm"><h2 class="thread-kicker">Règles expéditeur auto</h2><ul class="contacts-detail-list contacts-detail-list--scroll">${rules}</ul></div>`
            : ""
        }
        ${
          phones
            ? `<div class="contacts-detail-card surface-sm"><h2 class="thread-kicker">Téléphones détectés</h2><ul class="contacts-detail-list contacts-detail-list--scroll">${phones}</ul></div>`
            : ""
        }
        ${
          entities
            ? `<div class="contacts-detail-card surface-sm"><h2 class="thread-kicker">Entités extraites</h2><ul class="contacts-detail-list contacts-detail-list--scroll">${entities}</ul></div>`
            : ""
        }
        <div class="contacts-detail-card surface-sm">
          <h2 class="thread-kicker">Derniers fils</h2>
          <div class="inbox-thread-list contacts-thread-inbox-panel" role="list">${threads || `<p class="dim">Aucun fil local pour cet expéditeur.</p>`}</div>
        </div>
      </div>
      </div>
    </section>`;
}
