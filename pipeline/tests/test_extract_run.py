from datetime import date

from psycopg.pq import TransactionStatus

from impacto.db.documents import (
    RawDocument,
    pending_for_extraction,
    save_extraction,
    upsert_raw_document,
)
from impacto.extract.run import extract_document, run_extract
from impacto.providers import QuotaExhausted
from impacto.providers.stub import StubProvider

HEADER_RESPONSE = {
    "doc_type": "dia", "verdict": "favorable_condicionada", "project_name": "Parque Ronda I",
    "developer": "CEPSA", "municipalities": [{"name": "Ronda", "province": "Málaga"}], "confidence": 0.9,
}
DESC_RESPONSE = {"doc_type": "otro", "verdict": "no_aplica", "technology": "solar_fv", "mw_nominal": 93, "hectares": 140.1}
EMPTY = {"doc_type": "otro", "verdict": "no_aplica"}


def test_extract_document_merges_sections():
    # Headings mirror the real markers in impacto.extract.sections (digit-prefixed
    # "descripcion"/"analisis tecnico", so all four sections actually split apart).
    provider = StubProvider([HEADER_RESPONSE, DESC_RESPONSE, EMPTY, EMPTY])
    text = (
        "Promotor CEPSA\n"
        "1. Descripción del proyecto\nRonda I 93 MW\n"
        "3. Análisis técnico del expediente\nx\n"
        "Condiciones al proyecto\ny"
    )
    e = extract_document(provider, "Resolución", text, {"ronda": "Ronda"})
    assert e.doc_type == "dia"
    assert e.verdict == "favorable_condicionada"
    assert e.mw_nominal == 93
    assert e.municipalities[0].name == "Ronda"
    assert len(provider.calls) == 4


def test_extract_document_handles_null_fields_and_promotes_late_verdict():
    # Observed live against Groq/openai-gpt-oss-120b: a section chunk that
    # genuinely doesn't state doc_type/verdict returns JSON null for them
    # (the prompt tells it to use null when the text doesn't say), and null
    # for list fields it has nothing to report. Pydantic treats an explicit
    # null differently from an omitted key, so the raw response must be
    # sanitised before validation - and because verdict is usually only
    # stated in the resolving section, a later section's real value must
    # win over an earlier section's "not stated here" placeholder.
    header = {"doc_type": None, "verdict": None, "project_name": "Parque X", "related_projects": None}
    conditions = {
        "doc_type": "dia", "verdict": "desfavorable",
        "conditions": [{"category": "general", "text": "denegado"}],
    }
    provider = StubProvider([header, conditions])
    text = "Promotor Y\nCondiciones al proyecto\nz"
    e = extract_document(provider, "Resolución", text, {})
    assert e.doc_type == "dia"
    assert e.verdict == "desfavorable"
    assert e.project_name == "Parque X"
    assert e.related_projects == []


def test_extract_document_folds_per_plant_lists_into_project_totals():
    # Observed live against Mistral/ministral-14b on multi-plant resolutions
    # (Ronda I/II/III, Filabres + Peregiles + La Rambla): numeric fields come
    # back as one value per plant (a list, or a dict keyed by plant name) and
    # string fields as one value per plant. The project total is the sum of
    # the numbers; the strings are joined so nothing is lost.
    header = {
        "doc_type": "dia", "verdict": "favorable_condicionada",
        "developer": ["Nuza Solar II, SLU", "Trofeo Solar II, SLU"],
        "project_name": ["Ronda I", "Ronda II", "Ronda III"],
        "mw_nominal": [93, 93, 93],
        "hectares": {"ronda_i": 140.1, "ronda_ii": 174.93, "ronda_iii": 132.2},
        "turbines": [10, None, 5],
        "municipalities": [{"name": "Ronda", "province": "Málaga"}, {"name": None, "province": "Cádiz"}],
    }
    provider = StubProvider([header])
    e = extract_document(provider, "Resolución", "Promotor Y", {})
    assert [m.name for m in e.municipalities] == ["Ronda"]
    assert e.developer == "Nuza Solar II, SLU; Trofeo Solar II, SLU"
    assert e.project_name == "Ronda I; Ronda II; Ronda III"
    assert e.mw_nominal == 279
    assert abs(e.hectares - 447.23) < 1e-6
    assert e.turbines == 15


