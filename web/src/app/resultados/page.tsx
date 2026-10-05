import type { Metadata } from "next";
import Link from "next/link";
import { Figure } from "@/components/figure";
import { groupDocumentsByProject, loadDocuments } from "@/lib/data/documents";
import { loadProjects } from "@/lib/data/projects";
import { formatInt, formatPercent } from "@/lib/format";
import { TECHNOLOGY_LABELS } from "@/lib/labels";
import { daysToDecision, MIN_CASES_FOR_MEDIAN, MIN_DECIDED_FOR_RATE, refusals, sampledMedian, type Refusals } from "@/lib/outcomes";
import { PROVINCES, REGION, TECHNOLOGIES, type Project } from "@/lib/types";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Resultados · Impacto Acumulado",
  description: "Cuántos proyectos renovables evaluados en Andalucía se deniegan y cuánto tarda la decisión, por provincia y tecnología, según el BOE y el BOJA.",
};

function RateCells({ r }: { r: Refusals }) {
  return (
    <>
      <td className={styles.num}>
        <Figure value={`${formatInt(r.refused)} de ${formatInt(r.decided)}`} />
      </td>
      <td className={styles.num}>{r.decided >= MIN_DECIDED_FOR_RATE ? <Figure value={formatPercent(r.refused / r.decided)} /> : <span className="pie">pocos casos</span>}</td>
    </>
  );
}

export default async function OutcomesPage() {
  const [projects, documents] = await Promise.all([loadProjects(), loadDocuments()]);
  const docs = groupDocumentsByProject(documents);
  const days = new Map<number, number>();
  for (const p of projects) {
    const d = daysToDecision(docs.get(p.id) ?? []);
    if (d !== null) days.set(p.id, d);
  }
  const scopes: { label: string; projects: Project[]; total?: boolean }[] = [
    ...PROVINCES.map((prov) => ({ label: prov as string, projects: projects.filter((p) => p.provinces.includes(prov)) })),
    { label: REGION, projects, total: true },
  ];
  const technologies = TECHNOLOGIES.map((t) => ({ t, projects: projects.filter((p) => p.technology === t) })).filter(
    (x) => refusals(x.projects).decided > 0,
  );
  return (
    <article className={styles.page}>
      <h1>Resultados</h1>
      <p>
        Cómo terminan los procedimientos que recogen los boletines: cuántos proyectos se deniegan y cuánto tarda la decisión. Un
        proyecto decidido es uno con resolución favorable, favorable con condiciones o desfavorable; los caducados, los que siguen en
        trámite y los que no tienen veredicto en el boletín no cuentan. Cada tasa lleva sus casos; con menos de{" "}
        {formatInt(MIN_DECIDED_FOR_RATE)} decididos solo se dan los casos, y lo mismo con la mediana del plazo por debajo de{" "}
        {formatInt(MIN_CASES_FOR_MEDIAN)} proyectos medidos.
      </p>

      <h2 id="provincias">Denegaciones y plazo por provincia</h2>
      <table className={styles.tabla} aria-label="Denegaciones y plazo por provincia">
        <thead>
          <tr>
            <th scope="col">Provincia</th>
            <th scope="col" className={styles.num}>Denegados de decididos</th>
            <th scope="col" className={styles.num}>Tasa</th>
            <th scope="col" className={styles.num}>Días hasta la decisión (mediana)</th>
          </tr>
        </thead>
        <tbody>
          {scopes.map(({ label, projects: ps, total }) => {
            const d = ps.map((p) => days.get(p.id)).filter((v) => v !== undefined);
            const { median: m, cases } = sampledMedian(d);
            return (
              <tr key={label} className={total ? styles.total : undefined}>
                <th scope="row">{label}</th>
                <RateCells r={refusals(ps)} />
                <td className={styles.num}>
                  {m === null ? (
                    <span className="pie">pocos casos ({formatInt(cases)})</span>
                  ) : (
                    <>
                      <Figure value={formatInt(Math.round(m))} /> <span className="pie">({formatInt(cases)})</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pie">
        Un proyecto en varias provincias cuenta en cada una; en Andalucía, una vez. El plazo va del primer anuncio de información
        pública a la primera resolución con veredicto publicada después, solo en los proyectos que tienen ambos; entre paréntesis,
        cuántos. Los proyectos del BOE suelen tener su consulta en otro boletín o en la sede del ministerio, así que el plazo describe
        sobre todo los procedimientos de la Junta.
      </p>

      <h2 id="tecnologias">Denegaciones por tecnología</h2>
      <table className={styles.tabla} aria-label="Denegaciones por tecnología">
        <thead>
          <tr>
            <th scope="col">Tecnología</th>
            <th scope="col" className={styles.num}>Denegados de decididos</th>
            <th scope="col" className={styles.num}>Tasa</th>
          </tr>
        </thead>
        <tbody>
          {technologies.map(({ t, projects: ps }) => (
            <tr key={t}>
              <th scope="row">{TECHNOLOGY_LABELS[t]}</th>
              <RateCells r={refusals(ps)} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pie">
        Los boletines solo recogen lo que se publica: una denegación que no se publica, o un proyecto retirado antes de decidirse, no
        aparece. Lo que lee la extracción tiene el error medido en <Link href="/metodologia#precision">Metodología</Link>.
      </p>
    </article>
  );
}
