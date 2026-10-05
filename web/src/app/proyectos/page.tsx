import type { Metadata } from "next";
import { ProjectIndex } from "@/components/project-index";
import { loadProjectDetails } from "@/lib/data/project-details";
import { loadProjects } from "@/lib/data/projects";
import { distinctExpedientes, type ProjectRow } from "@/lib/project-index";

export const metadata: Metadata = {
  title: "Proyectos · Impacto Acumulado",
  description:
    "Todos los proyectos renovables evaluados en Andalucía según el BOE y el BOJA, con búsqueda por nombre, promotor o número de expediente y filtro por estado.",
};

export default async function ProjectsPage() {
  const [projects, details] = await Promise.all([loadProjects(), loadProjectDetails()]);
  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    developer: p.developer,
    technology: p.technology,
    status: p.status,
    mwNominal: p.mwNominal,
    mwPeak: p.mwPeak,
    provinces: p.provinces,
    expedientes: distinctExpedientes((details.get(p.id) ?? []).map((d) => d.expediente)),
  }));
  return (
    <article>
      <h1>Proyectos</h1>
      <ProjectIndex rows={rows} />
    </article>
  );
}