def test_extract_document_operative_sentence_overrides_model_verdict():
    # The ministry's favourable form has no adjective, which small models miss.
    model_says = {"doc_type": "otro", "verdict": "no_aplica", "project_name": "PE Filabres",
                  "conditions": [{"category": "general", "text": None}, {"category": "fauna", "text": "vallado"}]}
    provider = StubProvider([model_says])
    text = ("Fundamentos de derecho\nEsta Dirección General formula declaración de impacto ambiental "
            "a la realización del proyecto PE Filabres en la que se establecen las condiciones.")
    e = extract_document(provider, "Resolución", text, {})
    assert e.doc_type == "dia"
    assert e.verdict == "favorable_condicionada"
    assert "formula declaracion" in e.evidence["verdict"]
    assert [c.text for c in e.conditions] == ["vallado"]


def test_extract_document_keeps_evidenced_placeholder_over_later_unevidenced_guess():
    # "otro" and "no_aplica" are legitimate values in their own right, not
    # just "not stated" sentinels. Reproduced live: a header section
    # genuinely (and correctly) decides doc_type="otro"/verdict="no_aplica"
    # and cites evidence for that decision; a later section slips and
    # guesses "dia"/"favorable" with no evidence backing it. The evidenced
    # decision must win.
    header = {
        "doc_type": "otro", "verdict": "no_aplica",
        "evidence": {
            "doc_type": "el escrito es un anuncio de informacion publica, no una resolucion",
            "verdict": "no se emite resolucion en este anuncio",
        },
    }
    later = {"doc_type": "dia", "verdict": "favorable"}
    provider = StubProvider([header, later])
    text = "Promotor Y\nCondiciones al proyecto\nz"
    e = extract_document(provider, "Resolución", text, {})
    assert e.doc_type == "otro"
    assert e.verdict == "no_aplica"


def test_extract_document_lets_later_evidenced_value_override_unevidenced_placeholder():
    # The other side of the same rule: when the header section never cites
    # evidence for doc_type/verdict (i.e. it didn't actually decide, it just
    # defaulted to the placeholder), a later section that does cite evidence
    # for its differing value must still win.
    header = {"doc_type": "otro", "verdict": "no_aplica"}
    later = {
        "doc_type": "dia", "verdict": "favorable",
        "evidence": {
            "doc_type": "declaracion de impacto ambiental",
            "verdict": "se resuelve favorablemente",
        },
    }
    provider = StubProvider([header, later])
    text = "Promotor Y\nCondiciones al proyecto\nz"
    e = extract_document(provider, "Resolución", text, {})
    assert e.doc_type == "dia"
    assert e.verdict == "favorable"


def test_extract_document_prefers_evidenced_operative_verdict_over_evidenced_placeholder():
    # Observed live on BOJA disposition.2023.169.46 (doc 5): the header
    # section cited "no se menciona" as evidence for no_aplica (the v1
    # prompt asked for a citation even when a section merely lacked the
    # verdict), and the first evidenced value won, so the wholesale AAU
    # denial in the operative sentence at the end was lost. An evidenced
    # non-placeholder must beat an evidenced placeholder, and among
    # evidenced non-placeholders the last one (the operative sentence)
    # wins. doc_type has no evidence in either section, so it falls back
    # to the last non-placeholder value.
    header = {"doc_type": "otro", "verdict": "no_aplica", "evidence": {"verdict": "no se menciona"}}
    conditions = {
        "doc_type": "dia", "verdict": "desfavorable",
        "evidence": {"verdict": "formula declaracion de impacto ambiental desfavorable"},
    }
    provider = StubProvider([header, conditions])
    text = "Promotor Y\nCondiciones al proyecto\nz"
    e = extract_document(provider, "Resolución", text, {})
    assert e.verdict == "desfavorable"
    assert e.doc_type == "dia"


