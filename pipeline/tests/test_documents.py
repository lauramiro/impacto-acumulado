from datetime import date

from impacto.db.documents import RawDocument, upsert_raw_document


def make_doc(text="hola"):
    return RawDocument(
        source="boe",
        source_id="BOE-A-2023-1",
        published_at=date(2023, 1, 2),
        title="t",
        url="https://example.org",
        section="III",
        organisation="MITECO",
        text=text,
    )


def test_upsert_inserts_once(db):
    assert upsert_raw_document(db, make_doc()) is True
    assert upsert_raw_document(db, make_doc()) is False
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM raw_documents")
        assert cur.fetchone()["n"] == 1


def test_upsert_updates_changed_text(db):
    upsert_raw_document(db, make_doc("v1"))
    assert upsert_raw_document(db, make_doc("v2")) is True
    with db.cursor() as cur:
        cur.execute("SELECT text FROM raw_documents")
        assert cur.fetchone()["text"] == "v2"


def test_upsert_deletes_extraction_when_content_changes(db):
    upsert_raw_document(db, make_doc("v1"))
    with db.cursor() as cur:
        cur.execute("SELECT id FROM raw_documents WHERE source_id = %s", ("BOE-A-2023-1",))
        doc_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO extractions (document_id, model, prompt_version, status) VALUES (%s, %s, %s, %s)",
            (doc_id, "m", "v1", "ok"),
        )
    db.commit()
    upsert_raw_document(db, make_doc("v2"))
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM extractions WHERE document_id = %s", (doc_id,))
        assert cur.fetchone()["n"] == 0
