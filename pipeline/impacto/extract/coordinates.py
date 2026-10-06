"""UTM coordinates a resolution publishes for its project, read by rule.

Resolutions that locate a project do it in a table (turbine positions, the
vertices of the fenced plot, the substation) or inline ("X: 254.321,
Y: 4.123.456"), in UTM metres with the datum and zone stated somewhere above
("coordenadas UTM ETRS89 huso 30"). The model's `utm_coordinates` field
found such a list in 5 of 583 projects: it reads the text in 8,000-character
chunks, keeps the first list it meets and drops tables it does not
transcribe. A rule reads the whole stored text, is cheap enough to run on
every export without calling a model again, and leaves a quote behind.

`find_coordinate_groups` reads the text; `place` converts each group with
pyproj and keeps the points that fall in or near the project's
municipalities, which is what catches a wrong zone or a number that only
looks like a coordinate.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import cache
from typing import Literal

from impacto.text import strip_accents

Datum = Literal["ETRS89", "ED50"]
GroupKind = Literal["puntos", "poligono"]

# Andalusia in UTM metres. Eastings: zone 30 covers the region from about
# 100,000 (western Huelva written in zone 30) to 620,000 (Almeria's coast);
# western Huelva in zone 29 reaches about 780,000. Northings: Tarifa
# (36.0 N) to Sierra Morena (38.7 N).
EASTING_RANGE = (100_000, 900_000)
NORTHING_RANGE = (3_950_000, 4_320_000)

# One number as the bulletins print it: "254.321", "4.123.456,78",
# "254321.50", "254 321" with a non-breaking space. A plain space is not a
# thousands separator here: it would glue a label number to the easting.
_NUMBER = re.compile(
    r"(?<![\d.,])(\d{1,3}(?:[.  ]\d{3})+|\d+)(?:,(\d+)|\.(\d{1,3})(?!\d))?(?![\d.]\d)"
)
# What may stand between an easting and its northing: separators, axis
# names, a unit. Anything else (a word, another number) means the two
# numbers are not one point.
_GAP_WORDS = re.compile(r"\b(?:utm|coord(?:enada)?s?|x|y|n|e|m|metros)\b", re.IGNORECASE)
_GAP_PUNCT = re.compile(r"[\s|;:,=()\[\]/\-–—.]+")
_MAX_GAP = 40
# Text after a northing that makes it money, not a coordinate.
_MONEY_AFTER = re.compile(r"^\s*(?:€|euros?\b|eur\b)", re.IGNORECASE)
# Points closer than this (characters of text between them) belong to one table or list.
_MAX_ROW_GAP = 80
# Three words between two points are a sentence, not a row label: a new list starts.
_WORD = re.compile(r"[^\W\d_]{3,}")
# How far above a group to look for its heading.
_HEADING_CHARS = 600

# Matched on lowercased, accent-free text.
_ZONE = re.compile(
    r"huso\s*(?:utm\s*)?(?:n\.?\s*o?\s*)?(29|30)\b"
    r"|zona\s*utm\s*(29|30)\b"
    r"|utm\s*(?:huso\s*|zona\s*)?(29|30)\s*n?\b"
    r"|epsg\D{0,3}(?:258|230)(29|30)\b"
)
_ED50 = re.compile(r"\bed\s*-?\s*50\b|european datum 1950|epsg\D{0,3}230(?:29|30)\b")
_ETRS89 = re.compile(r"\betrs\s*-?\s*89\b|epsg\D{0,3}258(?:29|30)\b")
_COORDINATE_WORDS = re.compile(r"coordenad|utm|huso|etrs|ed\s*-?\s*50")
_POLYGON_WORDS = re.compile(
    r"vertice|poligonal|perimetr|vallado|recinto|delimit|contorno|envolvente|poligono de implantacion"
)
# A row label just before the easting: "AE-01", "V1", "Vértice 12", "P.3", "SET".
_LABEL = re.compile(
    r"(?:^|(?<=[\s|(:,;]))"
    r"((?:[A-Za-zÁÉÍÓÚáéíóúÑñº]{1,10}[ .\-]?)?\d{1,3}[A-Za-z]?|[A-Z]{2,5}(?:[ \-][A-Z0-9]{1,5})?)$"
)
# Words that end a heading right before the first point, not row labels.
_NOT_LABEL = re.compile(r"(?:huso|zona|utm|etrs|ed|epsg|x|y|n)\b")


@dataclass(frozen=True)
class UtmPoint:
    x: float
    y: float
    label: str | None = None
    start: int = 0
    end: int = 0


@dataclass(frozen=True)
class CoordinateGroup:
    """Points printed together under one heading: a table, or one sentence's list."""

    points: list[UtmPoint]
    kind: GroupKind
    zone: int | None  # as stated in the text; None when it says nothing
    datum: Datum
    evidence: str | None  # the heading that announces the coordinates, quoted
    datum_stated: bool = field(default=False)


