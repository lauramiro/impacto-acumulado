import { Figure } from "@/components/figure";
import { STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { absenceMark, formatCoverage, formatHa, formatInt, formatMwDeclared, formatNumber } from "@/lib/format";
import { splitBy, sumFigures } from "@/lib/metrics";
import { STATUSES, TECHNOLOGIES, type Figures, type MunicipalityStats } from "@/lib/types";
import styles from "./totals.module.css";

/** A coverage note read inside a sentence: "superficie declarada en 2 de 11 proyectos". */
const midSentence = (note: string) => note.charAt(0).toLowerCase() + note.slice(1);

/** A table cell's MW or hectares, or "sin dato" when none of the projects declares the figure. */
const mwCell = (f: Figures) => absenceMark(f.mwCount, f.projectCount) ?? formatNumber(f.mwBest, 1);
const haCell = (f: Figures) => absenceMark(f.haCount, f.projectCount) ?? formatNumber(f.hectares, 1);

/** `areaHa`: the municipality's area, for the share of it the declared hectares cover. */
export function Totals({ stats, areaHa }: { stats: MunicipalityStats; areaHa: number }) {
  const figuresByStatus = splitBy(stats.cells, "status");
  const byTech = splitBy(stats.cells, "technology");
  const total = sumFigures(stats.cells);
  const rows = STATUSES.filter((s) => (figuresByStatus.get(s)?.projectCount ?? 0) > 0);
  const techs = TECHNOLOGIES.filter((t) => t !== "linea_evacuacion" && (byTech.get(t)?.projectCount ?? 0) > 0);
  const lines = byTech.get("linea_evacuacion");
  return (
    <section aria-labelledby="totales" className={styles.section}>
      <h2 id="totales">Totales</h2>
      {/* The column headers carry the units, so the cells give bare figures: with
          the unit each figure broke over two lines on a phone. */}
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
                  <Figure value={mwCell(f)} />
                </td>
                <td className={styles.num}>
                  <Figure value={haCell(f)} />
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
              <Figure value={mwCell(total)} />
            </td>
            <td className={styles.num}>
              <Figure value={haCell(total)} />
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
              {TECHNOLOGY_LABELS[t]} <Figure value={`${formatInt(f.projectCount)} · ${formatMwDeclared(f.mwBest, f.mwCount, f.projectCount)}`} />
            </span>
          );
        })}
      </p>
      <p className={`dato ${styles.cobertura}`}>{formatCoverage(total.mwCount, total.projectCount, "mw", total.mwPeakCount)}</p>
      <p className={`dato ${styles.cobertura}`}>{formatCoverage(total.haCount, total.projectCount, "ha")}</p>
      {total.haCount > 0 && areaHa > 0 ? (
        <p className={styles.tech} data-testid="cuota-termino">
          Superficie declarada: <Figure value={formatHa(total.hectares)} />, el{" "}
          <Figure value={`${formatNumber((total.hectares / areaHa) * 100, 1)} %`} /> del término municipal (
          {midSentence(formatCoverage(total.haCount, total.projectCount, "ha"))}). Un proyecto en varios municipios cuenta aquí su superficie entera,
          así que la cuota puede exagerar.
        </p>
      ) : null}
      {lines ? (
        <p className={styles.tech}>
          Línea de evacuación: <Figure value={formatInt(lines.projectCount)} unit={lines.projectCount === 1 ? "proyecto" : "proyectos"} />,
          potencia no sumada (ya contada en las plantas que evacúa).
        </p>
      ) : null}
    </section>
  );
}
