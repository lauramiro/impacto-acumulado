import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Figure } from "@/components/figure";
import { ProjectRecord } from "@/components/municipality/project-record";
import { ReportError } from "@/components/report-error";
import { SplittingNote } from "@/components/splitting-note";
import { developerTotals, type DeveloperTotal } from "@/lib/developers";
import { keysByPrintedName, loadDevelopers, relatedDevelopers } from "@/lib/data/developers";
import { groupDocumentsByProject, loadDocuments } from "@/lib/data/documents";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjects } from "@/lib/data/projects";
import { developerSplittingGroups, loadSplittingGroups } from "@/lib/data/splitting";
import { formatCoverage, formatInt, formatMw } from "@/lib/format";
import styles from "./page.module.css";

type Params = { key: string };

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  return (await loadDevelopers()).map((d) => ({ key: d.key }));
}

async function findDeveloper(key: string) {
  const developers = await loadDevelopers();
  return { developers, developer: developers.find((d) => d.key === key) ?? null };
}

function projectsWord(n: number): string {
  return n === 1 ? "proyecto" : "proyectos";
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  const { developer } = await findDeveloper(key);
  if (!developer) return { title: "Promotor no encontrado · Impacto Acumulado" };
  const n = developer.projectIds.length;
  return {
    title: `${developer.name} · Impacto Acumulado`,
    description: `${formatInt(n)} ${projectsWord(n)} renovables de ${developer.name} en Andalucía según el BOE y el BOJA.`,
  };
}

function TotalLine({ label, t }: { label: string; t: DeveloperTotal }) {
  return (
    <p>
      {label}: <Figure value={`${formatInt(t.projects)} ${projectsWord(t.projects)}`} />
      {t.withMw > 0 ? (
        <>
          , <Figure value={formatMw(t.mw)} />
        </>
      ) : null}{" "}
      <span className="pie">({formatCoverage(t.withMw, t.projects, "mw", t.peak)})</span>
    </p>
  );
}

export default async function DeveloperPage({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const [{ developers, developer }, projects, documents, munis, splitting] = await Promise.all([
    findDeveloper(key),
    loadProjects(),
    loadDocuments(),
    loadMunicipalities(),
    loadSplittingGroups(),
  ]);
  if (!developer) notFound();

  const ids = new Set(developer.projectIds);
  const mine = projects.filter((p) => ids.has(p.id)).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  const totals = developerTotals(mine);
  const docsByProject = groupDocumentsByProject(documents);
  const developerKeys = keysByPrintedName(developers);
  const related = relatedDevelopers(developers, developer).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  const projectsIn = new Map<string, number>();
  for (const p of mine) for (const ine of p.ineCodes) projectsIn.set(ine, (projectsIn.get(ine) ?? 0) + 1);
  const places = munis
    .filter((m) => projectsIn.has(m.ine))
    .sort((a, b) => projectsIn.get(b.ine)! - projectsIn.get(a.ine)! || a.name.localeCompare(b.name, "es"));
  const otherNames = developer.names.filter((n) => n !== developer.name);
  const splittingHere = developerSplittingGroups(splitting, developer);

  return (
    <article>
      <p className={`dato ${styles.eyebrow}`}>Promotor</p>
      <h1 className={`display ${styles.nombre}`}>{developer.name}</h1>
      {otherNames.length > 0 ? (
        <p className="pie" data-testid="otras-grafias">
          Los boletines también lo escriben {otherNames.map((n) => `«${n}»`).join(", ")}.
        </p>
      ) : null}

      <section aria-labelledby="totales" className={styles.seccion}>
        <h2 id="totales">Totales</h2>
        {totals.accumulating.projects > 0 ? <TotalLine label="Aprobados o en trámite" t={totals.accumulating} /> : null}
        {totals.noVerdict.projects > 0 ? <TotalLine label="Sin veredicto en el boletín (no suman al total)" t={totals.noVerdict} /> : null}
        {totals.refused.projects > 0 ? <TotalLine label="Denegados o caducados" t={totals.refused} /> : null}
        {totals.accumulating.projects === 0 ? <p>Ningún proyecto aprobado o en trámite.</p> : null}
        {mine.some((p) => (p.developer ?? "").includes(";")) ? (
          <p className="pie">Un proyecto que el boletín atribuye a varias sociedades cuenta en la página de cada una.</p>
        ) : null}
      </section>

      {related.length > 0 ? (
        <section aria-labelledby="relacionados" className={styles.seccion}>
          <h2 id="relacionados">{developer.group ? `Grupo ${developer.group}` : "Sociedades con el mismo nombre"}</h2>
          <p>
            {developer.group && developer.parentCompany ? (
              <>
                Según{" "}
                {developer.sourceUrl ? (
                  <a href={developer.sourceUrl} rel="noopener">
                    esta fuente
                  </a>
                ) : (
                  "la fuente indicada en el repositorio"
                )}
                , pertenecen a {developer.parentCompany}.
              </>
            ) : developer.group ? (
              "Variantes del mismo nombre que los boletines escriben de forma distinta."
            ) : (
              "Sociedades cuyo nombre solo cambia en el número final. Es un patrón de nombres habitual en sociedades creadas para un solo proyecto; no está comprobado que pertenezcan al mismo grupo."
            )}
          </p>
          <ul className={styles.lista}>
            {related.map((d) => (
              <li key={d.key}>
                <Link href={`/promotor/${d.key}`}>{d.name}</Link>{" "}
                <span className="pie">
                  ({formatInt(d.projectIds.length)} {projectsWord(d.projectIds.length)})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SplittingNote groups={splittingHere} projects={new Map(projects.map((p) => [p.id, p]))} developers={developers} />

      <section aria-labelledby="municipios" className={styles.seccion}>
        <h2 id="municipios">Municipios ({formatInt(places.length)})</h2>
        <ul className={styles.lista}>
          {places.map((m) => (
            <li key={m.ine}>
              <Link href={`/municipio/${m.ine}`}>{m.name}</Link> <span className="pie">({m.province})</span>
              {projectsIn.get(m.ine)! > 1 ? <span className="pie"> · {formatInt(projectsIn.get(m.ine)!)} proyectos</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="proyectos" className={styles.seccion}>
        <h2 id="proyectos">Proyectos ({formatInt(mine.length)})</h2>
        {mine.map((p) => (
          <ProjectRecord key={p.id} project={p} documents={docsByProject.get(p.id) ?? []} developerKeys={developerKeys} />
        ))}
      </section>

      <p>
        <Link href="/promotores">Todos los promotores</Link> · <Link href="/">Volver al mapa</Link>
      </p>
      <ReportError subject={`el promotor ${developer.name}`} path={`/promotor/${developer.key}`} />
    </article>
  );
}