def _fold(text: str) -> str:
    """Lowercase, accent-free, same length as the input so offsets carry over."""
    out = []
    for c in text:
        f = strip_accents(c.lower())
        out.append(f if len(f) == 1 else c)
    return "".join(out)


def _value(match: re.Match) -> tuple[float, int]:
    """The number's value and the digit count of its integer part."""
    whole = re.sub(r"\D", "", match.group(1))
    decimals = match.group(2) or match.group(3)
    value = float(f"{whole}.{decimals}") if decimals else float(whole)
    return value, len(whole.lstrip("0") or "0")


def _is_easting(value: float, digits: int) -> bool:
    return digits == 6 and EASTING_RANGE[0] <= value < EASTING_RANGE[1]


def _is_northing(value: float, digits: int) -> bool:
    return digits == 7 and NORTHING_RANGE[0] <= value <= NORTHING_RANGE[1]


def _only_separators(gap: str) -> bool:
    if len(gap) > _MAX_GAP:
        return False
    return _GAP_PUNCT.sub("", _GAP_WORDS.sub(" ", gap)) == ""


def _label_before(text: str, start: int) -> str | None:
    """The row label printed just before a point, on its line or alone on the line above."""
    before = text[max(0, start - 60) : start]
    lines = before.split("\n")
    candidate = lines[-1]
    if not candidate.strip(" \t|:;,=") and len(lines) > 1:
        candidate = lines[-2]
    candidate = re.sub(r"(?:UTM\s*)?X\s*[:=]?\s*$", "", candidate.rstrip()).rstrip(" \t|:;,=")
    # The label cell is the last word or two: alone on its line, after a bar,
    # after a colon, or (a table flattened to one line) after the previous row.
    match = _LABEL.search(candidate)
    if match is None:
        return None
    label = match.group(1).strip()
    if _NOT_LABEL.match(_fold(label)):
        return None
    return label


def find_points(text: str) -> list[UtmPoint]:
    """Every easting/northing pair in reading order. Either may come first."""
    numbers = [(m, *_value(m)) for m in _NUMBER.finditer(text)]
    points: list[UtmPoint] = []
    i = 0
    while i < len(numbers) - 1:
        (a, va, da), (b, vb, db) = numbers[i], numbers[i + 1]
        if _is_easting(va, da) and _is_northing(vb, db):
            x, y = va, vb
        elif _is_northing(va, da) and _is_easting(vb, db):
            x, y = vb, va
        else:
            i += 1
            continue
        if not _only_separators(text[a.end() : b.start()]) or _MONEY_AFTER.match(text[b.end() : b.end() + 12]):
            i += 1
            continue
        points.append(UtmPoint(x=x, y=y, label=_label_before(text, a.start()), start=a.start(), end=b.end()))
        i += 2
    return points


