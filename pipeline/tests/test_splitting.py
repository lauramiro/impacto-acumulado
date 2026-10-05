from datetime import date

from impacto.aggregate.splitting import listed_plants, splitting_candidates, substations


def p(i, developer, mw, munis, day=date(2022, 1, 1), state_assessed=False):
    return {
        "id": i,
        "developer": developer,
        "mw_best": mw,
        "first_seen": day,
        "ine_codes": set(munis),
        "state_assessed": state_assessed,
    }


def test_the_tayant_pattern_is_flagged():
    projects = [
        p(i, f"Tayant Investment {i}, S.L.", 49.8, ["11021" if i % 2 else "11013"])
        for i in (12, 13, 14, 15)
    ]
    [group] = splitting_candidates(projects, {("11013", "11021")})
    assert group["family"] == "tayant-investment"
    assert group["project_ids"] == [12, 13, 14, 15]
    assert group["mw_total"] == 199.2
    assert group["ine_codes"] == ["11013", "11021"]


def test_far_apart_places_or_years_do_not_link():
    far = [p(1, "Solar 1, S.L.", 40, ["A"]), p(2, "Solar 2, S.L.", 40, ["Z"])]
    assert splitting_candidates(far, {("A", "B")}) == []
    late = [p(1, "Solar 1, S.L.", 40, ["A"]), p(2, "Solar 2, S.L.", 40, ["A"], date(2024, 2, 1))]
    assert splitting_candidates(late, set()) == []
    within = [p(1, "Solar 1, S.L.", 40, ["A"]), p(2, "Solar 2, S.L.", 40, ["A"], date(2024, 1, 1))]
    assert len(splitting_candidates(within, set())) == 1


def test_a_project_at_or_over_50_or_without_mw_is_not_part_of_a_group():
    projects = [
        p(1, "Solar 1, S.L.", 50, ["A"]),
        p(2, "Solar 2, S.L.", 30, ["A"]),
        p(3, "Solar 3, S.L.", None, ["A"]),
    ]
    assert splitting_candidates(projects, set()) == []


def test_the_sum_must_exceed_50():
    assert (
        splitting_candidates(
            [p(1, "Solar 1, S.L.", 20, ["A"]), p(2, "Solar 2, S.L.", 30, ["A"])], set()
        )
        == []
    )
    assert (
        len(
            splitting_candidates(
                [p(1, "Solar 1, S.L.", 20, ["A"]), p(2, "Solar 2, S.L.", 30.1, ["A"])], set()
            )
        )
        == 1
    )


def test_different_families_do_not_group_and_shared_developers_are_not_repeated():
    assert (
        splitting_candidates(
            [p(1, "Alfa Solar, S.L.", 40, ["A"]), p(2, "Beta Solar, S.L.", 40, ["A"])], set()
        )
        == []
    )
    both = [
        p(1, "Alfa 1, S.L.; Beta 1, S.L.", 40, ["A"]),
        p(2, "Alfa 2, S.L.; Beta 2, S.L.", 40, ["A"]),
    ]
    assert [g["project_ids"] for g in splitting_candidates(both, set())] == [[1, 2]]


def test_a_chain_of_links_never_stretches_a_group_beyond_24_months():
    chain = [
        p(1, "Solar 1, S.L.", 30, ["A"], date(2021, 1, 1)),
        p(2, "Solar 2, S.L.", 30, ["A"], date(2022, 6, 1)),
        p(3, "Solar 3, S.L.", 30, ["A"], date(2023, 9, 1)),
        p(4, "Solar 4, S.L.", 30, ["A"], date(2024, 1, 1)),
    ]
    groups = splitting_candidates(chain, set())
    assert [g["project_ids"] for g in groups] == [[1, 2], [3, 4]]
    for g in groups:
        first, last = (date.fromisoformat(d) for d in g["first_seen"])
        assert (last.year - first.year) * 12 + last.month - first.month <= 24


