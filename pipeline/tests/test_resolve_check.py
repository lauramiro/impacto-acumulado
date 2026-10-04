from impacto.resolve.check import WEAK_MATCH, Doc, Findings, compare, render


def doc(document_id, project_id, score=1.0, title="t"):
    return Doc(document_id, project_id, score, title)


def test_compare_finds_splits_merges_and_weak_new_documents():
    previous = {1: 10, 2: 10, 3: 20, 4: 30, 5: None}
    current = [
        doc(1, 10), doc(2, 2),           # project 10 split into 10 and 2
        doc(3, 3), doc(4, 3),            # projects 20 and 30 merged into 3
        doc(6, 3, score=0.7),            # new document, weak match into a multi-document project
        doc(7, 7, score=0.5),            # new document alone in its project: nothing to review
        doc(8, 10, score=WEAK_MATCH),    # new, at the threshold: not weak
    ]
    f = compare(previous, current)
    assert f.split == {10: [[1], [2]]}
    assert f.merged == {3: [20, 30]}
    assert [d.document_id for d in f.weak_new] == [6]
    assert f.count() == 3


def test_render_says_when_there_is_nothing_to_review():
    assert render(Findings(), {}).startswith("Resolve check: nothing to review.")
    text = render(compare({1: 10, 2: 10}, [doc(1, 10), doc(2, 2)]), {})
    assert "Project 10 is now 2 projects: 1; 2" in text
    assert "resolution_overrides" in text
