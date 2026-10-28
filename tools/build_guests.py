#!/usr/bin/env python3
"""Turn the "Daywise List | RSVP" tab into js/guests.js.

Usage:
    1. In Google Sheets open the "Daywise List | RSVP" tab and choose
       File > Download > Comma-separated values (.csv).
    2. Save the tab's merged cells as JSON (optional, but the CSV loses them):
       the Sheets API's spreadsheets.get with fields=sheets.merges.
    3. python3 tools/build_guests.py path/to/daywise.csv [path/to/merges.json]
    4. Delete the CSV. Never commit it.

How guests are stored
---------------------
js/guests.js holds no names or phone numbers. Each guest becomes a key made
from a name AND phone number together, run through PBKDF2-SHA256 with many
iterations. To log in, a guest types both; the browser makes the same key and
looks it up.

Sheet layout
------------
The tab is split into blocks. Each block starts with a title row whose second
cell ends in "| HSWC", "| HSW", "| WC" or "| W" (the events that block is
invited to: Haldi, Sangeet, Wedding, Cocktail). Inside a block: column A is
the name, E the phone, F the resort, G the household contact (POC).

What a guest can type
---------------------
- Their first name is a must: first name alone, or first name and surname
  (any order), plus a number. The first word in the sheet is the first name.
- Their surname alone doesn't log in: the site asks for first name and surname.
- Where the POC column spells the same person differently ("Akshay Avachat"
  for "Aksahy Avachat"), that spelling works too.
- Rows with no first name ("Kushal Shah Wife") can't log in until the sheet
  has their real name; the report lists them.

Which numbers work
------------------
- The guest's own number, and the number of the POC named on their row.
- Guests with no number use their household's: the nearest row above with a
  phone, if it shares their surname (or a row just below with their surname).
  If no row shares their surname, no number is guessed: they're asked to
  contact Ishita or Sarvesh, and listed in the report so you can fix the sheet.
- A guest with no number who types their full name and a wrong number is told
  whose number to use. That hint is encrypted with their name, so the file
  still reveals nothing to someone who doesn't already know the name.
"""
import csv
import json
import re
import secrets
import sys
import hashlib
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "js" / "guests.js"

# Written into guests.js; js/app.js reads it from there.
ITERATIONS = 600_000

RESORTS = {"palmwood": "P", "palmwoods": "P", "golden fields": "G",
           "amour": "A", "amor": "A", "amora": "A"}

# Words that are never someone's own name: relations, titles, nicknames.
# Must match NOT_NAMES in js/app.js.
NOT_NAMES = {"wife", "husband", "mother", "father", "son", "daughter", "dad",
             "mom", "family", "mr", "mrs", "ms", "dr", "kaka", "kaku", "ajji",
             "aji", "aaji", "mama", "mami", "mavshi", "maushi", "atya", "bhai",
             "toddler"}

HINT_BYTES = 32   # longest hint name, in UTF-8 bytes


# ---------- Names (must stay in step with js/app.js) ----------

def words(name):
    """Lowercase words of a name, without brackets or 'xx_' prefixes."""
    name = re.sub(r"\(.*?\)", " ", name.lower())
    name = re.sub(r"^\w+_\s*", "", name.strip())
    return re.findall(r"[a-z]+", name)


def real_words(w):
    out = []
    for x in w:
        if len(x) > 1 and x not in NOT_NAMES and x not in out:
            out.append(x)
    return out


def full_key(name):
    w = words(name)
    return " ".join(sorted(w)) if w else ""


# ---------- Fuzzy matching, for typos inside the sheet ----------

def close(a, b):
    """Same word, allowing a typo or two in longer words."""
    if a == b:
        return True
    n = min(len(a), len(b))
    limit = 2 if n >= 6 else 1 if n >= 4 else 0
    if not limit or abs(len(a) - len(b)) > limit:
        return False
    # Optimal string alignment distance (swaps count as one typo).
    d = [[i + j if i * j == 0 else 0 for j in range(len(b) + 1)] for i in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1,
                          d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[-1][-1] <= limit


def same_person(a, b):
    """Every real word of one name matches a word of the other."""
    wa, wb = real_words(words(a)), real_words(words(b))
    if not wa or not wb:
        return False
    short, long_ = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    if len(short) == 1 and len(long_) > 2:
        return False
    return all(any(close(x, y) for y in long_) for x in short)


def shares_word(a_words, b_words):
    return any(close(x, y) for x in a_words for y in b_words)


def norm_phones(cell):
    """Every number in a cell, as its last 10 digits ('a / b' gives two)."""
    out = []
    for part in re.split(r"[/,;]| or ", cell or ""):
        digits = re.sub(r"\D", "", part)
        if len(digits) >= 8 and digits[-10:] not in out:
            out.append(digits[-10:])
    return out


# ---------- Reading the sheet ----------

def load_merges(path):
    """Merged cells, as {column: [(first_row, end_row), ...]} (0-based, end
    excluded). Accepts the Sheets API's {"sheets": [{"merges": [...]}]}, a
    plain list of its merge objects, or {"E": [[a, b], ...], "G": [...]}."""
    if not path:
        return {}
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict) and "sheets" in data:
        data = [m for sh in data["sheets"] for m in sh.get("merges", [])]
    out = {}
    if isinstance(data, dict):
        for col, spans in data.items():
            out["ABCDEFGH".index(col)] = [tuple(x) for x in spans]
        return out
    for m in data:
        for c in range(m["startColumnIndex"], m["endColumnIndex"]):
            out.setdefault(c, []).append((m["startRowIndex"], m["endRowIndex"]))
    return out


