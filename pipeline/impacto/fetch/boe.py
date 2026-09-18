from __future__ import annotations

import xml.etree.ElementTree as ET
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from typing import Any

from impacto.text import normalize

SUMMARY_BASE = "https://www.boe.es/datosabiertos/api/boe/sumario/"
SUMMARY_HEADERS = {"Accept": "application/json"}

ANDALUSIAN_PROVINCES = ["almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"]
RENEWABLE_WORDS = ["fotovoltaic", "solar", "eolic", "hibrid", "renovable"]


@dataclass(frozen=True)
class SummaryItem:
    identifier: str
    title: str
    section: str
    department: str
    xml_url: str


@dataclass(frozen=True)
class ParsedDocument:
    identifier: str
    title: str
    published_at: date
    department: str
    text: str


def summary_url(day: date) -> str:
    return SUMMARY_BASE + day.strftime("%Y%m%d")


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
