import type { Meta } from "@/lib/data/meta";
import { formatInt, formatLongDate } from "@/lib/format";
import styles from "./dateline.module.css";

export function Dateline({ meta }: { meta: Meta }) {
  const parts = [
    "Andalucía",
    `Datos a ${formatLongDate(meta.generatedAt)}`,
    `${formatInt(meta.counts.projects)} proyectos`,
    `${formatInt(meta.counts.raw_documents)} resoluciones`,
  ];
  return (
    <p className={`dato ${styles.dateline}`} data-testid="dateline">
      {parts.join(" · ")}
    </p>
  );
}
