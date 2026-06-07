# Contributing mail samples for cleaning rules

## What we need

1. Raw **`.eml`** exported from your client (Thunderbird, Gmail “Show original”, Apple Mail, etc.)
2. One sentence describing the **cleaning goal** (e.g. *remove legal footer after recommendations, keep product blocks*)

No need to commit personal mail — the `Providerr_mockup/` folder is gitignored for local sources.

## Local file layout

Place `.eml` files here:

```text
Providerr_mockup/
  my-amazon-promo.eml
  ... (other reference mails)
```

## Amazon FR example (already in repo)

After copying an Amazon `.eml`:

```bash
python tools/build_amazon_fixture.py --source "Providerr_mockup/YOUR_MAIL.eml"
```

This regenerates the anonymized committed fixture:

```text
crates/rustymail-modules/tests/fixtures/amazon/recommendation_fr_anonymized.html
```

Verify:

```bash
cargo test -p rustymail-modules amazon_mail_cleaning
```

Without `--source`, the script uses `Providerr_mockup/amazon.md` if present, otherwise the newest `.eml` in `Providerr_mockup/`.

## Template message (for chat/issues)

```text
Sender / type: (e.g. Amazon FR recommendations)
Real subject: ...

Cleaning goal:
- Remove: ...
- Must keep: ...

File: Providerr_mockup/<name>.eml (see tools/contributor-mail-samples.md).
```

Optional: screenshot of desired readable rendering — helpful but secondary to the `.eml`.

## Git vs local

| Item | Commit to git? |
| ---- | -------------- |
| `Providerr_mockup/*.eml` | No (personal data; gitignored) |
| `tests/fixtures/...*_anonymized.html` | Yes (anonymized, for CI) |

For a **new provider** (not Amazon), follow the same pattern: MIME extraction script → fixture under `tests/fixtures/<provider>/` → Rust plugin under `mail_cleaning/providers/<name>.rs`.