def test_projects_the_state_assessed_are_left_out():
    # Iberdrola Renovables Andalucía: 11, 18, 43 and 44 have a DIA of the Ministry
    # (BOE-A-2022-15703, BOE-A-2022-24404, BOE-A-2023-15445, BOE-A-2023-16374); 75
    # went to the Junta. 57 has one too (BOE-A-2025-11511); 444 did not.
    iberdrola = "Iberdrola Renovables Andalucía, S.A.U."
    huelva = ["21003", "21006", "21058"]
    group = [
        p(11, iberdrola, 38.0, huelva, date(2021, 9, 21), state_assessed=True),
        p(18, iberdrola, 43.5, huelva, date(2021, 10, 1), state_assessed=True),
        p(43, iberdrola, 39.975, huelva, date(2021, 10, 15), state_assessed=True),
        p(44, iberdrola, 27.83, huelva, date(2022, 3, 1), state_assessed=True),
        p(75, iberdrola, 30.25, huelva, date(2022, 12, 30)),
    ]
    assert splitting_candidates(group, set(), {}) == []
    unflagged = [{**x, "state_assessed": False} for x in group]
    [found] = splitting_candidates(unflagged, set(), {})
    assert found["project_ids"] == [11, 18, 43, 44, 75]
    pair = [
        p(57, iberdrola, 39.98, ["14900"], date(2024, 2, 1), state_assessed=True),
        p(444, iberdrola, 17.25, ["14900"], date(2024, 6, 1)),
    ]
    assert splitting_candidates(pair, set(), {}) == []


def test_spellings_the_groups_file_joins_share_a_family():
    # Guadame III and IV print "PowerGuadame"; I, II and V print "Power Guadame".
    jaen = ["23059"]
    projects = [
        p(183, "Greenalia Solar Power Guadame I, S.L.", 49.99, jaen, date(2023, 1, 25)),
        p(197, "Greenalia Solar Power Guadame II, S.L.", 49.99, jaen, date(2023, 3, 1)),
        p(241, "Greenalia Solar PowerGuadame III, S.L.", 49.99, jaen, date(2023, 4, 1)),
        p(258, "Greenalia Solar PowerGuadame IV, S.L.", 49.99, jaen, date(2023, 4, 1)),
        p(437, "Greenalia Solar Power Guadame V, S.L.", 49.99, jaen, date(2023, 5, 24)),
    ]
    [group] = splitting_candidates(projects, set())
    assert group["family"] == "greenalia-solar-power-guadame"
    assert group["project_ids"] == [183, 197, 241, 258, 437]
    assert group["mw_total"] == 249.95


def plant(i, name, developer, mw, munis, day=date(2023, 1, 20), technology="solar_fv", **kw):
    return {**p(i, developer, mw, munis, day, **kw), "name": name, "technology": technology}


def line(i, name, developer, munis, day=date(2023, 2, 9)):
    return plant(i, name, developer, None, munis, day, technology="linea_evacuacion")


CARMONA = "41024"


def carmona_projects():
    # /municipio/41024 (data of 2026-10-05): five plants of five companies, 36,3 MW each,
    # behind one shared evacuation project (147), and Carmo 1 to 3 of three companies
    # behind another (473). Carmo 1 declares 50 MW peak and no nominal, so it is not under 50.
    five = [(294, "Almazara"), (283, "Atlante"), (276, "Chapitel"), (275, "Garita"), (281, "Fortaleza")]
    out = [plant(i, f"PSF {n} Solar", f"{n} Solar, S.L.", 36.3, [CARMONA]) for i, n in five]
    out[1]["name"] = "PSF Atlante Solar e Infraestructura Evacuación (Líneas 30 kV)"
    out.append(
        line(
            147,
            "Infraestructura común para la Evacuación de las PSFV Almazara Solar, Atlante Solar, "
            "Chapitel Solar, Garita Solar y Fortaleza Solar (SET Azora Carmona 30/220kV y LAAT 220kV)",
            "Almazara Solar S.L.",
            ["41019", CARMONA, "41027"],
        )
    )
    out += [
        plant(344, "PSFV «Carmo 1»", "Elsa Energía, S.L.", 50.0, [CARMONA]),
        plant(481, "PSFV «Carmo 2»", "Cripton Solar, S.L.", 36.665, [CARMONA]),
        plant(295, "PSFV «Carmo 3»", "Argon Sostenible, S.L.", 36.665, [CARMONA]),
        line(
            473,
            "Infraestructura común para la Evacuación de las PSFV Arcadia Carmona 1, 2 y 3 y "
            "Carmo 1, 2 y 3 (SET El Canto 30/220 kV y LAAT 220 kV)",
            "Elsa Energía, S.L.",
            [CARMONA],
        ),
        # Named like the town, in another place: not one of the listed plants.
        plant(900, "PSFV Carmo 10", "Otra, S.L.", 40, [CARMONA]),
    ]
    return out


def test_plants_a_shared_evacuation_project_lists_are_a_group_whatever_their_developers():
    groups = splitting_candidates(carmona_projects(), set(), {})
    assert [g["kind"] for g in groups] == ["infraestructura", "infraestructura"]
    five, carmo = groups
    assert five["project_ids"] == [275, 276, 281, 283, 294]
    assert five["mw_total"] == 181.5
    assert five["family"] is None
    assert five["infrastructure"] == {"project_ids": [147], "substations": ["azora carmona"]}
    assert five["ine_codes"] == [CARMONA]
    assert carmo["project_ids"] == [295, 481]
    assert carmo["mw_total"] == 73.33
    assert carmo["infrastructure"] == {"project_ids": [473], "substations": ["canto"]}


