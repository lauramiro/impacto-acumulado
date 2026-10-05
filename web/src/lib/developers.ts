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
