from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any
from urllib.parse import quote

from impacto.fetch.boe import RENEWABLE_WORDS
from impacto.text import normalize

SEARCH_BASE = "https://datos.juntadeandalucia.es/api/v0/boja/get/search_pagination"

# campos values match the working example URL captured in docs/sources.md
# (the record's PDF link comes back nested as pdf[0].publicUrl even though
# "publicUrl" is the campos value requested).
SEARCH_CAMPOS = [
    "id",
    "organisation",
    "summary",
    "number",
    "date",
    "titleSec",
    "body",
    "bodyNoHtml",
    "publicUrl",
]

BOJA_QUERIES = [
    "autorizacion ambiental unificada",
    "informe de impacto ambiental",
    "informacion publica fotovoltaica",
    "informacion publica eolico",
]

INSTRUMENT_PHRASES = [
    "autorizacion ambiental unificada",
    "impacto ambiental",
    "informacion publica",
]

# The environment authority ("Sostenibilidad"/"Medio Ambiente") only; see
# docs/sources.md BOJA selection section. Organisation names churn across
# legislatures so this matches on keyword, not exact name. v1 deliberately
# excludes the industry/energy authority ("Industria"/"Energia"): its
# grid-connection (AAP) notices are a different instrument from the AAU and
# DIA decisions this pipeline tracks.
ENV_DEPARTMENT_WORDS = ["sostenibilidad", "medio ambiente"]

_HTML_TAG = re.compile(r"<[^>]+>")


@dataclass(frozen=True)
class BojaRecord:
    bid: str
    title: str
    organisation: str
    published_at: date
    url: str
    text: str


def search_url(date_from: date, date_to: date, query: str, page: int, size: int = 50) -> str:
    params = [
        ("order_by", "date"),
        ("mode", "DESC"),
        ("size", str(size)),
        ("page", str(page)),
        ("general", query),
        ("date_from", date_from.isoformat()),
        ("date_to", date_to.isoformat()),
    ]
    parts = [f"{key}={quote(str(value))}" for key, value in params]
    parts += [f"campos={campo}" for campo in SEARCH_CAMPOS]
    return f"{SEARCH_BASE}?" + "&".join(parts)


def _records_list(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("results"), list):
        return payload["results"]
    raise ValueError("cannot find the record list in BOJA payload")


def total_results(payload: Any) -> int | None:
    if isinstance(payload, dict) and isinstance(payload.get("total_hits"), int):
        return payload["total_hits"]
    return None


def _parse_date(value: str) -> date:
    day, month, year = value.split("/")
    return date(int(year), int(month), int(day))


def _strip_html(value: str) -> str:
    return _HTML_TAG.sub("", value).strip()


def _pdf_url(raw: dict) -> str:
    pdf = raw.get("pdf")
    if isinstance(pdf, list) and pdf and isinstance(pdf[0], dict):
        return str(pdf[0].get("publicUrl", ""))
    return ""


def parse_records(payload: Any) -> list[BojaRecord]:
    out = []
    for raw in _records_list(payload):
        out.append(
            BojaRecord(
                bid=str(raw["id"]),
                title=_strip_html(str(raw.get("summary", ""))),
                organisation=str(raw.get("organisation", "")),
                published_at=_parse_date(str(raw["date"])),
                url=_pdf_url(raw),
                text=str(raw.get("bodyNoHtml") or raw.get("body") or ""),
            )
        )
    return out


def select_records(records: list[BojaRecord]) -> list[BojaRecord]:
    out = []
    for r in records:
        org = normalize(r.organisation)
        title = normalize(r.title)
        # The real search-result summary usually names the instrument
        # ("autorizacion ambiental unificada para el proyecto que se cita")
        # without the technology word, which only appears in the body text
        # (see docs/sources.md and pipeline/tests/fixtures/boja_search_sample.json,
        # e.g. record id disposition.2023.61.99) - so the renewables word is
        # looked up in either the title or the full text.
        text = normalize(r.text)
        if not any(w in org for w in ENV_DEPARTMENT_WORDS):
            continue
        if not any(p in title for p in INSTRUMENT_PHRASES):
            continue
        if not any(w in title or w in text for w in RENEWABLE_WORDS):
            continue
        out.append(r)
    return out