def test_extract_document_coerces_list_valued_technology_field():
    # Observed live against Groq/openai-gpt-oss-120b on a mixed-technology
    # project (three solar plants plus a shared evacuation line): the model
    # returned technology as a list of two values instead of the single
    # Literal the schema requires. Take the first rather than fail the
    # document.
    raw = {"doc_type": "dia", "verdict": "favorable", "technology": ["solar_fv", "linea_evacuacion"]}
    provider = StubProvider([raw])
    e = extract_document(provider, "Resolución", "texto sin encabezados", {})
    assert e.technology == "solar_fv"


def test_extract_document_coerces_list_valued_evidence_entries():
    # Observed live: the model sometimes cites more than one short excerpt
    # for a key (species_mentioned, conditions, ...) as a JSON list instead
    # of the single string the schema's evidence: dict[str, str] expects.
    raw = {
        "doc_type": "dia", "verdict": "favorable",
        "evidence": {
            "species_mentioned": ["Aquila adalberti", "Neophron percnopterus"],
            "project_name": "Parque X",
        },
    }
    provider = StubProvider([raw])
    e = extract_document(provider, "Resolución", "texto sin encabezados", {})
    assert e.evidence["species_mentioned"] == "Aquila adalberti; Neophron percnopterus"
    assert e.evidence["project_name"] == "Parque X"


def test_extract_document_defaults_unknown_condition_category_to_general():
    # Observed live: the model used "poblacion" as a condition category,
    # which is not one of the schema's allowed values. Fall back to
    # "general" (the schema's own catch-all default) rather than fail.
    raw = {
        "doc_type": "dia", "verdict": "favorable_condicionada",
        "conditions": [
            {"category": "fauna", "text": "a"},
            {"category": "poblacion", "text": "b"},
        ],
    }
    provider = StubProvider([raw])
    e = extract_document(provider, "Resolución", "texto sin encabezados", {})
    assert e.conditions[0].category == "fauna"
    assert e.conditions[1].category == "general"


def test_extract_document_drops_null_evidence_values():
    # Observed live: the model sometimes echoes every schema key in
    # `evidence` and sets the ones it has no citation for to null, instead
    # of omitting them. evidence: dict[str, str] has no room for a null
    # value, and a key with nothing to cite is not useful evidence anyway.
    raw = {
        "doc_type": "dia", "verdict": "favorable",
        "evidence": {"project_name": "Parque X", "developer": None},
    }
    provider = StubProvider([raw])
    e = extract_document(provider, "Resolución", "texto sin encabezados", {})
    assert e.evidence == {"project_name": "Parque X"}


def test_extract_document_falls_back_on_unrecognized_enum_values():
    # Observed live: the model used "declaracion_impacto" instead of the
    # schema's "dia" for doc_type on the same document. A value outside the
    # schema's allowed set is treated the same as "not stated" (the
    # placeholder) instead of failing the whole document.
    raw = {"doc_type": "declaracion_impacto", "verdict": "aprobado", "technology": "eolico"}
    provider = StubProvider([raw])
    e = extract_document(provider, "Resolución", "texto sin encabezados", {})
    assert e.doc_type == "otro"
    assert e.verdict == "no_aplica"
    assert e.technology is None


def test_run_extract_saves_rows_and_skips_done(db):
    upsert_raw_document(db, RawDocument("boe", "A", date(2023, 1, 1), "t", "u", "III", "o", "Promotor X"))
    provider = StubProvider([HEADER_RESPONSE])
    assert run_extract(db, provider, limit=10) == 1
    assert pending_for_extraction(db, 10) == []
    with db.cursor() as cur:
        cur.execute("SELECT status, prompt_version, payload->>'project_name' AS name FROM extractions")
        row = cur.fetchone()
    assert row["status"] == "ok"
    assert row["prompt_version"] == "v3"
    assert row["name"] == "Parque Ronda I"


