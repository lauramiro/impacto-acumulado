import { Figure } from "@/components/figure";
import { STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { formatCoverage, formatHa, formatInt, formatMw } from "@/lib/format";
import { splitBy, sumFigures } from "@/lib/metrics";
import { STATUSES, TECHNOLOGIES, type MunicipalityStats } from "@/lib/types";
import styles from "./totals.module.css";

export function Totals({ stats }: { stats: MunicipalityStats }) {
  const figuresByStatus = splitBy(stats.cells, "status");
  const byTech = splitBy(stats.cells, "technology");
  const total = sumFigures(stats.cells);
  const rows = STATUSES.filter((s) => (figuresByStatus.get(s)?.projectCount ?? 0) > 0);
  const techs = TECHNOLOGIES.filter((t) => t !== "linea_evacuacion" && (byTech.get(t)?.projectCount ?? 0) > 0);
  const lines = byTech.get("linea_evacuacion");
  return (
    <section aria-labelledby="totales" className={styles.section}>
      <h2 id="totales">Totales</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Estado</th>
            <th scope="col" className={styles.num}>Proyectos</th>
            <th scope="col" className={styles.num}>MW</th>
            <th scope="col" className={styles.num}>ha</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const f = figuresByStatus.get(s)!;
            return (
              <tr key={s}>
                <th scope="row">{STATUS_LABELS[s]}</th>
                <td className={styles.num}>
                  <Figure value={formatInt(f.projectCount)} />
                </td>
                <td className={styles.num}>
                  <Figure value={formatMw(f.mwNominal)} />
                </td>
                <td className={styles.num}>
                  <Figure value={formatHa(f.hectares)} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className={styles.num}>
              <Figure value={formatInt(total.projectCount)} />
            </td>
            <td className={styles.num}>
              <Figure value={formatMw(total.mwNominal)} />
            </td>
            <td className={styles.num}>
              <Figure value={formatHa(total.hectares)} />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className={styles.tech}>
        Por tecnología:{" "}
        {techs.map((t, i) => {
          const f = byTech.get(t)!;
          return (
            <span key={t}>
              {i > 0 ? " · " : ""}
              {TECHNOLOGY_LABELS[t]} <Figure value={`${formatInt(f.projectCount)} · ${formatMw(f.mwNominal)}`} />
            </span>
          );
        })}
      </p>
      <p className={`dato ${styles.cobertura}`}>{formatCoverage(total.mwCount, total.projectCount)}</p>
      {lines ? (
        <p className={styles.tech}>
          Línea de evacuación: <Figure value={formatInt(lines.projectCount)} unit={lines.projectCount === 1 ? "proyecto" : "proyectos"} />,
          potencia no sumada (ya contada en las plantas que evacúa).
        </p>
      ) : null}
    </section>
  );
}
