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
      <section aria-labelledby="cambio-2026-10-06" className={styles.columnas}>
        <h3 id="cambio-2026-10-06">
          <time dateTime="2026-10-06">6 de octubre de 2026</time>
        </h3>
        <ul>
          <li>
            Proyectos duplicados: un anuncio que no nombra municipio, o que nombra una planta dentro de un título con varias, se une
            al proyecto del mismo promotor que lleva ese nombre, si es el único y nada los separa (otro expediente, otros municipios,
            una línea frente a una planta, eólica frente a solar). Cuatro proyectos se unen a otro y{" "}
            <span className="dato">projects.csv</span> pierde cuatro filas: la hibridación Saucito (699) pasa a El Saucito (75), Rey I
            Solar PV (675) a las plantas Rey I a IV (35), FV Ronda I (698) a las plantas Ronda I a III (47) y la modificación de Lirios
            Solar PV (61) a su declaración (10). Carmona deja de contar dos veces Rey I: su total baja 356,4 MW. Los enlaces a los
            números retirados llevan al proyecto que los recoge. Los casos dudosos no se unen: la cola de revisión los lista.
          </li>
          <li>
            Aerogeneradores y tecnología: los anuncios de hibridación describen el parque eólico existente y el modelo copiaba sus
            aerogeneradores a la planta fotovoltaica. Un proyecto cuyo nombre dice fotovoltaica o módulo, sin eólica propia, ya no
            publica <span className="dato">turbines</span> (Retuerta, Valdefuentes, Tallisca, PV Centenar, Ferreira II, Montegordo).
            Un nombre que empieza por parque eólico corrige una tecnología leída como solar u otra:{" "}
            <span className="dato">technology</span> pasa a <span className="dato">eolica</span> en Filabres, Peregiles y La Rambla
            (32) y en Parapanda (262). Ninguna fila <span className="dato">solar_fv</span> tiene aerogeneradores.
          </li>
          <li>
            <span className="dato">splitting_candidates.json</span> gana un segundo tipo de grupo, misma infraestructura de evacuación
            (<span className="dato">kind</span> <span className="dato">infraestructura</span>, con{" "}
            <span className="dato">family</span> vacío e <span className="dato">infrastructure</span>): plantas que enumera un mismo
            proyecto de evacuación o cuyos nombres citan la misma subestación, sea cual sea su promotor. Los grupos de antes llevan{" "}
            <span className="dato">kind</span> <span className="dato">familia</span> y no cambian. Se añaden dos grupos en Carmona: las
            cinco plantas de 36,3 MW de la infraestructura común de Almazara, Atlante, Chapitel, Garita y Fortaleza Solar (181,5 MW) y
            Carmo 2 y 3 (73,33 MW; Carmo 1 declara 50 MW y queda fuera).
          </li>
          <li>
            <span className="dato">developers.json</span>: <span className="dato">group</span>,{" "}
            <span className="dato">parent_company</span> y <span className="dato">source_url</span> para los grupos con fuente: Endesa
            (Enel Green Power España), Acciona Energía (Corporación Acciona Eólica) y Greenalia (las sociedades Guadame y Zumajo). Nueve
            entradas cambian; el resto, igual. En Promotores, una tabla nueva suma las sociedades de cada grupo con fuente y de cada
            familia de nombres.
          </li>
        </ul>
      </section>
      <section aria-labelledby="cambio-2026-10-05" className={styles.columnas}>
        <h3 id="cambio-2026-10-05">
          <time dateTime="2026-10-05">5 de octubre de 2026</time>
        </h3>
        <ul>
          <li>
            Potencia: cuando el boletín etiqueta la potencia pico o la nominal («61,2 MWp/51 MWn»), esa cifra corrige la que leyó el
            modelo, y cada proyecto toma la del documento más reciente que la etiqueta. Cambian 14 proyectos en{" "}
            <span className="dato">mw_nominal</span> o <span className="dato">mw_peak</span>; por ejemplo, Las Quinientas pasa de
            109,5 a 90,75 MW nominales, Los Lirios de 96 a 48 y la planta solar de Jerez Este H2 de 484,3 a 138,3.
          </li>
          <li>
            Revisión de agrupaciones: <span className="dato">projects.csv</span> pasa de 585 a 587 filas. El parque eólico Hinojosa
            (63,08 MW, favorable con condiciones) y su ampliación (25,12 MW, desfavorable) son dos proyectos con dos declaraciones; antes
            figuraban juntos y como denegados. Don Rodrigo I (250 MW, en consulta desde 2019) se separa de Don Rodrigo (150 MW). Siete
            proyectos con nombre genérico toman el que da el boletín (por ejemplo, «Plantas fotovoltaicas del Nudo Jordana»).
          </li>
          <li>
            Archivo nuevo, <span className="dato">splitting_candidates.json</span>: grupos de proyectos de promotores con el mismo
            nombre que declaran cada uno menos de 50 MW y juntos los superan (posible fraccionamiento). Las páginas de proyecto y de
            municipio los señalan.
          </li>
          <li>
            Archivo nuevo, <span className="dato">project_details.json</span>: por proyecto, las condiciones, especies y espacios
            protegidos que leen los documentos y las citas que respaldan cada dato de la ficha. Las páginas de proyecto los
            muestran.
          </li>
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
