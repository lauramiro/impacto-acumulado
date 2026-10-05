import type { DeveloperRow } from "@/components/developer-index";
import { APPROVED_OR_PENDING, type Developer, type Project } from "./types";

/** The MW a project adds to a total: nominal, else the declared peak; none for an evacuation line (as in every aggregate). */
export function projectMwBest(p: Project): number | null {
  if (p.technology === "linea_evacuacion") return null;
  return p.mwNominal ?? p.mwPeak;
}

export type DeveloperTotal = { projects: number; mw: number; withMw: number; peak: number };

/** Totals for a set of projects, split as on the home page: approved or pending, and refused or lapsed. */
export function developerTotals(projects: readonly Project[]): { accumulating: DeveloperTotal; refused: DeveloperTotal } {
  const zero = (): DeveloperTotal => ({ projects: 0, mw: 0, withMw: 0, peak: 0 });
  const out = { accumulating: zero(), refused: zero() };
  for (const p of projects) {
    const t = APPROVED_OR_PENDING.includes(p.status) ? out.accumulating : out.refused;
    t.projects += 1;
    const mw = projectMwBest(p);
    if (mw !== null) {
      t.mw += mw;
      t.withMw += 1;
      if (p.mwNominal === null) t.peak += 1;
    }
  }
  return out;
}

/** A project's developer field as printed, name by name, with the key of each name that has a page. */
export function developerParts(developer: string | null, keys: ReadonlyMap<string, string>): { name: string; key: string | null }[] {
  return (developer ?? "")
    .split(";")
    .map((n) => n.trim())
    .filter((n) => n !== "")
    .map((name) => ({ name, key: keys.get(name) ?? null }));
}

/** Developers with the most projects first, then by name. */
export function byProjectCount(a: Developer, b: Developer): number {
  return b.projectIds.length - a.projectIds.length || a.name.localeCompare(b.name, "es");
}

/** Companies added up: a corporate group a source names, or a naming family (the name without its final number). */
export type RollupRow = DeveloperRow & {
  /** "grupo" when developer_groups.csv names a parent company with its source, else "familia". */
  kind: "grupo" | "familia";
  companies: number;
  parentCompany: string | null;
  sourceUrl: string | null;
};

/** The words every name starts with, ignoring case ("Tayant Investment" for Tayant Investment 12 and 15), without trailing punctuation. */
function sharedPrefix(names: readonly string[]): string {
  const words = names.map((n) => n.split(/\s+/));
  const shared: string[] = [];
  const same = (w: string[], i: number) => i < w.length - 1 && w[i].toLowerCase() === words[0][i].toLowerCase();
  for (let i = 0; words.length > 0 && words.every((w) => same(w, i)); i++) shared.push(words[0][i]);
  return shared.join(" ").replace(/[,;.\s]+$/, "");
}

/**
 * One row per corporate group (a parent company with a source) and per naming
 * family of two or more companies, its projects counted once however many of
 * its companies a project names. A family is a naming pattern, not a finding
 * that the companies are related; its row says so and names no parent.
 */
export function developerRollups(developers: readonly Developer[], projects: ReadonlyMap<number, Project>): RollupRow[] {
  const byRollup = new Map<string, Developer[]>();
  for (const d of developers) {
    const key = d.parentCompany && d.group ? `grupo:${d.group}` : `familia:${d.family}`;
    byRollup.set(key, [...(byRollup.get(key) ?? []), d]);
  }
  const rows: RollupRow[] = [];
  for (const [key, members] of byRollup) {
    const grupo = key.startsWith("grupo:");
    if (!grupo && members.length < 2) continue;
    // The page of the company with most projects lists the others.
    const lead = [...members].sort((a, b) => b.projectIds.length - a.projectIds.length || a.name.localeCompare(b.name, "es"))[0];
    const ids = new Set(members.flatMap((d) => d.projectIds));
    const mine = [...ids].map((id) => projects.get(id)).filter((p) => p !== undefined);
    const t = developerTotals(mine);
    const spelling = members.every((d) => d.group !== null && d.group === members[0].group) ? members[0].group : null;
    rows.push({
      key: lead.key,
      kind: grupo ? "grupo" : "familia",
      name: grupo ? lead.group! : (spelling ?? (sharedPrefix(members.map((d) => d.name)) || lead.family.replace(/-/g, " "))),
      names: members.flatMap((d) => d.names),
      companies: members.length,
      projects: mine.length,
      accumulatingMw: t.accumulating.mw,
      accumulatingWithMw: t.accumulating.withMw,
      refused: t.refused.projects,
      municipalities: new Set(mine.flatMap((p) => p.ineCodes)).size,
      parentCompany: grupo ? lead.parentCompany : null,
      sourceUrl: grupo ? lead.sourceUrl : null,
    });
  }
  return rows.sort((a, b) => b.projects - a.projects || a.name.localeCompare(b.name, "es"));
}