def _heading(text: str, folded: str, start: int, floor: int) -> str | None:
    """The last line above `start` that announces coordinates, cut to 200 characters."""
    lo = max(floor, start - _HEADING_CHARS)
    lines = text[lo:start].split("\n")
    folded_lines = folded[lo:start].split("\n")
    for line, f in zip(reversed(lines), reversed(folded_lines), strict=True):
        if _COORDINATE_WORDS.search(f):
            line = " ".join(line.split())
            return line if len(line) <= 200 else line[:197].rstrip() + "..."
    return None


def _first(pattern: re.Pattern, folded: str) -> re.Match | None:
    return next(pattern.finditer(folded), None)


def _zone(m: re.Match | None) -> int | None:
    if m is None:
        return None
    return int(next(g for g in m.groups() if g))


def _split_on_repeated_labels(points: list[UtmPoint]) -> list[list[UtmPoint]]:
    """A table of two plots restarts its numbering ("V1" again): one ring each."""
    runs: list[list[UtmPoint]] = [[]]
    seen: set[str] = set()
    for p in points:
        if p.label and p.label in seen:
            runs.append([])
            seen = set()
        runs[-1].append(p)
        if p.label:
            seen.add(p.label)
    return [r for r in runs if r]


def find_coordinate_groups(text: str) -> list[CoordinateGroup]:
    """The coordinate tables and lists of one document, with the zone and datum each states.

    A document that never says UTM, coordinates, huso or a datum yields
    nothing, whatever numbers it holds: a pair of numbers in range is not
    enough on its own.
    """
    folded = _fold(text)
    if not _COORDINATE_WORDS.search(folded):
        return []
    points = find_points(text)
    if not points:
        return []
    runs: list[list[UtmPoint]] = [[points[0]]]
    for p in points[1:]:
        gap = text[runs[-1][-1].end : p.start]
        if len(gap) <= _MAX_ROW_GAP and len(_WORD.findall(gap)) < 3:
            runs[-1].append(p)
        else:
            runs.append([p])
    doc_zone = _zone(_first(_ZONE, folded))
    doc_ed50 = _first(_ED50, folded) is not None
    doc_etrs = _first(_ETRS89, folded) is not None
    groups: list[CoordinateGroup] = []
    floor = 0
    for run in runs:
        start = run[0].start
        context = folded[max(floor, start - _HEADING_CHARS) : start]
        # The nearest statement above the table wins over one elsewhere in the document.
        zones = list(_ZONE.finditer(context))
        zone = _zone(zones[-1]) if zones else doc_zone
        eds, etrs = list(_ED50.finditer(context)), list(_ETRS89.finditer(context))
        if eds or etrs:
            last_ed = eds[-1].start() if eds else -1
            last_etrs = etrs[-1].start() if etrs else -1
            datum: Datum = "ED50" if last_ed > last_etrs else "ETRS89"
            stated = True
        else:
            datum = "ED50" if doc_ed50 and not doc_etrs else "ETRS89"
            stated = doc_ed50 or doc_etrs
        heading = _heading(text, folded, start, floor)
        polygon_context = folded[max(floor, start - 300) : start]
        is_polygon = bool(_POLYGON_WORDS.search(polygon_context)) and "aerogenerador" not in polygon_context[-120:]
        for part in _split_on_repeated_labels(run) if is_polygon else [run]:
            kind: GroupKind = "poligono" if is_polygon and len(part) >= 3 else "puntos"
            groups.append(CoordinateGroup(part, kind, zone, datum, heading, stated))
        floor = run[-1].end
    return groups


@cache
def _transformer(datum: Datum, zone: int):
    from pyproj import Transformer

    epsg = (25800 if datum == "ETRS89" else 23000) + zone
    return Transformer.from_crs(epsg, 4326, always_xy=True)


