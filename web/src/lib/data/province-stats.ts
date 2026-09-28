import "server-only";
import { readFile } from "node:fs/promises";
import { SCOPES, type ProvinceStats } from "@/lib/types";
import { dataFile } from "./paths";
import { ProvinceStatsFileSchema } from "./schemas";
import { toCell } from "./stats";

export async function loadProvinceStats(): Promise<ProvinceStats> {
  const file = ProvinceStatsFileSchema.parse(JSON.parse(await readFile(dataFile("province_stats.json"), "utf-8")));
  return Object.fromEntries(SCOPES.map((s) => [s, file[s].cells.map(toCell)])) as ProvinceStats;
}
