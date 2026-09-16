# Front-end (`src/`)

Le monolithe historique (`main.ts` ~20k lignes) est découpé en couches. La logique UI reste volumineuse dans `application.ts` ; la prochaine étape est de la répartir dans `modules/` sans casser les appels croisés.

## Point d’entrée

| Fichier | Rôle |
| ------- | ---- |
| `main.ts` | Boot : importe `application`, lance `boot()` |
| `app/application.ts` | Comportement UI (render, wireEvents, sync, compose, IA…) |
| `app/state.ts` | État global `state` (unique source de vérité) |
| `app/dispatch.ts` | `render()` / `registerRender()` (évite imports circulaires) |
| `app/dom.ts` | Racine `#app` |
| `app/types/` | Types TypeScript partagés (mail, modales, `State`) |

## Modules déjà extraits (hors `application.ts`)

Composants et domaines autonomes : `navigation.ts`, `contactsView.ts`, `organizationView*.ts`, `accountSetup.ts`, `searchQueryState.ts`, `ipc_bridge.ts`, etc.

## Conventions pour la suite

1. **Nouveau code** : fichier dédié sous `app/` ou à la racine `src/` selon le domaine, types dans `app/types/`.
2. **Pas de logique métier mail** dans le front : uniquement Tauri `invoke`.
3. **Couleurs / layout** : tokens dans `styles/tokens.css`, composants dans `styles.css` (découpage progressif).
4. **Découper `application.ts`** par domaine (`mail`, `compose`, `render`, `events`) avec fonctions **exportées** et imports explicites (éviter le registre global).

## Tests

`npm run verify:ts` · `npm test` (utilitaires / navigation / mailboxKinds).
