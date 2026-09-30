"use client";

import { absenceMark, formatCoverageCell, formatInt, NO_DATA, NO_PROJECTS } from "@/lib/format";
import { formatMetric, NO_FIGURE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { metricCoverage, metricValue } from "@/lib/metrics";
import { PROVINCES, REGION, STATUSES, type Filters, type Metric, type Province, type ProvinceStats, type StatsCell, type Status } from "@/lib/types";
import styles from "./province-table.module.css";

type Props = {
  stats: ProvinceStats;
  metric: Metric;
  filters: Filters;
  selected: Province | null;
  onSelect: (p: Province | null) => void;
  /** Rows in the municipality index, already limited to `selected`. */
  indexCount: number;
};

/** "–" read out as words: a screen reader may skip the dash or call it a punctuation mark. */
function Mark({ mark }: { mark: string }) {
  return mark === NO_PROJECTS ? (
    <>
      <span aria-hidden="true">{NO_PROJECTS}</span>
      <span className="visually-hidden">ningún proyecto</span>
    </>
  ) : (
    mark
  );
}

export function ProvinceTable({ stats, metric, filters, selected, onSelect, indexCount }: Props) {
  const region = stats[REGION];
  const only = (s: Status): Filters => ({ ...filters, statuses: new Set([s]) });
  const checked = STATUSES.filter((s) => filters.statuses.has(s));
  // A status column whose Andalucía total is zero is empty in every province;
  // it is left out and named in a note instead.
  const statuses = checked.filter((s) => metricValue(region, metric, only(s)) > 0);
  const omitted = checked
    .filter((s) => !statuses.includes(s))
    .map((s) => {
      const projects = metricValue(region, "proyectos", only(s));
      const why = projects === 0 || metric === "proyectos" ? "ningún proyecto" : `${formatMetric(projects, "proyectos")}, ${NO_FIGURE_LABELS[metric]}`;
      return `${STATUS_LABELS[s]} (${why})`;
    });
  const value = (cells: StatsCell[], f: Filters) => {
    const c = metricCoverage(cells, metric, f);
    const mark = absenceMark(c.declared, c.total);
    return mark ? <Mark mark={mark} /> : formatMetric(metricValue(cells, metric, f), metric);
  };
  const coverage = (cells: StatsCell[]) => {
    const c = metricCoverage(cells, metric, filters);
    return c.total === 0 ? <Mark mark={NO_PROJECTS} /> : formatCoverageCell(c.declared, c.total);
  };
  const coverageHeader = metric === "mw" ? "Con MW declarado" : metric === "ha" ? "Con superficie declarada" : null;
  return (
    <section aria-labelledby="provincias" className={styles.section}>
      <h2 id="provincias">Por provincia</h2>
      {checked.length === 0 ? (
        <p>Ningún estado seleccionado.</p>
      ) : filters.technologies.size === 0 ? (
        <p>Ninguna tecnología seleccionada.</p>
      ) : (
        <>
          <p className={styles.nota}>Elige una provincia para marcarla en el mapa y limitar a ella la evolución mensual y el índice de municipios.</p>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Provincia</th>
                  {statuses.map((s) => (
                    <th key={s} scope="col" className={styles.num}>
                      {STATUS_LABELS[s]}
                    </th>
                  ))}
                  <th scope="col" className={styles.num}>Total</th>
                  {coverageHeader ? <th scope="col" className={styles.num}>{coverageHeader}</th> : null}
                </tr>
              </thead>
              <tbody>
                {PROVINCES.map((p) => (
                  <tr key={p} className={selected === p ? styles.seleccionada : undefined}>
                    <th scope="row">
                      <button type="button" aria-pressed={selected === p} className={styles.provincia} onClick={() => onSelect(selected === p ? null : p)}>
                        {p}
                      </button>
                    </th>
                    {statuses.map((s) => (
                      <td key={s} className={`dato ${styles.num}`}>
                        {value(stats[p], only(s))}
                      </td>
                    ))}
                    <td className={`dato ${styles.num}`}>{value(stats[p], filters)}</td>
                    {coverageHeader ? <td className={`dato ${styles.num}`}>{coverage(stats[p])}</td> : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{REGION}</th>
                  {statuses.map((s) => (
                    <td key={s} className={`dato ${styles.num}`}>
                      {value(region, only(s))}
                    </td>
                  ))}
                  <td className={`dato ${styles.num}`}>{value(region, filters)}</td>
                  {coverageHeader ? <td className={`dato ${styles.num}`}>{coverage(region)}</td> : null}
                </tr>
              </tfoot>
            </table>
          </div>
          {/* On a phone the map, the timeline and the index are all off-screen when a
              province is picked; this line says what the tap did. */}
          <p role="status" className={styles.marcada}>
            {selected ? (
              <>
                <strong>{selected}</strong> marcada en el mapa ·{" "}
                <a href="#indice">
                  {formatInt(indexCount)} {indexCount === 1 ? "municipio" : "municipios"} en el índice
                </a>{" "}
                · <a href="#mapa">Ver el mapa</a>
              </>
            ) : null}
          </p>
          <p className={styles.nota}>
            Un proyecto en varias provincias cuenta en cada una; en el total de Andalucía cuenta una vez, también si no tiene municipio
            identificado. «{NO_PROJECTS}»: ningún proyecto.
            {metric !== "proyectos" ? ` «${NO_DATA}»: hay proyectos, pero ninguno declara ${metric === "mw" ? "MW" : "superficie"}.` : null}
            {omitted.length > 0 ? ` Estados sin columna por estar vacíos en toda Andalucía: ${omitted.join("; ")}.` : null}
          </p>
        </>
      )}
    </section>
  );
}
