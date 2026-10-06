import type { MultiPolygon, Polygon, Position } from "geojson";

/** lon_min, lat_min, lon_max, lat_max. */
export type Box = [number, number, number, number];

// The official viewer: SIGPAC, Ministerio de Agricultura, Pesca y Alimentación. Its manual
// ("2.1.1 Por centro y radio") documents [visor]/?x=[X]&y=[Y]&srid=[srid]&r=[R], with the
// centre in the SRID's units and the radius in metres; 4258 (ETRS89 geographic) is one of the
// systems it lists. WGS84 longitude and latitude match ETRS89 to well under a metre here.
export const SIGPAC_VISOR = "https://sigpac.mapa.gob.es/fega/visor/";

const METRES_PER_DEGREE_LAT = 110_950;
const METRES_PER_DEGREE_LON_EQUATOR = 111_320;

function* positions(geometry: Polygon | MultiPolygon): Generator<Position> {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) for (const ring of rings) yield* ring;
}

/** The box around a set of positions, or null for none. Plain arithmetic: no winding order to get wrong. */
export function boxOf(points: Iterable<Position>): Box | null {
  let box: Box | null = null;
  for (const [lon, lat] of points) {
    if (lon === undefined || lat === undefined) continue;
    box = box ? [Math.min(box[0], lon), Math.min(box[1], lat), Math.max(box[2], lon), Math.max(box[3], lat)] : [lon, lat, lon, lat];
  }
  return box;
}

export function boxOfGeometry(geometry: Polygon | MultiPolygon): Box | null {
  return boxOf(positions(geometry));
}

export function unionBox(boxes: (Box | null)[]): Box | null {
  return boxOf(boxes.flatMap((b) => (b ? [[b[0], b[1]], [b[2], b[3]]] : [])));
}

/** Half the box's diagonal in metres, at least `floor`: the radius that shows the whole box. */
export function radiusMetres(box: Box, floor = 500): number {
  const midLat = (box[1] + box[3]) / 2;
  const dx = (box[2] - box[0]) * METRES_PER_DEGREE_LON_EQUATOR * Math.cos((midLat * Math.PI) / 180);
  const dy = (box[3] - box[1]) * METRES_PER_DEGREE_LAT;
  return Math.max(floor, Math.hypot(dx, dy) / 2);
}

/** A SIGPAC viewer link centred on the box, wide enough to show all of it. */
export function sigpacUrl(box: Box, floor = 500): string {
  const lon = (box[0] + box[2]) / 2;
  const lat = (box[1] + box[3]) / 2;
  const r = Math.round(radiusMetres(box, floor) * 1.2);
  return `${SIGPAC_VISOR}?x=${lon.toFixed(5)}&y=${lat.toFixed(5)}&srid=4258&r=${r}`;
}

/** The box widened so a lone point or a thin line still gets a frame around it. */
export function padBox(box: Box, minSpan = 0.01): Box {
  const padLon = Math.max(0, (minSpan - (box[2] - box[0])) / 2);
  const padLat = Math.max(0, (minSpan - (box[3] - box[1])) / 2);
  return [box[0] - padLon, box[1] - padLat, box[2] + padLon, box[3] + padLat];
}
