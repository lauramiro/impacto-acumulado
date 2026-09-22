import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectRecord } from "@/components/municipality/project-record";
import { ProtectedAreas } from "@/components/municipality/protected-areas";
import { Sensitivity } from "@/components/municipality/sensitivity";
import { Totals } from "@/components/municipality/totals";
import { groupDocumentsByProject, loadDocuments } from "@/lib/data/documents";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjects } from "@/lib/data/projects";
import { loadMunicipalityProtectedAreas } from "@/lib/data/protected-areas";
import { loadMunicipalityStats } from "@/lib/data/stats";
import { formatInt, formatMw } from "@/lib/format";
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
  const description = s
    ? `${formatMw(s.mwTotal)} en ${formatInt(s.countTotal)} proyectos renovables evaluados en ${muni.name} (${muni.province}) según el BOE y el BOJA.`
    : `Ningún proyecto renovable registrado en los boletines para ${muni.name} (${muni.province}).`;
  return { title: `${muni.name} · Impacto Acumulado`, description };
}

export default async function MunicipalityPage({ params }: { params: Promise<Params> }) {
  const { ine } = await params;
  const [muni, stats, areas, projects, documents] = await Promise.all([
    findMunicipality(ine),
    loadMunicipalityStats(),
    loadMunicipalityProtectedAreas(),
    loadProjects(),
    loadDocuments(),
  ]);
  if (!muni) notFound();

  const s = stats.get(ine);
  const here = projects.filter((p) => p.ineCodes.includes(ine)).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  const docsByProject = groupDocumentsByProject(documents);

  return (
    <article>
      <p className={`dato ${styles.eyebrow}`}>
        Provincia de {muni.province} · INE {muni.ine}
      </p>
      <h1 className={`display ${styles.nombre}`}>{muni.name}</h1>

      {s ? (
        <Totals stats={s} />
      ) : (
        <section aria-labelledby="totales" className={styles.vacio}>
          <h2 id="totales">Totales</h2>
          <p>Ningún proyecto registrado en los boletines desde 2019 para este municipio.</p>
        </section>
      )}

      <Sensitivity share={muni.sensitivityHighShare} />
      <ProtectedAreas areas={areas.get(ine) ?? []} />

      <section aria-labelledby="proyectos" className={styles.proyectos}>
        <h2 id="proyectos">Proyectos ({formatInt(here.length)})</h2>
        {here.map((p) => (
          <ProjectRecord key={p.id} project={p} documents={docsByProject.get(p.id) ?? []} />
        ))}
      </section>

      <p>
        <Link href="/">Volver al mapa</Link>
      </p>
    </article>
  );
}
