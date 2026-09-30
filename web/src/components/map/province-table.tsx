"use client";

import { formatCoverageCell, formatNumber } from "@/lib/format";
import { METRIC_UNITS, STATUS_LABELS } from "@/lib/labels";
import { metricValue, mwCoverage } from "@/lib/metrics";
import { PROVINCES, REGION, STATUSES, type Filters, type Metric, type Province, type ProvinceStats, type StatsCell } from "@/lib/types";
import styles from "./province-table.module.css";

type Props = {
  stats: ProvinceStats;
  metric: Metric;
  filters: Filters;
  selected: Province | null;
  onSelect: (p: Province | null) => void;
};

export function ProvinceTable({ stats, metric, filters, selected, onSelect }: Props) {
  const statuses = STATUSES.filter((s) => filters.statuses.has(s));
  const decimals = metric === "proyectos" ? 0 : 1;
  const value = (cells: StatsCell[], f: Filters) => `${formatNumber(metricValue(cells, metric, f), decimals)} ${METRIC_UNITS[metric]}`;
  const coverage = (cells: StatsCell[]) => {
    const c = mwCoverage(cells, filters);
    return formatCoverageCell(c.withMw, c.total);
  };
  const region = stats[REGION];
  return (
    <section aria-labelledby="provincias" className={styles.section}>
      <h2 id="provincias">Por provincia</h2>
      {statuses.length === 0 ? (
        <p>Ningún estado seleccionado.</p>
      ) : filters.technologies.size === 0 ? (
        <p>Ninguna tecnología seleccionada.</p>
      ) : (
        <>
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
                  {metric === "mw" ? <th scope="col" className={styles.num}>Con MW declarado</th> : null}
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
                        {value(stats[p], { ...filters, statuses: new Set([s]) })}
                      </td>
                    ))}
                    <td className={`dato ${styles.num}`}>{value(stats[p], filters)}</td>
                    {metric === "mw" ? <td className={`dato ${styles.num}`}>{coverage(stats[p])}</td> : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{REGION}</th>
                  {statuses.map((s) => (
                    <td key={s} className={`dato ${styles.num}`}>
                      {value(region, { ...filters, statuses: new Set([s]) })}
                    </td>
                  ))}
                  <td className={`dato ${styles.num}`}>{value(region, filters)}</td>
                  {metric === "mw" ? <td className={`dato ${styles.num}`}>{coverage(region)}</td> : null}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={styles.nota}>
            Un proyecto en varias provincias cuenta en cada una; en el total de Andalucía cuenta una vez, también si no tiene municipio
            identificado.
          </p>
        </>
      )}
    </section>
  );
}
