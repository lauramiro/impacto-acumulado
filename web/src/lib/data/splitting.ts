import "server-only";
import { readFile } from "node:fs/promises";
import type { Developer } from "@/lib/types";
import { dataFile } from "./paths";
import { SplittingFileSchema } from "./schemas";

/** Sibling projects each under 50 MW that together exceed it (pipeline/impacto/aggregate/splitting.py). */
export type SplittingGroup = { family: string; projectIds: number[]; mwTotal: number; ineCodes: string[]; firstSeen: [string, string] };

export async function loadSplittingGroups(): Promise<SplittingGroup[]> {
  const raw = SplittingFileSchema.parse(JSON.parse(await readFile(dataFile("splitting_candidates.json"), "utf-8")));
  return raw.map((g) => ({ family: g.family, projectIds: g.project_ids, mwTotal: g.mw_total, ineCodes: g.ine_codes, firstSeen: g.first_seen }));
}

/**
 * A readable name for a group's family: the one company's name, the name the
 * groups file gives its spellings, or the words its companies' names share
 * ("Tayant Investment" for Tayant Investment 12 to 15). The family key, as
 * words, when no developer of the family is in the group.
 */
export function familyLabel(group: SplittingGroup, developers: readonly Developer[]): string {
  const ids = new Set(group.projectIds);
  const devs = developers.filter((d) => d.family === group.family && d.projectIds.some((id) => ids.has(id)));
  if (devs.length === 1) return devs[0].name;
  const named = devs[0]?.group;
  if (named && devs.every((d) => d.group === named)) return named;
  const words = devs.map((d) => d.name.split(/\s+/));
  const shared: string[] = [];
  for (let i = 0; words.length > 0 && words.every((w) => i < w.length && w[i] === words[0][i]); i++) shared.push(words[0][i]);
  const prefix = shared.join(" ").replace(/[,;.\s]+$/, "");
  return prefix || group.family.replace(/-/g, " ");
}
