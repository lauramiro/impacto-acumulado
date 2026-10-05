"""Developer names as printed, reduced to keys a page can group by.

A project's `developer` holds the name as the gazette prints it, and several
names joined by "; " when a document names several companies. The same
company is printed many ways ("Enel Green Power España, S.L." and "Enel Green
Power España, SL"), so:

- `developer_key` drops accents, case, punctuation and the trailing legal form
  (S.L., S.L.U., S.A., S.A.U., A.I.E., "Sociedad Limitada"...), and returns a
  URL-safe slug;
- `family_key` drops a trailing number, roman numeral or number word from the
  key, so "Tayant Investment 12" and "Tayant Investment 15" share a family.
  A family is a naming pattern, not a finding that the companies are related;
- `pipeline/reference/developer_groups.csv` joins keys or families the rules
  cannot: spelling slips, and corporate groups when a source says so. A
  spelling row also joins families (`resolved_family`).
"""

from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from impacto.text import strip_accents

GROUPS_FILE = Path(__file__).resolve().parents[1] / "reference" / "developer_groups.csv"

_PARENTHESIS = re.compile(r"\([^)]*\)")
_NON_WORD = re.compile(r"[^a-z0-9]+")
# Letters then digits at the end of a word: "pv22" reads as "pv 22", "alpha1" as "alpha 1".
_LETTERS_DIGITS = re.compile(r"\b([a-z]+)(\d+)\b")
# Legal forms after punctuation has become spaces: "s l u", "slu", "s a", "sociedad limitada"...
_LEGAL_FORM = re.compile(
    r"(?:\s+(?:s\s?l\s?u|s\s?l\s?l|s\s?l|s\s?a\s?u|s\s?a|a\s?i\s?e|"
    r"sociedad (?:limitada|anonima)(?: unipersonal)?))+$"
)
_ROMAN = re.compile(r"^(?=[ivx]+$)x{0,3}(?:ix|iv|v?i{0,3})$")
_NUMBER_WORDS = frozenset(
    [
        "uno",
        "dos",
        "tres",
        "cuatro",
        "cinco",
        "seis",
        "siete",
        "ocho",
        "nueve",
        "diez",
        "once",
        "doce",
        "trece",
        "catorce",
        "quince",
        "dieciseis",
        "diecisiete",
        "dieciocho",
        "diecinueve",
        "veinte",
        "treinta",
        "cuarenta",
        "cincuenta",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
    ]
)


def split_names(developer: str | None) -> list[str]:
    """The company names in a project's developer field, as printed."""
    return [n.strip() for n in (developer or "").split(";") if n.strip()]


def _words(name: str) -> list[str]:
    text = _PARENTHESIS.sub(" ", strip_accents(name).lower())
    text = " " + " ".join(_NON_WORD.sub(" ", text).split())
    text = _LEGAL_FORM.sub("", text)
    text = _LETTERS_DIGITS.sub(r"\1 \2", text)
    return text.split()


def developer_key(name: str) -> str:
    """'Enel Green Power España, S.L.' -> 'enel-green-power-espana'. Empty for a name that is only a legal form."""
    return "-".join(_words(name))


def family_key(key: str) -> str:
    """The key without a trailing number, roman numeral or number word; the key itself when nothing is left."""
    words = key.split("-")
    last = words[-1]
    if len(words) > 1 and (last.isdigit() or _ROMAN.match(last) or last in _NUMBER_WORDS):
        return "-".join(words[:-1])
    return key


@dataclass(frozen=True)
class Group:
    name: str
    parent_company: str | None
    source_url: str | None


def resolved_family(key: str, groups: dict[str, Group]) -> str:
    """The family of a key, joined across spellings by developer_groups.csv.

    A row without a parent company joins spellings of one name ("Greenalia Solar
    PowerGuadame III" and "Greenalia Solar Power Guadame I"), so its keys take the
    family of the row's name. A row with a parent company is a corporate group, not
    a spelling: it leaves the family alone.
    """
    family = family_key(key)
    group = groups.get(key) or groups.get(family)
    if group and group.parent_company is None and (name_key := developer_key(group.name)):
        return family_key(name_key)
    return family


def load_groups(path: Path = GROUPS_FILE) -> dict[str, Group]:
    """Rows of developer_groups.csv by key; a row's key is a developer key or a family key."""
    if not path.exists():
        return {}
    with open(path, encoding="utf-8", newline="") as f:
        return {
            row["key"].strip(): Group(
                row["group"].strip(),
                row["parent_company"].strip() or None,
                row["source_url"].strip() or None,
            )
            for row in csv.DictReader(f)
            if row["key"].strip() and not row["key"].startswith("#")
        }


def build_developers(projects: list[dict], groups: dict[str, Group]) -> list[dict]:
    """One entry per developer key, from project rows with id, developer, status and mw_best.

    A project with several companies counts under each of them. `mw_by_status`
    sums mw_best (no MW for evacuation lines, as in every aggregate) and
    `mw_count` says how many of the projects declare it.
    """
    printed: dict[str, Counter[str]] = defaultdict(Counter)
    project_ids: dict[str, set[int]] = defaultdict(set)
    rows_by_id = {p["id"]: p for p in projects}
    for p in projects:
        for name in split_names(p.get("developer")):
            key = developer_key(name)
            if not key:
                continue
            printed[key][name] += 1
            project_ids[key].add(p["id"])
    out = []
    for key in sorted(printed):
        family = resolved_family(key, groups)
        group = groups.get(key) or groups.get(family_key(key))
        ids = sorted(project_ids[key])
        mw_by_status: dict[str, float] = defaultdict(float)
        projects_by_status: Counter[str] = Counter()
        mw_count = 0
        for i in ids:
            row = rows_by_id[i]
            projects_by_status[row["status"]] += 1
            if row.get("mw_best") is not None:
                mw_by_status[row["status"]] += float(row["mw_best"])
                mw_count += 1
        names = printed[key]
        out.append(
            {
                "key": key,
                "name": max(names, key=lambda n: (names[n], not n.isupper(), n)),
                "names": sorted(names),
                "family": family,
                "group": group.name if group else None,
                "parent_company": group.parent_company if group else None,
                "source_url": group.source_url if group else None,
                "project_ids": ids,
                "projects_by_status": dict(sorted(projects_by_status.items())),
                "mw_by_status": {s: round(v, 4) for s, v in sorted(mw_by_status.items())},
                "mw_count": mw_count,
            }
        )
    return out
