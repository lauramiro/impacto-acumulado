import { METRIC_UNITS } from "@/lib/labels";
import { formatNumber } from "@/lib/format";
import type { Metric } from "@/lib/types";
import styles from "./legend.module.css";

const CLASS_VARS = ["--regla", "--escala-1", "--escala-2", "--escala-3", "--escala-4", "--escala-5"];

export function Legend({ metric, thresholds, anyStatus }: { metric: Metric; thresholds: number[]; anyStatus: boolean }) {
  if (!anyStatus) return <p className={styles.nota}>Ningún estado seleccionado.</p>;
  const decimals = metric === "proyectos" ? 0 : 1;
  const unit = METRIC_UNITS[metric];
  const labels: string[] = ["Sin proyectos"];
  for (let i = 0; i <= thresholds.length; i++) {
    const lo = i === 0 ? null : thresholds[i - 1];
    const hi = i < thresholds.length ? thresholds[i] : null;
    if (hi === null && lo === null) labels.push("Con proyectos");
    else if (hi === null) labels.push(`Más de ${formatNumber(lo!, decimals)} ${unit}`);
    else if (lo === null) labels.push(`Hasta ${formatNumber(hi, decimals)} ${unit}`);
    else labels.push(`${formatNumber(lo, decimals)} a ${formatNumber(hi, decimals)} ${unit}`);
  }
  return (
    <ol className={styles.legend} aria-label="Leyenda">
      {labels.map((label, i) => (
        <li key={i} className={styles.item}>
          <span className={styles.swatch} style={{ background: `var(${CLASS_VARS[i]})` }} aria-hidden="true" />
          <span className="dato">{label}</span>
        </li>
      ))}
    </ol>
  );
}
