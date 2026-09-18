from __future__ import annotations

import argparse
import json
import logging
import math
import re
import time
from pathlib import Path

import numpy as np
import psycopg
import shapefile
import shapely
import tifffile
from pyproj import Transformer
from shapely.geometry import MultiPolygon, box
from shapely.geometry import shape as shapely_shape
from shapely.geometry.base import BaseGeometry

from impacto.db.connect import connect
from impacto.settings import load_settings

log = logging.getLogger(__name__)

# This machine's Windows Application Control policy blocks the GDAL DLLs that
# pyogrio/fiona/rasterio load on import (confirmed: geopandas.read_file and
# `import rasterio` both fail with "DLL load failed ... directiva de Control
# de aplicaciones", the same failure Task 1 hit and documented in
# docs/sources.md). geopandas, shapely, pyproj and numpy import fine; pyshp
# and tifffile+imagecodecs (pure-Python/no-GDAL) also import fine, so vector
# and raster reading below is built on those instead of geopandas.read_file
# and rasterio/pyogrio - which is why rasterio/pyogrio/geopandas are no
# longer in pyproject.toml at all (dead, unimportable dependencies).
# imagecodecs stays: tifffile delegates LZW tile decoding to it at runtime
# (verified - the real EOL/FTV rasters are LZW-compressed and fail to
# decode without it), even though load.py never imports it by name.

RASTER_KLASS = {0: "maxima", 1: "muy_alta", 2: "alta"}
RASTER_NODATA = 65535

# Every shapefile this task loads (DERA municipalities, REDIAM Natura 2000)
# ships the same ETRS89 / UTM 30N projection. Map it explicitly rather than
# parsing WKT generically; an unrecognized .prj raises instead of guessing.
_KNOWN_PRJ_EPSG = {
    "ETRS_1989_UTM_Zone_30N": 25830,
}

_BBOX_RE = re.compile(r"BOX\(([-\d.]+) ([-\d.]+),\s*([-\d.]+) ([-\d.]+)\)")


def _epsg_from_prj(prj_path: Path) -> int:
    text = prj_path.read_text(encoding="ascii", errors="replace")
    for marker, epsg in _KNOWN_PRJ_EPSG.items():
        if marker in text:
            return epsg
    raise ValueError(f"{prj_path}: unrecognized CRS, refusing to guess it: {text[:200]}")


def _shp_encoding(shp_path: Path) -> str:
    cpg_path = shp_path.with_suffix(".cpg")
    if cpg_path.exists():
        return cpg_path.read_text(encoding="ascii").strip()
    return "cp1252"


def _read_shp(path: Path) -> tuple[list[tuple[dict, BaseGeometry]], int]:
    reader = shapefile.Reader(str(path), encoding=_shp_encoding(path))
    features = [
        (sr.record.as_dict(), shapely_shape(sr.shape.__geo_interface__))
        for sr in reader.iterShapeRecords()
    ]
    return features, _epsg_from_prj(path.with_suffix(".prj"))


