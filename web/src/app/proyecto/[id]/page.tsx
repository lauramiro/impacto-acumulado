import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Conditions, Mentions } from "@/components/project/conditions";
import { DocumentTimeline } from "@/components/project/document-timeline";
import { FactSheet, type FieldEvidence } from "@/components/project/fact-sheet";
import { Provenance } from "@/components/project/provenance";
import { ReportError } from "@/components/report-error";
import { RecordHeader } from "@/components/project/record-header";
import { keysByPrintedName, loadDevelopers } from "@/lib/data/developers";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { distinctNames, loadProjectDetails } from "@/lib/data/project-details";
import { loadProjectRecord } from "@/lib/data/project-record";
import { loadSplittingGroups } from "@/lib/data/splitting";
import { SplittingNote } from "@/components/splitting-note";
import { loadProjects } from "@/lib/data/projects";
import { formatMw } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/labels";
import styles from "./page.module.css";

type Params = { id: string };

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  const projects = await loadProjects();
  return projects.map((p) => ({ id: String(p.id) }));
}

function parseId(id: string): number | null {
  return /^\d+$/.test(id) ? Number(id) : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const n = parseId(id);
  const record = n === null ? null : await loadProjectRecord(n);
  if (!record) return { title: "Proyecto no encontrado · Impacto Acumulado" };
  const { project } = record;
  const munis = await loadMunicipalities();
  const names = project.ineCodes
    .map((ine) => munis.find((m) => m.ine === ine)?.name)
    .filter((name): name is string => name !== undefined);
  const mw = project.mwNominal === null ? "potencia no indicada" : formatMw(project.mwNominal);
  return {
    title: `${project.name} · Impacto Acumulado`,
    description: `${STATUS_LABELS[project.status]}, ${mw}, en ${names.join(", ")}. Resoluciones del BOE y el BOJA.`,
  };
}

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const n = parseId(id);
  const [record, munis, developers, allDetails] = await Promise.all([
    n === null ? null : loadProjectRecord(n),
    loadMunicipalities(),
    loadDevelopers(),
    loadProjectDetails(),
  ]);
  const [allProjects, splitting] = await Promise.all([loadProjects(), loadSplittingGroups()]);
  const projectsById = new Map(allProjects.map((p) => [p.id, p]));
  if (!record) notFound();
  const details = allDetails.get(record.project.id) ?? [];
  const docById = new Map(record.documents.map((d) => [d.id, d]));
  // Newest document first, as the fact sheet takes each figure from the newest document that states it.
  const evidence: FieldEvidence = {};
  for (const d of [...details].reverse()) {
    const doc = docById.get(d.documentId);
    if (!doc) continue;
    for (const [field, quote] of Object.entries(d.evidence)) (evidence[field] ??= []).push({ quote, doc });
  }
  const expedientes = distinctNames(details.map((d) => (d.expediente ? [d.expediente] : [])));
  const here = record.project.ineCodes.map((ine) => munis.find((m) => m.ine === ine)).filter((m) => m !== undefined);
  return (
    <article className={styles.page}>
      <RecordHeader project={record.project} developerKeys={keysByPrintedName(developers)} />
      <FactSheet project={record.project} municipalities={here} evidence={evidence} expedientes={expedientes} />
      {splitting
        .filter((g) => g.projectIds.includes(record.project.id))
        .map((g) => (
          <SplittingNote key={g.projectIds.join("-")} group={g} projects={projectsById} current={record.project.id} />
        ))}
      <Conditions details={details} documents={record.documents} />
      <Mentions species={distinctNames(details.map((d) => d.species))} areas={distinctNames(details.map((d) => d.protectedAreas))} />
      {/* record.statusDocument, not record.project.statusDocumentId: loadProjectRecord
          already nulls it for a "desconocido" project (status_document_id still names
          a real document - the latest one - even though nothing resolved the status),
          so the timeline mark and the Provenance section below agree by construction. */}
      <DocumentTimeline documents={record.documents} statusDocumentId={record.statusDocument?.id ?? null} />
      <Provenance statusDocument={record.statusDocument} latestDocument={record.latestDocument} />
      <p>
        <Link href="/">Volver al mapa</Link>
      </p>
      <ReportError subject={`el proyecto ${record.project.id} (${record.project.name})`} path={`/proyecto/${record.project.id}`} />
    </article>
  );
}
