import { formatDate, formatInt, formatScore } from "@/lib/format";
import { ROLE_LABELS, VERDICT_LABELS } from "@/lib/labels";
import type { GazetteDocument } from "@/lib/types";
import styles from "./document-timeline.module.css";

const GAZETTE = { boe: "Ver en el BOE", boja: "Ver en el BOJA" } as const;

export function DocumentTimeline({ documents, statusDocumentId }: { documents: GazetteDocument[]; statusDocumentId: number | null }) {
  return (
    <section aria-labelledby="documentos" className={styles.section}>
      <h2 id="documentos">Documentos ({formatInt(documents.length)})</h2>
      <ol className={styles.list}>
        {documents.map((d) => (
          <li key={d.id} className={styles.item}>
            <p className={`dato ${styles.fecha}`}>
              {formatDate(d.publishedAt)} · {d.sourceId}
            </p>
            <p className={styles.tipo}>
              {d.role ? ROLE_LABELS[d.role] : "Documento"}
              {d.verdict ? ` · ${VERDICT_LABELS[d.verdict]}` : ""}
            </p>
            <blockquote className={styles.titulo}>{d.title}</blockquote>
            <p className={styles.acciones}>
              <a href={d.url} rel="noopener">{GAZETTE[d.source]}</a>
              {d.id === statusDocumentId ? (
                <span className={`pie ${styles.marca}`} data-testid="fija-estado">
                  Fija el estado
                </span>
              ) : null}
              {d.matchScore !== null && d.matchScore < 1 ? (
                <span className={`pie ${styles.marca}`} data-testid="agrupado">
                  Agrupado con confianza {formatScore(d.matchScore)}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
