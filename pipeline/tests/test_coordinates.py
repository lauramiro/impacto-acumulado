import json
import math

import pytest

from impacto.extract.coordinates import find_coordinate_groups, find_points, to_lonlat
from impacto.fetch.boe import parse_document_xml

# A BOE resolution's table as parse_document_xml flattens it: one cell per line.
BOE_TURBINES = """1. Descripción y localización del proyecto
El parque eólico se ubica en el término municipal de Tarifa.
Las coordenadas UTM (ETRS89, huso 30) de los aerogeneradores son las siguientes:
Aerogenerador
X
Y
AE-01
254.321
4.003.456
AE-02
254.980
4.003.912
AE-03
255.640,50
4.004.377,25
La subestación se ubica en la parcela 12 del polígono 4."""

# A BOJA notice's body text: an inline list and a vertex table flattened onto one line.
BOJA_POLYGON = (
    "Emplazamiento: paraje Los Llanos, término municipal de Écija (Sevilla). "
    "Coordenadas UTM de los vértices de la poligonal de implantación (ETRS89 Huso 30): "
    "V1 X: 305123 Y: 4155321 V2 X: 306001 Y: 4155390 V3 X: 306050 Y: 4154700 V4 X: 305200 Y: 4154650. "
    "Presupuesto: 4.150.000 euros."
)


def test_reads_a_boe_table_cell_per_line_with_labels_and_decimals():
    points = find_points(BOE_TURBINES)
    assert [(p.label, p.x, p.y) for p in points] == [
        ("AE-01", 254321.0, 4003456.0),
        ("AE-02", 254980.0, 4003912.0),
        ("AE-03", 255640.5, 4004377.25),
    ]


def test_a_table_is_one_group_of_points_with_its_heading_zone_and_datum():
    [group] = find_coordinate_groups(BOE_TURBINES)
    assert group.kind == "puntos"
    assert group.zone == 30
    assert group.datum == "ETRS89"
    assert group.datum_stated
    assert group.evidence == "Las coordenadas UTM (ETRS89, huso 30) de los aerogeneradores son las siguientes:"


def test_vertices_make_a_polygon_and_a_budget_is_not_a_northing():
    [group] = find_coordinate_groups(BOJA_POLYGON)
    assert group.kind == "poligono"
    assert [p.label for p in group.points] == ["V1", "V2", "V3", "V4"]
    assert group.points[0].x == 305123.0
    assert group.points[-1].y == 4154650.0
    assert group.zone == 30


def test_northing_first_and_spanish_and_english_decimals():
    text = "Coordenadas UTM: Y = 4.120.214,5; X = 389.751,25. Otra: 389751.25 4120214.50"
    assert [(p.x, p.y) for p in find_points(text)] == [(389751.25, 4120214.5), (389751.25, 4120214.5)]


def test_a_document_that_never_mentions_coordinates_yields_nothing():
    text = "Importes parciales de la obra civil: 254.321 / 4.003.456."
    assert find_points(text)  # the numbers alone would pass...
    assert find_coordinate_groups(text) == []  # ...but nothing announces coordinates


def test_numbers_with_words_between_them_are_not_a_point():
    text = "Coordenadas UTM. La línea tiene 254.321 metros de longitud y ocupa la finca 4.003.456 del catastro."
    assert find_points(text) == []


def test_ed50_is_read_from_the_heading_nearest_the_table():
    text = (
        "Las coordenadas de este documento se expresan en ETRS89 salvo indicación.\n"
        + "x" * 700
        + "\nCoordenadas UTM ED50 huso 29 del centro de la planta:\nX: 680.500 Y: 4.150.250"
    )
    [group] = find_coordinate_groups(text)
    assert (group.datum, group.zone) == ("ED50", 29)


def test_zone_falls_back_to_the_document_and_is_none_when_never_stated():
    stated = "Proyecto en huso 30.\n" + "z" * 700 + "\nCoordenadas UTM: X 559.820 Y 4.104.987"
    [group] = find_coordinate_groups(stated)
    assert group.zone == 30
    [unstated] = find_coordinate_groups("Coordenadas UTM: X 559.820 Y 4.104.987")
    assert unstated.zone is None
    assert unstated.datum == "ETRS89" and not unstated.datum_stated


