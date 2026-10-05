"""Possible splitting: sibling projects that each stay under 50 MW and together exceed it.

Article 3.13.a of Ley 24/2013, del Sector Eléctrico, gives the State the
authorisation of peninsular generation plants "de potencia eléctrica
instalada superior a 50 MW"; below that the Junta de Andalucía authorises.
Splitting one plant into several under the threshold is a pattern objectors
point to. This module flags the pattern; it is not a legal finding.

Two kinds of group, told apart by `kind`:

- "familia": the projects share a developer family
  (impacto.developers.resolved_family), and each is linked to another of the
  group by a shared or neighbouring municipality;
- "infraestructura": the projects share evacuation infrastructure, whatever
  their developers. A plant belongs to an evacuation project (technology
  linea_evacuacion) when that project's name lists it ("Infraestructura común
  para la Evacuación de las PSFV Almazara Solar, Atlante Solar ... y Fortaleza
  Solar") and the two share or neighbour a municipality; two projects whose
  names name the same substation ("SET El Canto") are joined when they share or
  neighbour a municipality. A group is the plants joined through those links.

For both kinds a group is flagged when also:
- there are at least two;
- none was assessed by the State (a DIA or informe of the Ministry in the
  BOE, section III): the Ministry's review is what the pattern would avoid,
  so a project it assessed cannot be part of one. Hybridisations and
  extensions under 50 MW often reach the Ministry this way;
- each declares MW (mw_best) under 50, and together they exceed 50;
- all their first documents fall within 24 months of the group's earliest
  (windows are taken from the earliest project on).

An infrastructure group with the same projects as a family group is left out:
it is already flagged.
"""

from __future__ import annotations

import re
from datetime import date

from impacto.developers import Group, developer_key, load_groups, resolved_family, split_names
from impacto.text import strip_accents, tokens

THRESHOLD_MW = 50.0
WINDOW_MONTHS = 24
LINE = "linea_evacuacion"

# Words that describe infrastructure rather than name a plant or a substation.
# A listed plant or a substation is named by the words left once these go.
_GENERIC = frozenset(
    ["a", "al", "alta", "aerea", "aereo", "aereas", "comun", "comunes", "colectora", "conexion", "conjunto", "de", "del", "desde", "e", "el", "en", "electrica", "electricas", "electrico", "energia", "evacuacion", "fotovoltaica", "fotovoltaicas", "fotovoltaico", "fotovoltaicos", "gestionada", "hasta", "hsf", "infraestructura", "infraestructuras", "instalacion", "instalaciones", "kv", "la", "laat", "lat", "las", "linea", "lineas", "los", "media", "modificacion", "mt", "para", "parque", "parques", "pfv", "planta", "plantas", "por", "posicion", "promotores", "proyecto", "psf", "psfv", "pv", "pvs", "red", "ree", "s", "se", "set", "sistema", "solar", "solares", "soterramiento", "subestacion", "subterranea", "subterraneo", "sus", "tension", "tramo", "transformadora", "transporte", "varias", "y"]
)
_ARTICLES = frozenset(["de", "del", "el", "la", "las", "los"])
_ROMAN = {
    "i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6",
    "vii": "7", "viii": "8", "ix": "9", "x": "10", "xi": "11", "xii": "12",
}  # fmt: skip
# Where one listed name ends and the next begins: commas, "y", brackets, quotes.
_LIST_SEPARATOR = re.compile(r"[,;()«»\"“”:.]|\sy\s|\se\s|\s-\s")
# "SET El Canto 30/220 kV", "subestación eléctrica «Chucena PV colectora»".
_SUBSTATION_START = re.compile(r"\b(?=set\s|subestacion\s)")
_SUBSTATION = re.compile(r"(?:set|subestacion(?:\s+electrica)?(?:\s+transformadora)?)\s+(.+)", re.DOTALL)


def _months_apart(a: date, b: date) -> int:
    return abs((a.year * 12 + a.month) - (b.year * 12 + b.month))


def _near(a: dict, b: dict, adjacency: set[tuple[str, str]]) -> bool:
    if a["ine_codes"] & b["ine_codes"]:
        return True
    return any(
        (x, y) in adjacency or (y, x) in adjacency for x in a["ine_codes"] for y in b["ine_codes"]
    )


def _find(parent: dict[int, int], i: int) -> int:
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def families(developer: str | None, groups: dict[str, Group]) -> set[str]:
    return {resolved_family(k, groups) for n in split_names(developer) if (k := developer_key(n))}


