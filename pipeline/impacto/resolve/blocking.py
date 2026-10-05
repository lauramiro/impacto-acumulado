from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from difflib import SequenceMatcher

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
_STATE = re.compile(r"(?:^|[\s/(])(pfot|peol|phib|solter)(?:[\s_-]*(fv|alm))?[\s_-]*0*(\d+)(?:[\s_-]*(ampl|[a-z]{1,3}))?\b")
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


# Correction notices. Each names the document it corrects in its title: the
# instrument and its date, and in BOJA the issue that published it
# ("Corrección de errores de la Resolución de 19 de julio de 2023, de la
# Delegación ... en Cádiz, ... (BOJA núm. 140, de 24 de julio de 2023)"); the
# ministry writes "Resolución de 3 de abril de 2023, de la Dirección General
# ..., por la que se corrigen errores en la de 22 de diciembre de 2022, por
# la que se formula ...". The stored text carries no reference block, so a
# BOE identifier in the body is read only when the title names no date.
_MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre"
_DATE = rf"\d{{1,2}} de (?:{_MONTHS}) de \d{{4}}"
_CORRECTION = re.compile(r"\bcorreccion de (?:errores|erratas)\b|\bse corrigen? (?:errores|erratas)\b")
_CORRECTION_OF = re.compile(rf"^correccion de (?:errores|erratas) (?:de la|del|de los|de las) (\w+ de {_DATE}.*)$")
_CORRECTS_IN = re.compile(
    rf"^(\w+) de {_DATE}(.*?),? por (?:la|el) que se corrigen? (?:errores|erratas) en (?:la|el) de ({_DATE})(.*)$"
)
_BOJA_ISSUE = re.compile(rf"\(boja (?:num\.?|n\.?o|no\.?) (\d+),? de (?:{_DATE}|\d{{1,2}}\.\d{{1,2}}\.\d{{4}})\)\.?")
_BOE_ID = re.compile(r"\bboe-[ab]-\d{4}-\d+\b")
# The second-best candidate must trail the best by this much, or the
# reference is ambiguous and no target is taken.
_CORRECTION_MARGIN = 0.05


@dataclass(frozen=True)
class Notice:
    document_id: int
    source: str
    source_id: str
    published_at: date
    title: str
    text: str = ""


def is_correction(title: str) -> bool:
    return bool(_CORRECTION.search(normalize(title)))


def corrected_reference(title: str) -> tuple[str, tuple[str, str] | None] | None:
    """What a correction's title says of the document it corrects, or None if it is no correction.

    Returns the corrected document's title as the correction restates it
    ("resolucion de 19 de julio de 2023, de la delegacion ...") and the BOJA
    (year, issue) that published it, when given. The restated title is "" when
    the correction names no date (a BOE anuncio's correction).
    """
    t = normalize(title)
    if not _CORRECTION.search(t):
        return None
    issue = None
    if m := _BOJA_ISSUE.search(t):
        issue = (re.findall(r"\d{4}", m.group(0))[-1], m.group(1))
        t = (t[: m.start()] + t[m.end() :]).strip()
    if m := _CORRECTION_OF.match(t):
        return m.group(1), issue
    if m := _CORRECTS_IN.match(t):
        return f"{m.group(1)} de {m.group(3)}{m.group(2)}{m.group(4)}", issue
    return "", issue


def _corrected_by_title(restated: str, issue, pool: list[Notice]) -> int | None:
    head = re.match(rf"\w+ de {_DATE}", restated).group(0)
    candidates = [
        n for n in pool
        if normalize(n.title).startswith(head)
        and (issue is None or n.source_id.startswith(f"disposition.{issue[0]}.{issue[1]}."))
    ]
    ranked = sorted(
        ((SequenceMatcher(None, restated, normalize(n.title)).ratio(), n.document_id) for n in candidates),
        reverse=True,
    )
    if not ranked or (len(ranked) > 1 and ranked[0][0] - ranked[1][0] < _CORRECTION_MARGIN):
        return None
    return ranked[0][1]


def correction_targets(notices: list[Notice]) -> dict[int, int]:
    """Correction document id -> id of the document it corrects, for each correction whose target is found.

    The target is a document of the same gazette, published no later than the
    correction, that is not itself a correction, and whose title opens with
    the instrument and date the correction names (and, for BOJA, sits in the
    issue it names); among several, the one whose title the correction
    restates most closely, if clearly so.
    """
    corrections = {n.document_id: corrected_reference(n.title) for n in notices}
    by_source_id = {n.source_id.lower(): n for n in notices if corrections[n.document_id] is None}
    out: dict[int, int] = {}
    for c in notices:
        ref = corrections[c.document_id]
        if ref is None:
            continue
        restated, issue = ref
        pool = [
            n for n in notices
            if corrections[n.document_id] is None and n.source == c.source and n.published_at <= c.published_at
        ]
        if restated:
            target = _corrected_by_title(restated, issue, pool)
        else:
            named = {by_source_id[i].document_id for i in _BOE_ID.findall(normalize(c.text)) if i in by_source_id}
            target = named.pop() if len(named) == 1 else None
        if target is not None:
            out[c.document_id] = target
    return out
