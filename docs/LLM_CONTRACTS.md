# LLM JSON contracts

Single business flow per feature: prompt → generation → JSON → **Rust validation** → domain. **GBNF** is an accelerator on llama-server only; OpenRouter has no grammar constraint.

## Layers

| Layer | Location | Role |
| ----- | -------- | ---- |
| Prompt | `ai_*` modules | Describes expected format (camelCase); wraps mail in `untrusted_mail_content_block` |
| GBNF | `ai_llm_contracts::gbnf_*` | Optional `grammar` for llama-server (`effective_grammar` in `rustymail-llm`) |
| Parse | `ai_llm_util::parse_model_json` | Extract + `serde_json` → DTO |
| Validation | `ai_llm_contracts::validate_*` | **Source of truth:** bounds, cardinalities, reject absurd cases (same for local and cloud) |
| Normalization | `ai_*` | Fine truncations, UX fallback (e.g. existing summary in `summary_from_raw`) |

## Key files

- `crates/rustymail-modules/src/ai_llm_contracts.rs` — GBNF constants + validators (summary, translation, Q&A, rewrite, quick replies, contact profile, NL search) + untrusted content wrapper
- `ai_summary.rs`, `ai_translation.rs`, `ai_qa.rs` — `generate_with_schema` / streaming + validator after parse
- `ai_writing.rs`, `ai_quick_reply.rs`, `ai_contact_profile.rs`, `ai_search_nl.rs` — validators and/or prompt-injection wrappers

## GBNF schemas (llama-server)

| Constant | JSON shape |
| -------- | ------------ |
| `SUMMARY_THREAD_JSON_GBNF` | `{ title, bullets[], sourceMessageIds[] }` |
| `TRANSLATION_PLAIN_JSON_GBNF` | `{ translatedText, preservedEntityIds[], detectedSourceLang }` |
| `QA_THREAD_JSON_GBNF` | `{ answer, evidenceMessageIds[] }` |
| `SECURITY_FINDINGS_GBNF` (`mail_security`) | `{ findings[{ code, severity, messageFr }] }` — max 3 findings enforced post-parse |

## Untrusted mail in prompts

`untrusted_mail_content_block` wraps user mail so the model treats body text as **data**, not instructions. Used across summary, translation, Q&A, and related modules.

## Evolution workflow

1. Change limits → update **validator** (and prompt if needed) in one place.
2. Change JSON shape → DTO + validator + minimal GBNF if root structure changes.

## Related

- [AI_AND_MODELS.md](AI_AND_MODELS.md)
- [IPC_SECURITY.md](IPC_SECURITY.md)
