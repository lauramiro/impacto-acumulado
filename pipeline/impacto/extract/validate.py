from __future__ import annotations

from rapidfuzz import fuzz, process

from impacto.extract.schema import Extraction, Municipality
from impacto.text import normalize

MATCH_THRESHOLD = 90
RANGES = {"mw_peak": (0.1, 5000), "mw_nominal": (0.1, 5000), "hectares": (0.1, 50000), "turbines": (1, 500)}


def canonical_municipality(name: str, names: dict[str, str]) -> str | None:
    key = normalize(name)
    if key in names:
        return names[key]
    if not names:
        return None
    match = process.extractOne(key, list(names.keys()), scorer=fuzz.ratio)
    if match and match[1] >= MATCH_THRESHOLD:
        return names[match[0]]
    return None


def validate_and_score(extraction: Extraction, municipality_names: dict[str, str]) -> Extraction:
    problems = 0
    data = extraction.model_dump()

    fixed = []
    for m in extraction.municipalities:
        canonical = canonical_municipality(m.name, municipality_names)
        if canonical is None:
            problems += 1
            fixed.append(Municipality(name=m.name, province=m.province))
        else:
            fixed.append(Municipality(name=canonical, province=m.province))
    data["municipalities"] = [m.model_dump() for m in fixed]

    for field, (lo, hi) in RANGES.items():
        value = data.get(field)
        if value is not None and not (lo <= value <= hi):
            data[field] = None
            problems += 1

    data["confidence"] = max(0.0, round(extraction.confidence - 0.1 * problems, 6))
    return Extraction.model_validate(data)
