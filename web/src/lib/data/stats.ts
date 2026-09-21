import "server-only";
import { readFile } from "node:fs/promises";
import type { MunicipalityStats, Status, StatusFigures, Technology, TechnologyFigures } from "@/lib/types";
import { dataFile } from "./paths";
import { StatsFileSchema } from "./schemas";

export async function loadMunicipalityStats(): Promise<Map<string, MunicipalityStats>> {
  const file = StatsFileSchema.parse(JSON.parse(await readFile(dataFile("municipality_stats.json"), "utf-8")));
  const out = new Map<string, MunicipalityStats>();
  for (const [ine, e] of Object.entries(file)) {
    const byStatus: Partial<Record<Status, StatusFigures>> = {};
    for (const [status, f] of Object.entries(e.by_status)) {
      if (!f) continue;
      byStatus[status as Status] = { projectCount: f.project_count, mwNominal: f.mw_nominal, hectares: f.hectares, turbines: f.turbines };
    }
    const byTechnology: Partial<Record<Technology, TechnologyFigures>> = {};
    for (const [tech, f] of Object.entries(e.by_technology)) {
      if (!f) continue;
      byTechnology[tech as Technology] = { projectCount: f.project_count, mwNominal: f.mw_nominal, hectares: f.hectares };
    }
    out.set(ine, { byStatus, byTechnology, mwTotal: e.mw_total, haTotal: e.ha_total, countTotal: e.count_total });
  }
  return out;
}
