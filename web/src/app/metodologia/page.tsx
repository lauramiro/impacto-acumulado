import type { Metadata } from "next";
import Link from "next/link";
import { Figure } from "@/components/figure";
import { loadEvaluation } from "@/lib/data/evaluation";
import { formatInt, formatPercent } from "@/lib/format";
import { REPO_URL } from "@/lib/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Metodología · Impacto Acumulado",
  description: "Fuentes, extracción automática, precisión medida y límites del conjunto de datos de Impacto Acumulado.",
};

// Spanish label for each field the evaluation harness scores. Distinct from
// lib/labels.ts, which covers domain enumerations (status, technology,
// verdict, role), not the extraction field names themselves.
const FIELD_LABELS: Record<string, string> = {
  doc_type: "Tipo de documento",
  verdict: "Resultado de la resolución",
  developer: "Promotor",
  technology: "Tecnología",
  mw_nominal: "Potencia nominal",
  mw_peak: "Potencia pico",
  hectares: "Superficie",
  turbines: "Aerogeneradores",
  municipalities: "Municipios",
  project_name: "Nombre del proyecto",
  expediente: "Expediente",
};

const ALERT_BELOW = 0.9;

export default async function MethodologyPage() {
  const ev = await loadEvaluation();
  const fields = Object.keys(ev.accuracy).sort((a, b) => (FIELD_LABELS[a] ?? a).localeCompare(FIELD_LABELS[b] ?? b, "es"));
  return (
    <article className={styles.page}>
      <h1>Metodología</h1>

      <h2>Fuentes</h2>
      <p>
        Boletín Oficial del Estado, sección III, resoluciones del ministerio con competencias en transición ecológica sobre proyectos
        renovables en Andalucía: declaraciones de impacto ambiental e informes. El BOE solo recoge proyectos de más de 50 MW.
      </p>
      <p>
        Boletín Oficial de la Junta de Andalucía, consejería con competencias en medio ambiente: autorizaciones ambientales
        unificadas, informes e información pública de proyectos de cualquier tamaño.
      </p>
      <p>
        Ambos desde el 1 de enero de 2019. Capas de referencia: límites municipales del DERA (Instituto de Estadística y
        Cartografía de Andalucía), Red Natura 2000 y zonificación ambiental para renovables del MITECO (ráster, cinco clases,
        eólica y fotovoltaica).
      </p>

      <h2>De documento a dato</h2>
      <p>
        Cada semana el pipeline descarga los documentos nuevos y un modelo de lenguaje (<span className="dato">{ev.provider}</span>)
        convierte cada uno en un registro: tipo, resultado, promotor, tecnología, potencia, superficie y municipios. Una regla lee
        además la frase dispositiva (la que formula la declaración o resuelve la autorización) y corrige el tipo de documento y
        el resultado, pero solo cuando el modelo ya los había leído como ese mismo tipo de decisión o como «otro».
      </p>
      <p>
        Los documentos se agrupan en proyectos por nombre, promotor, expediente y municipio. El identificador de un proyecto es
        el id de documento más bajo del grupo, así que no cambia entre semanas. El estado lo fija el documento resolutorio más
        reciente; una consulta pública no cambia el estado de un proyecto ya resuelto.
      </p>

      <h2 id="precision">Precisión medida</h2>
      <p data-testid="muestra">
        Medida con <span className="dato">{ev.provider}</span> sobre {formatInt(ev.nScored)} documentos etiquetados a mano
        {ev.skipped.length > 0 ? ` (${formatInt(ev.skipped.length)} más no pudieron evaluarse)` : ""}, de un conjunto de{" "}
        {formatInt(ev.labelsCount)}. Cada campo se mide solo sobre las etiquetas que lo llevan, así que la muestra varía por
        campo; la columna «Muestra» de la tabla la indica para cada uno. Las{" "}
        <a href={`${REPO_URL}/tree/main/pipeline/evaluation/labels`} rel="noopener">
          etiquetas
        </a>{" "}
        se escribieron leyendo cada resolución, no la extracción, y se revisaron una a una.
      </p>
      <table className={styles.tabla} aria-label="Precisión por campo">
        <thead>
          <tr>
            <th scope="col">Campo</th>
            <th scope="col" className={styles.num}>Aciertos</th>
            <th scope="col" className={styles.num}>Muestra</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const acc = ev.accuracy[f]!;
            const sample = ev.fieldSamples[f];
            return (
              <tr key={f}>
                <th scope="row">{FIELD_LABELS[f] ?? f}</th>
                <td className={`${styles.num} ${acc < ALERT_BELOW ? styles.alerta : ""}`}>
                  <Figure value={formatPercent(acc)} />
                </td>
                <td className={styles.num}>{sample !== undefined ? <Figure value={formatInt(sample)} /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pie">
        Los fallos más frecuentes: en «nombre del proyecto», el extractor conserva la coletilla descriptiva del título en vez de
        cortar en el nombre de la planta (para «Planta fotovoltaica Carbo de 90 MWp y su infraestructura de evacuación» el nombre
        correcto es «Planta fotovoltaica Carbo»); en «municipios», arrastra los términos de la línea de evacuación además de los
        del emplazamiento generador. En el parque fotovoltaico Retuerta, hibridado con un parque eólico ya existente, el modelo
        confunde ambas instalaciones: la tecnología sale como híbrida en vez de solar fotovoltaica, y la potencia nominal sale
        sumada (76 MW en vez de 38). Un acierto en
        potencia, superficie o aerogeneradores admite un 2 por ciento de diferencia con el valor impreso.
      </p>

      <h2>Agregación</h2>
      <ul>
        <li>Los totales por municipio suman los proyectos con ese municipio entre sus emplazamientos.</li>
        <li>Un proyecto situado en varios municipios cuenta íntegro en cada uno de ellos.</li>
        <li>
          Los solapes con la Red Natura 2000 y la cuota de sensibilidad usan el límite municipal completo: son un filtro de
          atención, no una evaluación de impacto. No hay geometría de parcela.
        </li>
        <li>El mapa clasifica los municipios con valor en cinco clases por cuantiles, recalculadas con cada filtro.</li>
      </ul>

      <h2>Lo que no cubre</h2>
      <ul>
        <li>Los boletines provinciales (BOP) y los proyectos de menos de 50 MW que no pasan por el BOJA.</li>
        <li>La geometría de las plantas: la localización es a nivel de municipio.</li>
        <li>
          El registro antes de 2022 es muy escaso: el backfill reúne <Figure value={formatInt(4)} /> documentos de 2019,{" "}
          <Figure value={formatInt(1)} /> de 2020 y <Figure value={formatInt(0)} /> de 2021, frente a{" "}
          <Figure value={formatInt(303)} /> solo en 2023. Un total por municipio o provincia que incluya esos años no debe
          leerse como completo.
        </li>
        <li>
          Lo que el extractor no lee bien; la lista de problemas conocidos está en el{" "}
          <a href={`${REPO_URL}/blob/main/docs/sources.md`} rel="noopener">
            repositorio
          </a>
          .
        </li>
      </ul>

      <h2>Datos y licencia</h2>
      <p>
        El conjunto completo se descarga en <Link href="/datos">Datos</Link>, con licencia CC BY 4.0 y una cita sugerida.
      </p>
    </article>
  );
}
