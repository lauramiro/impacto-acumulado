import type { MetadataRoute } from "next";
import { loadDevelopers } from "@/lib/data/developers";
import { loadMeta } from "@/lib/data/meta";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjects } from "@/lib/data/projects";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [meta, munis, projects, developers] = await Promise.all([loadMeta(), loadMunicipalities(), loadProjects(), loadDevelopers()]);
  const lastModified = meta.generatedAt;
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/metodologia`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/datos`, lastModified, changeFrequency: "weekly", priority: 0.5 },
    ...munis.map((m) => ({ url: `${SITE_URL}/municipio/${m.ine}`, lastModified, changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/promotores`, lastModified, changeFrequency: "weekly", priority: 0.5 },
    ...developers.map((d) => ({ url: `${SITE_URL}/promotor/${d.key}`, lastModified, changeFrequency: "weekly" as const, priority: 0.4 })),
    ...projects.map((p) => ({ url: `${SITE_URL}/proyecto/${p.id}`, lastModified, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
