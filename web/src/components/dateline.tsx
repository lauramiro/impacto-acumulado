import type { Meta } from "@/lib/data/meta";
import { formatDate, formatInt, formatLongDate } from "@/lib/format";
import styles from "./dateline.module.css";

/**
 * The export date and, beside it, the newest document: the site is rebuilt
 * every week, but a week with no new document leaves the data older than the
 * date of the build.
 */
export function Dateline({ meta }: { meta: Meta }) {
  const generated = `Datos a ${formatLongDate(meta.generatedAt)}`;
  const parts = [
    "Andalucía",
    meta.lastDocument ? `${generated} (último documento: ${formatDate(meta.lastDocument)})` : generated,
    `${formatInt(meta.counts.projects)} proyectos`,
    `${formatInt(meta.counts.raw_documents)} documentos`,
  ];
  return (
    <p className={`dato ${styles.dateline}`} data-testid="dateline">
      {parts.join(" · ")}
    </p>
  );
}
