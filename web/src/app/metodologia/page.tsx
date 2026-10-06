import type { Metadata } from "next";
import Link from "next/link";
import { Figure } from "@/components/figure";
import { loadOpenConsultations } from "@/lib/data/consultations";
import { loadDocuments } from "@/lib/data/documents";
import { loadEvaluation } from "@/lib/data/evaluation";
import { loadMeta } from "@/lib/data/meta";
import { formatDate, formatInt, formatPercent } from "@/lib/format";
import { REPO_URL } from "@/lib/site";
import type { GazetteDocument } from "@/lib/types";
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

/** A Wilson interval as "53 a 89 %". */
function formatInterval(low: number, high: number): string {
  return `${formatInt(Math.round(low * 100))} a ${formatPercent(high)}`;
}

/** Documents from 2019 to 2021 by gazette, against the busiest year, read from the published data. */
function earlyRecord(docs: readonly GazetteDocument[]) {
  const early = docs.filter((d) => d.publishedAt < "2022");
  const byYear = new Map<string, number>();
  for (const d of docs) byYear.set(d.publishedAt.slice(0, 4), (byYear.get(d.publishedAt.slice(0, 4)) ?? 0) + 1);
  const [referenceYear, reference] = [...byYear].reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
  return {
    boja: early.filter((d) => d.source === "boja").length,
    boe: early.filter((d) => d.source === "boe").length,
    consultasBoe: early.filter((d) => d.source === "boe" && d.role === "consulta").length,
    referenceYear,
    reference,
  };
}

