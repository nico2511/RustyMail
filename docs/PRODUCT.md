# Product vision

RustyMail (formerly planned as “RustMaily”) is a **readability-first, local-first desktop email client**. Mail should read like a **discussion**, not a raw MIME dump — without hiding the original source when you need it.

## Goals

- Make email **easier to read, classify, and answer**
- Keep a **stable mail core** with optional modules (AI, cleaning, security signals)
- Prefer **on-device processing**; cloud LLM is optional and gated
- Work fully **without AI** on weak hardware

## Non-goals

- Replacing webmail for every power-user workflow on day one
- Embedding llama.cpp inside the desktop binary (generative AI uses **HTTP** to llama-server or OpenRouter)
- Shipping a RustyMail OAuth **backend** or bundling a runtime `.env` in installers
- Treating Google Desktop `client_secret` as a confidential server secret (Google documents it as non-confidential for installed apps; still required for token exchange with PKCE)
## Core experience

| Area | Direction |
| ---- | --------- |
| Reading | Thread-oriented view, provider-specific HTML cleaning (Amazon, Deblock, generic), heuristic security signals |
| Writing | Markdown composer, reply/reply-all/forward, dictation, optional AI rewrite |
| Organization | Tags, facets, archive layouts, organization center with batch actions |
| Search | Lexical, semantic (MiniLM), hybrid, optional natural-language query via LLM |
| Accounts | Multi-account IMAP/SMTP; OAuth Google/Microsoft via PKCE + loopback when clients are embedded or set in env |

## Version history (summary)

The product spec evolved from an AI-heavy draft (v2.2) toward a **core-first** client:

| Era | Focus |
| --- | ----- |
| v3.0 | Strict MVP: mail core first, AI optional, no cloud fallback by default |
| v3.1 | AI as a first-class but bounded module; anti-hallucination rules |
| v3.2 | Readability, hierarchical tagging, local dictation, discussion-like reading |
| Implementation | Rust workspace `core + modules`, Tauri v2, SQLite + IMAP IDLE |

Older full PRD drafts (v2.2–v3.1) were removed from the repo to avoid duplicate maintenance; this file and [CAPABILITIES.md](CAPABILITIES.md) reflect **what is implemented today**.
