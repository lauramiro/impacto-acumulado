import "server-only";
import { readFile } from "node:fs/promises";
import type { z } from "zod";
import type { MunicipalityStats, StatsCell } from "@/lib/types";
import { dataFile } from "./paths";
import { StatsFileSchema, type CellSchema } from "./schemas";

export function toCell(c: z.infer<typeof CellSchema>): StatsCell {
  return {
    status: c.status,
    technology: c.technology,
    projectCount: c.project_count,
    // The site sums the best figure: nominal MW, or the peak where only the
    // peak is declared. mw_count counts nominal figures only, so the peak
    // fallbacks are added to it.
    mwBest: c.mw_best,
    mwCount: c.mw_count + c.mw_peak_fallback_count,
    mwPeakCount: c.mw_peak_fallback_count,
    hectares: c.hectares,
    haCount: c.ha_count,
  };
}

export async function loadMunicipalityStats(): Promise<Map<string, MunicipalityStats>> {
  const file = StatsFileSchema.parse(JSON.parse(await readFile(dataFile("municipality_stats.json"), "utf-8")));
  return new Map(Object.entries(file).map(([ine, e]) => [ine, { cells: e.cells.map(toCell) }]));
}
