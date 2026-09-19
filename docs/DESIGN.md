# Design & UI

Source of truth for the front end (`src/styles.css`, `src/main.ts`): tokens, Composer / Inbox screens, and known pitfalls. **Implementation wins** over aspirational mockups.

## Principles

- **Theme:** Warm **pastel light** — cream surfaces (`--deep` → `--surface` → `--elevated`); neither pure white nor slate-dark. Subtle borders (`--border` / `--border-weak`).
- **Accents:** Soft sage (`--sm-primary`), dusty rose (`--sm-tertiary`), optional lavender / peach / sky tokens for chips and highlights.
- **Radii:** `--radius-btn: 8px` and slightly rounder panels (`--radius-sm` … `--radius-lg`) for a calm, approachable feel.
- **Density:** Inbox and thread lists stay airy and professional; readable contrast on pastel backgrounds (`--text` on `--surface`).

## Typography

- **UI:** `system-ui` stack (local only — no Google Fonts).
- **Composer (markdown):** monospace on `.composer-mail-shell .composer-body textarea`
- **Text colors:** `--text`, `--muted`, `--dim` — prefer variables over hard-coded grays

## Palette & tokens (`:root`)

Pastel reference (2026 refonte):

| Role | Token | Example |
| ---- | ----- | ------- |
| Canvas | `--deep` | Warm gray-cream |
| Panels | `--base`, `--surface`, `--elevated` | Layered off-whites |
| Accent | `--accent` (= `--sm-primary`) | Sage green |
| Warm accent | `--accent-warm`, `--accent-peach` | Tags, highlights |
| Primary button | `--btn-primary-fill` + `--btn-primary-text` | Sage fill, dark text |
| Secondary | `--btn-secondary-*` | Light gray fill |
| Overlays | `--scrim`, `--scrim-heavy` | Modals / AI quick panel |
| Destructive | `--sm-danger-*`, `--danger` | Soft coral |

Legacy **Slate Monolith** dark palette was replaced by this light pastel system; old `guidance-color.png` remains historical reference only.

## Surfaces & layout

- **`.surface` / `.surface-sm`:** cards with shadows `--carved` / `--carved-sm`
- **Inbox:** `inbox-*` (app bar, chips, list panel)
- **Thread reading:** `.thread-reading` — header (subject, participants + avatars, Archive / Reply, `thread-zen` summary when `state.aiOutput`), **full width** of main panel
- **List:** no tag column on the right; mailbox choice via **sidebar** only

## Composer: `.composer-mail-shell`

- `<section class="compose-view composer-mail-shell">` — mail compose only (not account setup)
- Palette follows global pastel tokens
- **Send:** global primary (`--btn-primary-fill`)
- Markdown / active tone: `--accent`, `--accent-dim`
- **`composer-accent-outline`:** Add attachment, Adjust tone
- **Cc · Bcc:** `.compose-link` → `--accent`

### Layout

- **Chrome:** close, title (New message / Reply / Forward), preview, Send
- **`compose-meta-card`:** To, Cc/Bcc, Subject, Files; advanced multipart HTML at bottom (`composer-advanced--footnote`)
- **`compose-editor-sheet`:** tone + Markdown, textarea + preview, dictation
- **`persistDraft`:** if `#compose-cc` / `#compose-bcc` absent from DOM, do not clear `draft.cc` / `draft.bcc`
- After attachment changes: call **`render()`** for chips and counters

### Markdown toolbar

- Bold, italic, underline, lists, link, image URL, inline/block code, quote, undo/redo
- Body edits: **`finalizeMarkdownToolbarEdit`** → **`schedulePreviewUpdate`**
- **Preview:** `computePreview()` must not full `render()` on every keystroke (recreates `#compose-body` and jumps caret) — target DOM update on `.composer-body .preview` when preview visible

### Attachments

- Drop on **`.composer-mail-shell`**; **`AbortController`** for listeners; `dragenter` / `dragleave` counter

## Copy & locale

- UI strings come from `src/locales/{fr,en}.json` via `src/i18n.ts`
- **`general.motherLanguage`** pref selects UI locale
- Use `<span class="kbd">` for keyboard shortcut hints

## Reference files

| Topic | Location |
| ----- | -------- |
| CSS tokens | `src/styles.css` (`:root`) |
| Inbox | `.inbox-*`, `.thread-row` |
| Composer | `.compose-*`, `.composer-*` |
| Attachment logic | `pickAttachments`, `bindComposerDropzone`, `persistDraft` — `main.ts` |

## Theme & appearance (Clarity v10)

- **Light default:** Douce cream tokens in `src/styles/tokens.css`.
- **Modifiers:** `src/styles/appearance.css` — Contrast+, lavender accent, warm **dark** (`clarity-dark`), system preference via **Settings → Appearance**.
- **Email HTML:** `.message-html` keeps a light canvas in dark app theme so third-party mail stays readable.

## Possible evolutions

- Three-column layout refinements (AI rail + editor + wide panel)
- Rich editor with unified undo beyond Markdown toolbar

---

*Older “North Star” / Slate Monolith docs were consolidated; this file tracks the shipping UI.*
