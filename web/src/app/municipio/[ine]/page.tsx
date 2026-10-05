import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectRecord } from "@/components/municipality/project-record";
import { FeedLink } from "@/components/feed-link";
import { ReportError } from "@/components/report-error";
import { OpenConsultations } from "@/components/open-consultations";
import { ProtectedAreas } from "@/components/municipality/protected-areas";
import { Sensitivity } from "@/components/municipality/sensitivity";
import { splitByHeadline, Totals } from "@/components/municipality/totals";
import { stillOpen } from "@/lib/consultations";
import { loadOpenConsultations } from "@/lib/data/consultations";
import { keysByPrintedName, loadDevelopers } from "@/lib/data/developers";
import { groupDocumentsByProject, loadDocuments } from "@/lib/data/documents";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjects } from "@/lib/data/projects";
import { loadSplittingGroups } from "@/lib/data/splitting";
import { SplittingNote } from "@/components/splitting-note";
import { loadMunicipalityProtectedAreas } from "@/lib/data/protected-areas";
import { loadMunicipalityStats } from "@/lib/data/stats";
import { formatCoverage, formatInt, formatMw } from "@/lib/format";
import { sumFigures } from "@/lib/metrics";
import { SITE_URL } from "@/lib/site";
import styles from "./page.module.css";

type Params = { ine: string };

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  const munis = await loadMunicipalities();
  return munis.map((m) => ({ ine: m.ine }));
}

async function findMunicipality(ine: string) {
  const munis = await loadMunicipalities();
  return munis.find((m) => m.ine === ine) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { ine } = await params;
  const [muni, stats] = await Promise.all([findMunicipality(ine), loadMunicipalityStats()]);
  if (!muni) return { title: "Municipio no encontrado · Impacto Acumulado" };
  const s = stats.get(ine);
  // The headline's definition: approved or pending; refused projects are not in the figure.
  const t = s ? sumFigures(splitByHeadline(s.cells).accumulating) : null;
  const description = t && t.projectCount > 0
    ? `${formatMw(t.mwBest)} en ${formatInt(t.projectCount)} proyectos renovables aprobados o en trámite en ${muni.name} (${muni.province}) según el BOE y el BOJA (${formatCoverage(t.mwCount, t.projectCount, "mw", t.mwPeakCount)}).`
    : s
      ? `Ningún proyecto renovable aprobado o en trámite en ${muni.name} (${muni.province}); solo denegados o caducados según el BOE y el BOJA.`
      : `Ningún proyecto renovable registrado en los boletines para ${muni.name} (${muni.province}).`;
  return {
    title: `${muni.name} · Impacto Acumulado`,
    description,
    alternates: { canonical: "./", types: { "application/atom+xml": [{ url: `${SITE_URL}/feeds/municipio/${ine}.xml`, title: `Documentos en ${muni.name}` }] } },
  };
}

export default async function MunicipalityPage({ params }: { params: Promise<Params> }) {
  const { ine } = await params;
  const [muni, stats, areas, projects, documents, { consultations }, developers] = await Promise.all([
    findMunicipality(ine),
    loadMunicipalityStats(),
    loadMunicipalityProtectedAreas(),
    loadProjects(),
    loadDocuments(),
    loadOpenConsultations(),
    loadDevelopers(),
  ]);
  const splitting = (await loadSplittingGroups()).filter((g) => g.ineCodes.includes(ine));
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  if (!muni) notFound();
  const developerKeys = keysByPrintedName(developers);

  const s = stats.get(ine);
  const here = projects.filter((p) => p.ineCodes.includes(ine)).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  const docsByProject = groupDocumentsByProject(documents);
  // Build date: the page is static. Shown above the projects only when a notice here is open.
  const today = new Date();
  const openHere = stillOpen(consultations, today).filter((c) => c.ineCodes.includes(ine));

  return (
    <article>
      <p className={`dato ${styles.eyebrow}`}>
        Provincia de {muni.province} · INE {muni.ine}
      </p>
      <h1 className={`display ${styles.nombre}`}>{muni.name}</h1>
      <FeedLink href={`/feeds/municipio/${muni.ine}.xml`} label="Seguir este municipio" />

      {s ? (
        <Totals stats={s} areaHa={muni.areaHa} />
      ) : (
        <section aria-labelledby="totales" className={styles.vacio}>
          <h2 id="totales">Totales</h2>
          <p>Ningún proyecto registrado en los boletines desde 2019 para este municipio.</p>
        </section>
      )}

      <Sensitivity share={muni.sensitivityHighShare} />
      <ProtectedAreas areas={areas.get(ine) ?? []} />

      {openHere.length > 0 ? <OpenConsultations items={openHere} today={today} /> : null}

      <SplittingNote groups={splitting} projects={projectsById} developers={developers} />

      <section aria-labelledby="proyectos" className={styles.proyectos}>
        <h2 id="proyectos">Proyectos ({formatInt(here.length)})</h2>
        {here.map((p) => (
          <ProjectRecord key={p.id} project={p} documents={docsByProject.get(p.id) ?? []} developerKeys={developerKeys} />
        ))}
      </section>

      <p>
        <Link href="/">Volver al mapa</Link>
      </p>
      <ReportError subject={`${muni.name} (INE ${muni.ine})`} path={`/municipio/${muni.ine}`} />
    </article>
  );
}
