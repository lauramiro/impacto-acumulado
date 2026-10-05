import "server-only";
import { readFile } from "node:fs/promises";
import type { Developer } from "@/lib/types";
import { dataFile } from "./paths";
import { SplittingFileSchema } from "./schemas";

/**
 * Projects each under 50 MW that together exceed it (pipeline/impacto/aggregate/splitting.py):
 * by developer family ("familia"), or by shared evacuation infrastructure ("infraestructura"),
 * with the evacuation projects and substation names that join them.
 */
export type SplittingGroup = {
  kind: "familia" | "infraestructura";
  family: string | null;
  projectIds: number[];
  mwTotal: number;
  ineCodes: string[];
  firstSeen: [string, string];
  infrastructure: { projectIds: number[]; substations: string[] } | null;
};

export async function loadSplittingGroups(): Promise<SplittingGroup[]> {
  const raw = SplittingFileSchema.parse(JSON.parse(await readFile(dataFile("splitting_candidates.json"), "utf-8")));
  return raw.map((g) => ({
    kind: g.kind,
    family: g.family,
    projectIds: g.project_ids,
    mwTotal: g.mw_total,
    ineCodes: g.ine_codes,
    firstSeen: g.first_seen,
    infrastructure: g.infrastructure ? { projectIds: g.infrastructure.project_ids, substations: g.infrastructure.substations } : null,
  }));
}

/**
 * A readable name for a group's family: the one company's name, the name the
 * groups file gives its spellings, or the words its companies' names share
 * ("Tayant Investment" for Tayant Investment 12 to 15). The family key, as
 * words, when no developer of the family is in the group. An infrastructure
 * group has no family: it is named by what joins it.
 */
export function familyLabel(group: SplittingGroup, developers: readonly Developer[]): string {
  if (group.family === null) return "Misma infraestructura de evacuación";
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

/** The groups a developer page shows: its family's, and the infrastructure groups any of its projects is in. */
export function developerSplittingGroups(groups: readonly SplittingGroup[], developer: Developer): SplittingGroup[] {
  const ids = new Set(developer.projectIds);
  return groups.filter((g) => (g.kind === "familia" ? g.family === developer.family : g.projectIds.some((id) => ids.has(id))));
}
