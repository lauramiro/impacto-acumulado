import Link from "next/link";
import type { Consultation } from "@/lib/consultations";
import { formatDate, formatLongDate } from "@/lib/format";
import styles from "./open-consultations.module.css";

const GAZETTE = { boe: "BOE", boja: "BOJA" } as const;

/**
 * Información pública notices whose objection period is open at build time,
 * nearest deadline first. `names` maps INE codes to municipality names; leave
 * it out on a municipality's own page.
 */
export function OpenConsultations({
  items,
  today,
  names,
  headingLevel = 2,
}: {
  items: readonly Consultation[];
  today: Date;
  names?: ReadonlyMap<string, string>;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby="informacion-publica-titulo" id="informacion-publica" className={styles.section}>
      <Heading id="informacion-publica-titulo">En información pública</Heading>
      {items.length === 0 ? (
        <p>Ningún anuncio con plazo de alegaciones abierto a {formatLongDate(today)}.</p>
      ) : (
        <>
          <p className={styles.nota}>
            Plazos abiertos a {formatLongDate(today)}. La fecha límite cuenta festivos nacionales y andaluces, no los locales: confírmala en
            el anuncio.
          </p>
          <ol className={styles.lista}>
            {items.map((c) => (
              <li key={c.documentId} className={styles.item}>
                <p className={`dato ${styles.plazo}`}>
                  {c.deadline ? `Hasta el ${formatDate(c.deadline)}` : "El anuncio no indica plazo"}
                </p>
                <p className={styles.proyecto}>
                  <Link href={`/proyecto/${c.projectId}`}>{c.projectName}</Link>
                  {names && c.ineCodes.length > 0 ? ` · ${c.ineCodes.map((ine) => names.get(ine) ?? ine).join(", ")}` : null}
                </p>
                <p className="pie">
                  {c.period ? `«${c.period.evidence}» desde el ${formatDate(c.publishedAt)}` : `Publicado el ${formatDate(c.publishedAt)}`} ·{" "}
                  <a href={c.url} rel="noopener">
                    Anuncio en el {GAZETTE[c.source]}
                  </a>
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
