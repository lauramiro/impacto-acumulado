from datetime import date

from impacto.resolve.blocking import candidate_pairs, name_key, procedure_key
from impacto.resolve.model import Record
from impacto.resolve.run import resolve, with_operative
from impacto.resolve.scoring import THRESHOLD, conflict, phase_token, score_pair
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


def test_name_key_drops_capacity_figures():
    assert name_key("Parque eolico Ronda II de 50 MW") == "ronda ii"
    assert name_key("Planta fotovoltaica Carbo de 90,5 MWp") == "carbo"
    # A number with no unit after it is part of the name.
    assert name_key("Parque fotovoltaico Tabernas 100") == "tabernas 100"


def test_phase_token_is_not_read_from_a_capacity_figure():
    assert phase_token("Parque eolico Ronda I") == "i"
    assert phase_token("Parque eolico Ronda II de 50 MW") == "ii"
    # The evacuation tail's words are generic, so the phase before it is read.
    assert phase_token("Parque eolico Ronda I de 50 MW y su infraestructura de evacuacion") == "i"


def test_a_capacity_figure_does_not_block_two_documents_of_one_project():
    a = rec(1, "Parque eolico Ronda II de 50 MW", mw=50)
    b = rec(2, "Parque eolico Ronda II", mw=50)
    score, reason = score_pair(a, b)
    assert reason != "phase_mismatch"
    assert score >= THRESHOLD


def test_record_groups_on_the_generation_site_only():
    payload = {"municipalities": [{"name": "Ronda", "role": "generacion"}],
               "evacuation_municipalities": [{"name": "Cortes de la Frontera", "role": "evacuacion"}]}
    r = Record.from_extraction(1, date(2023, 1, 1), payload)
    assert r.municipalities == frozenset({"ronda"})


def test_resolve_never_merges_documents_with_different_override_keys():
    # Sister plants whose documents carry no phase marker or expediente: every pair scores as a match.
    gallego_aau = rec(1, "Repotenciación P.E. El Gallego", mw=24.0)
    gallego_ip = rec(2, "Repotenciación Parque Eólico El Gallego", mw=24.0, doc_type="informacion_publica", verdict="no_aplica")
    gallego_fv = rec(3, "F.V. Hibridación P.E. El Gallego", mw=24.0)
    assert sorted(sorted(r.document_id for r in g) for g in resolve([gallego_aau, gallego_ip, gallego_fv], overrides={})) == [[1, 2, 3]]
    groups = resolve([gallego_aau, gallego_ip, gallego_fv], overrides={1: "gallego", 2: "gallego", 3: "gallego-fv"})
    assert sorted(sorted(r.document_id for r in g) for g in groups) == [[1, 2], [3]]


def groups_of(records, overrides=None):
    return sorted(sorted(r.document_id for r in g) for g in resolve(records, overrides=overrides or {}))


def test_conflict_on_different_expediente_numbers_of_one_procedure_and_province():
    assert conflict(rec(1, "A", exp="aau/ja/0073/20"), rec(2, "A", exp="aau/ja/0074/20")) == "expediente"
    assert conflict(rec(1, "A", exp="aau/se/0092/2021/n"), rec(2, "A", exp="aau/se/0091/2021/n")) == "expediente"
    assert conflict(rec(1, "A", exp="a1/76/1997/m1"), rec(2, "A", exp="a1/69/1996/m1")) == "expediente"
    # A modification keeps the base number; leading zeros and the year's century do not matter.
    assert conflict(rec(1, "A", exp="aau/ca/051/21"), rec(2, "A", exp="aau/ca/051/21/m1")) is None
    assert conflict(rec(1, "A", exp="aau/se/0383/2009/m5"), rec(2, "A", exp="aau/se/383/2009/m5")) is None
    assert conflict(rec(1, "A", exp="aau/gr/023/17 ms1"), rec(2, "A", exp="aau/gr/023/17")) is None
    # Another province, another procedure type, or an unparsed format says nothing.
    assert conflict(rec(1, "A", exp="aau/sc/003/22 (pa220135)"), rec(2, "A", exp="aau/ca/29/22")) is None
    assert conflict(rec(1, "A", exp="aau/hu/008/22"), rec(2, "A", exp="aaus/hu/008/25")) is None


