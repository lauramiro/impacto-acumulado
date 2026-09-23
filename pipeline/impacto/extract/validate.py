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


def _canonicalise(municipalities: list[Municipality], names: dict[str, str]) -> tuple[list[Municipality], int]:
    fixed, problems = [], 0
    for m in municipalities:
        canonical = canonical_municipality(m.name, names)
        if canonical is None:
            problems += 1
        fixed.append(m.model_copy(update={"name": canonical or m.name}))
    return fixed, problems


def validate_and_score(extraction: Extraction, municipality_names: dict[str, str]) -> Extraction:
    data = extraction.model_dump()

    # Municipalities the model tagged as reached only by the evacuation line
    # leave the generation site. Untagged ones stay, so a document the model
    # declines to tag behaves exactly as before.
    generation = [m for m in extraction.municipalities if m.role != "evacuacion"]
    evacuation = list(extraction.evacuation_municipalities) + [
        m for m in extraction.municipalities if m.role == "evacuacion"
    ]
    generation, problems = _canonicalise(generation, municipality_names)
    evacuation, evacuation_problems = _canonicalise(evacuation, municipality_names)
    problems += evacuation_problems
    data["municipalities"] = [m.model_dump() for m in generation]
    data["evacuation_municipalities"] = [m.model_dump() for m in evacuation]

    for field, (lo, hi) in RANGES.items():
        value = data.get(field)
        if value is not None and not (lo <= value <= hi):
            data[field] = None
            problems += 1

    data["confidence"] = max(0.0, round(extraction.confidence - 0.1 * problems, 6))
    return Extraction.model_validate(data)
