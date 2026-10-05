import "server-only";
import { readFile } from "node:fs/promises";
import type { Developer } from "@/lib/types";
import { dataFile } from "./paths";
import { DevelopersFileSchema } from "./schemas";

export async function loadDevelopers(): Promise<Developer[]> {
  const raw = DevelopersFileSchema.parse(JSON.parse(await readFile(dataFile("developers.json"), "utf-8")));
  return raw.map((d) => ({
    key: d.key,
    name: d.name,
    names: d.names,
    family: d.family,
    group: d.group,
    parentCompany: d.parent_company,
    sourceUrl: d.source_url,
    projectIds: d.project_ids,
    mwCount: d.mw_count,
  }));
}

/** Printed developer name to its key, for linking a project's developer field name by name. */
export function keysByPrintedName(developers: readonly Developer[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of developers) for (const n of d.names) out.set(n, d.key);
  return out;
}

/**
 * Developers that share a key's family or group, without the developer
 * itself: sibling companies by naming pattern, or joined by hand in
 * pipeline/reference/developer_groups.csv.
 */
export function relatedDevelopers(developers: readonly Developer[], d: Developer): Developer[] {
  return developers.filter((o) => o.key !== d.key && (o.family === d.family || (d.group !== null && o.group === d.group)));
}