def read_rows(csv_path, merges=None):
    """Every guest row as a dict, grouped into blocks.

    A CSV loses merged cells: only a merge's first row keeps the value. With
    the sheet's merges, the Contact (E) and POC (G) values are copied down to
    every row of the merge, and rows sharing a merged POC form one family.
    """
    merges = merges or {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        sheet = [row + [""] * (8 - len(row)) for row in csv.reader(f)]
    family, shared = {}, {}
    for col in (4, 6):
        for a, b in merges.get(col, []):
            for i in range(a + 1, min(b, len(sheet))):
                sheet[i][col] = sheet[a][col]
                if col == 6:
                    family[i] = a
                elif sheet[a][4].strip():
                    shared[i] = re.sub(r"\s+", " ", sheet[a][0].strip())
            if col == 6 and a < len(sheet):
                family[a] = a
    rows, events, block = [], None, -1
    for n, row in enumerate(sheet):
        m = re.search(r"\|\s*([HSWC]+)\s*$", row[1].strip())
        if not row[0].strip() and re.search(r"[A-Za-z]", row[1]):
            # A title row. One without "| HSWC" etc. (e.g. "OTHERS- NO
            # INVITES") isn't invited to anything: skip its rows.
            events, block = (m.group(1) if m else None), block + 1
            continue
        person = row[0].strip()
        if not events or not person or person == "Person":
            continue
        rows.append({
            "i": len(rows), "block": block, "events": events,
            "name": re.sub(r"\s+", " ", person),
            "phones": norm_phones(row[4]),
            "resort": RESORTS.get(row[5].strip().lower(), ""),
            "poc": re.sub(r"\s+", " ", row[6].strip()),
            "aliases": [], "family": family.get(n),
            # Whose number this is, when it comes from a merged Contact cell.
            "shared": shared.get(n),
        })
    return rows


def link_households(rows):
    """Work out which numbers each guest may use. Returns names to check."""
    near = 8   # how far up/down to look for the person a POC names

    # The POC column names this person's family contact. If that is this
    # same person spelt better, keep the spelling. If it is someone else, this
    # row's number is usually theirs too, and theirs is this row's. Look
    # nearby first, then anywhere in the sheet (families span the blocks).
    for r in rows:
        if not r["poc"] or not real_words(words(r["poc"])):
            continue
        if same_person(r["poc"], r["name"]):
            r["aliases"].append(r["poc"])
            continue
        found = [o for o in rows if o is not r and same_person(r["poc"], o["name"])]
        if not found:
            continue
        nearby = [o for o in found
                  if o["block"] == r["block"] and abs(o["i"] - r["i"]) <= near]
        with_phone = [o for o in found if o["phones"]]
        o = min(nearby or with_phone or found, key=lambda o: abs(o["i"] - r["i"]))
        if o["block"] == r["block"] and abs(o["i"] - r["i"]) <= near:
            o["aliases"].append(r["poc"])
        r["poc_row"] = o

    for r in rows:
        r["use"] = list(r["phones"])
        o = r.get("poc_row")
        if o:
            r["use"] += [p for p in o["phones"] if p not in r["use"]]
            if not o["phones"]:
                o.setdefault("borrow", r)

    guessed = []
    block_rows = {}
    for r in rows:
        block_rows.setdefault(r["block"], []).append(r)
    for r in rows:
        r["hint"] = None
        if r["phones"]:
            r["hint"] = r["shared"]   # "use <that person>'s number"
            continue
        if r["family"] is not None:
            # Grouped by a merged POC cell: use their POC's number, or the
            # first number in the family.
            fam = [o for o in rows if o["family"] == r["family"] and o["phones"]]
            o = r.get("poc_row")
            src = o if o and o["phones"] else (fam[0] if fam else None)
            if src:
                r["use"] += [p for p in src["use"] if p not in r["use"]]
                r["hint"] = src["name"]
            continue
        if r.get("borrow"):
            # Their POC row lists a number that's really theirs.
            src = r["borrow"]
            r["use"] += [p for p in src["use"] if p not in r["use"]]
            r["hint"] = src["name"]
            continue
        o = r.get("poc_row")
        if o and o["phones"]:
            # No number, but their POC (anywhere in the sheet) has one.
            r["hint"] = o["name"]
            continue
        if r["poc"]:
            continue   # starts its own household, but no number in the sheet
        mine = real_words(words(r["name"]))
        blk = block_rows[r["block"]]
        pos = blk.index(r)
        # Nearest household above, stopping at a row that starts a household.
        above = None
        for o in reversed(blk[:pos]):
            if o["phones"] or o["poc"]:
                above = o
                break
        below = None
        for o in blk[pos + 1:pos + 4]:
            if o["phones"] and shares_word(mine, household_words(o)):
                below = o
                break
            if o["poc"]:
                break
        if above and above["phones"] and shares_word(mine, household_words(above)):
            src = above
        elif below:
            src = below
        elif above and above["phones"]:
            # Maybe their household, maybe not: don't guess. They're asked
            # to contact Ishita or Sarvesh.
            guessed.append((r["name"], above["name"]))
            continue
        else:
            continue
        r["use"] += [p for p in src["use"] if p not in r["use"]]
        r["hint"] = src["name"]
    return guessed


def household_words(o):
    return real_words(words(o["name"])) + real_words(words(o["poc"]))


def first_name_words(rows):
    """The first word of a name is the first name; the rest are surnames."""
    def firsts(name):
        w = real_words(words(name))
        return set(w[:1])
    return firsts


# ---------- Building guests.js ----------

def derive(args):
    salt, text, size = args
    return hashlib.pbkdf2_hmac("sha256", text.encode(), salt.encode(),
                               ITERATIONS, dklen=size).hex()


def build(rows):
    """Plain-text keys and hints, before scrambling."""
    guessed = link_households(rows)
    firsts = first_name_words(rows)

    entries = {}   # "name|phone" -> [events, resort]
    hints = {}     # "?full name" -> hint name

    def add(text, events, resort):
        old = entries.get(text)
        if old:
            ev = "".join(e for e in "HSWC" if e in old[0] or e in events)
            entries[text] = [ev, old[1] or resort]
        else:
            entries[text] = [events, resort]

    no_number = []
    for r in rows:
        if not r["use"]:
            no_number.append(r["name"])
        for name in [r["name"]] + r["aliases"]:
            first = firsts(name)
            keys = [full_key(name)]
            keys += [x if x in first else "~" + x for x in real_words(words(name))]
            for p in r["use"]:
                for k in keys:
                    if k and k != "~":
                        add(f"{k}|{p}", r["events"], r["resort"])
            if not r["phones"] or r["hint"]:
                k = full_key(name)
                if k and k not in hints:
                    hints[k] = r["hint"] or ""
    return entries, hints, no_number, guessed


def main(csv_path, merges_path=None):
    rows = read_rows(csv_path, load_merges(merges_path))
    entries, hints, no_number, guessed = build(rows)

    salt = secrets.token_hex(8)
    jobs = [(salt, t, 12) for t in entries] + [(salt, "?" + k, 12 + HINT_BYTES) for k in hints]
    print(f"Scrambling {len(jobs)} keys (takes a few minutes)...")
    with Pool() as pool:
        out = pool.map(derive, jobs, chunksize=4)

    g = {}
    for (_, text, _), key in zip(jobs, out):
        if text in entries:
            g[key] = entries[text]
    h = {}
    for (_, text, size), key in zip(jobs, out):
        if size == 12:
            continue
        raw = bytes.fromhex(key)
        msg = hints[text[1:]].encode()[:HINT_BYTES].ljust(HINT_BYTES, b"\0")
        h[raw[:12].hex()] = bytes(a ^ b for a, b in zip(msg, raw[12:])).hex()

    data = {"salt": salt, "iter": ITERATIONS,
            "g": dict(sorted(g.items())), "h": dict(sorted(h.items()))}
    OUT.write_text(
        "// Generated by tools/build_guests.py. Do not edit by hand.\n"
        "window.GUESTS = " + json.dumps(data, separators=(",", ":")) + ";\n",
        encoding="utf-8")
    print(f"{len(rows)} guests -> {OUT.relative_to(ROOT)}")

    # Rows with no first name of their own ("Kushal Shah Wife", "Thuse kaku").
    relation = re.compile(r"(" + "|".join(sorted(NOT_NAMES - {"mr", "mrs", "ms", "dr", "family", "toddler"})) + r")$")
    nameless = [r["name"] for r in rows
                if any(relation.search(x) for x in re.findall(r"[a-z]+", r["name"].lower()))]
    if nameless:
        print(f"\n{len(nameless)} rows have no first name, so they can't log in. "
              "Put the person's real name in the sheet and rebuild:")
        for p in nameless:
            print("  -", p)
    unclear = {p for p, _ in guessed} | set(nameless)
    no_number = [p for p in no_number if p not in unclear]
    if no_number:
        print(f"\n{len(no_number)} guests can't log in yet: neither they nor "
              "their household have a phone number in the sheet. Add one and rebuild.")
        for p in no_number:
            print("  -", p)
    guessed = [g for g in guessed if g[0] not in nameless]
    if guessed:
        print(f"\n{len(guessed)} guests have no number and don't share a surname "
              "with the row above, so they can't log in yet. Add their number (or fix the "
              "household) in the sheet and rebuild:")
        for p, src in guessed:
            print(f"  - {p}  (row above: {src})")


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    main(*sys.argv[1:])
