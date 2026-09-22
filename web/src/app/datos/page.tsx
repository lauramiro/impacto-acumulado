import { stat } from "node:fs/promises";
import type { Metadata } from "next";
import Link from "next/link";
import { Figure } from "@/components/figure";
import { CATALOG } from "@/lib/data/catalog";
import { loadMeta } from "@/lib/data/meta";
import { dataFile } from "@/lib/data/paths";
import { formatBytes, formatInt, formatLongDate } from "@/lib/format";
import { STATUS_LABELS, TECHNOLOGY_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import { STATUSES, TECHNOLOGIES, VERDICTS } from "@/lib/types";
import styles from "./page.module.css";

// Reused for the "Valores de las listas" glossary below: every enumeration a
// catalogued column can hold, its Spanish labels, and a heading. Listed once
// here rather than spelled out again in catalog.ts's column descriptions.
const ENUMERATIONS = [
  { slug: "status", title: "Estados (status)", values: STATUSES, labels: STATUS_LABELS },
  { slug: "technology", title: "Tecnologías (technology)", values: TECHNOLOGIES, labels: TECHNOLOGY_LABELS },
  { slug: "verdict", title: "Resultado de la resolución (verdict)", values: VERDICTS, labels: VERDICT_LABELS },
] as const;

export const metadata: Metadata = {
  title: "Datos · Impacto Acumulado",
  description: "Descarga del conjunto de datos de resoluciones ambientales de proyectos renovables en Andalucía, con licencia CC BY 4.0.",
};

export default async function DataPage() {
  const meta = await loadMeta();
  // meta.json cannot list itself in meta.files (it is the file that lists every
  // OTHER export), so its own row and byte figures come from the filesystem: a
  // single manifest object, and its size on disk.
  const metaJsonBytes = (await stat(dataFile("meta.json"))).size;
  const year = meta.generatedAt.getUTCFullYear();
  return (
    <article className={styles.page}>
      <h1>Datos</h1>
      <p>
        Todo lo que muestra el sitio sale de estos archivos, que el pipeline regenera cada semana. Se publican con licencia{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/deed.es" rel="license noopener">
          CC BY 4.0
        </a>
        : puedes reutilizarlos citando la fuente. Los textos de origen son del BOE y el BOJA; la extracción es automática y tiene errores, medidos en{" "}
        <Link href="/metodologia">Metodología</Link>.
      </p>
      <h2>Cómo citar</h2>
      <p className={`dato ${styles.cita}`} data-testid="cita">
        Impacto Acumulado ({year}). Resoluciones ambientales de proyectos renovables en Andalucía, 2019 a {year}. Datos a{" "}
        {formatLongDate(meta.generatedAt)}. {SITE_URL}/datos
      </p>
      <h2>Archivos</h2>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th scope="col">Archivo</th>
            <th scope="col">Contenido</th>
            <th scope="col" className={styles.num}>Filas</th>
            <th scope="col" className={styles.num}>Tamaño</th>
          </tr>
        </thead>
        <tbody>
          {CATALOG.map((entry) => {
            const info = entry.file === "meta.json" ? { rows: 1, bytes: metaJsonBytes } : meta.files[entry.file];
            if (!info) throw new Error(`datos: ${entry.file} is in the catalogue but not in meta.files`);
            return (
              <tr key={entry.file}>
                <th scope="row" className="dato">
                  <a href={`/data/${entry.file}`} download>
                    {entry.file}
                  </a>
                </th>
                <td>{entry.description}</td>
                <td className={styles.num}>
                  <Figure value={formatInt(info.rows)} />
                </td>
                <td className={styles.num}>
                  <Figure value={formatBytes(info.bytes)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Columnas</h2>
      {CATALOG.filter((e) => e.columns).map((entry) => (
        <section key={entry.file} aria-labelledby={`col-${entry.file}`} className={styles.columnas}>
          <h3 id={`col-${entry.file}`} className="dato">
            {entry.file}
          </h3>
          <dl className={styles.definiciones}>
            {entry.columns!.map((c) => (
              <div key={c.name}>
                <dt className="dato">
                  {c.name} <span className="pie">({c.type})</span>
                </dt>
                <dd>{c.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <h2>Valores de las listas</h2>
      {ENUMERATIONS.map(({ slug, title, values, labels }) => (
        <section key={slug} aria-labelledby={`enum-${slug}`} className={styles.columnas}>
          <h3 id={`enum-${slug}`}>{title}</h3>
          <dl className={styles.definiciones}>
            {values.map((v) => (
              <div key={v}>
                <dt className="dato">{v}</dt>
                <dd>{(labels as Record<string, string>)[v]}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </article>
  );
}
