"use client";

import { geoConicConformal, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { useMemo, useState } from "react";
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

export function Choropleth({ municipalities, provinces, classOf, labelOf, selected, onSelect }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const paths = useMemo(() => {
    const projection = geoConicConformal().parallels([36, 39]).fitSize([VIEW_W, VIEW_H], municipalities);
    const path = geoPath(projection);
    return {
      munis: municipalities.features.map((f) => ({ ine: f.properties.ine_code, name: f.properties.name, d: path(f) ?? "" })),
      provs: provinces.features.map((f) => ({ province: f.properties.province, d: path(f) ?? "" })),
    };
  }, [municipalities, provinces]);

  return (
    <div className={styles.wrap}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className={styles.svg} role="img" aria-label="Mapa de Andalucía por municipios">
        <g onMouseLeave={() => setTooltip(null)}>
          {paths.munis.map((m) => (
            <path
              key={m.ine}
              d={m.d}
              data-ine={m.ine}
              className={`${styles.muni} ${selected === m.ine ? styles.seleccionado : ""}`}
              style={{ fill: `var(${CLASS_VARS[classOf(m.ine)]})` }}
              onMouseMove={(e) => {
                const host = e.currentTarget.ownerSVGElement?.parentElement;
                if (!host) return;
                const rect = host.getBoundingClientRect();
                setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: m.name, value: labelOf(m.ine) });
              }}
              onClick={() => onSelect(selected === m.ine ? null : m.ine)}
            >
              <title>{`${m.name}: ${labelOf(m.ine)}`}</title>
            </path>
          ))}
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