def test_conflict_on_phase_markers_anywhere_in_the_name():
    ii = rec(1, "Instalación de parque solar fotovoltaico 49.99 MWP Guadame II, Set Guadame II y línea aérea 132 KV")
    iv = rec(2, "Parque Solar Fotovoltaico 49,99 Mwp Guadame IV, Set Guadame IV y línea aérea de evacuación")
    assert conflict(ii, iv) == "phase"
    assert conflict(rec(1, "El Descubrimiento 029"), rec(2, "Planta solar fotovoltaica el descubrimiento 90")) == "phase"
    # A document naming several phases does not conflict with one of them; a capacity figure is not a phase.
    assert conflict(rec(1, "Plantas fotovoltaicas Ronda I, Ronda II y Ronda III"), rec(2, "PSF Ronda 2 II")) is None
    assert conflict(rec(1, "Parque Solar Fotovoltaico 49,99 MWp Guadame III"), rec(2, "Guadame III")) is None
    assert conflict(rec(1, "Repotenciación P.E. El Gallego"), rec(2, "F.V. Hibridación P.E. El Gallego")) is None


def test_resolve_keeps_conflicting_documents_apart_whatever_chains_them():
    # Two plants and a common evacuation work naming both: the work scores as a
    # match with each plant, but it may only join one of them.
    almazara = rec(1, "PSF Almazara Solar", exp="aau/se/0110/2021/n")
    garita = rec(2, "PSF Garita Solar", exp="aau/se/0100/2021/n")
    common = rec(3, "Infraestructura común para la evacuación de las PSF Almazara y Garita")
    assert score_pair(almazara, common)[0] >= THRESHOLD and score_pair(garita, common)[0] >= THRESHOLD
    groups = groups_of([almazara, garita, common])
    assert len(groups) == 2 and [1, 2] not in groups and any(3 in g for g in groups)


def test_resolve_splits_numbered_sister_plants():
    docs = [rec(i, f"Planta Solar Fotovoltaica «El Descubrimiento {n}»", exp=f"aau/se/0{20 + i}/2024/n") for i, n in enumerate(["027", "028", "029", "90", "91"], 1)]
    assert groups_of(docs) == [[1], [2], [3], [4], [5]]


def test_a_shared_override_key_joins_documents_despite_a_conflict():
    first = rec(1, "Parque Solar Fotovoltaico 49,99 Mwp Guadame II", exp="aau/ja/0073/20")
    second = rec(2, "Parque Solar Fotovoltaico 49,99 MWP Guadame II", exp="aau/ja/0011/23")
    assert groups_of([first, second]) == [[1], [2]]
    assert groups_of([first, second], {1: "guadame-ii", 2: "guadame-ii"}) == [[1, 2]]


def test_a_document_conflicting_with_a_keyed_group_stays_out_unless_it_shares_an_expediente():
    # Two documents of one hydrogen plant (AAU and AAI under one number) keyed
    # together; another company's plant conflicts with the AAI only.
    aau = rec(1, "Planta solar fotovoltaica y planta de hidrógeno verde", exp="aau/ca/089/24")
    aai = rec(2, "Planta solar fotovoltaica y planta de hidrógeno verde", exp="aai/ca/089/24")
    other = rec(3, "Planta de hidrógeno verde y planta solar fotovoltaica", exp="aai/ca/081/23")
    assert groups_of([aau, aai, other], {1: "siroco-5", 2: "siroco-5"}) == [[1, 2], [3]]