def test_listed_names_are_read_from_the_evacuation_project_name():
    assert listed_plants(
        "Infraestructura común para la Evacuación de las PSFV Arcadia Carmona 1, 2 y 3 y Carmo 1, 2 y 3"
    ) == [
        ["arcadia", "carmona", "1"],
        ["arcadia", "carmona", "2"],
        ["arcadia", "carmona", "3"],
        ["carmo", "1"],
        ["carmo", "2"],
        ["carmo", "3"],
    ]
    assert listed_plants("Infraestructura de evacuación PSF Huévar I y II") == [["huevar", "1"], ["huevar", "2"]]
    assert listed_plants(
        "Línea aéreo-subterránea 15 kV de evacuación de las plantas solares fotovoltaicas El Naranjo 8 y PSFV El Naranjo 9"
    ) == [["naranjo", "8"], ["naranjo", "9"]]
    # A final "solar" stays, so a plant called after its town alone is not taken for it.
    assert listed_plants("Infraestructura para evacuación varias plantas (Chucena Solar, Aznalcóllar Solar)") == [
        ["chucena", "solar"],
        ["aznalcollar", "solar"],
    ]
    assert listed_plants("Soterramiento de Línea de Evacuación") == []


def test_substation_names_drop_voltages_and_generic_words():
    assert substations("Infraestructura común (SET Azora Carmona 30/220kV y LAAT 220kV)") == {"azora carmona"}
    assert substations("hsf La Víbora III, línea evacuación y SET La Víbora III") == {"vibora 3"}
    assert substations("Infraestructura común de varias plantas para Evacuación a SET Guillena 220-400") == {"guillena"}
    assert substations("Evacuación Común Guillena 400 kV (SET Colectora y tramo LAAT 400 kV)") == set()
    assert substations("SET Danae 220/30 kV y LASAT 220 kV SET Danae-SET Ronda Renovables") == {
        "danae",
        "ronda renovables",
    }


def test_plants_naming_one_substation_share_it_when_near():
    a = plant(1, "PSF Uno y SET Los Llanos 30/132 kV", "Uno, S.L.", 30, ["A"])
    b = plant(2, "PSF Dos y SET Los Llanos 30/132 kV", "Dos, S.L.", 30, ["B"])
    [g] = splitting_candidates([a, b], {("A", "B")}, {})
    assert g["kind"] == "infraestructura"
    assert g["infrastructure"] == {"project_ids": [], "substations": ["llanos"]}
    assert splitting_candidates([a, b], set(), {}) == []


def test_a_listed_plant_far_from_the_line_or_outside_the_rules_is_left_out():
    projects = [
        line(10, "Evacuación de las PSFV Alfa Solar, Beta Solar y Gamma Solar", "Alfa, S.L.", ["A"]),
        plant(1, "PSF Alfa Solar", "Alfa, S.L.", 30, ["A"]),
        plant(2, "PSF Beta Solar", "Beta, S.L.", 30, ["Z"]),  # far from the line
        plant(3, "PSF Gamma Solar", "Gamma, S.L.", 30, ["A"], state_assessed=True),
    ]
    assert splitting_candidates(projects, set(), {}) == []
    projects[2]["ine_codes"] = {"A"}
    [g] = splitting_candidates(projects, set(), {})
    assert g["project_ids"] == [1, 2]
    projects[2]["first_seen"] = date(2026, 1, 1)
    assert splitting_candidates(projects, set(), {}) == []


def test_an_infrastructure_group_that_repeats_a_family_group_is_not_listed_twice():
    projects = [
        line(10, "Evacuación común de las PSF Tayant 1 y 2", "Tayant Investment 1, S.L.", ["A"]),
        plant(1, "PSF Tayant 1", "Tayant Investment 1, S.L.", 30, ["A"]),
        plant(2, "PSF Tayant 2", "Tayant Investment 2, S.L.", 30, ["A"]),
    ]
    [g] = splitting_candidates(projects, set(), {})
    assert g["kind"] == "familia"
    assert g["family"] == "tayant-investment"


def test_projects_without_name_or_technology_only_form_family_groups():
    projects = [p(1, "Solar 1, S.L.", 30, ["A"]), p(2, "Solar 2, S.L.", 30, ["A"])]
    [g] = splitting_candidates(projects, set(), {})
    assert g["kind"] == "familia"
    assert "infrastructure" not in g