export default async function MethodologyPage() {
  const [ev, { evaluation: periods }, docs, meta] = await Promise.all([
    loadEvaluation(),
    loadOpenConsultations(),
    loadDocuments(),
    loadMeta(),
  ]);
  const early = earlyRecord(docs);
  const coverage = meta.bojaCoverage;
  const nominal = ev.intervals["mw_nominal"];
  const fields = Object.keys(ev.accuracy).sort((a, b) => (FIELD_LABELS[a] ?? a).localeCompare(FIELD_LABELS[b] ?? b, "es"));
  return (
    <article className={styles.page}>
      <h1>Metodología</h1>

      <h2>Fuentes</h2>
      <p>
        Boletín Oficial del Estado, sección III, resoluciones del ministerio con competencias en transición ecológica sobre proyectos
        renovables en Andalucía: declaraciones de impacto ambiental e informes. El BOE recoge los proyectos que evalúa el
        Estado: la mayoría superan los 50 MW, pero también los hay de menos, como hibridaciones y ampliaciones de plantas
        existentes.
      </p>
      <p>
        Boletín Oficial del Estado, sección V: anuncios de información pública de esos mismos proyectos, cuando lo que se somete a
        consulta incluye la evaluación ambiental. Se guardan sin la relación de bienes y derechos afectados, que lleva nombres y
        documentos de identidad de propietarios; un anuncio en el que no se encuentra dónde empieza esa relación no se guarda. Los
        módulos de almacenamiento exentos de evaluación ambiental no se incluyen.
      </p>
      <p>
        Boletín Oficial de la Junta de Andalucía, consejería con competencias en medio ambiente: autorizaciones ambientales
        unificadas, informes e información pública de proyectos de cualquier tamaño. Los anuncios de la consejería con competencias
        en energía no se recogen (ver <a href="#lo-que-no-cubre">lo que no cubre</a>).
      </p>
      {coverage ? (
        <>
          <p id="cobertura-boja" data-testid="cobertura-boja">
            Cobertura del BOJA, comprobada el {formatDate(coverage.checked)}: la búsqueda del BOJA da{" "}
            <Figure value={formatInt(coverage.total_hits)} /> resultados desde {(coverage.scanned_from ?? coverage.from).slice(0, 4)} para las{" "}
            {formatInt(coverage.queries.length)} consultas que usa el sitio, y el sitio guarda <Figure value={formatInt(coverage.stored)} />{" "}
            ({formatPercent(coverage.total_hits ? coverage.stored / coverage.total_hits : 0)}). La mayoría de esos resultados son de
            otras consejerías o de otros asuntos: con la misma selección que aplica el sitio (consejería de medio ambiente, el
            procedimiento en el título y una palabra de renovables) quedan <Figure value={formatInt(coverage.selected)} /> anuncios, y el
            sitio tiene <Figure value={formatInt(coverage.stored)} />, el{" "}
            {formatPercent(coverage.selected ? coverage.stored / coverage.selected : 1)}.
            {coverage.complete ? "" : " Alguna consulta falló durante la comprobación, así que las cifras de la búsqueda son un mínimo."}
            {coverage.timed_out
              ? ` La comprobación se cortó por su límite de tiempo: lee desde el año actual hacia atrás, así que estas cifras cubren desde ${(coverage.scanned_from ?? coverage.from).slice(0, 4)} y los años anteriores no se han comprobado esta vez.`
              : ""}{" "}
            La comprobación se repite en cada actualización semanal.
          </p>
          <table className={styles.tabla} aria-label="Cobertura del BOJA por año">
            <thead>
              <tr>
                <th scope="col">Año</th>
                <th scope="col" className={styles.num}>
                  Con la selección
                </th>
                <th scope="col" className={styles.num}>
                  En el sitio
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(coverage.years)
                .filter(([, y]) => y.selected > 0 || y.stored > 0)
                .map(([year, y]) => (
                  <tr key={year}>
                    <th scope="row">{year}</th>
                    <td className={styles.num}>
                      <Figure value={formatInt(y.selected)} />
                    </td>
                    <td className={styles.num}>
                      <Figure value={formatInt(y.stored)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      ) : (
        <p data-testid="cobertura-boja">La comprobación de cobertura del BOJA no pudo hacerse en la última actualización.</p>
      )}
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
        el resultado, pero solo cuando el modelo ya los había leído como ese mismo tipo de decisión o como «otro». Otra regla lee
        la potencia cuando el boletín la etiqueta («61,2 MWp/51 MWn», «109,52 MWp (90,75 MWn)») y corrige la del modelo, que a
        veces toma la pico por nominal; si el título nombra varias plantas no se aplica. La potencia de un proyecto es la del
        documento más reciente que la etiqueta, y solo si ninguno lo hace, la del más reciente que la da sin etiqueta.
      </p>
      <p>
        Los documentos se agrupan en proyectos por nombre, promotor, expediente y municipio. El identificador de un proyecto es
        el id de documento más bajo del grupo, así que no cambia entre semanas. El estado lo fija el documento resolutorio más
        reciente; una consulta pública no cambia el estado de un proyecto ya resuelto.
      </p>

      <p>
        El promotor se guarda como lo imprime el boletín. Para agruparlo, se le quitan la forma jurídica (S.L., S.L.U., S.A.…), las
        mayúsculas, los acentos y la puntuación, de modo que «Enel Green Power España, S.L.» y «Enel Green Power España, SL» son el
        mismo promotor. Las sociedades cuyo nombre solo cambia en el número final (Tayant Investment 12 a 15) se muestran juntas como
        «mismo nombre», sin afirmar que sean del mismo grupo; un grupo empresarial solo se asigna a mano y con fuente. La fuente
        (cuentas anuales, la web del grupo o un registro oficial como el BORME) tiene que nombrar la sociedad o los proyectos que
        promueve; sin ella no se indica sociedad matriz. En <Link href="/promotores">Promotores</Link> se suman las sociedades de cada
        grupo con fuente y de cada familia de nombres.
      </p>

      <h2 id="precision">Precisión medida</h2>
      <p data-testid="muestra">
        Medida el {formatDate(ev.measured)} con <span className="dato">{ev.provider}</span> sobre {formatInt(ev.nScored)} documentos
        etiquetados a mano
        {ev.skipped.length > 0 ? ` (${formatInt(ev.skipped.length)} más no pudieron evaluarse)` : ""}, de un conjunto de{" "}
        {formatInt(ev.labelsCount)}. Las{" "}
        <a href={`${REPO_URL}/tree/main/pipeline/evaluation/${ev.labelsFolder}`} rel="noopener">
          etiquetas
        </a>{" "}
        se escribieron leyendo cada documento, no la extracción, y ninguno de esos documentos se usó para ajustar el extractor:
        miden la versión que produce los datos publicados. Se eligieron al azar dentro de grupos (declaraciones del ministerio,
        anuncios de la sección V del BOE, autorizaciones y consultas del BOJA; con desfavorables y eólicos en cada fuente). Cada
        campo se mide solo sobre las etiquetas que lo llevan, así que la muestra varía por campo.
      </p>
      <table className={styles.tabla} aria-label="Precisión por campo">
        <thead>
          <tr>
            <th scope="col">Campo</th>
            <th scope="col" className={styles.num}>Aciertos</th>
            <th scope="col" className={styles.num}>Intervalo del 95 %</th>
            <th scope="col" className={styles.num}>Muestra</th>
            {ev.previous ? (
              <th scope="col" className={styles.num}>
                {formatDate(ev.previous.measured)}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const acc = ev.accuracy[f]!;
            const sample = ev.fieldSamples[f];
            const interval = ev.intervals[f];
            return (
              <tr key={f}>
                <th scope="row">{FIELD_LABELS[f] ?? f}</th>
                <td className={`${styles.num} ${acc < ALERT_BELOW ? styles.alerta : ""}`}>
                  <Figure value={formatPercent(acc)} />
                </td>
                <td className={styles.num}>{interval ? <Figure value={formatInterval(interval.low, interval.high)} /> : "—"}</td>
                <td className={styles.num}>{sample !== undefined ? <Figure value={formatInt(sample)} /> : "—"}</td>
                {ev.previous ? (
                  <td className={styles.num}>
                    {ev.previous.accuracy[f] !== undefined ? <Figure value={formatPercent(ev.previous.accuracy[f]!)} /> : "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pie">
        Los fallos de esta medida: en «municipios», el extractor sigue sumando los términos que solo cruza la línea de
        evacuación (4 de 17 documentos). En la potencia, suma la del parque existente cuando el proyecto lo hibrida (Valdefuentes:
        55,83 MW en vez de 27,83), mezcla la potencia del electrolizador con la de la planta solar en las dos plantas de
        hidrógeno, cuenta como nominal la suma de potencias pico de cuatro plantas y deja sin leer los 5 MW de una autorización
        del BOJA. Un acierto en potencia, superficie o aerogeneradores admite un 2 por ciento de diferencia con el valor impreso.
      </p>
      <p className="pie" data-testid="intervalo">
        El intervalo es el de Wilson al 95 %: el margen en el que cae el acierto real dada la muestra de ese campo.
        {nominal && nominal.n < 100
          ? ` Con ${formatInt(nominal.n)} documentos es ancho: en la potencia nominal, ${formatInt(nominal.correct)} aciertos de ${formatInt(nominal.n)}, va del ${formatInt(Math.round(nominal.low * 100))} al ${formatPercent(nominal.high)}. Para estrecharlo, el conjunto de etiquetas se está ampliando a 100 documentos elegidos al azar por fuente y tecnología.`
          : null}
      </p>
      {ev.previous ? (
        <p className="pie" data-testid="medida-anterior">
          La última columna es la medida anterior, del {formatDate(ev.previous.measured)}, sobre{" "}
          {formatInt(ev.previous.nScored)} documentos que después se usaron para corregir el extractor: se conserva como
          historial, pero ya no mide la versión publicada.
        </p>
      ) : null}

      {ev.aauPublication ? (
        <>
          <h3 id="sin-veredicto">Proyectos sin veredicto en el boletín</h3>
          <p>
            Muchas autorizaciones ambientales unificadas se publican en el BOJA con un anuncio que solo dice que se da publicidad al
            informe vinculante y remite al texto completo en la web de la Consejería: el boletín no dice si se concedió. Esos proyectos
            figuran como «Sin veredicto en el boletín», no como un fallo de lectura. Cuando el anuncio sí lo dice («autorización
            ambiental unificada otorgada», «se otorga», «se modifica», «se deniega») una regla lo lee y prevalece sobre el modelo; en una
            corrección de errores solo cuenta el texto que «debe decir». El texto completo al que remiten esos anuncios está en una
            aplicación de consulta de la Consejería, sin un documento por expediente que pueda leerse con una regla, y el texto que da
            la API del BOJA para cada anuncio es el mismo que el sitio ya lee. Por eso el titular de la portada da estos proyectos
            aparte, sin sumarlos a los aprobados o en trámite.
          </p>
          <p>
            Hoy quedan {formatInt(ev.aauPublication.unknownProjects)} de {formatInt(ev.aauPublication.projects)} proyectos sin
            veredicto en el boletín. La regla se comprobó a mano en {formatInt(ev.aauPublication.heldOut.labelled)} anuncios no usados
            para escribirla: acertó en {formatInt(ev.aauPublication.heldOut.correct)}, y la forma que falló («se modifica») se añadió
            después. Sobre los {formatInt(ev.aauPublication.live.labelled)} anuncios etiquetados acierta hoy en{" "}
            {formatInt(ev.aauPublication.live.correct)}.
          </p>
        </>
      ) : null}

      <h2>Agregación</h2>
      <ul>
        <li>Los totales por municipio suman los proyectos con ese municipio entre sus emplazamientos.</li>
        <li>Un proyecto situado en varios municipios cuenta íntegro en cada uno de ellos. En el total de Andalucía cuenta una vez.</li>
        <li>
          El sitio no suma la potencia de las líneas de evacuación: la potencia que declara una línea es la de las plantas que evacúa,
          que ya cuentan por sí mismas. Las líneas sí cuentan como proyectos. El almacenamiento asociado a una planta puede duplicar
          potencia de la misma forma; ese caso no se corrige.
        </li>
        <li>
          Muchos documentos no declaran potencia. Cada total de MW indica cuántos proyectos la declaran, por ejemplo «MW declarados en
          7 de 9 proyectos». Las cifras de potencia llevan además el error de lectura medido arriba.
        </li>
        <li>
          Un proyecto cuya última consulta pública tiene más de 24 meses y del que no se ha publicado ninguna resolución figura como
          «Consulta sin resolución», no como «Información pública»: ya no está en consulta, y el boletín no dice si siguió adelante.
          Cuenta con los aprobados o en trámite en el titular.
        </li>
        <li>
          «MW por km²» divide los MW del municipio, o de la provincia, entre su superficie. Como un proyecto en varios municipios cuenta
          entero en cada uno, la densidad de los municipios que comparte puede exagerar; la de la provincia cuenta cada proyecto una vez
          por provincia. La tabla de la Red Natura 2000 muestra MW con esta métrica: un espacio no tiene superficie propia en estos
          datos. En el titular, los proyectos sin veredicto en el boletín y los denegados o caducados se dan aparte de los aprobados o
          en trámite.
        </li>
        <li>
          Los totales de MW suman la potencia nominal (MWn) de cada proyecto y, cuando un proyecto solo declara la potencia pico (MWp),
          esa. En fotovoltaica la pico es mayor que la nominal, así que un total que la usa tira hacia arriba; la nota de cada total dice
          en cuántos proyectos se usa, por ejemplo «MW declarados en 7 de 9 proyectos; en 2 se usa la potencia pico». La columna{" "}
          <span className="dato">mw_nominal</span> de los datos descargables sigue sumando solo la nominal.
        </li>
        <li>
          Los solapes con la Red Natura 2000 y la cuota de sensibilidad usan el límite municipal completo: son un filtro de atención, no
          una evaluación de impacto. La tabla de espacios suma todos los proyectos de los municipios que tocan cada espacio y mide
          cercanía, no afección.
        </li>
        <li>
          La capa de sensibilidad del mapa es la zonificación ambiental del Ministerio para energías renovables, clases alta, muy alta y
          máxima, sobre una malla de 250 m y simplificada para la web. La ubicación de un proyecto dentro de su municipio solo se conoce
          cuando sus documentos publican coordenadas, y entonces se muestra en su página, no en este mapa.
        </li>
        <li>
          La serie mensual cuenta documentos: anuncios de información pública y resoluciones (declaraciones de impacto, autorizaciones
          ambientales unificadas e informes) con su resultado. Las resoluciones cuyo resultado no se ha podido leer aparecen aparte. Las
          modificaciones y caducidades no cuentan. Empieza en 2022.
        </li>
        <li>
          El extractor separa los municipios por los que solo pasa la línea de evacuación o donde solo está la subestación, y esos no
          cuentan como emplazamiento del proyecto. Cuando no los separa, el proyecto cuenta también en ellos: la medida de arriba da
          la frecuencia de ese fallo.
        </li>
        <li>El mapa clasifica los municipios con valor en cinco clases por cuantiles, recalculadas con cada filtro.</li>
      </ul>

      <h2 id="fraccionamiento">Posible fraccionamiento</h2>
      <p>
        El artículo 3.13.a de la Ley 24/2013, del Sector Eléctrico, atribuye al Estado la autorización de las instalaciones
        peninsulares de producción «de potencia eléctrica instalada superior a 50 MW»; por debajo autoriza la Junta. Dividir una planta
        en varias por debajo de ese umbral es un patrón que se señala en alegaciones. El sitio marca un grupo de proyectos cuando:
      </p>
      <ul>
        <li>
          sus promotores tienen el mismo nombre salvo el número final (Tayant Investment 12 a 15), o son la misma sociedad, aunque
          los boletines la escriban de forma distinta («Greenalia Solar Power Guadame» y «PowerGuadame»), y cada uno comparte
          municipio, o linda, con otro del grupo; o bien
        </li>
        <li>
          comparten infraestructura de evacuación, sea cual sea su promotor (misma infraestructura de evacuación): el nombre de un
          proyecto de evacuación los enumera («Infraestructura común para la Evacuación de las PSFV Almazara Solar, Atlante Solar,
          Chapitel Solar, Garita Solar y Fortaleza Solar»), o sus nombres citan la misma subestación («SET El Canto»), y cada planta
          comparte municipio, o linda, con el proyecto de evacuación o con la otra planta. Un grupo así que repite uno del primer tipo
          no se muestra dos veces;
        </li>
        <li>son al menos dos, cada uno declara menos de 50 MW y juntos superan los 50 MW;</li>
        <li>sus primeros documentos caen dentro de 24 meses;</li>
        <li>
          el Estado no evaluó ninguno: un proyecto con una declaración de impacto o un informe del Ministerio en el BOE (sección III)
          queda fuera, porque el Estado ya lo revisó.
        </li>
      </ul>
      <p>
        Es un patrón en los datos, no una conclusión: no dice que haya fraccionamiento ni que sea ilegal, y no comprueba si las
        sociedades pertenecen al mismo grupo. Usa la potencia que lee el sitio (nominal o, si falta, pico), que puede no ser la
        potencia instalada a efectos de la ley; los proyectos sin potencia declarada quedan fuera. Otros umbrales, como los de la
        evaluación ambiental, no se comprueban.
      </p>

      <h2>Plazos de información pública</h2>
      <ul>
        <li>
          El plazo de alegaciones se lee del texto del anuncio, no con el modelo de lenguaje: los anuncios de la Junta lo dicen con una
          fórmula fija («durante el plazo de treinta (30) días hábiles»). Se guarda la frase leída. Si el anuncio no indica plazo no se
          supone ninguno, y el plazo de un recurso no cuenta como plazo de alegaciones.
        </li>
        <li>
          Lectura comprobada a mano en {formatInt(periods.labelled)} anuncios ({formatInt(periods.withPeriod)} con plazo): acierta en{" "}
          {formatInt(periods.correct)}.
        </li>
        <li>
          La fecha límite sigue el artículo 30 de la Ley 39/2015: se cuenta desde el día siguiente a la publicación; los días hábiles
          excluyen sábados, domingos y festivos nacionales y andaluces; un plazo en días naturales o meses que acaba en día inhábil pasa
          al siguiente hábil. No se cuentan los festivos locales, así que la fecha puede quedar uno o dos días antes de la real.
        </li>
        <li>
          La lista es la de la fecha en que se generó el sitio, que se reconstruye cada semana: un anuncio publicado después no aparece
          hasta la siguiente, y uno cuyo plazo ha vencido desaparece en ella.
        </li>
      </ul>

      <h2 id="lo-que-no-cubre">Lo que no cubre</h2>
      <ul>
        <li>Los boletines provinciales (BOP) y los proyectos de menos de 50 MW que no pasan por el BOJA.</li>
        <li data-testid="no-cubre-energia">
          Los anuncios de la consejería con competencias en energía en el BOJA: información pública y resoluciones de autorización
          administrativa previa y de construcción de plantas y líneas. Solo se recogen cuando la de medio ambiente los publica de forma
          conjunta con la autorización ambiental unificada. Un plazo de alegaciones abierto en uno de esos anuncios no aparece en «En
          información pública».
        </li>
        <li>La geometría de las plantas: la localización es a nivel de municipio.</li>
        <li data-testid="registro-temprano">
          El registro antes de 2022 es escaso, sobre todo en el BOJA: el backfill reúne{" "}
          <Figure value={formatInt(early.boja)} /> documentos del BOJA y <Figure value={formatInt(early.boe)} /> del BOE de 2019 a
          2021 (<Figure value={formatInt(early.consultasBoe)} /> de estos, anuncios de información pública), frente a{" "}
          <Figure value={formatInt(early.reference)} /> solo en {early.referenceYear}. Un total por municipio o provincia que
          incluya esos años no debe leerse como completo.
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
