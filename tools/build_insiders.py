#!/usr/bin/env python3
"""Turn the "TPO Insider Access" tags in the guest sheet into js/insiders.js.

Usage (same CSV as tools/build_guests.py):
    python3 tools/build_insiders.py path/to/daywise.csv

js/insiders.js keeps the insider list on its own, apart from js/guests.js.
Each entry is one of a tagged guest's own logins (their name with a number
they may use), run through PBKDF2-SHA256. So it goes by the person: a family
member typing their own name with an insider's number isn't an insider.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_guests as B  # noqa: E402

OUT = B.ROOT / "js" / "insiders.js"
SALT = "tpo-insider"   # must match js/insiders.js
ROUNDS = 100_000


def main(csv_path):
    rows = B.read_rows(csv_path)
    B.link_households(rows)
    firsts = B.first_name_words(rows)
    tagged = [r for r in rows if r["insider"]]
    keys = {k for r in tagged for k in B.login_keys(r, firsts, surnames=False)}
    hashes = sorted(hashlib.pbkdf2_hmac("sha256", k.encode(), SALT.encode(), ROUNDS, dklen=12).hex()
                    for k in keys)

    src = OUT.read_text(encoding="utf-8")
    new = re.sub(r"var LIST = \[.*?\];",
                 lambda _: "var LIST = " + json.dumps(hashes, indent=4).replace('"', "'")
                 .replace("\n]", "\n  ]") + ";", src, flags=re.S)
    OUT.write_text(new, encoding="utf-8")
    print(f"{len(tagged)} insiders, {len(hashes)} logins -> {OUT.relative_to(B.ROOT)}")
    for r in tagged:
        if not r["use"]:
            print("  can't log in yet (no number):", r["name"])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
