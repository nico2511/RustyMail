# Clarity — sleek, doux, utile

Direction mockup alignée sur : **sleek + fonctionnel**, **UX douce**, **couleurs = hiérarchie** (pas de décoration pastel partout).

## Règles couleur

| Rôle | Token | Usage |
| ---- | ----- | ----- |
| Fond app | `--bg` #f4f5f7 | Neutre froid léger — calme, pas crème |
| Surface | `--surface` #fff | Cartes, lignes mail |
| Texte principal | `--text` #111827 | Sujets, titres |
| Texte secondaire | `--muted` #6b7280 | Extraits, meta |
| **Action / sélection** | `--primary` #0f766e | teal profond — boutons, dossier actif, focus |
| **Important (non lu)** | `--signal` | barre 3px + fond `--signal-bg` teinté |
| **Urgent** | `--urgent` #b45309 | chip seul, jamais en fond global |
| Danger | `--danger` #dc2626 | spam / supprimer — rare |

**Principe :** 90 % neutre, 8 % teal (intention utilisateur), 2 % ambre/rouge (sémantique).

## Règles UX

- **Sleek** : rayons 10–12px, ombre légère sur cartes uniquement, pas de dégradés décoratifs.
- **Doux** : espacement généreux (14–16px padding lignes), transitions 150ms, pas de noir pur sur grand fond.
- **Utile** : omnibox + filtres en une ligne ; actions fil au survol ; barre réponse toujours visible en bas du fil.
- **IA** : ligne discrète « Suggestion » sous le brief, pas colonne permanente.

## Fichiers

- [`inbox.html`](inbox.html) — hiérarchie non lus / urgent / lu
- [`thread.html`](thread.html) — lecture + réponse
- [`compose.html`](compose.html) — champs clairs + CTA envoi
- [`clarity.css`](clarity.css) — tokens
- [`images/`](images/) — PNG

## vs v0.2.0 pastel

Plus de sauge/lavande/pêche sur toute la surface ; le teal **guide l’œil** vers ce qui demande une action.
