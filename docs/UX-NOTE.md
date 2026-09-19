# Note UX — RustyMail v0.2.0 (refonte pastel)

Document de référence pour la **structure visuelle**, l’**ergonomie** et l’**architecture front** livrée avec la refonte pastel (PR #1 → `main`, tag **`v0.2.0`**).

## Branches de sauvegarde

| Branche | Rôle |
| -------- | ----- |
| `cursor/pastel-ux-refonte-e449` | Branche de travail historique de la refonte (conservée sur le remote). |
| `stamp/v0.2.0-pastel-ux` | **Snapshot** au commit final de la refonte (identique au tip de la branche ci-dessus au moment du merge). |
| `main` @ tag `v0.2.0` | Ligne produit courante après merge + bump de version. |

Pour retrouver l’état exact de la refonte avant évolutions sur `main`, checkout `stamp/v0.2.0-pastel-ux` ou le tag `v0.2.0`.

---

## Intentions produit

- **Calme visuel** : palette crème / sauge / lavande, pas de contraste agressif type « dark dev tool ».
- **Lecture mail d’abord** : colonne centrale dominante, panneau IA repliable, sidebar dossiers repliable.
- **Desktop-first (Tauri)** : grille fixe plein écran, scroll interne par panneau, barre d’état 28 px.
- **Progressive disclosure** : compose plein écran, modales pour actions rares, panneau IA et overlay quick panel séparés.

---

## Design system (tokens)

Source : `src/styles/tokens.css` + fond `body` dans `src/styles.css`.

| Domaine | Choix |
| -------- | ----- |
| Surfaces | `--deep`, `--base`, `--surface`, `--elevated` (crème chaud) |
| Accents | sauge `--sm-primary`, lavande `--accent-lavender`, pêche `--accent-peach` |
| Typo | stack system-ui locale (pas de Google Fonts) |
| Rayons | `--radius-btn` 8px, cartes 10–14px |
| Motion | `--t-fast` 120ms, `--ease-out` |
| Focus | `outline` accent 1px + offset 2px (`:focus-visible`) |

Le fond global combine ** trois radial-gradients** pastels + bruit SVG léger (`.noise`, non interactif).

---

## Grille shell (`app-shell`)

Rendu : `app/mail/appShellRenderRun.ts` + markup `appShellRenderMarkupRun.ts`.

```
┌─────────────┬──────────────────────────┬──────────────┐
│  Sidebar    │  Main (liste / fil / …)   │  Panneau IA  │
│  dossiers   │                           │  (largeur    │
│             │                           │   --ai-width)│
├─────────────┴──────────────────────────┴──────────────┤
│  Status bar (28px)                                     │
└────────────────────────────────────────────────────────┘
```

- **Colonnes** : `clamp(252px, 22vw, 320px) | 1fr | var(--ai-width)` ; IA repliable → `--ai-width: 0` (`.ai-collapsed`).
- **Sidebar repliable** : `.sidebar-collapsed` — colonne 0, bouton ☰ dans `.main`.
- **Compose** : `.compose-fullscreen-active` — une colonne compositeur, footer status masqué visuellement.
- **Modales** : empilées dans le markup shell (move, tags, image, prompt, recherche, réglages IA, etc.).

État global : `state.view`, `state.sidebarCollapsed`, prefs IA (`aiPanelWidthPx`), layout compose.

---

## Cartographie des vues (`state.view`)

| Vue | Zone principale | Notes UX |
| ----- | ---------------- | -------- |
| `inbox` / liste | `.main` + sidebar | Barre recherche, filtres, digest dossier optionnel |
| `thread` | Lecture fil | Meta auto / zen, PJ, sécurité mail, QA fil |
| `compose` | Plein écran | Preview markdown, chips destinataires, panneau IA latéral masqué |
| `settings` | Formulaires onglets | Comptes, IA, activité — capture identité avant re-render |
| `contacts` | Liste + fiche | Recherche debounce, scroll infini |
| `organization` / v2 | Organiser boîtes | Modales confirm avec checkbox |
| `folder-manager` | Arborescence | DnD dossiers |

Navigation : pile `navigation.ts` + fil d’Ariane (`navBreadcrumbSegments`).

---

## Ergonomie clavier & souris

- **Raccourcis shell** : `appShellKeyboard*Run.ts` (accords, Escape, raccourcis « plain » hors champs éditables).
- **Compose** : Ctrl/Cmd+B/I/K/U sur `#compose-body` ; Enter sur quick reply.
- **Recherche** : Enter commit (sauf autocomplete `#` / `@` ouverts).
- **Clic `data-action`** : dispatch central `handleActionRun` + branchements DOM `wireEventsDom*`.
- **Scroll conservé** : snapshot sidebar / org / modale IA avant `innerHTML` shell (`appShellRenderScrollRestoreRun.ts`).

---

## Tons rédaction (`state.tone`)

Boutons `[data-tone]` (wire inbox/thread chrome) : influencent le style des brouillons / assist (voir `composeTone`, hints micro).

---

## Structure code ↔ UX

Le dégraissage front (**plus de `application.ts` / `deps.ts`**) aligne la **structure du code** sur les **domaines UX** :

| Domaine UX | Câblage |
| ----------- | -------- |
| Boot | `main.ts` → `appModuleRegistryRun` |
| Rendu | `render()` → `appShellRenderRun` + `renderDeps` par page |
| Registries | compose / search / thread / account-org / render fragments |
| DOM events | `wireEventsDomOrchestrator*` → modules par écran |

Doc modules : `src/app/README.md`.

---

## Mode navigateur vs Tauri

- **Vite** (`npm run dev`) : pas de persistance IMAP ; message « Mode navigateur » normal.
- **Tauri** : comptes, sync, OAuth, autosave brouillons, file drop native.

Ne pas juger l’ergonomie « prod » uniquement en preview web sans compte.

---

## Pistes post-v0.2.0 (UX / structure)

1. **Typage** des `wireEventsDom*` (`@ts-nocheck` → types ciblés).
2. **Responsive** : breakpoints partiels dans `styles.css` — revue tablette si cible élargie.
3. **Accessibilité** : audit contrastes pastels (WCAG), labels ARIA modales, annonces live region status.
4. **Cohérence** : unifier libellés FR, états vide (empty states), feedback chargement liste/fil.
5. **Design tokens** : documenter variantes « danger / warn » déjà en tokens pour fil #security.
6. **Tests visuels** : captures golden sur inbox / fil / compose pour éviter régressions pastel.

---

## Vérification locale

```bash
npm run verify:ts && npm test
npm run dev          # aperçu UX navigateur :5173
npm run tauri:dev    # ergonomie réelle desktop
```

---

## Mockups & explorations

**Règle (non négociable)** : toute UX mockée ou livrée doit utiliser **uniquement les composants existants** — voir [`docs/mockups/RULES.md`](mockups/RULES.md) et [`docs/mockups/APP-COMPONENT-INVENTORY.md`](mockups/APP-COMPONENT-INVENTORY.md).

Le dossier `docs/mockups/clarity/` est une exploration **non alignée** produit (CSS parallèle) — voir [`clarity/STATUS.md`](mockups/clarity/STATUS.md). Ne pas confondre avec la refonte pastel v0.2.0.

---

*Dernière mise à jour : merge PR #1 → `main`, version **0.2.0**.*
