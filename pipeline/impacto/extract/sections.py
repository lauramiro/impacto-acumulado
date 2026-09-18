from __future__ import annotations

import re

from impacto.text import normalize

# Ordered markers. Each maps the start of a section to its key. Matching is
# accent-insensitive and case-insensitive on a per-line basis (lines are run
# through impacto.text.normalize before matching).
#
# Verified against the three real BOE fixtures in tests/fixtures/:
#   - boe_doc_BOE-A-2023-19635.xml (Ronda I-III, developer CEPSA, favourable
#     with conditions)
#   - boe_doc_BOE-A-2023-2907.xml (favourable, Almeria)
#   - boe_doc_BOE-A-2023-2580.xml (unfavourable, Cadiz/Malaga)
#
# Real headings found (normalized form shown):
#   "alcance de la evaluacion"                     -- all three, right after
#                                                      the "Antecedentes de
#                                                      hecho" preamble that
#                                                      names the promoter.
#   "1. descripcion y localizacion del proyecto"   -- all three.
#   "3. analisis tecnico del expediente"           -- all three (the section
#                                                      number is always 3 in
#                                                      these fixtures, but the
#                                                      pattern accepts any
#                                                      number of digits).
#   "e) valoracion del organo ambiental."          -- 19635, as a lettered
#                                                      sub-heading inside the
#                                                      technical analysis.
#   "c) valoracion del organo ambiental."          -- 2580, same role.
#   "fundamentos de derecho"                       -- all three, right before
#                                                      the resolving text.
#   "1. condiciones al proyecto"                   -- 19635 and 2907. 2580 is
#                                                      unfavourable and has no
#                                                      such heading at all: its
#                                                      resolving paragraph
#                                                      (which imposes no
#                                                      conditions) follows
#                                                      directly after
#                                                      "Fundamentos de
#                                                      Derecho", so that marker
#                                                      is what makes
#                                                      `conditions` non-empty
#                                                      for that document too.
#
# Because sections only move forward, "Fundamentos de Derecho" always fires
# first (it precedes any "Condiciones al proyecto" / "Condicionado" heading in
# every fixture), and the later heading is simply absorbed into the
# already-open `conditions` section.
MARKERS = [
    ("description", re.compile(r"^(alcance de la evaluacion|\d+\.?\s*descripcion)")),
    (
        "assessment",
        re.compile(r"^(\d+\.?\s*analisis tecnico|([a-z]\)\s*)?valoracion del organo ambiental)"),
    ),
    (
        "conditions",
        re.compile(r"^(\d+\.?\s*)?(condiciones al proyecto|condicionado|condiciones|fundamentos de derecho)"),
    ),
]

ORDER = ["header", "description", "assessment", "conditions"]


def split_sections(text: str) -> dict[str, str]:
    parts = {k: [] for k in ORDER}
    current = "header"
    reached = {"header"}
    for line in text.splitlines():
        n = normalize(line)
        for key, rx in MARKERS:
            if key not in reached and rx.match(n) and ORDER.index(key) > ORDER.index(current):
                current = key
                reached.add(key)
                break
        parts[current].append(line)
    return {k: "\n".join(v).strip() for k, v in parts.items()}
