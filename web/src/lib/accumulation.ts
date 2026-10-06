import { APPROVED_OR_PENDING, type Project } from "@/lib/types";

/** One project added to the running total, on the date of its first notice in the bulletin. */
export type AccumulationStep = {
  date: string;
  projectId: number;
  name: string;
  /** The project's MW as the totals count it: nominal, else the peak; null when it declares neither, or for a line. */
  mw: number | null;
  /** An evacuation line: counted as a project, its power already counted in the plants it serves. */
  line: boolean;
  /** Running MW after this project, counting only projects that declare a figure. */
  total: number;
  /** Running number of projects after this one, with or without a figure. */
  count: number;
};

/** The figure the totals use for a project: mw_best in the export (nominal, else the peak). */
export const projectMwBest = (p: Pick<Project, "mwNominal" | "mwPeak">): number | null => p.mwNominal ?? p.mwPeak;

/**
 * How the municipality's approved or pending load built up: the projects that are approved or
 * pending today, ordered by their first notice. A project in several municipalities counts its
 * whole figure here, as the totals do, and an evacuation line adds a project but no MW, so the
 * last step equals the totals table.
 */
export function accumulation(projects: readonly Project[], ine: string): AccumulationStep[] {
  const here = projects
    .filter((p) => p.ineCodes.includes(ine) && APPROVED_OR_PENDING.includes(p.status))
    .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.id - b.id);
  let total = 0;
  return here.map((p, i) => {
    const line = p.technology === "linea_evacuacion";
    const mw = line ? null : projectMwBest(p);
    total += mw ?? 0;
    return { date: p.firstSeen, projectId: p.id, name: p.name, mw, line, total, count: i + 1 };
  });
}
