import numpy as np
import tifffile

from impacto.reference.load import load_municipalities, load_protected_areas, load_sensitivity


def test_load_municipalities_replaces_table(db, fixtures_dir):
    path = fixtures_dir / "municipalities_sample.geojson"
    assert load_municipalities(db, path, "CODIGO_INE", "NOMBRE", "PROVINCIA") == 2
    assert load_municipalities(db, path, "CODIGO_INE", "NOMBRE", "PROVINCIA") == 2
    with db.cursor() as cur:
        cur.execute(
            "SELECT ine_code, name, province, area_ha, ST_GeometryType(geom) AS t, "
            "ST_SRID(geom) AS srid FROM municipalities ORDER BY ine_code"
        )
        rows = cur.fetchall()
    assert [r["ine_code"] for r in rows] == ["29067", "29084"]
    assert rows[1]["name"] == "Ronda"
    assert rows[1]["t"] == "ST_MultiPolygon"
    assert rows[1]["srid"] == 4326
    assert rows[1]["area_ha"] > 5000


def test_load_protected_areas_replaces_table(db, fixtures_dir):
    path = fixtures_dir / "protected_areas_sample.geojson"
    assert load_protected_areas(db, path, "CODIGOEURO", "NOMBRE", "FIGURA") == 2
    assert load_protected_areas(db, path, "CODIGOEURO", "NOMBRE", "FIGURA") == 2
    with db.cursor() as cur:
        cur.execute(
            "SELECT site_code, name, type, ST_GeometryType(geom) AS t, ST_SRID(geom) AS srid "
            "FROM protected_areas ORDER BY site_code"
        )
        rows = cur.fetchall()
    assert [r["site_code"] for r in rows] == ["ES6170001", "ES6170002"]
    assert rows[0]["name"] == "Sierra de Grazalema"
    assert rows[0]["type"] == "ZEC"
    assert rows[0]["t"] == "ST_MultiPolygon"
    assert rows[0]["srid"] == 4326


def _write_sensitivity_fixture(tmp_path):
    # 40x40 pixels at 250m in EPSG:25830, placed over the Ronda fixture square
    # (lon -5.2..-5.1, lat 36.7..36.8), with margin so the raster fully covers it.
    origin_x, origin_y = 303000.0, 4076000.0
    pixel = 250.0
    arr = np.full((40, 40), 4, dtype=np.uint16)  # baja (excluded)
    arr[5:15, 5:15] = 0  # maxima block
    arr[25:35, 25:35] = 2  # alta block
    extratags = [
        (33550, "d", 3, (pixel, pixel, 0.0), False),  # ModelPixelScaleTag
        (33922, "d", 6, (0.0, 0.0, 0.0, origin_x, origin_y, 0.0), False),  # ModelTiepointTag
    ]
    path = tmp_path / "sensitivity_sample.tiff"
    tifffile.imwrite(path, arr, photometric="minisblack", tile=(16, 16), extratags=extratags)
    return path


def test_load_sensitivity_classifies_and_intersects_municipality(db, fixtures_dir, tmp_path):
    load_municipalities(db, fixtures_dir / "municipalities_sample.geojson", "CODIGO_INE", "NOMBRE", "PROVINCIA")
    raster_path = _write_sensitivity_fixture(tmp_path)

    count = load_sensitivity(db, raster_path, "eol", factor=2)
    assert count > 0

    with db.cursor() as cur:
        cur.execute("SELECT DISTINCT klass FROM sensitivity_zones WHERE technology = 'eol'")
        klasses = {r["klass"] for r in cur.fetchall()}
    assert klasses == {"maxima", "alta"}

    with db.cursor() as cur:
        cur.execute(
            "SELECT sz.id FROM sensitivity_zones sz JOIN municipalities m ON ST_Intersects(sz.geom, m.geom) "
            "WHERE m.ine_code = '29084' AND sz.technology = 'eol'"
        )
        rows = cur.fetchall()
    assert len(rows) > 0

    # repeatable: reloading the same technology replaces rows rather than accumulating
    count2 = load_sensitivity(db, raster_path, "eol", factor=2)
    assert count2 == count
    with db.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM sensitivity_zones WHERE technology = 'eol'")
        assert cur.fetchone()["n"] == count
