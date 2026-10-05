from datetime import date

from impacto.aggregate.splitting import splitting_candidates


def p(i, developer, mw, munis, day=date(2022, 1, 1)):
    return {
        "id": i,
        "developer": developer,
        "mw_best": mw,
        "first_seen": day,
        "ine_codes": set(munis),
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
