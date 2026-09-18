from datetime import date

from impacto.resolve.blocking import candidate_pairs, name_key
from impacto.resolve.model import Record
from impacto.resolve.run import resolve
from impacto.resolve.scoring import THRESHOLD, score_pair
from impacto.resolve.status import derive_status
from impacto.resolve.unionfind import UnionFind


def rec(doc_id, name, munis=("ronda",), mw=93.0, exp=None, doc_type="dia", verdict="favorable_condicionada", day=date(2023, 9, 18)):
    return Record(document_id=doc_id, published_at=day, doc_type=doc_type, verdict=verdict, name=name,
                  expediente=exp, developer=None, municipalities=frozenset(munis), mw_nominal=mw, mw_peak=None,
                  hectares=None, turbines=None, technology="solar_fv")


def test_name_key_removes_generic_words():
    assert name_key("Parque Solar Fotovoltaico Ronda I, S.L.U.") == "ronda i"
    assert name_key("PSFV Los Olivos") == "olivos"


def test_candidate_pairs_by_expediente_and_by_name_plus_municipality():
    a = rec(1, "Ronda I", exp="EXP-1")
    b = rec(2, "Completely different", munis=("sevilla",), exp="EXP-1")
    c = rec(3, "Ronda I fase 2")
    d = rec(4, "Ronda I", munis=("jaen",))
    pairs = candidate_pairs([a, b, c, d])
    assert (0, 1) in pairs
    assert (0, 2) in pairs
    assert (0, 3) not in pairs


def test_score_pair_expediente_is_decisive():
    a = rec(1, "X", exp="EXP-1")
    b = rec(2, "Y", munis=("sevilla",), mw=5, exp="EXP-1")
    assert score_pair(a, b) == (1.0, "expediente")


def test_score_pair_combines_name_municipality_and_mw():
    a = rec(1, "Ronda I", mw=93)
    b = rec(2, "Parque fotovoltaico Ronda I", mw=100)
    score, reason = score_pair(a, b)
    assert score >= THRESHOLD
    assert "name" in reason and "municipality" in reason and "mw" in reason
    c = rec(3, "Otro parque", munis=("sevilla",), mw=10)
    assert score_pair(a, c)[0] < THRESHOLD


def test_score_pair_different_phases_never_merge_without_expediente():
    a = rec(1, "Ronda I")
    b = rec(2, "Parque fotovoltaico Ronda II")
    assert score_pair(a, b) == (0.0, "phase_mismatch")
    c = rec(3, "Ronda 2", exp="E9")
    d = rec(4, "Ronda 1", exp="E9")
    assert score_pair(c, d) == (1.0, "expediente")


def test_unionfind_groups():
    uf = UnionFind(4)
    uf.union(0, 1)
    uf.union(2, 3)
    uf.union(1, 3)
    assert sorted(sorted(g) for g in uf.groups()) == [[0, 1, 2, 3]]


def test_derive_status_uses_latest_relevant_document():
    consulta = rec(1, "R", doc_type="informacion_publica", verdict="no_aplica", day=date(2022, 1, 1))
    dia = rec(2, "R", doc_type="dia", verdict="desfavorable", day=date(2023, 1, 1))
    mod = rec(3, "R", doc_type="modificacion", verdict="no_aplica", day=date(2024, 1, 1))
    assert derive_status([consulta]) == ("en_consulta", 1)
    assert derive_status([consulta, dia]) == ("desfavorable", 2)
    assert derive_status([consulta, dia, mod]) == ("desfavorable", 2)
    cad = rec(4, "R", doc_type="caducidad", verdict="no_aplica", day=date(2025, 1, 1))
    assert derive_status([consulta, dia, mod, cad]) == ("caducado", 4)


def test_resolve_groups_and_respects_overrides():
    a = rec(1, "Ronda I", exp="E1")
    b = rec(2, "Ronda I", exp="E1", doc_type="informacion_publica", verdict="no_aplica")
    c = rec(3, "Ronda II")
    groups = resolve([a, b, c], overrides={})
    assert sorted(sorted(r.document_id for r in g) for g in groups) == [[1, 2], [3]]
    groups = resolve([a, b, c], overrides={2: "new"})
    assert sorted(sorted(r.document_id for r in g) for g in groups) == [[1], [2], [3]]
    groups = resolve([a, b, c], overrides={1: "k", 3: "k"})
    assert sorted(sorted(r.document_id for r in g) for g in groups) == [[1, 2, 3]]
