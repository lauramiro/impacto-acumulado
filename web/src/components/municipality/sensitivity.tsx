import { formatPercent } from "@/lib/format";
import styles from "./sensitivity.module.css";

const ALERT_THRESHOLD = 0.5;

export function Sensitivity({ share }: { share: number | null }) {
  return (
    <section aria-labelledby="sensibilidad" className={styles.section}>
      <h2 id="sensibilidad">Sensibilidad ambiental</h2>
      {share === null ? (
        <p>Sin datos de zonificación para este municipio.</p>
      ) : (
        <p>
          <span className={`dato ${share >= ALERT_THRESHOLD ? styles.alerta : ""}`}>{formatPercent(share)}</span> del
          término en clases alta o máxima de la zonificación ambiental para renovables (eólica y fotovoltaica).
        </p>
      )}
      <p className="pie">
        Calculado sobre todo el término municipal; es un filtro de atención, no una evaluación de impacto.{" "}
        <a href="/metodologia">Metodología</a>
      </p>
    </section>
  );
}
