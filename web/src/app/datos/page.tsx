import { stat } from "node:fs/promises";
import type { Metadata } from "next";
import Link from "next/link";
import { Figure } from "@/components/figure";
import { CATALOG } from "@/lib/data/catalog";
import { loadMeta } from "@/lib/data/meta";
import { dataFile } from "@/lib/data/paths";
import { formatBytes, formatInt, formatLongDate } from "@/lib/format";
import { EVENT_LABELS, ROLE_LABELS, STATUS_LABELS, TECHNOLOGY_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import { DOCUMENT_ROLES, EVENTS, STATUSES, TECHNOLOGIES, VERDICTS } from "@/lib/types";
import styles from "./page.module.css";

// Reused for the "Valores de las listas" glossary below: every enumeration a
// catalogued column can hold, its Spanish labels, and a heading. Listed once
// here rather than spelled out again in catalog.ts's column descriptions.
const ENUMERATIONS = [
  { slug: "status", title: "Estados (status)", values: STATUSES, labels: STATUS_LABELS },
  { slug: "technology", title: "Tecnologías (technology)", values: TECHNOLOGIES, labels: TECHNOLOGY_LABELS },
  { slug: "verdict", title: "Resultado de la resolución (verdict)", values: VERDICTS, labels: VERDICT_LABELS },
  { slug: "role", title: "Tipos de documento (role)", values: DOCUMENT_ROLES, labels: ROLE_LABELS },
  { slug: "event", title: "Acontecimientos (event)", values: EVENTS, labels: EVENT_LABELS },
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
      <p>
        Los textos de origen se reutilizan conforme a la Ley 37/2007, de reutilización de la información del sector público, y a las
        condiciones de reutilización del BOE y del BOJA: sin alterar su contenido, citando el boletín y el anuncio de cada dato, y con la
        fecha de la última actualización, {formatLongDate(meta.generatedAt)}.
      </p>
      <h2>Cómo citar</h2>
      <p className={`dato ${styles.cita}`} data-testid="cita">
        Impacto Acumulado ({year}). Resoluciones ambientales de proyectos renovables en Andalucía, 2019 a {year}. Datos a{" "}
        {formatLongDate(meta.generatedAt)}. {SITE_URL}/datos
      </p>
      <h2>Archivos</h2>
      <p>
        Los totales de MW del sitio suman la potencia nominal o, cuando un proyecto solo declara la pico, la pico (columna{" "}
        <span className="dato">mw_best</span>). Para trabajar solo con la nominal, usa la columna{" "}
        <span className="dato">mw_nominal</span>, que está en todos los archivos agregados.
      </p>
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
      <h2 id="seguir">Seguir los cambios</h2>
      <p>
        Cada municipio y cada espacio de la Red Natura 2000 tiene un feed (RSS/Atom) con sus documentos más recientes, y hay uno para
        toda Andalucía: <a href="/feeds/andalucia.xml">/feeds/andalucia.xml</a>, <span className="dato">/feeds/municipio/</span>código
        INE<span className="dato">.xml</span> y <span className="dato">/feeds/natura/</span>código del espacio
        <span className="dato">.xml</span>. Las páginas de cada municipio y la tabla de la Red Natura 2000 enlazan el suyo.
      </p>
      <p>
        Un feed se lee con un lector de feeds, una aplicación o web que avisa cuando hay entradas nuevas. Si prefieres recibirlas por
        correo, hay servicios gratuitos que convierten un feed en avisos por email: pega en ellos la dirección del feed. El sitio no
        recomienda ninguno ni guarda direcciones de correo.
      </p>
      <h2>Cambios</h2>
      <section aria-labelledby="cambio-2026-10-05" className={styles.columnas}>
        <h3 id="cambio-2026-10-05">
          <time dateTime="2026-10-05">5 de octubre de 2026</time>
        </h3>
        <ul>
          <li>
            Archivo nuevo, <span className="dato">developers.json</span>: los promotores con sus distintas grafías unidas, sus
            proyectos y sus MW por estado. Cada uno tiene su página en <Link href="/promotores">Promotores</Link>.
            <span className="dato"> projects.csv</span> no cambia: su columna <span className="dato">developer</span> sigue como la
            imprime el boletín.
          </li>
          <li>
            Un valor nuevo de <span className="dato">status</span>, <span className="dato">sin_resolucion</span>: proyectos cuya última
            consulta pública tiene más de 24 meses y sin resolución publicada (antes, <span className="dato">en_consulta</span>). Se
            calcula en cada actualización semanal, así que un proyecto puede pasar a este estado sin un documento nuevo.
          </li>
          <li>
            Fuente nueva: los anuncios de información pública de la sección V del BOE sobre proyectos renovables en Andalucía que
            someten a consulta la evaluación ambiental (120 anuncios desde 2019). Se guardan sin la relación de bienes y derechos
            afectados, que lleva datos personales. La mayoría se suma a un proyecto ya publicado. Los módulos de almacenamiento
            exentos de evaluación ambiental no se incluyen; los que sí se evalúan cuentan como proyectos propios, no como parte de
            la planta que hibridan. <span className="dato">projects.csv</span> pasa de 541 a 585 filas; seis de las nuevas son
            plantas que la agrupación unía con otras y ahora separa.
          </li>
        </ul>
      </section>
      <section aria-labelledby="cambio-2026-10-04" className={styles.columnas}>
        <h3 id="cambio-2026-10-04">
          <time dateTime="2026-10-04">4 de octubre de 2026</time>
        </h3>
        <ul>
          <li>
            Archivo nuevo, <span className="dato">open_consultations.json</span>: los anuncios de información pública con plazo de
            alegaciones abierto en la fecha de exportación, con el plazo leído del anuncio, la frase que lo dice y la fecha límite
            calculada (festivos nacionales y andaluces, no locales).
          </li>
          <li>
            Los archivos agregados (<span className="dato">municipality_stats</span>, <span className="dato">protected_area_stats</span>,{" "}
            <span className="dato">province_stats.json</span>, <span className="dato">province_monthly.csv</span>) tienen dos campos
            nuevos: <span className="dato">mw_best</span>, que suma la potencia nominal o, si un proyecto solo declara la pico, la pico; y{" "}
            <span className="dato">mw_peak_fallback_count</span>, cuántos proyectos de la fila usan la pico. Las líneas de evacuación
            siguen sin sumar potencia. <span className="dato">mw_nominal</span> y <span className="dato">mw_count</span> no cambian; en{" "}
            <span className="dato">municipality_stats.csv</span> las dos columnas nuevas van tras <span className="dato">ha_count</span>.
            Los totales de MW del sitio usan ahora <span className="dato">mw_best</span>.
          </li>
          <li>
            La agrupación de documentos en proyectos ya no une plantas hermanas (números de expediente distintos del mismo
            procedimiento y provincia, o fases distintas en el nombre). Se separaron 46 proyectos que reunían varias plantas, y{" "}
            <span className="dato">projects.csv</span> pasa de 444 a 541 filas. Cada proyecto conserva como identificador el menor de
            sus documentos, así que algunos identificadores nombran ahora otro proyecto.
          </li>
        </ul>
      </section>
      <section aria-labelledby="cambio-2026-09-28" className={styles.columnas}>
        <h3 id="cambio-2026-09-28">
          <time dateTime="2026-09-28">28 de septiembre de 2026</time>
        </h3>
        <ul>
          <li>
            <span className="dato">mw_nominal</span> ya no suma la potencia de las líneas de evacuación en los archivos agregados (
            <span className="dato">municipality_stats</span>, <span className="dato">protected_area_stats</span>,{" "}
            <span className="dato">province_monthly.csv</span>): esa potencia es la de las plantas que evacúan, que ya cuentan por sí
            mismas. Las líneas siguen contando como proyectos. <span className="dato">projects.csv</span> no cambia.
          </li>
          <li>
            <span className="dato">municipality_stats.csv</span> tiene una columna nueva, <span className="dato">mw_count</span>, entre{" "}
            <span className="dato">turbines</span> y <span className="dato">name</span>. Si lees el archivo por posición de columna, pasa a
            leerlo por nombre.
          </li>
          <li>
            <span className="dato">municipality_stats.json</span> y <span className="dato">protected_area_stats.json</span> cambian de
            forma: cada entrada lleva una lista <span className="dato">cells</span> con una fila por estado y tecnología, en lugar de
            totales por estado. <span className="dato">protected_area_stats.json</span> incluye además todos los espacios, con{" "}
            <span className="dato">name</span>, <span className="dato">type</span> y <span className="dato">municipality_count</span>.
          </li>
          <li>
            Archivos nuevos: <span className="dato">province_stats.json</span>, <span className="dato">monthly_events.csv</span>,{" "}
            <span className="dato">sensitivity_ftv.geojson</span> y <span className="dato">sensitivity_eol.geojson</span>.
          </li>
        </ul>
      </section>
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
