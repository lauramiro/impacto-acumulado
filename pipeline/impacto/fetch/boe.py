from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from typing import Any

from impacto.text import normalize

SUMMARY_BASE = "https://www.boe.es/datosabiertos/api/boe/sumario/"
SUMMARY_HEADERS = {"Accept": "application/json"}
# The readable page of a document. The summary's url_html points here; the
# XML (url_xml, application/xml) is only for reading the text.
HTML_BASE = "https://www.boe.es/diario_boe/txt.php?id="

ANDALUSIAN_PROVINCES = ["almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"]
RENEWABLE_WORDS = ["fotovoltaic", "solar", "eolic", "hibrid", "renovable"]


@dataclass(frozen=True)
class SummaryItem:
    identifier: str
    title: str
    section: str
    department: str
    xml_url: str
    # Stored as the document's url and shown as "Ver en el BOE": the HTML page
    # for people. xml_url is only fetched for the text.
    html_url: str = ""


@dataclass(frozen=True)
class ParsedDocument:
    identifier: str
    title: str
    published_at: date
    department: str
    text: str


def summary_url(day: date) -> str:
    return SUMMARY_BASE + day.strftime("%Y%m%d")


def html_url(identifier: str) -> str:
    """The readable BOE page for an identifier (BOE-A-... or BOE-B-...)."""
    return HTML_BASE + identifier


def _section_label(nombre: str) -> str:
    """Extract the roman-numeral section label from a seccion.nombre value.

    BOE seccion.nombre looks like "III. Otras disposiciones" or
    "V. Anuncios. - A. Contratación del Sector Público"; the label is the
    text before the first period.
    """
    return nombre.split(".", 1)[0].strip()


def _walk(node: Any, section: str, department: str, parent_key: str = "") -> Iterator[SummaryItem]:
    if isinstance(node, dict):
        if "identificador" in node and "titulo" in node:
            yield SummaryItem(
                identifier=str(node["identificador"]),
                title=str(node["titulo"]),
                section=section,
                department=department,
                xml_url=str(node.get("url_xml", "")),
                html_url=str(node.get("url_html") or html_url(str(node["identificador"]))),
            )
            return
        if parent_key == "seccion" and "nombre" in node:
            section = _section_label(str(node["nombre"]))
        elif parent_key == "departamento" and "nombre" in node:
            department = str(node["nombre"])
        for key, value in node.items():
            yield from _walk(value, section, department, parent_key=key)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value, section, department, parent_key=parent_key)


def walk_items(summary: dict) -> list[SummaryItem]:
    return list(_walk(summary, section="", department=""))


def _has_any(text: str, words: list[str]) -> bool:
    n = normalize(text)
    return any(w in n for w in words)


def select_items(items: list[SummaryItem]) -> list[SummaryItem]:
    out = []
    for item in items:
        if item.section != "III":
            continue
        if "transicion ecologica" not in normalize(item.department):
            continue
        if "impacto ambiental" not in normalize(item.title):
            continue
        if not _has_any(item.title, RENEWABLE_WORDS):
            continue
        out.append(item)
    return out


def mentions_andalusia(text: str) -> bool:
    return _has_any(text, ANDALUSIAN_PROVINCES + ["andalucia"])


def consulted_andalusian_authority(text: str) -> bool:
    """Whether the body consults a territorial delegation of the Junta de Andalucía.

    The regional environmental authority for an Andalusian project is a
    "Delegación Territorial en <province> de la Consejería ... de la Junta de
    Andalucía", and the consulted-bodies table of a state resolution names it
    only when the project sits in that province. Used as a second chance for
    the documents whose title names no province at all - typically
    "modificación de condiciones" resolutions, which restate only the project
    name (observed for BOE-A-2025-11509, "Instalación fotovoltaica Puerto Real
    110 MW", in Cádiz).

    A bare "Junta de Andalucía" mention is not enough: non-Andalusian
    resolutions cite its technical guidance - a bat-mortality wind-speed
    instruction in BOE-A-2022-7119 (Huesca), a game-species monitoring
    programme in BOE-A-2026-13449 (Toledo). Pairing the phrase with a province
    separates the two (checked over all 624 renewable resolutions of 2019-01 to
    2026-09: 72 selected, no misses, no false positives).
    """
    n = normalize(text)
    return any(f"delegacion territorial en {p}" in n for p in ANDALUSIAN_PROVINCES)