def test_a_modification_matches_its_original_procedure():
    original = rec(1, "Planta solar fotovoltaica Marchenilla VIII 4", munis=("jimena",), exp="aau/ca/052/21")
    modified = rec(2, "Instalación Planta Solar Fotovoltaica Marchenilla VIII", munis=("castellar",), mw=None, exp="aau/ca/052/21/m1")
    assert (0, 1) in candidate_pairs([original, modified])
    assert score_pair(original, modified) == (1.0, "expediente")
    assert groups_of([original, modified]) == [[1, 2]]


def test_the_kind_of_works_does_not_make_two_wind_farms_alike():
    gallego = rec(1, "Repotenciación Parque Eólico El Gallego", munis=("tarifa",), mw=24.0)
    herreria = rec(2, "Repotenciación Parque Eólico La Herrería", munis=("tarifa",), mw=24.0)
    assert name_key(gallego.name) == "gallego"
    assert score_pair(gallego, herreria)[0] < THRESHOLD


def test_a_granted_modification_fills_an_unknown_status_only():
    aau = rec(1, "R", doc_type="aau", verdict="no_aplica", day=date(2022, 1, 1))
    modification = rec(2, "R", doc_type="modificacion", verdict="favorable_condicionada", day=date(2024, 1, 1))
    assert derive_status([aau, modification]) == ("favorable_condicionada", 2)
    refused = rec(3, "R", doc_type="aau", verdict="desfavorable", day=date(2023, 1, 1))
    assert derive_status([refused, modification]) == ("desfavorable", 3)


def test_resolve_reapplies_the_operative_rule_to_stored_extractions():
    notice = (
        "De conformidad con el art. 31.7 de la Ley 7/2007, esta Delegación HA RESUELTO Primero. Dar publicidad en BOJA al "
        "Informe Vinculante sobre la Autorización Ambiental Unificada otorgada por la Delegación Territorial en Sevilla."
    )
    payload = {"doc_type": "aau", "verdict": "no_aplica", "project_name": "X"}
    assert with_operative(payload, notice) == {"doc_type": "aau", "verdict": "favorable_condicionada", "project_name": "X"}
    # A notice the model read as a consultation keeps what the model said.
    consultation = {"doc_type": "informacion_publica", "verdict": "no_aplica"}
    assert with_operative(consultation, notice) is consultation


def test_procedure_key_reads_state_expedientes_and_other_separators():
    assert procedure_key("pfot-365") == procedure_key("pfot 365") == ("pfot", "365", "")
    # A letter suffix names another file: PFot-365 AC (Natera, Orla) is not PFOT 365 (Posets, Faballones).
    assert procedure_key("pfot-365 ac") == ("pfot", "365", "ac")
    assert procedure_key("peol-512") == ("peol", "512", "")
    assert procedure_key("aau-gr-012-22") == procedure_key("aau_gr_012_22") == procedure_key("aau/gr/12/22")
    # A Junta expediente with no year is left unread rather than compared against one that has a year.
    assert procedure_key("aai/hu/123") is None


def test_procedure_key_reads_storage_and_hybrid_state_files():
    assert procedure_key("pfot-alm-194") == ("pfot-alm", "194", "")
    assert procedure_key("pfot-123-alm") == ("pfot-alm", "123", "")
    assert procedure_key("pfot-alm-195 ac") == ("pfot-alm", "195", "ac")
    assert procedure_key("peol-fv-252") == procedure_key("peol-fv 252") == ("peol-fv", "252", "")
    assert procedure_key("solter-fv-001") == ("solter-fv", "1", "")
    # After a gazette reference, and not taking a conjunction for a suffix.
    assert procedure_key("001/2019 pfot 032") == ("pfot", "32", "")
    assert procedure_key("pfot-365 y pfot-366") == ("pfot", "365", "")


