"use client";

import { geoConicConformal, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Tooltip, type TooltipState } from "./tooltip";
import styles from "./choropleth.module.css";

export const VIEW_W = 1000;
export const VIEW_H = 560;

export type MuniProps = { ine_code: string; name: string; province: string };
export type ProvProps = { province: string };

type Props = {
  municipalities: FeatureCollection<Geometry, MuniProps>;
  provinces: FeatureCollection<Geometry, ProvProps>;
  classOf: (ine: string) => number;
  labelOf: (ine: string) => string;
  selected: string | null;
  onSelect: (ine: string | null) => void;
};

const CLASS_VARS = ["--regla", "--escala-1", "--escala-2", "--escala-3", "--escala-4", "--escala-5"];

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
          style={{ fill: `var(${CLASS_VARS[m.cls]})` }}
          onMouseMove={(e) => onHover(m.name, m.label, e.clientX, e.clientY)}
          onClick={() => onSelect(selected === m.ine ? null : m.ine)}
        >
          <title>{`${m.name}: ${m.label}`}</title>
        </path>
      ))}
    </>
  );
});

export function Choropleth({ municipalities, provinces, classOf, labelOf, selected, onSelect }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const paths = useMemo(() => {
    const projection = geoConicConformal().parallels([36, 39]).fitSize([VIEW_W, VIEW_H], municipalities);
    const path = geoPath(projection);
    return {
      munis: municipalities.features.map((f) => ({ ine: f.properties.ine_code, name: f.properties.name, d: path(f) ?? "" })),
      provs: provinces.features.map((f) => ({ province: f.properties.province, d: path(f) ?? "" })),
    };
  }, [municipalities, provinces]);

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
        <g onMouseLeave={handleLeave}>
          <MuniLayer items={muniItems} selected={selected} onSelect={onSelect} onHover={handleHover} />
        </g>
        <g className={styles.provincias} aria-hidden="true">
          {paths.provs.map((p) => (
            <path key={p.province} d={p.d} />
          ))}
        </g>
      </svg>
      <Tooltip state={tooltip} />
    </div>
  );
}
