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
  const statusDocument = project.statusDocumentId === null ? null : (docs.find((d) => d.id === project.statusDocumentId) ?? null);
  if (project.statusDocumentId !== null && statusDocument === null) {
    // resolve and export disagree: fail the build rather than show a status with no source.
    throw new Error(`projects.csv: project ${id} status_document_id ${project.statusDocumentId} is not among its documents`);
  }
  return { project, documents: docs, statusDocument, latestDocument: docs.at(-1) ?? null };
}
