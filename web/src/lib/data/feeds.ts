import "server-only";
import type { FeedEntry } from "@/lib/feeds";
import { loadDocuments } from "./documents";
import { loadMeta } from "./meta";
import { loadProjects } from "./projects";
import { loadMunicipalityProtectedAreas } from "./protected-areas";

export type FeedIndex = {
  generatedAt: Date;
  all: FeedEntry[];
  byMunicipality: Map<string, FeedEntry[]>;
  bySite: Map<string, FeedEntry[]>;
};

let cached: Promise<FeedIndex> | null = null;

/**
 * Every document as a feed entry, indexed by the municipalities of its project
 * and by the Natura 2000 sites those municipalities touch (the site tables'
 * own municipal-scale rule). Built once per build: every feed route reads it.
 */
export function loadFeedIndex(): Promise<FeedIndex> {
  cached ??= build();
  return cached;
}

async function build(): Promise<FeedIndex> {
  const [docs, projects, areas, meta] = await Promise.all([loadDocuments(), loadProjects(), loadMunicipalityProtectedAreas(), loadMeta()]);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const all: FeedEntry[] = docs.map((doc) => ({ doc, projectName: doc.projectId !== null ? (byId.get(doc.projectId)?.name ?? null) : null }));
  const byMunicipality = new Map<string, FeedEntry[]>();
  const bySite = new Map<string, FeedEntry[]>();
  for (const entry of all) {
    const project = entry.doc.projectId !== null ? byId.get(entry.doc.projectId) : undefined;
    if (!project) continue;
    const sites = new Set<string>();
    for (const ine of project.ineCodes) {
      byMunicipality.set(ine, [...(byMunicipality.get(ine) ?? []), entry]);
      for (const a of areas.get(ine) ?? []) sites.add(a.siteCode);
    }
    for (const code of sites) bySite.set(code, [...(bySite.get(code) ?? []), entry]);
  }
  return { generatedAt: meta.generatedAt, all, byMunicipality, bySite };
}
