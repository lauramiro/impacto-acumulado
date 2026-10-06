import { loadDevelopers } from "@/lib/data/developers";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjectDetails } from "@/lib/data/project-details";
import { loadProjects } from "@/lib/data/projects";
import { loadProtectedAreaStats } from "@/lib/data/protected-area-stats";
import { formatInt } from "@/lib/format";
import { TECHNOLOGY_LABELS } from "@/lib/labels";
import { distinctExpedientes } from "@/lib/project-index";
import type { SearchEntry } from "@/lib/site-search";

// Built once with the site; the header search fetches it the first time someone uses the box.
export const dynamic = "force-static";

export async function GET() {
  const [munis, projects, details, developers, sites] = await Promise.all([
    loadMunicipalities(),
    loadProjects(),
    loadProjectDetails(),
    loadDevelopers(),
    loadProtectedAreaStats(),
  ]);
  const muniName = new Map(munis.map((m) => [m.ine, m.name]));
  const entries: SearchEntry[] = [
    ...munis.map((m): SearchEntry => ({ kind: "municipio", name: m.name, detail: m.province, href: `/municipio/${m.ine}`, keys: [] })),
    ...sites.map(
      (s): SearchEntry => ({
        kind: "espacio",
        name: s.name,
        detail: `${s.type} · ${s.siteCode}`,
        // No page of its own: the home page opens with the Natura layer and its table filtered to the site.
        href: `/?natura=1&espacio=${encodeURIComponent(s.siteCode)}#natura`,
        keys: [s.siteCode],
      }),
    ),
    ...developers.map(
      (d): SearchEntry => ({
        kind: "promotor",
        name: d.name,
        detail: `${formatInt(d.projectIds.length)} ${d.projectIds.length === 1 ? "proyecto" : "proyectos"}`,
        href: `/promotor/${d.key}`,
        keys: d.names.filter((n) => n !== d.name),
      }),
    ),
    ...projects.map((p): SearchEntry => {
      const places = p.ineCodes.map((ine) => muniName.get(ine)).filter((n): n is string => n !== undefined);
      return {
        kind: "proyecto",
        name: p.name,
        detail: [TECHNOLOGY_LABELS[p.technology], places.length > 2 ? `${places[0]} y ${formatInt(places.length - 1)} más` : places.join(", ")].filter(Boolean).join(" · "),
        href: `/proyecto/${p.id}`,
        keys: distinctExpedientes((details.get(p.id) ?? []).map((d) => d.expediente)),
      };
    }),
  ];
  return Response.json(entries, { headers: { "Cache-Control": "public, max-age=3600" } });
}
