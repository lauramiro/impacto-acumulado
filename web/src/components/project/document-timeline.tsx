import { StatusBadge } from "@/components/status-badge";
import { authority, isCorrection } from "@/lib/document-label";
import { formatDate, formatInt, formatScore } from "@/lib/format";
import { ROLE_LABELS, VERDICT_LABELS } from "@/lib/labels";
import type { GazetteDocument } from "@/lib/types";
import styles from "./document-timeline.module.css";

const GAZETTE = { boe: "Ver en el BOE", boja: "Ver en el BOJA" } as const;
const GAZETTE_NAME = { boe: "BOE", boja: "BOJA" } as const;

/**
 * Per corrected document, the latest correction notice that names it. Its verdict
 * is superseded only when that correction states one: a correction that fixes a
 * typo (verdict "no_aplica") leaves the original decision standing.
 */
export function correctionsByTarget(documents: GazetteDocument[]): Map<number, { by: GazetteDocument; supersedesVerdict: boolean }> {
  const out = new Map<number, { by: GazetteDocument; supersedesVerdict: boolean }>();
  for (const d of documents) {
    if (d.correctsDocumentId === null) continue;
    const seen = out.get(d.correctsDocumentId);
    if (seen && (seen.by.publishedAt > d.publishedAt || (seen.by.publishedAt === d.publishedAt && seen.by.id > d.id))) continue;
    out.set(d.correctsDocumentId, { by: d, supersedesVerdict: d.verdict !== null && d.verdict !== "no_aplica" });
  }
  return out;
}

export function DocumentTimeline({ documents, statusDocumentId }: { documents: GazetteDocument[]; statusDocumentId: number | null }) {
  const corrected = correctionsByTarget(documents);
  const byId = new Map(documents.map((d) => [d.id, d]));
  return (
    <section aria-labelledby="documentos" className={styles.section}>
      <h2 id="documentos">Documentos ({formatInt(documents.length)})</h2>
      <ol className={styles.list}>
        {documents.map((d) => {
          const correction = corrected.get(d.id);
          const corrects = d.correctsDocumentId !== null ? byId.get(d.correctsDocumentId) : undefined;
          const superseded = correction?.supersedesVerdict === true;
          return (
          <li key={d.id} id={`documento-${d.id}`} className={styles.item}>
            <p className={styles.tipo}>
              {isCorrection(d.title) ? "Corrección de errores" : d.role ? ROLE_LABELS[d.role] : "Documento"}
              {d.verdict ? (
                <>
                  {" · "}
                  {d.verdict === "no_aplica" ? (
                    VERDICT_LABELS[d.verdict]
                  ) : superseded ? (
                    <>
                      <span className={styles.sustituido} data-testid="veredicto-sustituido">
                        <StatusBadge status={d.verdict} />
                      </span>{" "}
                      <span className={`pie ${styles.marca}`}>(veredicto sustituido)</span>
                    </>
                  ) : (
                    <StatusBadge status={d.verdict} />
                  )}
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
                  {corrects ? (
                    <>
                      Corrige <a href={`#documento-${corrects.id}`}>el documento del {formatDate(corrects.publishedAt)}</a>
                    </>
                  ) : (
                    "Corrige un documento anterior"
                  )}
                </span>
              ) : null}
              {correction ? (
                <span className={`pie ${styles.marca}`} data-testid="corregido-por">
                  Corregido por <a href={`#documento-${correction.by.id}`}>el documento del {formatDate(correction.by.publishedAt)}</a>
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
          );
        })}
      </ol>
    </section>
  );
}
