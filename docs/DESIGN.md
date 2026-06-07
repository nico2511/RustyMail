# Design & UI

Source of truth for the front end (`src/styles.css`, `src/main.ts`): tokens, Composer / Inbox screens, and known pitfalls. **Implementation wins** over aspirational mockups.

## Principles

- **Theme:** Very dark background; layered surfaces (`--deep` → `--surface` → `--elevated`); subtle borders (`--border` / `--border-weak`)
- **Radii:** `--radius-btn: 3px` for buttons (Slate Monolith); cards/panels use `--radius-sm` / `--radius-md`
- **Density:** Inbox and thread lists are airy but professional; minimal rounding on dense actions

## Typography

- **UI:** `"Inter"` (serif **Newsreader** in some preview zones)
- **Composer (markdown):** monospace on `.composer-mail-shell .composer-body textarea`
- **Text colors:** `--text`, `--muted`, `--dim` — prefer variables over hard-coded grays

## Palette & tokens (`:root`)

**Color board:** [guidance-color.png](./guidance-color.png) — **Slate Monolith** (Primary `#6F7A6F`, Secondary `#747873`, Tertiary `#37272A`, Neutral `#787775`)

- **Accents:** `--sm-primary` … `--sm-neutral`; `--accent` = `--sm-primary`; `--accent-dim` for light highlights
- **Buttons:**
  - **Primary:** `--btn-primary-fill` + `--btn-primary-text` (e.g. Send)
  - **Secondary:** `--btn-secondary-*`
  - **Outlined:** `.ghost-button` — border `--btn-outlined-border`
- **Destructive (trash icons):** `--sm-danger-surface` / `--sm-danger-border` / `--sm-danger-fg`
- **Semantics:** `--danger`, `--success`, `--warn`

## Surfaces & layout

- **`.surface` / `.surface-sm`:** cards with shadows `--carved` / `--carved-sm`
- **Inbox:** `inbox-*` (app bar, chips, list panel)
- **Thread reading:** `.thread-reading` — monolith-style header (large subject, participants + avatars, Archive / Reply, `thread-zen` summary when `state.aiOutput`), **full width** of main panel
- **List:** no tag column on the right; mailbox choice via **sidebar** only

## Composer: `.composer-mail-shell`

- `<section class="compose-view composer-mail-shell">` — mail compose only (not account setup)
- Palette follows `guidance-color.png` (no separate blue composer theme)
- **Send:** global primary (`--btn-primary-fill`)
- Markdown / active tone: sage green `--sm-primary`, `--accent-dim`
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

## Possible evolutions

- Three-column layout (AI rail + editor + wide panel) if product targets it
- Rich editor with unified undo beyond Markdown toolbar

---

*Older “North Star” inspiration docs were removed during consolidation; this file tracks the shipping UI.*
