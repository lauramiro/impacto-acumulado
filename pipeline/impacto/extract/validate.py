from __future__ import annotations

import re

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


# A hybridisation notice describes the wind park the new plant joins ("Parque
# fotovoltaico Retuerta ... para su hibridación con el parque eólico existente
# Retuerta de 38 MW"), and the model copied that park's turbines into the
# plant. The clause naming the existing park is not what the project builds.
_HYBRIDISED_WITH = re.compile(
    r"\b(?:(?:para su )?hibridacion|hibridad[oa]) con (?:el |la |los )?(?:parque |planta |instalacion )?eolic\w*[^,;()]*"
)
_EXISTING_WIND = re.compile(r"\b(?:parque|planta|instalacion) eolic\w*[^,;()]*?\bexistentes?\b[^,;()]*")
_WIND = re.compile(r"\beolic[oa]s?\b|\baerogenerador")
_SOLAR = re.compile(r"\bfotovoltaic[oa]s?\b|\bmodulos?\b|\bsolar(?:es)?\b|\b(?:psfv|pfv|fv|psf|hsf|isf)\b")
# The first of these words says what the project mainly is: "Parque eólico
# Filabres, parque eólico Peregiles y parque solar fotovoltaico La Rambla" is
# wind; "Línea aérea desde Parque Eólico San Cristóbal" is a line.
_LEAD = re.compile(
    r"\b(?:(eolic)\w*|fotovoltaic\w*|solar\w*|modulos?|linea|lineas|subestacion|evacuacion|almacenamiento|baterias"
    r"|psfv|pfv|fv|psf|hsf|isf)\b"
)


def check_generation(name: str | None, technology: str | None, turbines: int | None) -> tuple[str | None, int | None, int]:
    """Technology and turbines checked against the project's name: (technology, turbines, problems found).

    Turbines on a project the name calls photovoltaic or a module, with no
    wind of its own, are held back. When the name names wind of its own, a
    solar, "otra" or missing technology is checked: a hybridisation of solar
    and wind is "hibrida", a name led by "eólico" is "eolica", and solar
    with wind is "hibrida". A wind park the project is only hybridised with
    does not count as the project's wind.
    """
    if not isinstance(name, str) or not name:
        return technology, turbines, 0
    subject = _EXISTING_WIND.sub(" ", _HYBRIDISED_WITH.sub(" ", normalize(name)))
    wind, solar = bool(_WIND.search(subject)), bool(_SOLAR.search(subject))
    problems = 0
    if turbines is not None and solar and not wind:
        turbines, problems = None, problems + 1
    if wind and technology in (None, "solar_fv", "otra"):
        lead = _LEAD.search(subject)
        checked = technology
        if solar and "hibrid" in subject:
            checked = "hibrida"
        elif lead and lead.group(1):
            checked = "eolica"
        elif solar and technology == "solar_fv":
            checked = "hibrida"
        if checked != technology:
            technology, problems = checked, problems + 1
    return technology, turbines, problems


def with_generation(payload: dict) -> dict:
    """The payload with check_generation applied, as validation applies it at extraction."""
    technology, turbines, problems = check_generation(
        payload.get("project_name"), payload.get("technology"), payload.get("turbines")
    )
    if not problems:
        return payload
    return {**payload, "technology": technology, "turbines": turbines}


def validate_and_score(extraction: Extraction, municipality_names: dict[str, str]) -> Extraction:
    data = extraction.model_dump()

    data["technology"], data["turbines"], problems = check_generation(
        extraction.project_name, extraction.technology, extraction.turbines
    )

    # Municipalities the model tagged as reached only by the evacuation line
    # leave the generation site. Untagged ones stay, so a document the model
    # declines to tag behaves exactly as before.
    generation = [m for m in extraction.municipalities if m.role != "evacuacion"]
    evacuation = list(extraction.evacuation_municipalities) + [
        m for m in extraction.municipalities if m.role == "evacuacion"
    ]
    generation, generation_problems = _canonicalise(generation, municipality_names)
    evacuation, evacuation_problems = _canonicalise(evacuation, municipality_names)
    problems += generation_problems + evacuation_problems
    data["municipalities"] = [m.model_dump() for m in generation]
    data["evacuation_municipalities"] = [m.model_dump() for m in evacuation]

    for field, (lo, hi) in RANGES.items():
        value = data.get(field)
        if value is not None and not (lo <= value <= hi):
            data[field] = None
            problems += 1

    data["confidence"] = max(0.0, round(extraction.confidence - 0.1 * problems, 6))
    return Extraction.model_validate(data)
