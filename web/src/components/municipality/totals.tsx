import { Figure } from "@/components/figure";
import { STATUS_LABELS, TECHNOLOGY_LABELS } from "@/lib/labels";
import { absenceMark, formatCoverage, formatHa, formatInt, formatMwDeclared, formatNumber } from "@/lib/format";
import { splitBy, sumFigures } from "@/lib/metrics";
import { APPROVED_OR_PENDING, REFUSED_OR_LAPSED, STATUSES, TECHNOLOGIES, type Figures, type MunicipalityStats, type StatsCell } from "@/lib/types";
import styles from "./totals.module.css";

/** A coverage note read inside a sentence: "superficie declarada en 2 de 11 proyectos". */
const midSentence = (note: string) => note.charAt(0).toLowerCase() + note.slice(1);

/** A table cell's MW or hectares, or "sin dato" when none of the projects declares the figure. */
const mwCell = (f: Figures) => absenceMark(f.mwCount, f.projectCount) ?? formatNumber(f.mwBest, 1);
const haCell = (f: Figures) => absenceMark(f.haCount, f.projectCount) ?? formatNumber(f.hectares, 1);

/**
 * The cells split the way the headline splits them: approved or pending (which every total on the
 * page counts) and refused or lapsed (which have a row of their own, never added to the total).
 */
export function splitByHeadline(cells: readonly StatsCell[]): { accumulating: StatsCell[]; refused: StatsCell[] } {
  return {
    accumulating: cells.filter((c) => APPROVED_OR_PENDING.includes(c.status)),
    refused: cells.filter((c) => REFUSED_OR_LAPSED.includes(c.status)),
  };
}

/** `areaHa`: the municipality's area, for the share of it the declared hectares cover. */
export function Totals({ stats, areaHa }: { stats: MunicipalityStats; areaHa: number }) {
  const { accumulating, refused: refusedCells } = splitByHeadline(stats.cells);
  const figuresByStatus = splitBy(accumulating, "status");
  const byTech = splitBy(accumulating, "technology");
  const total = sumFigures(accumulating);
  const refused = sumFigures(refusedCells);
  const rows = STATUSES.filter((s) => APPROVED_OR_PENDING.includes(s) && (figuresByStatus.get(s)?.projectCount ?? 0) > 0);
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
        <tbody className={styles.total}>
          <tr>
            <th scope="row">Total aprobados o en trámite</th>
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
        </tbody>
        {refused.projectCount > 0 ? (
          <tbody className={styles.denegados} data-testid="fila-denegados">
            <tr>
              <th scope="row">Denegados o caducados</th>
              <td className={styles.num}>
                <Figure value={formatInt(refused.projectCount)} />
              </td>
              <td className={styles.num}>
                <Figure value={mwCell(refused)} />
              </td>
              <td className={styles.num}>
                <Figure value={haCell(refused)} />
              </td>
            </tr>
          </tbody>
        ) : null}
      </table>
      <p className={styles.base} data-testid="nota-base-municipio">
        Las cifras de esta página, salvo la fila de denegados o caducados, cuentan {formatInt(total.projectCount)}{" "}
        {total.projectCount === 1 ? "proyecto aprobado o en trámite" : "proyectos aprobados o en trámite"}, la misma base que el titular del mapa.
        {refused.projectCount > 0 ? " Los denegados o caducados no se suman al total." : null}
      </p>
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
      {total.projectCount > 0 ? (
        <>
          <p className={`dato ${styles.cobertura}`}>{formatCoverage(total.mwCount, total.projectCount, "mw", total.mwPeakCount)}</p>
          <p className={`dato ${styles.cobertura}`}>{formatCoverage(total.haCount, total.projectCount, "ha")}</p>
        </>
      ) : null}
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
