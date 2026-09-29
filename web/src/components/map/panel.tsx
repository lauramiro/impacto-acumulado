import Link from "next/link";
import { Figure } from "@/components/figure";
import { StatusBadge } from "@/components/status-badge";
import { formatCoverage, formatHa, formatInt, formatMw } from "@/lib/format";
import { TECHNOLOGY_LABELS } from "@/lib/labels";
import { matching, mwCoverage, splitBy, sumFigures } from "@/lib/metrics";
import { STATUSES, TECHNOLOGIES, type Filters, type MapMunicipality, type Metric, type MunicipalityStats } from "@/lib/types";
import { Legend } from "./legend";
import styles from "./panel.module.css";

type Props = {
  municipality: MapMunicipality | null;
  stats: MunicipalityStats | undefined;
  metric: Metric;
  filters: Filters;
  thresholds: number[];
  anyStatus: boolean;
  anyTechnology: boolean;
  coverage: { withMw: number; total: number } | null;
  onClose: () => void;
};

export function Panel({ municipality, stats, metric, filters, thresholds, anyStatus, anyTechnology, coverage, onClose }: Props) {
  const shown = stats ? matching(stats.cells, filters) : [];
  const figuresByStatus = splitBy(shown, "status");
  const total = sumFigures(shown);
  const muniCoverage = metric === "mw" ? mwCoverage(stats?.cells, filters) : null;
  return (
    <aside className={styles.panel} aria-label={municipality === null ? "Leyenda del mapa" : "Municipio seleccionado"}>
      {municipality === null ? (
        <>
          <h2 className={styles.titulo}>Cómo leer el mapa</h2>
          <p className={styles.texto}>
            Cada municipio se colorea por la suma de los proyectos evaluados en los boletines con los estados
            seleccionados. Pulsa un municipio para ver sus totales, o usa el índice de abajo.
          </p>
          <Legend metric={metric} thresholds={thresholds} anyStatus={anyStatus} anyTechnology={anyTechnology} coverage={coverage} />
        </>
      ) : (
        <div aria-live="polite">
          <p className={`dato ${styles.eyebrow}`}>
            {municipality.province} · INE {municipality.ine}
          </p>
          {filters.technologies.size < TECHNOLOGIES.length && filters.technologies.size > 0 ? (
            <p className={styles.texto}>
              Filtrado por tecnología: {TECHNOLOGIES.filter((t) => filters.technologies.has(t)).map((t) => TECHNOLOGY_LABELS[t]).join(", ")}
            </p>
          ) : null}
          <h2 className={`display ${styles.nombre}`}>{municipality.name}</h2>
          {total.projectCount === 0 ? (
            <p className={styles.texto}>Ningún proyecto registrado en los boletines desde 2019.</p>
          ) : (
            <dl className={styles.totales}>
              {STATUSES.filter((s) => (figuresByStatus.get(s)?.projectCount ?? 0) > 0).map((s) => {
                const f = figuresByStatus.get(s)!;
                return (
                  <div key={s} className={styles.fila}>
                    <dt>
                      <StatusBadge status={s} />
                    </dt>
                    <dd>
                      <Figure value={formatInt(f.projectCount)} unit={f.projectCount === 1 ? "proyecto" : "proyectos"} /> ·{" "}
                      <Figure value={formatMw(f.mwNominal)} /> · <Figure value={formatHa(f.hectares)} />
                    </dd>
                  </div>
                );
              })}
              <div className={`${styles.fila} ${styles.total}`}>
                <dt>Total</dt>
                <dd>
                  <Figure value={formatInt(total.projectCount)} unit="proyectos" /> · <Figure value={formatMw(total.mwNominal)} /> ·{" "}
                  <Figure value={formatHa(total.hectares)} />
                </dd>
              </div>
            </dl>
          )}
          {metric === "mw" && muniCoverage && muniCoverage.total > 0 ? (
            <p className={`dato ${styles.texto}`}>{formatCoverage(muniCoverage.withMw, muniCoverage.total)}</p>
          ) : null}
          <p className={styles.acciones}>
            <Link href={`/municipio/${municipality.ine}`}>Ver municipio</Link>
            <button type="button" onClick={onClose} className={styles.cerrar}>
              Cerrar
            </button>
          </p>
        </div>
      )}
    </aside>
  );
}
