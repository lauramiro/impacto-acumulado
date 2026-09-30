"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import { formatInt, formatMonth } from "@/lib/format";
import { EVENT_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { buildSeries, monthRange, seriesMax, TIMELINE_START, yearTotals } from "@/lib/timeline";
import { EVENTS, REGION, TECHNOLOGIES, type EventKind, type MonthlyEvent, type Province, type Technology } from "@/lib/types";
import { Tooltip, type TooltipState } from "./tooltip";
import styles from "./timeline.module.css";

const W = 1000;
const ROW_H = 44;
const BAR_H = 28;
const AXIS_H = 20;
const FILL: Record<EventKind, string> = {
  consulta: "var(--tinta)",
  favorable: "var(--tinta)",
  favorable_condicionada: "var(--tinta)",
  desfavorable: "var(--alerta)",
  sin_veredicto: "var(--regla)",
};

type Props = {
  events: readonly MonthlyEvent[];
  province: Province | null;
  technologies: ReadonlySet<Technology>;
  lastMonth: string;
  onClearProvince: () => void;
};

export function Timeline({ events, province, technologies, lastMonth, onClearProvince }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const months = useMemo(() => monthRange(TIMELINE_START, lastMonth), [lastMonth]);
  const series = useMemo(() => buildSeries(events, province ?? REGION, technologies, months), [events, province, technologies, months]);
  const max = seriesMax(series);
  const years = yearTotals(series, months);
  const band = W / months.length;
  const scope = province ? `Provincia de ${province}` : REGION;
  const techNote =
    technologies.size > 0 && technologies.size < TECHNOLOGIES.length
      ? ` · ${TECHNOLOGIES.filter((t) => technologies.has(t)).map((t) => TECHNOLOGY_LABELS[t]).join(", ")}`
      : "";
  const sums = Object.fromEntries(EVENTS.map((e) => [e, series[e].reduce((a, b) => a + b, 0)])) as Record<EventKind, number>;
  // Rows with no document in this scope are left out and named in a note.
  const shown = EVENTS.filter((e) => sums[e] > 0);
  const empty = EVENTS.filter((e) => sums[e] === 0);
  const totals = shown.map((e) => `${EVENT_LABELS[e]} ${formatInt(sums[e])}`).join(", ");
  const height = shown.length * ROW_H + AXIS_H;

  function hover(e: MouseEvent, ev: EventKind, i: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: EVENT_LABELS[ev], value: `${formatMonth(months[i])} · ${formatInt(series[ev][i])}` });
  }

  return (
    <section aria-labelledby="evolucion" className={styles.section}>
      <h2 id="evolucion">
        Resoluciones por mes · {scope}
        {techNote}
      </h2>
      {province ? (
        <button type="button" className={styles.toda} onClick={onClearProvince}>
          Toda Andalucía
        </button>
      ) : null}
      {max === 0 ? (
        <p>Ninguna resolución con estos filtros.</p>
      ) : (
        <div className={styles.wrap} ref={wrapRef}>
          {/* An SVG <title>, not aria-label: Playwright's getByLabel would otherwise match the
              event names in the summary against the status checkboxes' labels. */}
          <svg viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" onMouseLeave={() => setTooltip(null)}>
            <title>{`Resoluciones por mes desde ${formatMonth(TIMELINE_START)}: ${totals}`}</title>
            {shown.map((ev, row) => {
              const top = row * ROW_H;
              return (
                <g key={ev}>
                  <text x={0} y={top + 11} className={styles.etiqueta}>
                    {EVENT_LABELS[ev]}
                  </text>
                  <line x1={0} x2={W} y1={top + ROW_H - 2} y2={top + ROW_H - 2} className={styles.base} />
                  {series[ev].map((n, i) =>
                    n === 0 ? null : (
                      <rect
                        key={months[i]}
                        x={i * band + 0.5}
                        width={Math.max(1, band - 1)}
                        y={top + ROW_H - 2 - (n / max) * BAR_H}
                        height={(n / max) * BAR_H}
                        fill={FILL[ev]}
                        onMouseMove={(e) => hover(e, ev, i)}
                      />
                    ),
                  )}
                </g>
              );
            })}
            {months.map((m, i) =>
              m.endsWith("-01") ? (
                <text key={m} x={i * band} y={height - 4} className={styles.eje}>
                  {m.slice(0, 4)}
                </text>
              ) : null,
            )}
          </svg>
          <Tooltip state={tooltip} />
        </div>
      )}
      <p className={styles.nota}>
        Cuenta documentos publicados (anuncios de información pública y resoluciones, por su veredicto), no proyectos por su estado actual: el filtro de estado no se aplica.
        {empty.length > 0 && max > 0 ? ` Sin documentos con esta selección: ${empty.map((e) => EVENT_LABELS[e]).join(", ")}.` : null}
      </p>
      <p className={styles.nota}>Entre 2019 y 2021 la colección solo contiene 5 documentos; la serie empieza en 2022.</p>
      {shown.length > 0 ? (
        <details className={styles.datos}>
          <summary>Ver los datos</summary>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th scope="col">Año</th>
                {shown.map((e) => (
                  <th key={e} scope="col" className={styles.num}>
                    {EVENT_LABELS[e]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.year}>
                  <th scope="row" className="dato">
                    {y.year}
                  </th>
                  {shown.map((e) => (
                    <td key={e} className={`dato ${styles.num}`}>
                      {formatInt(y.counts[e])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}
