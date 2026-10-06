import type { Metadata } from "next";
import { DeveloperIndex, DeveloperRollupIndex, type DeveloperRow } from "@/components/developer-index";
import { byProjectCount, developerRollups, developerTotals } from "@/lib/developers";
import { loadDevelopers } from "@/lib/data/developers";
import { loadProjects } from "@/lib/data/projects";

export const metadata: Metadata = {
  title: "Promotores · Impacto Acumulado",
  description: "Las sociedades que promueven proyectos renovables evaluados en Andalucía, con sus proyectos y MW según el BOE y el BOJA.",
};

export default async function DevelopersPage() {
  const [developers, projects] = await Promise.all([loadDevelopers(), loadProjects()]);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const rows: DeveloperRow[] = [...developers].sort(byProjectCount).map((d) => {
    const mine = d.projectIds.map((id) => byId.get(id)).filter((p) => p !== undefined);
    const t = developerTotals(mine);
    return {
      key: d.key,
      name: d.name,
      names: d.names,
      projects: mine.length,
      accumulatingMw: t.accumulating.mw,
      accumulatingWithMw: t.accumulating.withMw,
      noVerdict: t.noVerdict.projects,
      refused: t.refused.projects,
      municipalities: new Set(mine.flatMap((p) => p.ineCodes)).size,
    };
  });
  return (
    <article>
      <h1>Promotores</h1>
      <DeveloperRollupIndex rows={developerRollups(developers, byId)} />
      <DeveloperIndex rows={rows} />
    </article>
  );
}
