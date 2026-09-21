import type { Metadata } from "next";

export const metadata: Metadata = { title: "Metodología · Impacto Acumulado" };

export default function MethodologyPage() {
  return (
    <article>
      <h1>Metodología</h1>
      <p>
        Impacto Acumulado se construye a partir de las declaraciones de impacto ambiental, informes y autorizaciones
        publicadas en el BOE y el BOJA desde 2019. Cada resolución se convierte en datos estructurados con un modelo de
        lenguaje y se agrupa por proyecto.
      </p>
      <h2>Lo que hay que saber al leer las cifras</h2>
      <ul>
        <li>La localización es a nivel de municipio; no hay geometría de parcela.</li>
        <li>La extracción la hace un modelo de lenguaje y tiene errores. La precisión por campo se publicará aquí.</li>
        <li>El BOE solo recoge proyectos de más de 50 MW; los proyectos autonómicos dependen del BOJA, todavía en carga.</li>
        <li>
          Los solapes con la Red Natura 2000 y con la zonificación de sensibilidad usan el límite municipal completo: son
          un filtro de atención, no una evaluación de impacto.
        </li>
        <li>Un proyecto situado en varios municipios cuenta íntegro en cada uno de ellos.</li>
      </ul>
    </article>
  );
}
