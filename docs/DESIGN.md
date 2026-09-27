# Design & UI

Official visual direction for the **next** RustyMail interface: the productivity mockups in [`docs/mockups/productivity/`](mockups/productivity/README.md).

Open `docs/mockups/productivity/index.html` (no build). Captures live in `docs/mockups/productivity/images/`.

The running app in `src/` still ships the **Clarity v10 pastel** shell (`src/styles/tokens.css`, `src/styles.css`, `src/styles/appearance.css`). That CSS is the current release, not the direction to extend. A later implementation PR replaces it. Do not treat cream, sage, or lavender as the product direction.

Clarity mockups (`docs/mockups/clarity/`, v2–v10) are an **archive**. Do not continue them.

## Language

- **Rail:** charcoal (`#17191e`). Collapses to an icon strip. On compose it starts collapsed so writing is almost full width.
- **Surface:** white. Ink is near-black. Borders are cool gray.
- **Accent:** copper (`#c4491d`) only for unread, send, reply, new message, and focus. It is not an account color.
- **No costume:** not cream, not sage, not lavender, not Clarity teal.

## Typography

Two families, both local (no network):

- **Literata** — reading mail: subject, body, list subject and preview.
- **IBM Plex Sans** — chrome: rail, buttons, filters, modals, account labels.

## Hierarchy

What matters stays in front: subject, sender, the open message body, Reply, Send, New message, unread.

Everything else recedes — smaller, grayer, or behind a chevron, a tab, a modal, a hover, or the collapsed rail — and stays one click, one hover, or one shortcut away. That includes metadata, tags, DKIM, sync, account, contact, help, rewrite, shortcuts, and secondary counts.

## Multi-account

The inbox is multi-account. Unified view **Tous les comptes** mixes mail by time. Each row names its account. A filtered view shows one mailbox; the title and unread count follow.

Account hues are muted and separate from copper. The name is always written; color is not the only signal.

| Account | Hue | Text on white |
| ------- | --- | ------------- |
| Perso | slate | `#3d4c63` |
| Atelier | olive | `#4a5336` |
| Facturation | plum | `#5c4458` |

The same hues mark the rail, the list-title switcher, and the account modal. On a single-account view the hue moves into the title and the rail; the list surface stays white.

Demo: `inbox.html?compte=tous`, `?compte=perso`, `?compte=atelier`, `?compte=facturation`, `inbox.html?profil=1`.

## Screens

| Mocked | File | Proves |
| ------ | ---- | ------ |
| Hub | `productivity/index.html` | The three-screen path |
| Inbox | `inbox.html` | Unified and filtered mail, account color, unread |
| Thread | `thread.html` | Every message folds; contact modal; copper on the unread |
| Compose | `compose.html` | Collapsed rail, markdown, send |

Not mocked here, and still real product: Organiser, full Settings, the address book as a page, OAuth setup, model install. The contact and account **modals** stand in for those overlays. Do not invent new product mechanics in the mockups.

## What not to follow

- `src/styles/tokens.css` pastel tokens (`--sm-primary`, cream surfaces, lavender) — shipped UI only.
- `docs/guidance-color.png` — historical Slate Monolith reference, not this palette.
- `docs/mockups/clarity/`, `vNext/`, `alternatives/` — closed explorations.

---

*Shipped CSS stays Clarity v10 until a separate implementation PR. This file is the guidance for that PR.*
