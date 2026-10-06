import { formatDate, formatInt } from "@/lib/format";
import { CONDITION_LABELS, ROLE_LABELS } from "@/lib/labels";
import type { DocumentDetails } from "@/lib/data/project-details";
import type { GazetteDocument } from "@/lib/types";
import styles from "./conditions.module.css";

type Props = { details: DocumentDetails[]; documents: GazetteDocument[] };

export function docLabel(d: GazetteDocument | undefined): string {
  if (!d) return "documento";
  return `${d.role ? ROLE_LABELS[d.role] : "Documento"}, ${formatDate(d.publishedAt)}`;
}

/** The conditions the project's decisions set, by category, each tagged with its document. */
export function Conditions({ details, documents }: Props) {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const all = details.flatMap((d) => d.conditions.map((c) => ({ ...c, doc: byId.get(d.documentId) })));
  if (all.length === 0) return null;
  const categories = (Object.keys(CONDITION_LABELS) as (keyof typeof CONDITION_LABELS)[]).filter((k) => all.some((c) => c.category === k));
  return (
    <section aria-labelledby="condiciones" className={styles.section}>
      <h2 id="condiciones">Condiciones ({formatInt(all.length)})</h2>
      <p className="pie">
        Resumen automático de las condiciones que fijan los documentos, para localizarlas: el texto que vale es el del boletín,
        enlazado en cada documento más abajo. Puede faltar alguna.
      </p>
      {categories.map((k) => (
        <section key={k} aria-labelledby={`condiciones-${k}`}>
          <h3 id={`condiciones-${k}`}>{CONDITION_LABELS[k]}</h3>
          <ul className={styles.lista}>
            {all
              .filter((c) => c.category === k)
              .map((c, i) => (
                <li key={i}>
                  {c.text} <span className={`pie ${styles.fuente}`}>({c.doc ? <a href={`#documento-${c.doc.id}`}>{docLabel(c.doc)}</a> : "documento"})</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

/** Species and protected areas the documents name. */
export function Mentions({ species, areas }: { species: string[]; areas: string[] }) {
  if (species.length === 0 && areas.length === 0) return null;
  return (
    <section aria-labelledby="menciones" className={styles.section}>
      <h2 id="menciones">Especies y espacios citados</h2>
      <p className="pie">Los que nombran los documentos, leídos automáticamente. Citar no quiere decir que el proyecto los afecte.</p>
      {species.length > 0 ? (
        <>
          <h3>Especies ({formatInt(species.length)})</h3>
          <ul className={styles.columnas}>
            {species.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      ) : null}
      {areas.length > 0 ? (
        <>
          <h3>Espacios y planes citados ({formatInt(areas.length)})</h3>
          <ul className={styles.columnas}>
            {areas.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