def test_two_plots_in_one_vertex_table_are_two_rings():
    text = (
        "Coordenadas UTM ETRS89 huso 30 de los vértices de los recintos vallados:\n"
        "V1 305123 4155321\nV2 306001 4155390\nV3 306050 4154700\n"
        "V1 310000 4150000\nV2 310500 4150000\nV3 310500 4149500\n"
    )
    groups = find_coordinate_groups(text)
    assert [g.kind for g in groups] == ["poligono", "poligono"]
    assert [len(g.points) for g in groups] == [3, 3]


def test_tables_far_apart_are_separate_groups():
    text = (
        "Coordenadas UTM ETRS89 huso 30 de los aerogeneradores:\nA1 254321 4003456\n"
        + "Texto de la resolución. " * 10
        + "\nCoordenadas UTM de la subestación:\nSET 256000 4004000"
    )
    groups = find_coordinate_groups(text)
    assert [len(g.points) for g in groups] == [1, 1]
    assert groups[1].points[0].label == "SET"
    assert groups[1].evidence == "Coordenadas UTM de la subestación:"


GRS80_A = 6378137.0
GRS80_F = 1 / 298.257222101


def _meridian_arc(lat_deg: float) -> float:
    """Distance from the equator along a GRS80 meridian, by numerical integration (independent of pyproj)."""
    e2 = GRS80_F * (2 - GRS80_F)
    n = 20000
    h = math.radians(lat_deg) / n
    total = 0.0
    for i in range(n + 1):
        phi = i * h
        weight = 1 if i in (0, n) else (4 if i % 2 else 2)
        total += weight * GRS80_A * (1 - e2) / (1 - e2 * math.sin(phi) ** 2) ** 1.5
    return total * h / 3


@pytest.mark.parametrize(("zone", "meridian"), [(30, -3.0), (29, -9.0)])
def test_a_point_on_the_central_meridian_converts_to_its_known_position(zone, meridian):
    # On the central meridian a UTM easting is 500,000 m and the northing is
    # the meridian arc scaled by 0.9996: both known without pyproj.
    lon, lat = to_lonlat(500_000.0, 0.9996 * _meridian_arc(37.0), zone)
    assert lon == pytest.approx(meridian, abs=1e-7)
    assert lat == pytest.approx(37.0, abs=1e-7)


def test_a_point_off_the_meridian_lands_in_its_municipality():
    # The model's coordinates for project 461 (Caniles and Serón), as published in project_details.json.
    lon, lat = to_lonlat(536127.98, 4141349.18, 30)
    assert -2.65 < lon < -2.55 and 37.35 < lat < 37.45


def test_ed50_reads_about_110_m_east_and_210_m_north_of_etrs89():
    etrs = to_lonlat(591873.15, 4126448.82, 30, "ETRS89")
    ed50 = to_lonlat(591873.15, 4126448.82, 30, "ED50")
    metres_east = (etrs[0] - ed50[0]) * 111_320 * math.cos(math.radians(etrs[1]))
    metres_north = (etrs[1] - ed50[1]) * 110_950
    assert 80 < metres_east < 140
    assert 180 < metres_north < 240


def test_the_real_fixtures_print_no_coordinates_and_yield_none(fixtures_dir):
    # The three BOE resolutions and the BOJA notice in tests/fixtures publish
    # no coordinates: whatever numbers they hold must not become points.
    texts = [parse_document_xml(p.read_bytes()).text for p in sorted(fixtures_dir.glob("boe_doc_*.xml"))]
    boja = json.loads((fixtures_dir / "boja_doc_sample.json").read_text(encoding="utf-8"))
    texts += [r.get("bodyNoHtml") or r.get("body") or "" for r in boja["results"]]
    assert len(texts) == 4 and all(len(t) > 1000 for t in texts)
    assert [find_coordinate_groups(t) for t in texts] == [[], [], [], []]
