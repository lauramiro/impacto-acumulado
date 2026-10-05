from datetime import date

from impacto.resolve.review import (
    Group,
    ReviewDoc,
    is_generic,
    namesake_groups,
    pp_numbers,
    queue,
    reviewed,
    rules,
    summary,
)


def doc(
    i,
    *,
    title="t",
    doc_type="aau",
    verdict="no_aplica",
    expediente=None,
    mw=None,
    day=None,
    key=None,
):
    return ReviewDoc(
        i, day or date(2023, 1, i), title, doc_type, verdict, expediente, mw, ("Marmolejo",), key
    )


def test_a_clean_pair_hits_nothing():
    g = Group(
        1,
        "Planta solar Guadame III",
        (doc(1, mw=50, expediente="AAU/JA/1/22"), doc(2, mw=50.4, expediente="AAU/JA/1/22/M1")),
    )
    assert rules(g) == []


def test_many_documents():
    assert "many_documents" in rules(Group(1, "Las Quinientas", tuple(doc(i) for i in range(1, 6))))
    assert "many_documents" not in rules(
        Group(1, "Las Quinientas", tuple(doc(i) for i in range(1, 5)))
    )


def test_several_pp_numbers_in_titles():
    assert pp_numbers(
        ["Anuncio ... que se cita. (PP. 81/2019).", "otro (PP. 081/2019)", "x PP. 12/2020"]
    ) == {"81/2019", "12/2020"}
    g = Group(1, "Guadame", (doc(1, title="a (PP. 81/2019)."), doc(2, title="b (PP. 12/2020).")))
    assert "several_pp_numbers" in rules(g)


def test_mw_more_than_ten_percent_apart():
    assert "mw_differs" in rules(Group(1, "Guadame", (doc(1, mw=50), doc(2, mw=138.4))))
    assert "mw_differs" not in rules(Group(1, "Guadame", (doc(1, mw=50), doc(2, mw=54.9))))


def test_several_expedientes_ignore_modification_suffixes():
    same = Group(
        1, "Guadame", (doc(1, expediente="AAU/JA/12/21"), doc(2, expediente="AAU/JA/12/21/M1"))
    )
    other = Group(
        1, "Guadame", (doc(1, expediente="AAU/JA/12/21"), doc(2, expediente="AAU/JA/13/21"))
    )
    assert "several_expedientes" not in rules(same)
    assert "several_expedientes" in rules(other)


def test_consultation_after_a_decision():
    g = Group(
        1,
        "Marchenilla VII",
        (
            doc(1, doc_type="aau", verdict="favorable", day=date(2022, 3, 1)),
            doc(2, doc_type="informacion_publica", day=date(2024, 5, 1)),
        ),
    )
    assert "consultation_after_decision" in rules(g)
    before = Group(
        1,
        "X",
        (
            doc(1, doc_type="informacion_publica", day=date(2021, 1, 1)),
            doc(2, verdict="favorable", day=date(2022, 1, 1)),
        ),
    )
    assert "consultation_after_decision" not in rules(before)


def test_generic_names():
    assert is_generic("Planta Solar Fotovoltaica")
    assert is_generic("Parque solar fotovoltaico de 50 MW")
    assert is_generic("Plantas Solares Fotovoltaicas")
    assert not is_generic("Planta solar fotovoltaica Las Quinientas")
    assert "generic_name" in rules(Group(1, "Planta Solar Fotovoltaica", (doc(1),)))


def test_keyed_groups_are_listed_as_reviewed_and_left_out_of_the_count():
    keyed = Group(1, "Planta Solar Fotovoltaica", (doc(1, key="a"), doc(2, key="a")))
    open_ = Group(2, "Planta Solar Fotovoltaica", (doc(3, key="a"), doc(4)))
    clean = Group(3, "Las Quinientas", (doc(5),))
    rows = queue([keyed, open_, clean])
    assert [(g.project_id, done) for g, _, done in rows] == [(1, True), (2, False)]
    assert reviewed(keyed) and not reviewed(open_)
    assert summary(rows).startswith(
        "Review queue: 1 project(s) to review (generic_name 1); 1 more already reviewed"
    )


