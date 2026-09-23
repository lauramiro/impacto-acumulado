import "server-only";
import type { GazetteDocument, Project } from "@/lib/types";
import { groupDocumentsByProject, loadDocuments } from "./documents";
import { loadProjects } from "./projects";

export type ProjectRecord = {
  project: Project;
  documents: GazetteDocument[];
  statusDocument: GazetteDocument | null;
  latestDocument: GazetteDocument | null;
};

export async function loadProjectRecord(id: number): Promise<ProjectRecord | null> {
  const [projects, documents] = await Promise.all([loadProjects(), loadDocuments()]);
  const project = projects.find((p) => p.id === id);
  if (!project) return null;
  const docs = groupDocumentsByProject(documents).get(id) ?? [];
  const rawStatusDocument = project.statusDocumentId === null ? null : (docs.find((d) => d.id === project.statusDocumentId) ?? null);
  if (project.statusDocumentId !== null && rawStatusDocument === null) {
    // resolve and export disagree: fail the build rather than show a status with no source.
    throw new Error(`projects.csv: project ${id} status_document_id ${project.statusDocumentId} is not among its documents`);
  }
  // derive_status (pipeline/impacto/resolve/status.py) seeds status_document_id
  // with the project's latest document before scanning for one that actually
  // resolves it, and never clears that seed when none does. So for a
  // "desconocido" project the column always holds a real document id, but it
  // is the latest document, not a deciding one: no document fixed the status.
  // Treat it as absent here so the page renders the "no resolving document"
  // copy instead of naming a document that did not, in fact, decide anything.
  const statusDocument = project.status === "desconocido" ? null : rawStatusDocument;
  return { project, documents: docs, statusDocument, latestDocument: docs.at(-1) ?? null };
}
