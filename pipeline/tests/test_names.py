import pytest

from evaluation.run_eval import score
from impacto.extract.names import trim_project_name

# (source_id, stored v3 extraction, label). Seven misses are descriptive tails.
TAIL_MISSES = [
    ("BOE-A-2022-15703",
     "Parque Fotovoltaico Retuerta (38 MW) y Parque Eólico Retuerta (38 MW) con infraestructura de evacuación",
     "Parque Fotovoltaico Retuerta"),
    ("BOE-A-2022-18089", "Planta fotovoltaica Carbo de 90 MWp y su infraestructura de evacuación", "Planta fotovoltaica Carbo"),
    ("BOE-A-2024-16661", "Parque fotovoltaico Tabernas 100 MW", "Parque fotovoltaico Tabernas 100"),
    ("disposition.2024.38.48", "Solar Airport PV e infraestructura de evacuación", "Solar Airport PV"),
    ("disposition.2025.23.46", "Parque Eólico Los Morales e infraestructura de evacuación", "Parque Eólico Los Morales"),
    ("disposition.2025.63.37", "Parque eólico Los Morales e infraestructura de evacuación", "Parque eólico Los Morales"),
    ("disposition.2026.125.87",
     ("Planta de Almacenamiento Teleiro Los Barrios, de potencial instalada de 5 MW y 20 MWH y línea de evacuación "
      "20 kV DC y Centro de Seccionamiento Asociados"),
     "Planta de Almacenamiento Teleiro Los Barrios"),
]
# Two misses are in the head of the name, which the contract forbids touching:
# (source_id, stored, what the trimmer must return). Both stay misses.
HEAD_MISSES = [
    ("disposition.2025.144.69",
     "Proyecto de parque fotovoltaico Tabernas Solar 3 de 35 MWP y su infraestructura de evacuación",
     "Proyecto de parque fotovoltaico Tabernas Solar 3"),
    ("disposition.2026.142.33", "Repotenciación del Parque Eólico Carrascal I", "Repotenciación del Parque Eólico Carrascal I"),
]
# Six already match their label; the trimmer must leave them exactly as they are.
ALREADY_RIGHT = [
    "Instalación Fotovoltaica Don Rodrigo",
    "Parque eólico Hinojosa Ampliación",
    "Parque eólico Hinojosa",
    "Módulo de almacenamiento OPDE Miramundo",
    "Instalación híbrida Cartuja",
    "Gelo",
]


@pytest.mark.parametrize(("source_id", "got", "label"), TAIL_MISSES, ids=[c[0] for c in TAIL_MISSES])
def test_tail_misses_are_trimmed_to_the_label(source_id, got, label):
    trimmed = trim_project_name(got)
    assert trimmed == label
    assert score({"project_name": label}, {"project_name": trimmed}) == {"project_name": True}


@pytest.mark.parametrize(("source_id", "got", "want"), HEAD_MISSES, ids=[c[0] for c in HEAD_MISSES])
def test_head_misses_lose_only_their_tail(source_id, got, want):
    assert trim_project_name(got) == want


@pytest.mark.parametrize("name", ALREADY_RIGHT)
def test_names_that_already_match_are_untouched(name):
    assert trim_project_name(name) == name


@pytest.mark.parametrize("name", [
    "Parque fotovoltaico Tabernas 100",  # trailing number with no unit
    "Parque eolico Ronda II",  # trailing phase marker
    "Planta Solar Cortijo de 3 Hermanos",  # "de <number>" with no unit
])
def test_contract_keeps_numbers_and_phases_that_are_part_of_the_name(name):
    assert trim_project_name(name) == name


def test_a_cut_that_would_empty_the_name_is_not_made():
    assert trim_project_name("de 50 MW") == "de 50 MW"
