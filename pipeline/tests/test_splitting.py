from datetime import date

from impacto.aggregate.splitting import splitting_candidates


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
