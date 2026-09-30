"use client";

import { geoConicConformal, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { NO_FIGURE_CLASS } from "@/lib/metrics";
import { Tooltip, type TooltipState } from "./tooltip";
import styles from "./choropleth.module.css";

export const VIEW_W = 1000;
export const VIEW_H = 560;

export type MuniProps = { ine_code: string; name: string; province: string };
export type ProvProps = { province: string };
export type SiteProps = { site_code: string; name: string; type: string };

type Props = {
  municipalities: FeatureCollection<Geometry, MuniProps>;
  provinces: FeatureCollection<Geometry, ProvProps>;
  classOf: (ine: string) => number;
  labelOf: (ine: string) => string;
  selected: string | null;
  onSelect: (ine: string | null) => void;
  /** Province picked in the province table: the map zooms to it and outlines it. */
  province: string | null;
  sites: FeatureCollection<Geometry, SiteProps> | null;
  sensitivity: { layer: "ftv" | "eol"; data: FeatureCollection } | null;
};

/** Keeps the outer outline's stroke inside the viewBox. */
const FIT_PAD = 4;
/**
 * The mainland ends at 36.00N (Tarifa). The Isla de Alborán (35.94N), part of the
 * municipality of Almería, lies some 90 km offshore: fitting it shrank the mainland
 * and left a speck under the map, so the fit ignores it and it falls outside the frame.
 */
const MAINLAND_SOUTH = 35.97;

function mainland<P>(fc: FeatureCollection<Geometry, P>): FeatureCollection<Geometry, P> {
  return {
    ...fc,
    features: fc.features.map((f) =>
      f.geometry.type === "MultiPolygon"
        ? { ...f, geometry: { ...f.geometry, coordinates: f.geometry.coordinates.filter((poly) => poly[0].some(([, lat]) => lat >= MAINLAND_SOUTH)) } }
        : f,
    ),
  };
}

const CLASS_VARS =["--regla", "--escala-1", "--escala-2", "--escala-3", "--escala-4", "--escala-5"];

function fillOf(cls: number): string {
  return cls === NO_FIGURE_CLASS ? "url(#rayado-sin-dato)" : `var(${CLASS_VARS[cls]})`;
}

type MuniItem = { ine: string; name: string; d: string; cls: number; label: string };

type MuniLayerProps = {
  items: MuniItem[];
  selected: string | null;
  onSelect: (ine: string | null) => void;
  onHover: (name: string, label: string, clientX: number, clientY: number) => void;
};

/**
 * Memoised so hovering (which only updates tooltip state in the parent) does not
 * re-render all 785 municipality paths. Re-renders only when `items` (recomputed
 * when the geometry or the metric/status classification changes), `selected` or
 * `onSelect` actually change.
 */
const MuniLayer = memo(function MuniLayer({ items, selected, onSelect, onHover }: MuniLayerProps) {
  return (
    <>
      {items.map((m) => (
        <path
          key={m.ine}
          d={m.d}
          data-ine={m.ine}
          className={`${styles.muni} ${selected === m.ine ? styles.seleccionado : ""}`}
          style={{ fill: fillOf(m.cls) }}
          onMouseMove={(e) => onHover(m.name, m.label, e.clientX, e.clientY)}
          onClick={() => onSelect(selected === m.ine ? null : m.ine)}
        >
          <title>{`${m.name}: ${m.label}`}</title>
        </path>
      ))}
    </>
  );
});

export function Choropleth({ municipalities, provinces, classOf, labelOf, selected, onSelect, province, sites, sensitivity }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A picked province refits the projection to it, at every width: fitted to the whole
  // mainland, a phone draws most municipalities under 10px, too small to tap. Neighbours
  // stay visible at the edges and the viewBox clips the rest.
  const provinceFeature = useMemo(() => (province ? provinces.features.find((f) => f.properties.province === province) : undefined), [province, provinces]);

  const projection = useMemo(
    () =>
      geoConicConformal()
        .parallels([36, 39])
        .fitExtent(
          [
            [FIT_PAD, FIT_PAD],
            [VIEW_W - FIT_PAD, VIEW_H - FIT_PAD],
          ],
          provinceFeature ? mainland({ type: "FeatureCollection", features: [provinceFeature] }) : mainland(municipalities),
        ),
    [municipalities, provinceFeature],
  );

  const paths = useMemo(() => {
    const path = geoPath(projection);
    return {
      munis: municipalities.features.map((f) => ({ ine: f.properties.ine_code, name: f.properties.name, d: path(f) ?? "" })),
      provs: provinces.features.map((f) => ({ province: f.properties.province, d: path(f) ?? "" })),
    };
  }, [projection, municipalities, provinces]);

  const sitePaths = useMemo(() => {
    if (!sites) return [];
    const path = geoPath(projection);
    return sites.features.map((f) => ({ ...f.properties, d: path(f) ?? "" }));
  }, [projection, sites]);

  const sensitivityPath = useMemo(() => (sensitivity ? geoPath(projection)(sensitivity.data) ?? "" : ""), [projection, sensitivity]);

  const muniItems = useMemo<MuniItem[]>(
    () => paths.munis.map((m) => ({ ine: m.ine, name: m.name, d: m.d, cls: classOf(m.ine), label: labelOf(m.ine) })),
    [paths, classOf, labelOf],
  );

  const handleHover = useCallback((name: string, label: string, clientX: number, clientY: number) => {
    const host = wrapRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    setTooltip({ x: clientX - rect.left, y: clientY - rect.top, name, value: label });
  }, []);

  const handleLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className={styles.svg} role="img" aria-describedby="mapa-teclado" aria-label={province ? `Mapa de Andalucía por municipios, ampliado a la provincia de ${province}` : "Mapa de Andalucía por municipios"}>
        <defs>
          {/* Projects but no declared MW or ha; the legend swatch draws the same hatching. */}
          <pattern id="rayado-sin-dato" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" className={styles.sinDatoFondo} />
            <line x1="0" y1="0" x2="0" y2="4" className={styles.sinDatoRaya} />
          </pattern>
          {/* Opposite angle to #rayado-sin-dato, so a sensitive municipality with no declared figure reads as a cross-hatch rather than one hatch. */}
          <pattern id="rayado-sensibilidad" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" className={styles.rayado} />
          </pattern>
        </defs>
        <g onMouseLeave={handleLeave}>
          <MuniLayer items={muniItems} selected={selected} onSelect={onSelect} onHover={handleHover} />
        </g>
        {sensitivity ? <path d={sensitivityPath} data-sensitivity={sensitivity.layer} className={styles.sensibilidad} aria-hidden="true" /> : null}
        <g className={styles.provincias} aria-hidden="true">
          {paths.provs.map((p) => (
            <path key={p.province} d={p.d} />
          ))}
        </g>
        {paths.provs
          .filter((p) => p.province === province)
          .map((p) => (
            <path key={p.province} d={p.d} data-province={p.province} className={styles.provinciaMarcada} aria-hidden="true" />
          ))}
        {/* The selected municipality, redrawn on top: in the municipality layer its stroke
            scaled with the viewBox and the neighbours painted after it covered half of it. */}
        {paths.munis
          .filter((m) => m.ine === selected)
          .map((m) => (
            <g key={m.ine} data-selected={m.ine} aria-hidden="true">
              <path d={m.d} className={styles.marcoSeleccion} />
              <path d={m.d} className={styles.muniMarcado} />
            </g>
          ))}
        <g onMouseLeave={handleLeave}>
          {sitePaths.map((s) => (
            <path
              key={s.site_code}
              d={s.d}
              data-site={s.site_code}
              className={styles.espacio}
              onMouseMove={(e) => handleHover(s.name, `${s.site_code} · ${s.type}`, e.clientX, e.clientY)}
            />
          ))}
        </g>
      </svg>
      {/* The municipalities are mouse and touch targets only; the index is the keyboard path to the same selection. */}
      <p id="mapa-teclado" className="visually-hidden">
        Para elegir un municipio con el teclado, usa el índice de municipios, más abajo: su botón Ver en el mapa lo selecciona aquí.
      </p>
      <Tooltip state={tooltip} />
    </div>
  );
}