def select_consultation_items(items: list[SummaryItem]) -> list[SummaryItem]:
    """Section V announcements that put a renewable project in Andalucía to consultation.

    The State's industry and energy offices (and sometimes the Junta) publish
    these; the ministry's decisions are in section III (select_items). Whether
    the consultation covers the environmental assessment is decided on the
    text, see assesses_environment.
    """
    return [
        item
        for item in items
        if item.section == "V"
        and "informacion publica" in normalize(item.title)
        and _has_any(_GRID_FOR_RENEWABLES.sub(" ", normalize(item.title)), RENEWABLE_WORDS)
        and mentions_andalusia(item.title)
    ]


# Red Eléctrica's grid works name renewables only as what they evacuate: "Nueva
# subestación Ronda ... para evacuación de renovables" (BOE-B-2022-18446, 3150
# MVA), the Cártama and Jordana "Posición EVRE" bays. They are not plants.
_GRID_FOR_RENEWABLES = re.compile(r"evacuacion de (?:las )?(?:energias )?renovables")


_ENVIRONMENT_TITLE = ["impacto ambiental", "evaluacion ambiental", "estudio de impacto"]
# In the body, only wording that puts the assessment itself under consultation.
# A plant that "ha obtenido declaración de impacto ambiental" is past it: the
# consultation is on its energy permit or expropriation (observed in 2023-2026
# public-utility and modification notices). Storage exempt from the assessment
# (Real Decreto 997/2025) says so with "exento del trámite" or asks for the
# "exención del trámite" (BOE-B-2026-15229, BOE-B-2026-15996).
_ENVIRONMENT_BODY = ["estudio de impacto ambiental", "evaluacion de impacto ambiental ordinaria", "evaluacion de impacto ambiental simplificada"]
_EXEMPTION = re.compile(r"(?:exent[ao]s?|exencion) del tramite de evaluacion de impacto ambiental[^.]*")


def assesses_environment(title: str, body: str) -> bool:
    """Whether a consultation covers the environmental assessment, not only the energy permit or expropriation."""
    if _has_any(title, _ENVIRONMENT_TITLE):
        return True
    return _has_any(_EXEMPTION.sub(" ", normalize(body)), _ENVIRONMENT_BODY)


def concerns_andalusia(title: str, body: str) -> bool:
    return mentions_andalusia(title) or consulted_andalusian_authority(body)


def _text_of(element: ET.Element | None) -> str:
    return "".join(element.itertext()).strip() if element is not None else ""


def parse_document_xml(raw: bytes) -> ParsedDocument:
    root = ET.fromstring(raw)
    meta = root.find("metadatos")
    if meta is None:
        raise ValueError("BOE document has no metadatos element")
    texto = root.find("texto")
    if texto is None:
        raise ValueError("BOE document has no top-level texto element")
    published = _text_of(meta.find("fecha_publicacion"))
    # Iterate p elements scoped to the top-level texto only: a second,
    # unrelated texto element can appear nested under
    # analisis/referencias/posteriores/posterior, and root.iter("p") would
    # wrongly pick up its paragraphs too.
    paragraphs = [_text_of(p) for p in texto.iter("p")]
    return ParsedDocument(
        identifier=_text_of(meta.find("identificador")),
        title=_text_of(meta.find("titulo")),
        published_at=date(int(published[:4]), int(published[4:6]), int(published[6:8])),
        department=_text_of(meta.find("departamento")),
        text="\n".join(p for p in paragraphs if p),
    )