def _words(text: str) -> list[str]:
    """Lower-case words without accents; a roman numeral after the first word, or alone, reads as a number."""
    out = tokens(text)
    return [_ROMAN.get(w, w) if i or len(out) == 1 else w for i, w in enumerate(out)]


def _distinctive(words: list[str]) -> bool:
    return any(w not in _GENERIC and not w.isdigit() and len(w) > 2 for w in words)


def _trim(words: list[str], keep: frozenset[str] = frozenset()) -> list[str]:
    while words and words[0] in _GENERIC:
        words = words[1:]
    while words and words[-1] in _GENERIC and words[-1] not in keep:
        words = words[:-1]
    return words


def listed_plants(name: str) -> list[list[str]]:
    """The plant names an evacuation project's name lists, as words.

    "... de las PSFV Arcadia Carmona 1, 2 y 3 y Carmo 1, 2 y 3 (SET El Canto ...)" lists
    arcadia carmona 1, 2 and 3 and carmo 1, 2 and 3: a bare number takes the words of the
    name before it. Infrastructure words are dropped from either end of each name (a final
    "solar" stays), and a name left with none of its own ("línea de 30 kV") is not a plant
    name.
    """
    out: list[list[str]] = []
    stem: list[str] = []
    for part in _LIST_SEPARATOR.split(f" {strip_accents(name).lower()} "):
        # "Chucena Solar" keeps "solar": "chucena" alone would name any plant called after the town.
        words = _trim(_words(part), keep=frozenset(["solar"]))
        if len(words) > 1 and words[0].isdigit():
            # "15 kV de evacuación de las plantas ... El Naranjo 8": the name is what follows
            # the last infrastructure word.
            last = max(i for i, w in enumerate(words[:-1]) if w in _GENERIC or w.isdigit())
            words = _trim(words[last + 1 :], keep=frozenset(["solar"]))
        if len(words) == 1 and words[0].isdigit():
            if stem:
                out.append([*stem, words[0]])
            continue
        if not _distinctive(words):
            continue
        stem = words[:-1] if words[-1].isdigit() else words
        out.append(words)
    return out


def substations(name: str) -> set[str]:
    """The substations a project's name names, as keys: "SET El Canto 30/220 kV" -> "canto".

    A substation's name runs to its voltage or to the end of its list item; articles
    are dropped. A name of infrastructure words only ("SET colectora") names nothing
    that tells one substation from another.
    """
    out = set()
    for chunk in _SUBSTATION_START.split(strip_accents(name).lower()):
        m = _SUBSTATION.match(chunk.strip())
        if not m:
            continue
        words: list[str] = []
        for w in _words(_LIST_SEPARATOR.split(f" {m.group(1)} ")[0]):
            if "kv" in w or (w[0].isdigit() and not w.isdigit()) or w == "set":
                while words and words[-1].isdigit():
                    words.pop()  # "30/220kV": the numbers before kV are voltages
                break
            if w.isdigit() and words and words[-1].isdigit():
                words.pop()  # "220 400": a voltage, not a number in the name
                break
            words.append(w)
        while words and words[-1].isdigit() and len(words[-1]) > 2:
            words.pop()  # "Guillena 400": a voltage
        words = _trim(words)
        if _distinctive(words):
            out.add(" ".join(w for w in words if w not in _ARTICLES))
    return out


def _names_plant(item: list[str], plant_words: list[str]) -> bool:
    """Whether a listed name is in a plant's name word for word, and not followed by a further number."""
    n = len(item)
    for i in range(len(plant_words) - n + 1):
        if plant_words[i : i + n] == item:
            after = plant_words[i + n] if i + n < len(plant_words) else None
            if after is None or not after.isdigit():
                return True
    return False


def _qualifies(p: dict) -> bool:
    return (
        p["mw_best"] is not None
        and 0 < p["mw_best"] < THRESHOLD_MW
        and bool(p["ine_codes"])
        and not p["state_assessed"]
    )


def _windows(members: list[dict]) -> list[list[dict]]:
    """Members in runs of 24 months from each run's earliest first document.

    Time first, so pairwise links cannot chain a group beyond the window.
    """
    windows: list[list[dict]] = []
    for p in sorted(members, key=lambda p: (p["first_seen"], p["id"])):
        if windows and _months_apart(windows[-1][0]["first_seen"], p["first_seen"]) <= WINDOW_MONTHS:
            windows[-1].append(p)
        else:
            windows.append([p])
    return windows


def _flagged(group: list[dict]) -> bool:
    return len(group) >= 2 and sum(p["mw_best"] for p in group) > THRESHOLD_MW