def test_run_extract_records_failures_and_retries_up_to_three(db):
    upsert_raw_document(db, RawDocument("boe", "B", date(2023, 1, 1), "t", "u", "III", "o", "texto"))

    class Broken:
        name = "broken"

        def complete_json(self, system, user):
            raise RuntimeError("boom")

    for _ in range(3):
        assert run_extract(db, Broken(), limit=10) == 0
    assert pending_for_extraction(db, 10) == []
    with db.cursor() as cur:
        cur.execute("SELECT status, attempts, error FROM extractions")
        row = cur.fetchone()
    assert row["status"] == "failed"
    assert row["attempts"] == 3
    assert "boom" in row["error"]


def test_run_extract_stops_on_quota_exhausted_without_consuming_attempts(db):
    # A daily-quota error is not the document's fault: no attempt is
    # recorded against it and the loop stops instead of failing every
    # remaining document one by one.
    upsert_raw_document(db, RawDocument("boe", "Q1", date(2023, 1, 1), "t", "u", "III", "o", "uno"))
    upsert_raw_document(db, RawDocument("boe", "Q2", date(2023, 1, 2), "t", "u", "III", "o", "dos"))

    class Exhausted:
        name = "exhausted"

        def __init__(self):
            self.calls = 0

        def complete_json(self, system, user):
            self.calls += 1
            raise QuotaExhausted("tokens per day (TPD)")

    provider = Exhausted()
    assert run_extract(db, provider, limit=10) == 0
    assert provider.calls == 1
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM extractions")
        assert cur.fetchone()["n"] == 0
    assert len(pending_for_extraction(db, 10)) == 2


def test_run_extract_holds_no_transaction_open_during_llm_calls(db):
    # The two SELECTs before the loop must be committed so the connection is
    # idle while the provider spends minutes on rate-limited LLM calls.
    upsert_raw_document(db, RawDocument("boe", "T1", date(2023, 1, 1), "t", "u", "III", "o", "uno"))

    class Observing:
        name = "observing"

        def __init__(self):
            self.statuses: list[TransactionStatus] = []

        def complete_json(self, system, user):
            self.statuses.append(db.info.transaction_status)
            return dict(HEADER_RESPONSE)

    provider = Observing()
    assert run_extract(db, provider, limit=10) == 1
    assert provider.statuses == [TransactionStatus.IDLE]


def test_pending_for_extraction_redo_prompt_version_reselects_ok_rows(db):
    # An ok row extracted under an older prompt is only reselected when the
    # caller asks for that prompt version to be redone; a plain call still
    # treats it as done.
    upsert_raw_document(db, RawDocument("boe", "E", date(2023, 1, 1), "t", "u", "III", "o", "old prompt"))
    with db.cursor() as cur:
        cur.execute("SELECT id FROM raw_documents WHERE source_id = 'E'")
        doc_id = cur.fetchone()["id"]
    save_extraction(db, doc_id, "stub", "v1", {"doc_type": "dia", "verdict": "no_aplica"}, 0.5, None)
    assert pending_for_extraction(db, 10) == []
    assert pending_for_extraction(db, 10, redo_prompt_version="v2") == []
    redo = pending_for_extraction(db, 10, redo_prompt_version="v1")
    assert [r["id"] for r in redo] == [doc_id]


def test_pending_for_extraction_excludes_ok_and_exhausted_failures(db):
    upsert_raw_document(db, RawDocument("boe", "C", date(2023, 1, 1), "t", "u", "III", "o", "ok text"))
    upsert_raw_document(db, RawDocument("boe", "D", date(2023, 1, 1), "t", "u", "III", "o", "failed text"))
    provider = StubProvider([HEADER_RESPONSE])
    assert run_extract(db, provider, limit=1) == 1  # only "C" processed, "D" still pending

    class Broken:
        name = "broken"

        def complete_json(self, system, user):
            raise RuntimeError("boom")

    for _ in range(3):
        run_extract(db, Broken(), limit=10)

    assert pending_for_extraction(db, 10) == []
