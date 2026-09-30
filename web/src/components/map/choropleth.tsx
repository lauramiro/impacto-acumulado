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
  sites: FeatureCollection<Geometry, SiteProps> | null;
  sensitivity: { layer: "ftv" | "eol"; data: FeatureCollection } | null;
};

const CLASS_VARS = ["--regla", "--escala-1", "--escala-2", "--escala-3", "--escala-4", "--escala-5"];

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

export function Choropleth({ municipalities, provinces, classOf, labelOf, selected, onSelect, sites, sensitivity }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const projection = useMemo(() => geoConicConformal().parallels([36, 39]).fitSize([VIEW_W, VIEW_H], municipalities), [municipalities]);

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
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className={styles.svg} role="img" aria-label="Mapa de Andalucía por municipios">
        <defs>
          {/* Projects but no declared MW or ha; the legend swatch draws the same hatching. */}
          <pattern id="rayado-sin-dato" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" className={styles.sinDatoFondo} />
            <line x1="0" y1="0" x2="0" y2="4" className={styles.sinDatoRaya} />
          </pattern>
          <pattern id="rayado-sensibilidad" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
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
      <Tooltip state={tooltip} />
    </div>
  );
}
