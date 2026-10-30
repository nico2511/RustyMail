# LLM JSON contracts

Single business flow per feature: prompt → generation → JSON → **Rust validation** → domain. **GBNF** is an accelerator on llama-server only. **Ollama** accepts an optional JSON Schema in `format` when the caller sets `LlmGenParams.json_schema`, with a single fallback to `"json"` if the server rejects the schema. OpenRouter has no grammar constraint.

## Schémas Ollama (`format` JSON Schema)

| Feature | Schéma | Repli si erreur `format` / schéma |
| ------- | ------ | ----------------------------------- |
| Brief d’action (Quick / Decision / Deep) | `ai_llm_contracts::action_brief_json_schema(mode)` | `"json"` puis parse + validation Rust |
| Réécriture | `ai_llm_contracts::rewrite_json_schema()` | `"json"` |
| Assist — faits fil | `ai_llm_contracts::assist_facts_json_schema()` | `"json"` ; JSON réparé → `outputPartial`, confiance ≤ 0,45 |

## Layers

| Layer | Location | Role |
| ----- | -------- | ---- |
| Prompt | `ai_*` modules | Describes expected format (camelCase); wraps mail in `untrusted_mail_content_block` |
| GBNF | `ai_llm_contracts::gbnf_*` | Optional `grammar` for llama-server only (`grammar_for_kind` drops it for OpenRouter and Ollama) |
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
| `ORG_ORIENTATION_JSON_GBNF` | `{ diagnosis, recommendations[], actions[{ title, rationale, threadIds[], searchKeywords[], suggestedAction, targetMailbox }] }` — `suggestedAction` ∈ `archive` \| `move` \| `trash` \| `markRead` \| `deleteMailbox` ; alias normalisés, action inconnue ignorée (`validate_org_orientation_shape`) |

## Untrusted mail in prompts

`untrusted_mail_content_block` wraps user mail so the model treats body text as **data**, not instructions. Used across summary, translation, Q&A, reply agent, Assist, action brief, grammar, and related modules.

**Contact profile tone:** `suggestedTone` in API responses uses the English enum `neutral|formal|warm|direct`. Free-text user tone preference in Assist (`AssistUserPrefs.tone`, e.g. `neutre`) is unchanged and is not normalized to that enum.

## Evolution workflow

1. Change limits → update **validator** (and prompt if needed) in one place.
2. Change JSON shape → DTO + validator + minimal GBNF if root structure changes.

## Related

- [AI_AND_MODELS.md](AI_AND_MODELS.md)
- [IPC_SECURITY.md](IPC_SECURITY.md)
