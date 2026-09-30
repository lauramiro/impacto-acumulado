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
    mwNominal: c.mw_nominal,
    mwCount: c.mw_count,
    hectares: c.hectares,
    haCount: c.ha_count,
  };
}

export async function loadMunicipalityStats(): Promise<Map<string, MunicipalityStats>> {
  const file = StatsFileSchema.parse(JSON.parse(await readFile(dataFile("municipality_stats.json"), "utf-8")));
  return new Map(Object.entries(file).map(([ine, e]) => [ine, { cells: e.cells.map(toCell) }]));
}
