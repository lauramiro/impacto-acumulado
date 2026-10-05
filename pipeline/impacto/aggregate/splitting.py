"""Possible splitting: sibling projects that each stay under 50 MW and together exceed it.

Article 3.13.a of Ley 24/2013, del Sector Eléctrico, gives the State the
authorisation of peninsular generation plants "de potencia eléctrica
instalada superior a 50 MW"; below that the Junta de Andalucía authorises.
Splitting one plant into several under the threshold is a pattern objectors
point to. This module flags the pattern; it is not a legal finding.

A group is flagged when all hold:
- its projects share a developer family (impacto.developers.resolved_family);
- there are at least two;
- none was assessed by the State (a DIA or informe of the Ministry in the
  BOE, section III): the Ministry's review is what the pattern would avoid,
  so a project it assessed cannot be part of one. Hybridisations and
  extensions under 50 MW often reach the Ministry this way;
- each declares MW (mw_best) under 50, and together they exceed 50;
- each is linked to another of the group by a shared or neighbouring
  municipality, and all their first documents fall within 24 months of the
  group's earliest (windows are taken from the family's earliest project on).
"""

from __future__ import annotations

from datetime import date

from impacto.developers import Group, developer_key, load_groups, resolved_family, split_names

THRESHOLD_MW = 50.0
WINDOW_MONTHS = 24


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


def splitting_candidates(
    projects: list[dict],
    adjacency: set[tuple[str, str]],
    groups: dict[str, Group] | None = None,
) -> list[dict]:
    """`projects`: dicts with id, developer, mw_best, first_seen, ine_codes (set), state_assessed. `adjacency`: pairs of neighbouring INE codes. `groups`: developer_groups.csv rows (read from the file when None)."""
    if groups is None:
        groups = load_groups()
    by_family: dict[str, list[dict]] = {}
    for p in projects:
        if p["mw_best"] is None or not (0 < p["mw_best"] < THRESHOLD_MW) or not p["ine_codes"]:
            continue
        if p["state_assessed"]:
            continue
        for f in families(p["developer"], groups):
            by_family.setdefault(f, []).append(p)
    seen: set[frozenset[int]] = set()
    out = []
    for family, members in sorted(by_family.items()):
        # Time first: windows of 24 months from the earliest first document,
        # so pairwise links cannot chain a group beyond the window.
        windows: list[list[dict]] = []
        for p in sorted(members, key=lambda p: (p["first_seen"], p["id"])):
            if (
                windows
                and _months_apart(windows[-1][0]["first_seen"], p["first_seen"]) <= WINDOW_MONTHS
            ):
                windows[-1].append(p)
            else:
                windows.append([p])
        parent = {p["id"]: p["id"] for p in members}
        for window in windows:
            for i, a in enumerate(window):
                for b in window[i + 1 :]:
                    if _near(a, b, adjacency):
                        parent[_find(parent, a["id"])] = _find(parent, b["id"])
        groups: dict[int, list[dict]] = {}
        for p in members:
            groups.setdefault(_find(parent, p["id"]), []).append(p)
        for group in groups.values():
            ids = frozenset(p["id"] for p in group)
            total = sum(p["mw_best"] for p in group)
            if len(group) < 2 or total <= THRESHOLD_MW or ids in seen:
                continue
            seen.add(ids)
            group.sort(key=lambda p: p["id"])
            out.append(
                {
                    "family": family,
                    "project_ids": [p["id"] for p in group],
                    "mw": [round(p["mw_best"], 4) for p in group],
                    "mw_total": round(total, 4),
                    "ine_codes": sorted(set().union(*(p["ine_codes"] for p in group))),
                    "first_seen": [
                        min(p["first_seen"] for p in group).isoformat(),
                        max(p["first_seen"] for p in group).isoformat(),
                    ],
                }
            )
    return sorted(out, key=lambda g: (-len(g["project_ids"]), g["family"]))