def _entry(group: list[dict]) -> dict:
    group = sorted(group, key=lambda p: p["id"])
    return {
        "project_ids": [p["id"] for p in group],
        "mw": [round(p["mw_best"], 4) for p in group],
        "mw_total": round(sum(p["mw_best"] for p in group), 4),
        "ine_codes": sorted(set().union(*(p["ine_codes"] for p in group))),
        "first_seen": [
            min(p["first_seen"] for p in group).isoformat(),
            max(p["first_seen"] for p in group).isoformat(),
        ],
    }


def _family_groups(
    projects: list[dict], adjacency: set[tuple[str, str]], groups: dict[str, Group]
) -> list[dict]:
    by_family: dict[str, list[dict]] = {}
    for p in projects:
        if _qualifies(p):
            for f in families(p["developer"], groups):
                by_family.setdefault(f, []).append(p)
    seen: set[frozenset[int]] = set()
    out = []
    for family, members in sorted(by_family.items()):
        parent = {p["id"]: p["id"] for p in members}
        for window in _windows(members):
            for i, a in enumerate(window):
                for b in window[i + 1 :]:
                    if _near(a, b, adjacency):
                        parent[_find(parent, a["id"])] = _find(parent, b["id"])
        linked: dict[int, list[dict]] = {}
        for p in members:
            linked.setdefault(_find(parent, p["id"]), []).append(p)
        for group in linked.values():
            ids = frozenset(p["id"] for p in group)
            if _flagged(group) and ids not in seen:
                seen.add(ids)
                out.append({"kind": "familia", "family": family, **_entry(group)})
    return out


def _infrastructure_groups(projects: list[dict], adjacency: set[tuple[str, str]]) -> list[dict]:
    """Plants joined by an evacuation project that lists them, or by a substation their names share."""
    parent = {p["id"]: p["id"] for p in projects}

    def join(a: dict, b: dict) -> None:
        parent[_find(parent, a["id"])] = _find(parent, b["id"])

    plants = [p for p in projects if p.get("technology") != LINE]
    plant_words = {p["id"]: _words(p.get("name") or "") for p in plants}
    for line in projects:
        if line.get("technology") != LINE:
            continue
        items = listed_plants(line.get("name") or "")
        for plant in plants:
            if any(_names_plant(i, plant_words[plant["id"]]) for i in items) and _near(
                line, plant, adjacency
            ):
                join(line, plant)
    named: dict[str, list[dict]] = {}
    for p in projects:
        for s in substations(p.get("name") or ""):
            named.setdefault(s, []).append(p)
    for sharing in named.values():
        for i, a in enumerate(sharing):
            for b in sharing[i + 1 :]:
                if _near(a, b, adjacency):
                    join(a, b)

    components: dict[int, list[dict]] = {}
    for p in projects:
        components.setdefault(_find(parent, p["id"]), []).append(p)
    out = []
    for component in components.values():
        if len(component) < 2:
            continue
        members = [p for p in component if p.get("technology") != LINE and _qualifies(p)]
        lines = sorted(p["id"] for p in component if p.get("technology") == LINE)
        shared = sorted({s for p in component for s in substations(p.get("name") or "")})
        for window in _windows(members):
            if _flagged(window):
                out.append(
                    {
                        "kind": "infraestructura",
                        "family": None,
                        **_entry(window),
                        "infrastructure": {"project_ids": lines, "substations": shared},
                    }
                )
    return out


def splitting_candidates(
    projects: list[dict],
    adjacency: set[tuple[str, str]],
    groups: dict[str, Group] | None = None,
) -> list[dict]:
    """Family groups first, then infrastructure groups; larger groups first within each.

    `projects`: dicts with id, developer, mw_best, first_seen, ine_codes (set) and
    state_assessed, plus name and technology for the infrastructure groups (a project
    without them is in none). `adjacency`: pairs of neighbouring INE codes. `groups`:
    developer_groups.csv rows (read from the file when None).
    """
    if groups is None:
        groups = load_groups()
    family = sorted(
        _family_groups(projects, adjacency, groups),
        key=lambda g: (-len(g["project_ids"]), g["family"]),
    )
    flagged = {frozenset(g["project_ids"]) for g in family}
    infrastructure = sorted(
        (
            g
            for g in _infrastructure_groups(projects, adjacency)
            if frozenset(g["project_ids"]) not in flagged
        ),
        key=lambda g: (-len(g["project_ids"]), g["project_ids"]),
    )
    return family + infrastructure