def test_a_storage_module_is_not_the_plant_it_hybridises():
    # BOE-B-2026-4035: a battery module for the existing FREYA plant (PFot-ALM-172).
    module = rec(1, "Módulo de Almacenamiento de Energía por baterías para su hibridación con la planta solar fotovoltaica existente FREYA",
                 munis=("carmona",), mw=39.6, exp="pfot-alm-172")
    plant = rec(2, "Planta solar fotovoltaica Freya", munis=("carmona",), mw=50.0)
    assert conflict(module, plant) == "storage"
    assert conflict(module, rec(3, "Freya", munis=("carmona",), exp="pfot-172")) == "expediente"
    # A plant built with storage is a plant.
    with_storage = rec(4, "Parque solar fotovoltaico Cerro Gordo con almacenamiento bess", munis=("carmona",))
    assert conflict(with_storage, rec(5, "Cerro Gordo", munis=("carmona",))) is None
    # Two modules for different plants share only their wording.
    other = rec(6, "Módulo de Almacenamiento de Energía por baterías Híbrida Don Rodrigo III", munis=("carmona",), mw=39.6)
    assert name_key(module.name) == "freya"
    assert score_pair(module, other)[0] < THRESHOLD


def test_state_expedientes_with_different_numbers_conflict():
    assert conflict(rec(1, "A", exp="pfot-365"), rec(2, "A", exp="pfot-479")) == "expediente"
    assert conflict(rec(1, "A", exp="pfot-365"), rec(2, "A", exp="peol-365")) is None
    assert conflict(rec(1, "A", exp="pfot 365"), rec(2, "A", exp="pfot-365 ac")) == "expediente"


def test_an_unkeyed_document_joins_a_keyed_plant_only_on_positive_evidence():
    # Tabernas 100 (no expediente) scored as a match with the keyed Tabernas Solar 2
    # on a shared place name; it is not the same plant.
    solar_2 = rec(1, "Tabernas Solar 2", munis=("tabernas",), mw=None, exp="aau/al/0021/20")
    tabernas_100 = rec(2, "Parque fotovoltaico Tabernas 100", munis=("tabernas",), mw=None)
    assert score_pair(solar_2, tabernas_100)[0] >= THRESHOLD
    assert groups_of([solar_2, tabernas_100]) == [[1, 2]]
    assert groups_of([solar_2, tabernas_100], {1: "tabernas-solar-2"}) == [[1], [2]]
    # The same procedure, or a near-identical name, is positive evidence.
    modification = rec(3, "Proyecto de parque fotovoltaico Tabernas Solar 2", munis=("tabernas",), mw=None, exp="aau/al/0021/20/m1")
    assert groups_of([solar_2, modification], {1: "tabernas-solar-2"}) == [[1, 3]]
    renamed = rec(4, "Tabernas Solar 2", munis=("tabernas",), mw=None)
    assert groups_of([solar_2, renamed], {1: "tabernas-solar-2"}) == [[1, 4]]


def test_a_consultation_with_no_decision_after_24_months_has_no_resolution():
    consulta = rec(1, "R", doc_type="informacion_publica", verdict="no_aplica", day=date(2023, 3, 10))
    assert derive_status([consulta]) == ("en_consulta", 1)
    assert derive_status([consulta], date(2025, 3, 9)) == ("en_consulta", 1)
    assert derive_status([consulta], date(2025, 3, 10)) == ("sin_resolucion", 1)
    # A decision ends it whatever its age; a later consultation restarts the clock.
    dia = rec(2, "R", doc_type="dia", verdict="favorable_condicionada", day=date(2023, 9, 1))
    assert derive_status([consulta, dia], date(2026, 1, 1)) == ("favorable_condicionada", 2)
    again = rec(3, "R", doc_type="informacion_publica", verdict="no_aplica", day=date(2025, 1, 15))
    assert derive_status([consulta, again], date(2026, 1, 1)) == ("en_consulta", 3)


def test_an_extension_file_is_another_procedure():
    # PEol-268_AMPL (Hinojosa Ampliación, 25.12 MW) is not PEol-268 (Hinojosa, 63.08 MW): two declarations.
    assert procedure_key("peol-268_ampl") == ("peol", "268", "ampl")
    assert procedure_key("peol-268 ampl") == ("peol", "268", "ampl")
    assert procedure_key("peol-268_ampl") != procedure_key("peol-268")
