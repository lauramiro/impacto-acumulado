import "server-only";
import { readFile } from "node:fs/promises";
import type { ProtectedAreaStats } from "@/lib/types";
import { dataFile } from "./paths";
import { ProtectedAreaStatsFileSchema } from "./schemas";
import { siteName } from "./site-names";
import { toCell } from "./stats";

export async function loadProtectedAreaStats(): Promise<ProtectedAreaStats[]> {
  const file = ProtectedAreaStatsFileSchema.parse(JSON.parse(await readFile(dataFile("protected_area_stats.json"), "utf-8")));
  return Object.entries(file)
    .map(([siteCode, s]) => ({ siteCode, name: siteName(siteCode, s.name), type: s.type, municipalityCount: s.municipality_count, cells: s.cells.map(toCell) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