def test_projects_sharing_a_plant_name_and_a_developer_are_listed():
    rey = Group(35, "Plantas solares fotovoltaicas Rey I Solar PV, Rey II Solar PV y Rey III Solar PV", (doc(1),),
                "Villablanca Solar 1, SL", "solar_fv")
    rey_i = Group(675, "Rey I Solar PV", (doc(2),), "VILLABLANCA SOLAR 1, S.L.", "solar_fv")
    other = Group(5, "Rey I Solar PV", (doc(3),), "Otra Energía, S.L.", "solar_fv")
    plant = Group(254, "PSF Esparragal II", (doc(4),), "FRV Corchitos II Solar, S.L.", "solar_fv")
    line = Group(566, "Línea de evacuación 132 kV de la FV El Esparragal II", (doc(5),),
                 "FRV Corchitos II Solar, S.L.U.", "linea_evacuacion")
    groups = [rey, rey_i, other, plant, line]
    assert namesake_groups(groups) == {35, 675}
    rows = queue(groups)
    assert [(g.project_id, hit) for g, hit, _ in rows] == [(35, ["namesake"]), (675, ["namesake"])]


def test_review_clusters_reads_the_database(db, fixtures_dir, tmp_path):
    from impacto.resolve.review import load_groups, write_csv
    from impacto.resolve.run import run_resolve
    from tests.test_resolve_run import seed

    seed(db, fixtures_dir)
    run_resolve(db)
    groups = {g.project_id: g for g in load_groups(db)}
    assert sorted(len(g.docs) for g in groups.values()) == [1, 2]
    ronda = next(g for g in groups.values() if len(g.docs) == 2)
    assert ronda.docs[0].doc_type == "informacion_publica"
    assert ronda.docs[1].mw == 93
    assert ronda.docs[0].municipalities == ("Ronda",)
    path = write_csv(queue(list(groups.values())), tmp_path / "clusters.csv")
    assert path.read_text(encoding="utf-8").startswith("project_id,name,rules,reviewed")


def test_a_modification_of_the_same_procedure_is_not_flagged():
    g = Group(
        1,
        "Marchenilla VIII",
        (
            doc(
                1,
                title="se otorga autorización ambiental unificada (PP. 1/2022)",
                verdict="favorable",
                expediente="AAU/CA/052/21",
            ),
            doc(
                2,
                title="información pública con el fin de obtener modificación sustancial (PP. 9/2024)",
                doc_type="informacion_publica",
                expediente="AAU/CA/052/21/M1",
                mw=60,
                day=date(2024, 3, 1),
            ),
        ),
    )
    assert rules(g) == []


def test_a_state_file_and_a_junta_aau_for_one_plant_are_not_several_expedientes():
    g = Group(
        1, "Hipódromo", (doc(1, expediente="PFot-245"), doc(2, expediente="AAU/SE/0647/2021/N"))
    )
    assert "several_expedientes" not in rules(g)


def test_peak_and_nominal_are_compared_separately():
    one = ReviewDoc(1, date(2023, 1, 1), "t", "dia", "favorable", None, 188, (), None, mw_peak=250)
    two = ReviewDoc(2, date(2023, 2, 1), "t", "aau", "favorable", None, 190, (), None, mw_peak=250)
    assert "mw_differs" not in rules(Group(1, "Cabra 0", (one, two)))
    three = ReviewDoc(
        3, date(2023, 3, 1), "t", "aau", "favorable", None, None, (), None, mw_peak=400
    )
    assert "mw_differs" in rules(Group(1, "Cabra 0", (one, three)))


def test_an_acknowledged_group_leaves_the_count_until_a_new_document_joins():
    def ack(d):
        return ReviewDoc(**{**d.__dict__, "acknowledged": True})

    read = Group(1, "Planta Solar Fotovoltaica", (ack(doc(1)), ack(doc(2))))
    grown = Group(1, "Planta Solar Fotovoltaica", (ack(doc(1)), ack(doc(2)), doc(3)))
    assert reviewed(read)
    assert not reviewed(grown)


def test_acknowledgements_are_read_from_the_database(db, fixtures_dir):
    from impacto.resolve.review import load_groups
    from impacto.resolve.run import run_resolve
    from tests.test_resolve_run import seed

    seed(db, fixtures_dir)
    run_resolve(db)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO review_acknowledgements (document_id, note) SELECT id, 'test' FROM raw_documents"
        )
    groups = load_groups(db)
    assert all(reviewed(g) for g in groups)
