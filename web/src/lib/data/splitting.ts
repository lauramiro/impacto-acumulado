import "server-only";
import { readFile } from "node:fs/promises";
import { dataFile } from "./paths";
import { SplittingFileSchema } from "./schemas";

/** Sibling projects each under 50 MW that together exceed it (pipeline/impacto/aggregate/splitting.py). */
export type SplittingGroup = { family: string; projectIds: number[]; mwTotal: number; ineCodes: string[]; firstSeen: [string, string] };

export async function loadSplittingGroups(): Promise<SplittingGroup[]> {
  const raw = SplittingFileSchema.parse(JSON.parse(await readFile(dataFile("splitting_candidates.json"), "utf-8")));
  return raw.map((g) => ({ family: g.family, projectIds: g.project_ids, mwTotal: g.mw_total, ineCodes: g.ine_codes, firstSeen: g.first_seen }));
}
