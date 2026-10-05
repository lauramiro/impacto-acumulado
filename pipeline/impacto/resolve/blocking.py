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
    # Storage modules and evacuation works: "Módulo de almacenamiento de energía
    # por baterías para su hibridación con la planta existente GES" and "...
    # Agatha" are named by the last word alone; left in, the shared wording
    # grouped GES, Zafra and Agatha, and Garita with Dulcinea.
    "modulo", "almacenamiento", "energia", "baterias", "bateria", "bess", "existente", "por", "para", "su", "con",
    "un", "una", "infraestructura", "infraestructuras", "evacuacion", "comunes", "linea", "lineas", "electrica",
    "subestacion", "set", "nudo", "mediante", "incorporacion", "generacion", "grupo",
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
# "PEol-512". A letter suffix names another file: "PFot-365 AC" (Natera and
# Orla Solar) is not "PFOT 365" (Posets and Faballones Solar).
# Storage and hybridisation are files of their own: "PFot-ALM-194" (a battery
# module for an existing plant), "PEol-FV-252" (wind added to a solar plant),
# "SolTer-ALM-12". The number can follow a gazette reference ("001/2019 PFOT 032").
_STATE = re.compile(r"(?:^|[\s/(])(pfot|peol|phib|solter)(?:[\s_-]*(fv|alm))?[\s_-]*0*(\d+)(?:[\s_-]*([a-z]{1,3}))?\b")
_NOT_SUFFIX = {"y", "e", "o", "de", "del", "la", "el", "en"}
_LEGACY_WIND = re.compile(r"^a1/0*(\d+)/(?:19|20)?(\d{2})\b")


def procedure_key(expediente: str | None) -> tuple[str, str, str] | None:
    """(type and province, number, year) of a regional or state procedure, or None for any other format.

    A state file carries no year in its number; its third part is its letter suffix, or "".
    """
    if not expediente:
        return None
    if m := _PROCEDURE.match(expediente):
        return f"{m.group(1)}/{m.group(2)}", m.group(3), m.group(4)
    if m := _LEGACY_WIND.match(expediente):
        return "a1", m.group(1), m.group(2)
    if m := _STATE.search(expediente):
        family, sub, number, suffix = m.group(1), m.group(2), m.group(3), m.group(4) or ""
        if suffix == "alm" and not sub:
            sub, suffix = "alm", ""
        if suffix in _NOT_SUFFIX:
            suffix = ""
        return (f"{family}-{sub}" if sub else family), number, suffix
    return None


def same_family(a: str, b: str) -> bool:
    """Whether two procedure families number the same kind of file.

    A storage or hybrid state file shares a family with its base ("pfot-alm"
    and "pfot"; "peol-fv" with both "peol" and "pfot"), so two such files with
    different numbers are two projects. "pfot" and "peol" number separately.
    """
    def parts(f: str) -> set[str]:
        return {"pfot" if p == "fv" else p for p in f.split("-") if p != "alm"}
    return a == b or bool(parts(a) & parts(b))


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