def to_lonlat(x: float, y: float, zone: int, datum: Datum = "ETRS89") -> tuple[float, float]:
    """UTM metres (ETRS89 or ED50, zone 29 or 30) to WGS84 longitude and latitude.

    ETRS89 and WGS84 differ by well under a metre in Spain. The same place
    has ED50 coordinates about 110 m east and 210 m north of its ETRS89
    ones; pyproj's default transformation removes that to a few metres.
    """
    lon, lat = _transformer(datum, zone).transform(x, y)
    return lon, lat


# Where a project's points may fall: its municipalities' bounding box widened
# by this much (about 3 km), so a substation or turbine on the boundary
# stays. A point beyond it is a wrong zone, a wrong number or another
# project's infrastructure (an evacuation line's far end), and is dropped.
MUNICIPALITY_MARGIN = 0.03  # degrees
# Without resolved municipalities, Andalusia's bounding box is all there is to check.
ANDALUSIA_BOUNDS = (-7.6, 35.9, -1.5, 38.8)  # lon_min, lat_min, lon_max, lat_max
LONLAT_DECIMALS = 5  # about one metre


def widen(bounds: tuple[float, float, float, float], margin: float = MUNICIPALITY_MARGIN) -> tuple[float, float, float, float]:
    lon_min, lat_min, lon_max, lat_max = bounds
    return lon_min - margin, lat_min - margin, lon_max + margin, lat_max + margin


def _inside(lon: float, lat: float, bounds: tuple[float, float, float, float]) -> bool:
    return bounds[0] <= lon <= bounds[2] and bounds[1] <= lat <= bounds[3]


def model_groups(utm_coordinates: list[dict]) -> list[CoordinateGroup]:
    """The model's `utm_coordinates`, one group per zone it gave, for documents the rule reads nothing in."""
    by_zone: dict[int | None, list[UtmPoint]] = {}
    for c in utm_coordinates:
        if not isinstance(c, dict):
            continue
        try:
            x, y = float(c["x"]), float(c["y"])
        except (KeyError, TypeError, ValueError):
            continue
        zone = c.get("zone") if c.get("zone") in (29, 30) else None
        by_zone.setdefault(zone, []).append(UtmPoint(x=x, y=y))
    return [CoordinateGroup(points, "puntos", zone, "ETRS89", None) for zone, points in by_zone.items()]


def place(groups: list[CoordinateGroup], bounds: tuple[float, float, float, float] | None) -> list[dict]:
    """Convert each group to longitude and latitude, keeping the points that fall where the project is.

    `bounds` is where the project may be (see `widen`); None means only
    Andalusia is known. A group that states no zone is tried in zone 30 and
    then 29, and keeps the zone that places more of its points. A polygon
    that loses a vertex is shown as its remaining points, not as a
    different shape. The same point printed twice in one document is kept once.
    """
    area = bounds or ANDALUSIA_BOUNDS
    seen: set[tuple[float, float]] = set()
    placed = []
    for g in groups:
        best: tuple[int, list[dict]] | None = None
        for zone in [g.zone] if g.zone else [30, 29]:
            kept = []
            for p in g.points:
                lon, lat = to_lonlat(p.x, p.y, zone, g.datum)
                if _inside(lon, lat, area):
                    kept.append(
                        {
                            "label": p.label,
                            "x": p.x,
                            "y": p.y,
                            "lon": round(lon, LONLAT_DECIMALS),
                            "lat": round(lat, LONLAT_DECIMALS),
                        }
                    )
            if best is None or len(kept) > len(best[1]):
                best = (zone, kept)
        zone, kept = best
        whole_polygon = g.kind == "poligono" and len(kept) == len(g.points)
        if not whole_polygon:
            kept = [p for p in kept if (p["x"], p["y"]) not in seen]
        if not kept:
            continue
        seen.update((p["x"], p["y"]) for p in kept)
        placed.append(
            {
                "kind": "poligono" if whole_polygon else "puntos",
                "zone": zone,
                "zone_stated": g.zone is not None,
                "datum": g.datum,
                "evidence": g.evidence,
                "points": kept,
            }
        )
    return placed
