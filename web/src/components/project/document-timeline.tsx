import { StatusBadge } from "@/components/status-badge";
import { authority, isCorrection } from "@/lib/document-label";
import { formatDate, formatInt, formatScore } from "@/lib/format";
import { ROLE_LABELS, VERDICT_LABELS } from "@/lib/labels";
import type { GazetteDocument } from "@/lib/types";
import styles from "./document-timeline.module.css";

const GAZETTE = { boe: "Ver en el BOE", boja: "Ver en el BOJA" } as const;
const GAZETTE_NAME = { boe: "BOE", boja: "BOJA" } as const;

export function DocumentTimeline({ documents, statusDocumentId }: { documents: GazetteDocument[]; statusDocumentId: number | null }) {
  return (
    <section aria-labelledby="documentos" className={styles.section}>
      <h2 id="documentos">Documentos ({formatInt(documents.length)})</h2>
      <ol className={styles.list}>
        {documents.map((d) => (
          <li key={d.id} id={`documento-${d.id}`} className={styles.item}>
            <p className={styles.tipo}>
              {isCorrection(d.title) ? "Corrección de errores" : d.role ? ROLE_LABELS[d.role] : "Documento"}
              {d.verdict ? (
                <>
                  {" · "}
                  {d.verdict === "no_aplica" ? VERDICT_LABELS[d.verdict] : <StatusBadge status={d.verdict} />}
                </>
              ) : null}
            </p>
            <p className={styles.organo}>
              {authority(d.title) ?? GAZETTE_NAME[d.source]} · <span className="dato">{formatDate(d.publishedAt)}</span>
            </p>
            <blockquote className={styles.titulo}>{d.title}</blockquote>
            <p className={styles.acciones}>
              <a href={d.url} rel="noopener">{GAZETTE[d.source]}</a>
              <span className={`dato pie ${styles.ref}`}>{d.sourceId}</span>
              {isCorrection(d.title) ? (
                <span className={`pie ${styles.marca}`} data-testid="correccion">
                  Corrige un documento anterior
                </span>
              ) : null}
              {d.id === statusDocumentId ? (
                <span className={`pie ${styles.marca}`} data-testid="fija-estado">
                  Fija el estado
                </span>
              ) : null}
              {d.matchScore !== null && d.matchScore < 1 ? (
                <span className={`pie ${styles.marca}`} data-testid="agrupado">
                  Agrupado con confianza <span className="dato">{formatScore(d.matchScore)}</span>
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
