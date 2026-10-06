"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Tooltip, type TooltipState } from "@/components/map/tooltip";
import type { AccumulationStep } from "@/lib/accumulation";
import { formatDate, formatInt, formatMw, formatNumber, NO_DATA } from "@/lib/format";
import styles from "./accumulation-chart.module.css";

// Width before the container is measured; afterwards the viewBox matches the rendered
// width, so the axis labels keep their pixel size on a phone.
const DEFAULT_W = 704;
const H = 200;
// The left gutter holds the MW labels, outside the plot so the line never runs through them.
const PAD = { top: 12, right: 8, bottom: 22, left: 64 };

const time = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Round gridline steps: 1, 2 or 5 times a power of ten, at most four lines up to `max`. */
function ticks(max: number): number[] {
  if (max <= 0) return [];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = step; v <= max; v += step) out.push(v);
  return out;
}

type Props = {
  steps: readonly AccumulationStep[];
  /** The newest document in the data: the line runs to it. */
  until: string;
  name: string;
};

export function AccumulationChart({ steps, until, name }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(DEFAULT_W);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0) setW(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (steps.length === 0) return null;
  const last = steps[steps.length - 1];
  // No project here declares MW: a flat line at zero says nothing the sentence does not.
  if (last.total === 0) {
    return (
      <section aria-labelledby="acumulacion" className={styles.section}>
        <h2 id="acumulacion">Cómo se ha acumulado</h2>
        <p className={styles.resumen}>
          {formatInt(last.count)} {last.count === 1 ? "proyecto aprobado o en trámite" : "proyectos aprobados o en trámite"} y ninguna potencia que sumar: {steps.every((s) => s.line) ? (last.count === 1 ? "es una línea de evacuación, cuya potencia cuenta en las plantas que evacúa" : "son líneas de evacuación, cuya potencia cuenta en las plantas que evacúan") : "sin MW declarado"}.
        </p>
      </section>
    );
  }
  const firstYear = Number(steps[0].date.slice(0, 4));
  const lastYear = Number(until.slice(0, 4));
  const t0 = time(`${firstYear}-01-01`);
  const t1 = Math.max(time(until), time(last.date));
  // Some room above the last step, so the line does not run along the top edge.
  const max = Math.max(last.total, 1) * 1.08;
  const x = (iso: string) => PAD.left + ((time(iso) - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (mw: number) => PAD.top + (1 - mw / max) * (H - PAD.top - PAD.bottom);
  const base = y(0);

  // A step line: flat until each project's first notice, then up by its figure.
  let d = `M${x(`${firstYear}-01-01`)},${base}`;
  let prev = 0;
  for (const s of steps) {
    const sx = x(s.date);
    d += ` L${sx},${y(prev)} L${sx},${y(s.total)}`;
    prev = s.total;
  }
  d += ` L${x(until)},${y(prev)}`;
  const area = `${d} L${x(until)},${base} Z`;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const undeclared = steps.filter((s) => s.mw === null && !s.line).length;
  const lines = steps.filter((s) => s.line).length;

  function hover(e: MouseEvent, s: AccumulationStep) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const added = s.line ? "línea de evacuación" : s.mw === null ? `${NO_DATA} de MW` : `+${formatMw(s.mw)}`;
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: s.name, value: `${formatDate(s.date)} · ${added} · total ${formatMw(s.total)}` });
  }

  return (
    <section aria-labelledby="acumulacion" className={styles.section}>
      <h2 id="acumulacion">Cómo se ha acumulado</h2>
      <p className={styles.resumen}>
        <span className="dato">{formatMw(last.total)}</span> en {formatInt(last.count)} {last.count === 1 ? "proyecto aprobado o en trámite" : "proyectos aprobados o en trámite"},{" "}
        {last.count === 1 ? `anunciado el ${formatDate(last.date)}` : `anunciados entre el ${formatDate(steps[0].date)} y el ${formatDate(last.date)}`}.
      </p>
      <div className={styles.wrap} ref={wrapRef}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" onMouseLeave={() => setTooltip(null)} data-testid="grafico-acumulacion">
          <title>{`Potencia aprobada o en trámite acumulada en ${name}, por fecha del primer anuncio de cada proyecto: ${formatMw(last.total)} en ${formatInt(last.count)} proyectos.`}</title>
          {/* Painted in this order so the gridlines show over the area and the labels over the line. */}
          <path d={area} className={styles.area} />
          {ticks(last.total).map((v) => (
            <line key={v} x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={styles.rejilla} />
          ))}
          <path d={d} className={styles.linea} />
          <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} className={styles.base} />
          {ticks(last.total).map((v) => (
            <text key={v} x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className={styles.eje}>
              {formatNumber(v, 0)} MW
            </text>
          ))}
          {years.map((yr) => {
            const yx = x(`${yr}-01-01`);
            // On a phone every other year is labelled, so the labels do not touch.
            const label = W >= 480 || (yr - firstYear) % 2 === 0;
            return label ? (
              <text key={yr} x={yx} y={H - 6} textAnchor="middle" className={styles.eje}>
                {yr}
              </text>
            ) : null;
          })}
          {steps.map((s) => (
            <circle
              key={s.projectId}
              cx={x(s.date)}
              cy={y(s.total)}
              r={4}
              className={s.mw === null ? styles.puntoSinDato : styles.punto}
              onMouseMove={(e) => hover(e, s)}
            />
          ))}
        </svg>
        <Tooltip state={tooltip} />
      </div>
      <p className={styles.nota}>
        Cada escalón es un proyecto aprobado o en trámite hoy, en la fecha de su primer anuncio en el boletín, con su potencia nominal o, si no consta, la pico.
        {undeclared === 1 ? " Uno sin MW declarado cuenta como proyecto pero no sube la línea (punto hueco)." : undeclared > 1 ? ` ${formatInt(undeclared)} sin MW declarado cuentan como proyecto pero no suben la línea (punto hueco).` : ""}
        {lines === 1 ? " Una línea de evacuación cuenta como proyecto sin potencia, ya contada en las plantas que evacúa." : lines > 1 ? ` ${formatInt(lines)} líneas de evacuación cuentan como proyecto sin potencia, ya contada en las plantas que evacúan.` : ""}
      </p>
      <details className={styles.datos}>
        <summary>Ver los datos</summary>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th scope="col">Primer anuncio</th>
              <th scope="col">Proyecto</th>
              <th scope="col" className={styles.num}>MW</th>
              <th scope="col" className={styles.num}>Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.projectId}>
                <td className="dato">{s.date}</td>
                <th scope="row">
                  <Link href={`/proyecto/${s.projectId}`}>{s.name}</Link>
                </th>
                <td className={`dato ${styles.num}`}>{s.line ? "línea" : s.mw === null ? NO_DATA : formatNumber(s.mw, 1)}</td>
                <td className={`dato ${styles.num}`}>{formatNumber(s.total, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
