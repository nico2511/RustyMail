# Inventaire composants UX existants (RustyMail v0.2.0)

Liste **factuelle** extraite du code — à utiliser pour mockups et refontes sans inventer de UI.

## Boutons & contrôles

| Classe / pattern | Usage | Référence |
| ---------------- | ----- | --------- |
| `.primary-button` | CTA principal (Composer sidebar, confirmations) | `sidebarRender.ts`, `styles.css` ~578 |
| `.ghost-button` | Actions secondaires toolbar, liens d’action | `listRender.ts`, `searchRender.ts`, partout |
| `.ghost-button-sm` | Petites actions panneau IA | `aiPanelRender.ts` |
| `.icon-pill` | Lu / suivi / corbeille sur ligne fil | `listRender.ts` (`inbox-thread-follow-toggle`, etc.) |
| `.icon-button` | Toolbar icônes | `styles.css` |
| `.kbd` | Raccourci affiché (ex. N sur Composer) | `sidebarRender.ts` |
| `[data-tone]` | Tons rédaction (wire inbox/thread) | `docs/UX-NOTE.md`, compose |
| `.search-save-view-btn` | Enregistrer vue recherche | `searchRender.ts` |
| `.inbox-load-more` | Pagination liste | `listRender.ts` |

**Pas dans le produit (interdit en mock « fidèle »)** : `.btn-primary`, `.btn-ghost`, `.btn-focus`, `.palette-backdrop`, `.seg` mock Clarity, etc.

## Shell & navigation

| Élément | Référence |
| ------- | --------- |
| `.app-shell`, sidebar repliable `.sidebar-collapsed` | `appShellRenderMarkupRun.ts`, `UX-NOTE.md` |
| Panneau IA `--ai-width`, `.ai-collapsed` | idem |
| Status bar 28px | `statusFooterRender.ts` |
| Fil d’Ariane | `navBreadcrumbSegments` |
| Modales (move, tags, search, settings, split send…) | `modalsRender.ts` |

## Inbox / liste

| Élément | Référence |
| ------- | --------- |
| `.thread-row`, `.inbox-thread-row`, `.thread-row--unread` | `listRender.ts` |
| `.avatar.inbox-thread-avatar` | idem |
| `.inbox-thread-actions`, `.row-actions` | idem |
| Barre recherche `.search-bar-stack` | `searchRender.ts` |
| Chips / badges liste | `listChrome.ts` (`renderInboxChipBadge`, digest) |
| Brief action LLM | `actionBriefHtml.ts`, `inbox-brief-*` |
| Digest dossier | `renderMailboxDigestTriggerButton` |

**Pas produit** : panneau lecture split à côté de la liste (Clarity), filtres « Triage » mock, tri Date/Contact seg, épingler ☆ mock sans `toggle-thread-follow`.

## Fil

| Élément | Référence |
| ------- | --------- |
| Lecture messages, PJ, sécurité | `threadViewRender.ts` |
| Quick reply dock | markup thread + compose |
| Cartes réponse IA | `aiPanelRender.ts` (`ai-quick-reply-card`) |
| Désabonnement | `.mail-unsubscribe-bar` |

## Compose

| Élément | Référence |
| ------- | --------- |
| `.composer-mail-shell`, `.compose-fullscreen-active` | `composerRender.ts` |
| `.compose-send.primary-button` | envoi |
| `.attachments-actions`, drop Tauri | `styles.css`, wire natif |
| Layout `composeLayout`: split / write / preview / historique | `cycleComposeLayout.ts` (compose **interne**, pas inbox split) |
| Modale split envoi PJ | `split-send-modal` |

## Sidebar

| Élément | Référence |
| ------- | --------- |
| Dossiers IMAP + comptes | `sidebarRender.ts` |
| Vues enregistrées | `savedSearchView` |
| Trigger panneau IA rapide | `renderSidebarAiQuickTrigger` |
| Composer `primary-button` | idem |

## Tokens couleur (obligatoires pour mock fidèle)

Fichier : `src/styles/tokens.css` — sauge `--sm-primary`, surfaces crème, **pas** teal Clarity `#0f766e`.
