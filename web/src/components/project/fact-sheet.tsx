import Link from "next/link";
import { Figure } from "@/components/figure";
import { formatDate, formatHa, formatInt, formatMw } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import type { GazetteDocument, Municipality, Project } from "@/lib/types";
import styles from "./fact-sheet.module.css";

const EMPTY = "—";

/** Quotes for one fact-sheet field, newest document first. */
export type FieldEvidence = Record<string, { quote: string; doc: GazetteDocument }[]>;

/** "Cita" disclosure: what the documents say for a figure, so a reader can check it. */
function Quote({ items }: { items: FieldEvidence[string] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <details className={styles.cita}>
      <summary>Cita</summary>
      <ul>
        {items.slice(0, 3).map(({ quote, doc }) => (
          <li key={doc.id}>
            «{quote}» <span className="pie">({doc.role ? ROLE_LABELS[doc.role] : "Documento"}, {formatDate(doc.publishedAt)})</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function FactSheet({
  project,
  municipalities,
  evidence = {},
  expedientes = [],
}: {
  project: Project;
  municipalities: Municipality[];
  evidence?: FieldEvidence;
  expedientes?: string[];
}) {
  const cell = (v: number | null, f: (n: number) => string, field: string) => (
    <>
      <Figure value={v === null ? EMPTY : f(v)} />
      {v === null ? null : <Quote items={evidence[field]} />}
    </>
  );
  return (
    <section aria-labelledby="ficha" className={styles.section}>
      <h2 id="ficha">Ficha</h2>
      <dl className={styles.grid}>
        <dt>{project.technology === "linea_evacuacion" ? "Potencia evacuada" : "Potencia nominal"}</dt>
        <dd>{cell(project.mwNominal, formatMw, "mw_nominal")}</dd>
        <dt>Superficie</dt>
        <dd>{cell(project.hectares, formatHa, "hectares")}</dd>
        <dt>Potencia pico</dt>
        <dd>{cell(project.mwPeak, formatMw, "mw_peak")}</dd>
        <dt>Aerogeneradores</dt>
        <dd>{cell(project.turbines, formatInt, "turbines")}</dd>
        <dt>Municipios</dt>
        <dd>
          {municipalities.length === 0 ? (
            EMPTY
          ) : (
            <ul className={styles.municipios}>
              {municipalities.map((m) => (
                <li key={m.ine}>
                  <Link href={`/municipio/${m.ine}`}>
                    {m.name} ({m.province})
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Quote items={evidence["municipalities"]} />
        </dd>
        {expedientes.length > 0 ? (
          <>
            <dt>{expedientes.length === 1 ? "Expediente" : "Expedientes"}</dt>
            <dd className="dato">{expedientes.join(" · ")}</dd>
          </>
        ) : null}
        <dt>Primera publicación</dt>
        <dd>
          <Figure value={formatDate(project.firstSeen)} />
        </dd>
        <dt>Última publicación</dt>
        <dd>
          <Figure value={formatDate(project.lastSeen)} />
        </dd>
      </dl>
    </section>
  );
}
