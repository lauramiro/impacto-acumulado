from impacto.extract.sections import split_sections


def test_split_sections_on_real_resolution(fixtures_dir):
    from impacto.fetch.boe import parse_document_xml

    doc = parse_document_xml((fixtures_dir / "boe_doc_BOE-A-2023-19635.xml").read_bytes())
    parts = split_sections(doc.text)
    assert set(parts) == {"header", "description", "assessment", "conditions"}
    assert "CEPSA" in parts["header"]
    assert "Ronda I" in parts["description"]
    assert "Condiciones al proyecto" in parts["conditions"] or "condiciones" in parts["conditions"].lower()
    assert sum(len(v) for v in parts.values()) >= len(doc.text) - 10


def test_split_sections_without_markers_puts_everything_in_header():
    parts = split_sections("Texto corto sin encabezados.")
    assert parts["header"] == "Texto corto sin encabezados."
    assert parts["description"] == ""


def test_split_sections_on_other_real_resolutions(fixtures_dir):
    from impacto.fetch.boe import parse_document_xml

    for name in ("boe_doc_BOE-A-2023-2907.xml", "boe_doc_BOE-A-2023-2580.xml"):
        doc = parse_document_xml((fixtures_dir / name).read_bytes())
        parts = split_sections(doc.text)
        assert parts["description"] != "", name
        assert parts["conditions"] != "", name
        assert sum(len(v) for v in parts.values()) >= len(doc.text) - 10, name
