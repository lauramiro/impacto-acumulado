import Link from "next/link";
import { Figure } from "@/components/figure";
import { StatusBadge } from "@/components/status-badge";
import { formatHa, formatInt, formatMw } from "@/lib/format";
import { STATUSES, type Metric, type Municipality, type MunicipalityStats } from "@/lib/types";
import { Legend } from "./legend";
import styles from "./panel.module.css";

type Props = {
  municipality: Municipality | null;
  stats: MunicipalityStats | undefined;
  metric: Metric;
  thresholds: number[];
  anyStatus: boolean;
  onClose: () => void;
};

export function Panel({ municipality, stats, metric, thresholds, anyStatus, onClose }: Props) {
  return (
    <aside className={styles.panel} aria-live="polite" aria-label="Municipio seleccionado">
      {municipality === null ? (
        <>
          <h2 className={styles.titulo}>Cómo leer el mapa</h2>
          <p className={styles.texto}>
            Cada municipio se colorea por la suma de los proyectos evaluados en los boletines con los estados
            seleccionados. Pulsa un municipio para ver sus totales, o usa el índice de abajo.
          </p>
          <Legend metric={metric} thresholds={thresholds} anyStatus={anyStatus} />
        </>
      ) : (
        <>
          <p className={`dato ${styles.eyebrow}`}>
            {municipality.province} · INE {municipality.ine}
          </p>
          <h2 className={`display ${styles.nombre}`}>{municipality.name}</h2>
          {stats ? (
            <dl className={styles.totales}>
              {STATUSES.filter((s) => (stats.byStatus[s]?.projectCount ?? 0) > 0).map((s) => {
                const f = stats.byStatus[s]!;
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
                  <Figure value={formatInt(stats.countTotal)} unit="proyectos" /> · <Figure value={formatMw(stats.mwTotal)} /> ·{" "}
                  <Figure value={formatHa(stats.haTotal)} />
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.texto}>Ningún proyecto registrado en los boletines desde 2019.</p>
          )}
          <p className={styles.acciones}>
            <Link href={`/municipio/${municipality.ine}`}>Ver municipio</Link>
            <button type="button" onClick={onClose} className={styles.cerrar}>
              Cerrar
            </button>
          </p>
        </>
      )}
    </aside>
  );
}
