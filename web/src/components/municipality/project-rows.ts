import { projectMwBest } from "@/lib/accumulation";
import { gazetteRef } from "@/lib/document-label";
import { developerParts } from "@/lib/developers";
import { ROLE_LABELS } from "@/lib/labels";
import type { GazetteDocument, Project } from "@/lib/types";
import type { MunicipalityProjectRow } from "./project-table";

/** The rows of a municipality's project table, as plain data for the client table. */
export function municipalityProjectRows(
  projects: readonly Project[],
  documentsByProject: ReadonlyMap<number, GazetteDocument[]>,
  developerKeys: ReadonlyMap<string, string>,
): MunicipalityProjectRow[] {
  return projects.map((p) => {
    const docs = documentsByProject.get(p.id) ?? [];
    const last = docs.at(-1);
    return {
      id: p.id,
      name: p.name,
      developers: developerParts(p.developer, developerKeys),
      technology: p.technology,
      status: p.status,
      mw: projectMwBest(p),
      peakOnly: p.mwNominal === null && p.mwPeak !== null,
      elsewhere: p.ineCodes.length - 1,
      lastSeen: p.lastSeen,
      lastDocument: last ? { label: last.role ? ROLE_LABELS[last.role] : "Documento", url: last.url, ref: gazetteRef(last), date: last.publishedAt } : null,
      documentCount: docs.length,
    };
  });
}
