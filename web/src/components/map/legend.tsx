import type { ReactNode } from "react";
import { classLabels, NO_FIGURE_LABELS, SENSITIVITY_LABELS } from "@/lib/labels";
import { formatCoverage } from "@/lib/format";
import type { Metric, SensitivityLayer } from "@/lib/types";
import styles from "./legend.module.css";

const SCALE_VARS = ["--escala-1", "--escala-2", "--escala-3", "--escala-4", "--escala-5"];
/** Matches the #rayado-sin-dato pattern in choropleth.tsx. */
const NO_FIGURE_SWATCH = "repeating-linear-gradient(45deg, var(--escala-3) 0 1px, var(--papel) 1px 4px)";

type Props = {
  metric: Metric;
  thresholds: number[];
  anyStatus: boolean;
  anyTechnology: boolean;
  coverage: { withMw: number; total: number; peak: number } | null;
  overlays?: ReactNode;
  /** Denser two-column layout, shown under a selected municipality. */
  compact?: boolean;
};

export function Legend({ metric, thresholds, anyStatus, anyTechnology, coverage, overlays, compact = false }: Props) {
  if (!anyStatus)
    return (
      <>
        <p className={styles.nota}>Ningún estado seleccionado.</p>
        {overlays}
      </>
    );
  if (!anyTechnology)
    return (
      <>
        <p className={styles.nota}>Ninguna tecnología seleccionada.</p>
        {overlays}
      </>
    );
  const items: { label: string; fill: string }[] = [
    { label: "Sin proyectos", fill: "var(--regla)" },
    ...(metric === "proyectos" ? [] : [{ label: `Con proyectos, ${NO_FIGURE_LABELS[metric]}`, fill: NO_FIGURE_SWATCH }]),
    ...classLabels(metric, thresholds).map((label, i) => ({ label, fill: `var(${SCALE_VARS[i]})` })),
  ];
  return (
    <>
      <ol className={compact ? `${styles.legend} ${styles.compacta}` : styles.legend} aria-label="Leyenda">
        {items.map((item) => (
          <li key={item.label} className={styles.item}>
            <span className={styles.swatch} style={{ background: item.fill }} aria-hidden="true" />
            <span className={`dato ${styles.valor}`}>{item.label}</span>
          </li>
        ))}
      </ol>
      {coverage ? (
        <p className={`dato ${styles.cobertura}`} data-testid="cobertura-mapa">
          {formatCoverage(coverage.withMw, coverage.total, "mw", coverage.peak)}
        </p>
      ) : null}
      {overlays}
    </>
  );
}

type OverlayKeyProps = { natura: boolean; sensitivity: SensitivityLayer };

export function OverlayKey({ natura, sensitivity }: OverlayKeyProps) {
  if (!natura && sensitivity === "ninguna") return null;
  return (
    <ul className={styles.capas} aria-label="Capas">
      {natura ? (
        <li>
          <span className={styles.muestraNatura} aria-hidden="true" /> Red Natura 2000 (ZEC, ZEPA, LIC)
        </li>
      ) : null}
      {sensitivity !== "ninguna" ? (
        <li>
          <span className={styles.muestraSensibilidad} aria-hidden="true" /> Zonificación del Ministerio, clases alta a máxima (
          {SENSITIVITY_LABELS[sensitivity].toLowerCase()}). La ubicación de los proyectos dentro del municipio no se conoce.
        </li>
      ) : null}
    </ul>
  );
}
