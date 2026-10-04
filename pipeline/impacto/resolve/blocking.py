from __future__ import annotations

import re
from collections import defaultdict

from impacto.resolve.model import Record
from impacto.text import normalize, tokens

GENERIC = {
    "parque", "planta", "plantas", "proyecto", "instalacion", "fotovoltaico", "fotovoltaica", "fotovoltaicos",
    "solar", "eolico", "eolica", "psfv", "pfv", "pe", "de", "la", "el", "los", "las", "del", "y", "e",
    "s", "l", "u", "a", "sl", "slu", "sa", "sau", "mw", "mwp", "mwn",
    # The kind of works, not the plant: "Repotenciación P.E. El Gallego" and
    # "Repotenciación P.E. La Herrería" share nothing that names them.
    "repotenciacion", "hibridacion", "hibrida", "hibrido", "agrofotovoltaica", "fv", "psf", "hsf", "isf", "pvs",
    "modificacion", "sustancial",
}
# A capacity figure ("50 MW", "90,5 MWp") describes a project, it does not
# name it. Left in, its number becomes the last token and phase_token reads
# it as a phase, which blocks two documents of one project from grouping.
_CAPACITY = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:mwp|mwn|mwh|mw|kwp|kwn|kw|kv)\b")


# Andalusian environmental procedures: type, province, number, year
# ("aau/ja/0073/20", "aaus/se/070/2025/n"); wind farms authorised before the
# AAU carry "a1/76/1997". A suffix such as "/m1", " ms1" or "/n" marks a
# modification or the format, not another procedure, so it is not read.
_PROCEDURE = re.compile(r"^(aaus|aaua|aaui|aau|aai)[/_-]([a-z]{2})[/_-]0*(\d+)[/_-](?:19|20)?(\d{2})\b")
# The ministry's files for state-authorised plants: "PFot-365", "PFOT 365",
# "PEol-512"; a suffix such as " AC" is part of the same file.
_STATE = re.compile(r"^(pfot|peol|phib)[\s_-]*0*(\d+)\b")
_LEGACY_WIND = re.compile(r"^a1/0*(\d+)/(?:19|20)?(\d{2})\b")


def procedure_key(expediente: str | None) -> tuple[str, str, str] | None:
    """(type and province, number, year) of a regional or state procedure, or None for any other format.

    A state file carries no year in its number, so its year is "".
    """
    if not expediente:
        return None
    if m := _PROCEDURE.match(expediente):
        return f"{m.group(1)}/{m.group(2)}", m.group(3), m.group(4)
    if m := _LEGACY_WIND.match(expediente):
        return "a1", m.group(1), m.group(2)
    if m := _STATE.match(expediente):
        return m.group(1), m.group(2), ""
    return None


def name_key(name: str) -> str:
    return " ".join(t for t in tokens(_CAPACITY.sub(" ", normalize(name))) if t not in GENERIC)


def candidate_pairs(records: list[Record]) -> set[tuple[int, int]]:
    pairs: set[tuple[int, int]] = set()
    by_exp: dict[str, list[int]] = defaultdict(list)
    by_token: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(records):
        if r.expediente:
            proc = procedure_key(r.expediente)
            by_exp["/".join(proc) if proc else r.expediente].append(i)
        if r.name:
            for t in set(name_key(r.name).split()):
                if len(t) >= 4:
                    by_token[t].append(i)
    for idxs in by_exp.values():
        for a in idxs:
            for b in idxs:
                if a < b:
                    pairs.add((a, b))
    for idxs in by_token.values():
        for a in idxs:
            for b in idxs:
                if a < b and records[a].municipalities & records[b].municipalities:
                    pairs.add((a, b))
    return pairs
