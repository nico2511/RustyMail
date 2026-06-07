"""
Regenerate `crates/rustymail-modules/tests/fixtures/amazon/recommendation_fr_anonymized.html`
from Thunderbird MIME (`.md` export, `.eml`, or same bytes in any file).

Not run in CI — only refreshes committed fixtures locally.

Examples:
  python tools/build_amazon_fixture.py
  python tools/build_amazon_fixture.py --source "Providerr_mockup/mail.eml"
"""

from __future__ import annotations

import argparse
import quopri
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVIDER_DIR = ROOT / "Providerr_mockup"
DST = ROOT / (
    "crates/rustymail-modules/tests/fixtures/amazon/recommendation_fr_anonymized.html"
)


def extract_html_qp(raw_text: str) -> bytes:
    text = raw_text.replace("\r\n", "\n")
    idx = text.find("Content-Type: text/html")
    if idx < 0:
        raise ValueError("no text/html part in source")
    sub = text[idx:]
    i = sub.lower().find("content-transfer-encoding: quoted-printable")
    if i < 0:
        raise ValueError("expected quoted-printable html")
    after = sub[i:]
    j = after.find("\n\n")
    if j < 0:
        raise ValueError("no blank line after headers")
    body = after[j + 2 :]
    boundary = "------=_Part_"
    b2 = body.find(boundary)
    if b2 >= 0:
        body = body[:b2]
    body = body.strip()
    return quopri.decodestring(body.encode("latin-1"))


def anonymize(s: str) -> str:
    s = re.sub(
        r"https://www\.amazon\.fr/gp/r\.html\?[^\s\"<>]+",
        "https://www.amazon.fr/gp/r.html?REDACTED",
        s,
    )
    s = re.sub(
        r"https://www\.amazon\.fr/hz/mobile/mission[^\s\"<>]*",
        "https://www.amazon.fr/hz/mobile/mission?REDACTED",
        s,
    )
    # Strip mailbox-looking tokens if they appear in HTML (rare).
    s = re.sub(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "recipient@example.invalid",
        s,
    )
    return s


def resolve_source(explicit: Path | None) -> tuple[Path, str]:
    if explicit is not None:
        if not explicit.is_file():
            raise SystemExit(f"Missing --source file: {explicit}")
        return explicit.resolve(), explicit.name

    amazon_md = PROVIDER_DIR / "amazon.md"
    if amazon_md.is_file():
        return amazon_md, "Providerr_mockup/amazon.md"

    eml_files = sorted(
        PROVIDER_DIR.glob("*.eml"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if eml_files:
        return eml_files[0], f"Providerr_mockup/{eml_files[0].name}"

    raise SystemExit(
        "No MIME source found. Drop `Providerr_mockup/amazon.md` or "
        "`Providerr_mockup/*.eml`, or pass --source PATH."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build anonymized Amazon HTML fixture.")
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help="MIME file (.eml / .md). Default: amazon.md else newest *.eml in Providerr_mockup/",
    )
    args = parser.parse_args()

    src, label = resolve_source(args.source)
    html_bytes = extract_html_qp(src.read_text(encoding="utf-8", errors="replace"))
    s = html_bytes.decode("utf-8", errors="replace")
    s = anonymize(s)
    hdr = (
        f"<!-- Fixture: anonymized from {label} (URL/email stubs). "
        "Regenerate: python tools/build_amazon_fixture.py -->\n"
    )
    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(hdr + s, encoding="utf-8")
    print("Source:", src)
    print("Wrote", DST, len(s), "chars")


if __name__ == "__main__":
    main()
