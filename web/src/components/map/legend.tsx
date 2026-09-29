import type { ReactNode } from "react";
import { METRIC_UNITS } from "@/lib/labels";
import { formatCoverage, formatNumber } from "@/lib/format";
import type { Metric } from "@/lib/types";
import styles from "./legend.module.css";

const CLASS_VARS = ["--regla", "--escala-1", "--escala-2", "--escala-3", "--escala-4", "--escala-5"];

type Props = {
  metric: Metric;
  thresholds: number[];
  anyStatus: boolean;
  anyTechnology: boolean;
  coverage: { withMw: number; total: number } | null;
  overlays?: ReactNode;
};

export function Legend({ metric, thresholds, anyStatus, anyTechnology, coverage, overlays }: Props) {
  if (!anyStatus) return <p className={styles.nota}>Ningún estado seleccionado.</p>;
  if (!anyTechnology) return <p className={styles.nota}>Ninguna tecnología seleccionada.</p>;
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
    <>
      <ol className={styles.legend} aria-label="Leyenda">
        {labels.map((label, i) => (
          <li key={i} className={styles.item}>
            <span className={styles.swatch} style={{ background: `var(${CLASS_VARS[i]})` }} aria-hidden="true" />
            <span className={`dato ${styles.valor}`}>{label}</span>
          </li>
        ))}
      </ol>
      {coverage ? (
        <p className={`dato ${styles.cobertura}`} data-testid="cobertura-mapa">
          {formatCoverage(coverage.withMw, coverage.total)}
        </p>
      ) : null}
      {overlays}
    </>
  );
}
