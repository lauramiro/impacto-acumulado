import { geoMercator, geoPath } from "d3-geo";
import type { MultiPolygon, Polygon } from "geojson";
import { formatInt, formatNumber } from "@/lib/format";
import type { DocumentLocation, LocationGroup } from "@/lib/data/project-details";
import type { GazetteDocument } from "@/lib/types";
import { docLabel } from "./conditions";
import { type Box, boxOf, boxOfGeometry, padBox, sigpacUrl, unionBox } from "./location-geometry";
import styles from "./location-map.module.css";

const W = 640;
const H = 400;
const PAD = 16;

export type Place = { ine: string; name: string; outline: Polygon | MultiPolygon | undefined };
export type Located = { documentId: number; doc: GazetteDocument | undefined; location: DocumentLocation };

const coord = (n: number) => formatNumber(n, n % 1 === 0 ? 0 : 2);
const degrees = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 5, maximumFractionDigits: 5 });

function describe(g: LocationGroup): string {
  const what = g.kind === "poligono" ? `polígono de ${formatInt(g.points.length)} vértices` : g.points.length === 1 ? "1 punto" : `${formatInt(g.points.length)} puntos`;
  const zone = g.zoneStated ? `huso ${g.zone}` : `huso ${g.zone}, que el documento no indica: es el que sitúa los puntos en los municipios del proyecto`;
  return `${what}; coordenadas UTM ${g.datum}, ${zone}`;
}

function Coordinates({ group }: { group: LocationGroup }) {
  return (
    <details className={styles.coordenadas}>
      <summary>Coordenadas</summary>
      <div className={styles.tablaWrap}>
        <table className="dato">
          <thead>
            <tr>
              <th scope="col">Punto</th>
              <th scope="col">X (m)</th>
              <th scope="col">Y (m)</th>
              <th scope="col">Longitud</th>
              <th scope="col">Latitud</th>
            </tr>
          </thead>
          <tbody>
            {group.points.map((p, i) => (
              <tr key={i}>
                <td>{p.label ?? formatInt(i + 1)}</td>
                <td>{coord(p.x)}</td>
                <td>{coord(p.y)}</td>
                <td>{degrees(p.lon)}</td>
                <td>{degrees(p.lat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** A small map of the coordinates the documents publish over the project's municipalities. */
function LocationSvg({ located, places, frame }: { located: Located[]; places: Place[]; frame: Box }) {
  const projection = geoMercator().fitExtent(
    [
      [PAD, PAD],
      [W - PAD, H - PAD],
    ],
    { type: "MultiPoint", coordinates: [[frame[0], frame[1]], [frame[2], frame[3]]] },
  );
  const path = geoPath(projection);
  const xy = (lon: number, lat: number) => projection([lon, lat]) ?? [0, 0];
  const groups = located.flatMap((l) => l.location.groups);
  const points = groups.flatMap((g) => g.points).length;
  const polygons = groups.filter((g) => g.kind === "poligono");
  const names = places.map((p) => p.name).join(", ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-labelledby="ubicacion-mapa-titulo">
      <title id="ubicacion-mapa-titulo">
        {`Mapa: ${formatInt(points)} ${points === 1 ? "punto" : "puntos"}${polygons.length > 0 ? `, ${formatInt(polygons.length)} ${polygons.length === 1 ? "polígono" : "polígonos"}` : ""} sobre ${names || "Andalucía"}`}
      </title>
      <g className={styles.municipios}>
        {places.map((p) => (p.outline ? <path key={p.ine} d={path(p.outline) ?? ""} /> : null))}
      </g>
      <g className={styles.poligonos}>
        {polygons.map((g, i) => (
          <path key={i} d={`M${g.points.map((p) => xy(p.lon, p.lat).map((v) => v.toFixed(1)).join(",")).join("L")}Z`} />
        ))}
      </g>
      <g className={styles.puntos}>
        {groups
          .filter((g) => g.kind === "puntos")
          .flatMap((g) => g.points)
          .map((p, i) => {
            const [cx, cy] = xy(p.lon, p.lat);
            return (
              <circle key={i} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={5}>
                <title>{`${p.label ? `${p.label}: ` : ""}X ${coord(p.x)}, Y ${coord(p.y)}`}</title>
              </circle>
            );
          })}
      </g>
      {places.map((p) => {
        const box = p.outline ? boxOfGeometry(p.outline) : null;
        if (!box) return null;
        const [x, y] = xy((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
        return (
          <text key={p.ine} x={x.toFixed(1)} y={y.toFixed(1)} className={styles.nombre} textAnchor="middle" aria-hidden="true">
            {p.name}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * Where the project is: the coordinates its documents publish, on a map of its municipalities,
 * or, when none publishes any, a link to each municipality in the official viewer.
 */
export function ProjectLocation({ located, places }: { located: Located[]; places: Place[] }) {
  const placesBox = unionBox(places.map((p) => (p.outline ? boxOfGeometry(p.outline) : null)));
  const pointsBox = boxOf(located.flatMap((l) => l.location.groups.flatMap((g) => g.points.map((p) => [p.lon, p.lat]))));
  if (!pointsBox) {
    const linked = places.filter((p) => p.outline);
    return (
      <section aria-labelledby="ubicacion" className={styles.section}>
        <h2 id="ubicacion">Ubicación</h2>
        <p>
          Ningún documento del proyecto publica coordenadas que se hayan podido leer, así que su posición dentro del municipio no se
          conoce.
          {linked.length > 0 ? " Los municipios en el visor oficial (SIGPAC, Ministerio de Agricultura):" : null}
        </p>
        {linked.length > 0 ? (
          <ul className={styles.visor}>
            {linked.map((p) => (
              <li key={p.ine}>
                <a href={sigpacUrl(boxOfGeometry(p.outline!)!)} rel="external">
                  {p.name} en el visor SIGPAC
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }
  const frame = padBox(unionBox([placesBox, pointsBox])!);
  return (
    <section aria-labelledby="ubicacion" className={styles.section}>
      <h2 id="ubicacion">Ubicación</h2>
      <figure className={styles.figura} data-testid="mapa-ubicacion">
        <LocationSvg located={located} places={places} frame={frame} />
        <figcaption className="pie">
          Coordenadas UTM publicadas en los documentos, convertidas a longitud y latitud, sobre los términos municipales del proyecto.
          Lectura automática: las coordenadas que valen son las del boletín. Se descartan las que caen a más de unos 3 km de esos
          municipios (por ejemplo, el final de una línea de evacuación).
        </figcaption>
      </figure>
      <p>
        <a href={sigpacUrl(pointsBox)} rel="external">
          Ver la zona en el visor SIGPAC
        </a>{" "}
        <span className="pie">(Ministerio de Agricultura; visor oficial con ortofoto y parcelas).</span>
      </p>
      <ul className={styles.documentos}>
        {located.map((l) => (
          <li key={l.documentId}>
            {l.doc ? <a href={`#documento-${l.doc.id}`}>{docLabel(l.doc)}</a> : "Documento"}
            {l.location.source === "modelo" ? <span className="pie"> (leídas por el modelo de lenguaje)</span> : null}
            <ul>
              {l.location.groups.map((g, i) => (
                <li key={i}>
                  {describe(g)}.
                  {g.evidence ? <span className="pie"> «{g.evidence}»</span> : null}
                  <Coordinates group={g} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
