import { STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { formatHa, formatInt, formatMw } from "@/lib/format";
import { STATUSES, TECHNOLOGIES, type MunicipalityStats } from "@/lib/types";
import styles from "./totals.module.css";

export function Totals({ stats }: { stats: MunicipalityStats }) {
  const rows = STATUSES.filter((s) => (stats.byStatus[s]?.projectCount ?? 0) > 0);
  const techs = TECHNOLOGIES.filter((t) => (stats.byTechnology[t]?.projectCount ?? 0) > 0);
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
            const f = stats.byStatus[s]!;
            return (
              <tr key={s}>
                <th scope="row">{STATUS_LABELS[s]}</th>
                <td className={`dato ${styles.num}`}>{formatInt(f.projectCount)}</td>
                <td className={`dato ${styles.num}`}>{formatMw(f.mwNominal)}</td>
                <td className={`dato ${styles.num}`}>{formatHa(f.hectares)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className={`dato ${styles.num}`}>{formatInt(stats.countTotal)}</td>
            <td className={`dato ${styles.num}`}>{formatMw(stats.mwTotal)}</td>
            <td className={`dato ${styles.num}`}>{formatHa(stats.haTotal)}</td>
          </tr>
        </tfoot>
      </table>
      <p className={styles.tech}>
        Por tecnología:{" "}
        {techs.map((t, i) => {
          const f = stats.byTechnology[t]!;
          return (
            <span key={t}>
              {i > 0 ? " · " : ""}
              {TECHNOLOGY_LABELS[t]} <span className="dato">{formatInt(f.projectCount)} · {formatMw(f.mwNominal)}</span>
            </span>
          );
        })}
      </p>
    </section>
  );
}
