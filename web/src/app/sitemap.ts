import type { MetadataRoute } from "next";
import { loadMeta } from "@/lib/data/meta";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjects } from "@/lib/data/projects";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [meta, munis, projects] = await Promise.all([loadMeta(), loadMunicipalities(), loadProjects()]);
  const lastModified = meta.generatedAt;
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/metodologia`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/datos`, lastModified, changeFrequency: "weekly", priority: 0.5 },
    ...munis.map((m) => ({ url: `${SITE_URL}/municipio/${m.ine}`, lastModified, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...projects.map((p) => ({ url: `${SITE_URL}/proyecto/${p.id}`, lastModified, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