def _read_geojson(path: Path) -> tuple[list[tuple[dict, BaseGeometry]], int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    features = [
        (feature["properties"], shapely_shape(feature["geometry"])) for feature in data["features"]
    ]
    return features, 4326


def _read_vector(path: Path) -> tuple[list[tuple[dict, BaseGeometry]], int]:
    suffix = path.suffix.lower()
    if suffix == ".shp":
        return _read_shp(path)
    if suffix in (".geojson", ".json"):
        return _read_geojson(path)
    raise ValueError(f"unsupported vector format: {suffix}")


def _reprojector(src_epsg: int, dst_epsg: int):
    if src_epsg == dst_epsg:
        return None
    transformer = Transformer.from_crs(src_epsg, dst_epsg, always_xy=True)

    def _apply(coords: np.ndarray) -> np.ndarray:
        xs, ys = transformer.transform(coords[:, 0], coords[:, 1])
        return np.column_stack([xs, ys])

    return _apply


def _reproject(geom: BaseGeometry, apply) -> BaseGeometry:
    if apply is None:
        return geom
    return shapely.transform(geom, apply)


def _to_multipolygon(geom: BaseGeometry) -> MultiPolygon:
    """Repair self-intersections and similar invalidities with make_valid
    before wrapping into a MultiPolygon. make_valid can return a
    GeometryCollection (e.g. mixing the repaired polygon with a stray point
    or line where a ring collapsed); only the polygonal parts of that are
    kept, since geom columns here are always polygonal."""
    valid = shapely.make_valid(geom)
    if valid.geom_type == "Polygon":
        return MultiPolygon([valid])
    if valid.geom_type == "MultiPolygon":
        return valid
    if valid.geom_type == "GeometryCollection":
        polygons: list[BaseGeometry] = []
        for part in valid.geoms:
            if part.geom_type == "Polygon":
                polygons.append(part)
            elif part.geom_type == "MultiPolygon":
                polygons.extend(part.geoms)
        if not polygons:
            raise ValueError(
                f"make_valid produced no polygonal parts from a {geom.geom_type}"
            )
        return MultiPolygon(polygons)
    raise ValueError(f"expected polygonal geometry, got {valid.geom_type} (from {geom.geom_type})")


def _area_ha(geom: BaseGeometry, src_epsg: int) -> float:
    if src_epsg == 25830:
        return geom.area / 10_000
    return _reproject(geom, _reprojector(src_epsg, 25830)).area / 10_000


def load_municipalities(
    conn: psycopg.Connection, path: Path, code_field: str, name_field: str, province_field: str
) -> int:
    features, src_epsg = _read_vector(path)
    to_4326 = _reprojector(src_epsg, 4326)
    rows = []
    for props, geom in features:
        area_ha = _area_ha(geom, src_epsg)
        geom_4326 = _to_multipolygon(_reproject(geom, to_4326))
        rows.append(
            (
                str(props[code_field]).zfill(5),
                str(props[name_field]),
                str(props[province_field]),
                geom_4326.wkt,
                float(area_ha),
            )
        )
    with conn.cursor() as cur:
        cur.execute("DELETE FROM project_municipalities")
        cur.execute("DELETE FROM municipality_stats")
        cur.execute("DELETE FROM municipalities")
        cur.executemany(
            "INSERT INTO municipalities (ine_code, name, province, geom, area_ha) "
            "VALUES (%s, %s, %s, ST_Multi(ST_GeomFromText(%s, 4326)), %s)",
            rows,
        )
    conn.commit()
    return len(rows)


def load_protected_areas(
    conn: psycopg.Connection, path: Path, code_field: str, name_field: str, type_field: str
) -> int:
    features, src_epsg = _read_vector(path)
    to_4326 = _reprojector(src_epsg, 4326)
    rows = []
    for props, geom in features:
        geom_4326 = _to_multipolygon(_reproject(geom, to_4326))
        rows.append(
            (str(props[code_field]), str(props[name_field]), str(props[type_field]), geom_4326.wkt)
        )
    with conn.cursor() as cur:
        cur.execute("DELETE FROM protected_area_stats")
        cur.execute("DELETE FROM protected_areas")
        for row in rows:
            cur.execute(
                "INSERT INTO protected_areas (site_code, name, type, geom) "
                "VALUES (%s, %s, %s, ST_Multi(ST_GeomFromText(%s, 4326))) "
                "ON CONFLICT (site_code) DO NOTHING",
                row,
            )
        cur.execute("SELECT count(*) AS n FROM protected_areas")
        stored = cur.fetchone()["n"]
    conn.commit()
    skipped = len(rows) - stored
    if skipped:
        log.warning(
            "load_protected_areas: skipped %d duplicate site_code row(s) out of %d read",
            skipped,
            len(rows),
        )
    return stored


def _municipalities_bbox_25830(conn: psycopg.Connection) -> tuple[float, float, float, float]:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM municipalities")
        if cur.fetchone()["n"] == 0:
            raise ValueError(
                "municipalities table is empty; load municipalities before sensitivity zoning"
            )
        cur.execute("SELECT ST_Extent(ST_Transform(geom, 25830))::text AS bbox FROM municipalities")
        bbox_text = cur.fetchone()["bbox"]
    match = _BBOX_RE.match(bbox_text or "")
    if not match:
        raise ValueError(f"unexpected ST_Extent output: {bbox_text!r}")
    minx, miny, maxx, maxy = (float(v) for v in match.groups())
    return minx, miny, maxx, maxy


def _tiff_affine(page: tifffile.TiffPage) -> tuple[float, float, float, float]:
    tiepoint = page.tags[33922].value  # ModelTiepointTag: (i, j, k, x, y, z)
    scale = page.tags[33550].value  # ModelPixelScaleTag: (sx, sy, sz)
    return tiepoint[3], tiepoint[4], scale[0], scale[1]


def _window_for_bbox(
    bbox: tuple[float, float, float, float],
    origin_x: float,
    origin_y: float,
    px: float,
    py: float,
    imagewidth: int,
    imagelength: int,
    tilewidth: int,
    tilelength: int,
) -> tuple[int, int, int, int]:
    minx, miny, maxx, maxy = bbox
    col0 = max(0, math.floor((minx - origin_x) / px))
    col1 = min(imagewidth, math.ceil((maxx - origin_x) / px))
    row0 = max(0, math.floor((origin_y - maxy) / py))
    row1 = min(imagelength, math.ceil((origin_y - miny) / py))
    if col1 <= col0 or row1 <= row0:
        raise ValueError("municipalities bbox does not overlap the raster extent")
    return col0 // tilewidth, row0 // tilelength, (col1 - 1) // tilewidth, (row1 - 1) // tilelength


def _decode_window(
    page: tifffile.TiffPage,
    filehandle,
    tiles_across: int,
    tcol0: int,
    trow0: int,
    tcol1: int,
    trow1: int,
) -> np.ndarray:
    tilew, tileh = page.tilewidth, page.tilelength
    out = np.full(
        ((trow1 - trow0 + 1) * tileh, (tcol1 - tcol0 + 1) * tilew), RASTER_NODATA, dtype=page.dtype
    )
    for trow in range(trow0, trow1 + 1):
        for tcol in range(tcol0, tcol1 + 1):
            idx = trow * tiles_across + tcol
            count = page.databytecounts[idx]
            if not count:
                continue
            filehandle.seek(page.dataoffsets[idx])
            data = filehandle.read(count)
            decoded, _position, _shape = page.decode(data, idx)
            tile = np.asarray(decoded).reshape(tileh, tilew)
            oy, ox = (trow - trow0) * tileh, (tcol - tcol0) * tilew
            out[oy : oy + tileh, ox : ox + tilew] = tile
    return out


def _polygonize_class(
    classes: np.ndarray, value: int, origin_x: float, origin_y: float, dpx: float, dpy: float
) -> list[BaseGeometry]:
    """Merge same-value pixels into rectilinear polygons: run-length-merge each
    row into horizontal spans, then let GEOS union_all dissolve touching spans
    (within and across rows) into per-connected-region polygons. This is a
    pure-Python (shapely/GEOS-only) substitute for rasterio.features.shapes,
    which is unavailable on this machine (see module docstring)."""
    mask = classes == value
    if not mask.any():
        return []
    boxes = []
    for r in range(mask.shape[0]):
        row_mask = mask[r]
        if not row_mask.any():
            continue
        diff = np.diff(row_mask.astype(np.int8))
        starts = np.where(diff == 1)[0] + 1
        ends = np.where(diff == -1)[0] + 1
        if row_mask[0]:
            starts = np.insert(starts, 0, 0)
        if row_mask[-1]:
            ends = np.append(ends, mask.shape[1])
        y_top = origin_y - r * dpy
        y_bottom = origin_y - (r + 1) * dpy
        for s, e in zip(starts, ends):
            boxes.append(box(origin_x + s * dpx, y_bottom, origin_x + e * dpx, y_top))
    merged = shapely.union_all(boxes)
    if merged.is_empty:
        return []
    if merged.geom_type == "MultiPolygon":
        return list(merged.geoms)
    return [merged]


def load_sensitivity(
    conn: psycopg.Connection, path: Path, technology: str, factor: int = 10
) -> int:
    started = time.monotonic()
    bbox = _municipalities_bbox_25830(conn)
    with tifffile.TiffFile(path) as tf:
        page = tf.pages[0]
        if not page.is_tiled:
            raise ValueError(f"{path}: expected a tiled GeoTIFF")
        origin_x, origin_y, px, py = _tiff_affine(page)
        tilew, tileh = page.tilewidth, page.tilelength
        tiles_across = math.ceil(page.imagewidth / tilew)
        tcol0, trow0, tcol1, trow1 = _window_for_bbox(
            bbox, origin_x, origin_y, px, py, page.imagewidth, page.imagelength, tilew, tileh
        )
        window = _decode_window(page, tf.filehandle, tiles_across, tcol0, trow0, tcol1, trow1)

    window_origin_x = origin_x + tcol0 * tilew * px
    window_origin_y = origin_y - trow0 * tileh * py
    decimated = window[::factor, ::factor]
    dpx, dpy = px * factor, py * factor

    to_4326 = _reprojector(25830, 4326)
    rows = []
    for value, klass in RASTER_KLASS.items():
        for poly in _polygonize_class(decimated, value, window_origin_x, window_origin_y, dpx, dpy):
            geom_4326 = _to_multipolygon(_reproject(poly, to_4326))
            rows.append((klass, technology, geom_4326.wkt))

    with conn.cursor() as cur:
        cur.execute("DELETE FROM sensitivity_zones WHERE technology = %s", (technology,))
        cur.executemany(
            "INSERT INTO sensitivity_zones (klass, technology, geom) "
            "VALUES (%s, %s, ST_Multi(ST_GeomFromText(%s, 4326)))",
            rows,
        )
    conn.commit()
    elapsed = time.monotonic() - started
    print(f"sensitivity[{technology}]: {len(rows)} polygon(s) in {elapsed:.1f}s (factor={factor})")
    return len(rows)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="impacto reference")
    sub = parser.add_subparsers(dest="layer", required=True)

    m = sub.add_parser("municipalities")
    m.add_argument("path", type=Path)
    m.add_argument("--code", required=True)
    m.add_argument("--name", required=True)
    m.add_argument("--province", required=True)

    p = sub.add_parser("protected-areas")
    p.add_argument("path", type=Path)
    p.add_argument("--code", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--type", required=True)

    s = sub.add_parser("sensitivity")
    s.add_argument("path", type=Path)
    s.add_argument("--technology", required=True, choices=["eol", "ftv"])
    s.add_argument("--factor", type=int, default=10)

    args = parser.parse_args(argv)
    settings = load_settings()
    with connect(settings.db_dsn) as conn:
        if args.layer == "municipalities":
            n = load_municipalities(conn, args.path, args.code, args.name, args.province)
        elif args.layer == "protected-areas":
            n = load_protected_areas(conn, args.path, args.code, args.name, args.type)
        else:
            n = load_sensitivity(conn, args.path, args.technology, factor=args.factor)
    print(f"loaded {n} feature(s) into {args.layer}")
    return 0
