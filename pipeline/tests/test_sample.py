import csv
import json

from evaluation.run_eval import HELD_OUT_DIR, LABELS_DIR
from evaluation.sample import (
    SAMPLE_FILE,
    TARGET,
    allocate,
    draw,
    label_key,
    read_sample,
    source_group,
    status,
    title_technology,
    write_stubs,
)


def test_title_technology_reads_the_title_by_keyword():
    assert title_technology("Parque Eólico Los Morales") == "eolica"
    assert title_technology("Planta solar fotovoltaica Carbo") == "solar_fv"
    assert title_technology("Instalación híbrida fotovoltaica para su hibridación con el parque eólico existente") == "hibrida"
    # Most BOJA notices do not name the technology in their title.
    assert title_technology("por la que se da publicidad al informe vinculante para el proyecto que se cita") is None


def test_source_group_splits_boe_sections():
    assert source_group("boe", "BOE-A-2023-1") == "boe_iii"
    assert source_group("boe", "BOE-B-2023-1") == "boe_v"
    assert source_group("boja", "disposition.2023.1.1") == "boja"


def test_allocate_gives_every_stratum_its_floor_and_spends_the_target():
    alloc = allocate({"big": 400, "mid": 50, "small": 2, "empty": 0}, 100)
    assert sum(alloc.values()) == 100
    assert alloc["small"] == 2  # all it has
    assert "empty" not in alloc
    assert alloc["mid"] >= 3 and alloc["big"] > alloc["mid"]


def test_allocate_stops_when_every_stratum_is_exhausted():
    assert allocate({"a": 4, "b": 1}, 100) == {"a": 4, "b": 1}


def _doc(i, stratum, source="boja"):
    return {"stratum": stratum, "source": source, "source_id": f"d{i}", "published_at": "2024-01-01", "technology": "solar_fv",
            "technology_from": "titulo", "doc_type": "aau", "title": f"t{i}", "url": f"u{i}"}


def test_draw_keeps_held_out_labels_skips_tuning_ones_and_is_reproducible():
    population = [_doc(i, "boja/solar_fv") for i in range(40)] + [_doc(i, "boja/eolica") for i in range(40, 50)]
    held_out = {("boja", "d1"), ("boja", "d41")}
    tuning = {("boja", "d2")}
    rows = draw(population, held_out, tuning, target=20, seed=1)
    assert len(rows) == 20
    ids = {r["source_id"] for r in rows}
    assert {"d1", "d41"} <= ids and "d2" not in ids
    assert sum(r["status"] == "etiquetado" for r in rows) == 2
    assert [r["source_id"] for r in draw(population, held_out, tuning, target=20, seed=1)] == [r["source_id"] for r in rows]


def test_stubs_fail_the_label_check_until_filled(tmp_path):
    rows = [{**_doc(1, "boja/solar_fv"), "status": "por_etiquetar"}, {**_doc(2, "boja/solar_fv"), "status": "etiquetado"}]
    assert write_stubs(rows, tmp_path / "stubs", tmp_path / "held") == 1
    stub = json.loads((tmp_path / "stubs" / "boja-d1.json").read_text(encoding="utf-8"))
    assert stub["expected"] == {"doc_type": None, "verdict": None} and stub["note"] == ""
    assert write_stubs(rows, tmp_path / "stubs", tmp_path / "held") == 0  # an existing stub is never overwritten


def test_committed_sample_reaches_the_target_with_the_held_out_labels():
    rows = read_sample(SAMPLE_FILE)
    keys = {(r["source"], r["source_id"]) for r in rows}
    assert len(keys) == len(rows) >= TARGET
    held_out = {label_key(p) for p in HELD_OUT_DIR.glob("*.json")}
    assert held_out <= keys
    assert not keys & {label_key(p) for p in LABELS_DIR.glob("*.json")}
    assert {r["stratum"].split("/")[0] for r in rows} == {"boe_iii", "boe_v", "boja"}
    assert {"eolica", "solar_fv", "hibrida"} <= {r["technology"] for r in rows}
    counts = status(rows, HELD_OUT_DIR)
    assert counts["off_list"] == 0
    assert counts["labelled"] + counts["to_label"] == len(rows)
    with open(SAMPLE_FILE, encoding="utf-8", newline="") as f:
        assert next(csv.reader(f))[:3] == ["order", "status", "stratum"]
