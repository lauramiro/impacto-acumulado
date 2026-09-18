from __future__ import annotations

from impacto.resolve.blocking import candidate_pairs
from impacto.resolve.model import Record
from impacto.resolve.scoring import THRESHOLD, score_pair
from impacto.resolve.unionfind import UnionFind


def resolve(records: list[Record], overrides: dict[int, str]) -> list[list[Record]]:
    index = {r.document_id: i for i, r in enumerate(records)}
    isolated = {index[d] for d, key in overrides.items() if key == "new" and d in index}
    uf = UnionFind(len(records))
    for i, j in candidate_pairs(records):
        if i in isolated or j in isolated:
            continue
        score, _ = score_pair(records[i], records[j])
        if score >= THRESHOLD:
            uf.union(i, j)
    by_key: dict[str, list[int]] = {}
    for d, key in overrides.items():
        if key != "new" and d in index:
            by_key.setdefault(key, []).append(index[d])
    for idxs in by_key.values():
        for other in idxs[1:]:
            uf.union(idxs[0], other)
    return [[records[i] for i in g] for g in uf.groups()]
