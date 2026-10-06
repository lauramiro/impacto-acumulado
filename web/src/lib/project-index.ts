import { fold, matches } from "./search";
import { STATUSES, type Project, type Status } from "./types";

/** One line of the project list. */
export type ProjectRow = Pick<Project, "id" | "name" | "developer" | "technology" | "status" | "mwNominal" | "mwPeak" | "provinces"> & {
  /** Every expediente number the project's documents carry, once each. */
  expedientes: string[];
};

/** Everything a search for a name, a developer, an expediente or a project number reads. */
export function projectSearchText(r: Pick<ProjectRow, "id" | "name" | "developer" | "expedientes">): string {
  return [r.name, r.developer ?? "", ...r.expedientes, `proyecto ${r.id}`].join(" \n ");
}

/** An expediente number with its separators (spaces, "/", "-", ".") taken out and folded: "AAU/HU/057/21" and "aau hu 057 21" both give "aauhu05721". */
export function expedienteKey(s: string): string {
  return fold(s).replace(/[\s/.-]+/g, "");
}

/**
 * Whether a project answers a search: the plain text match, or, for an expediente, the same
 * number whatever separators either side uses ("aau hu 057" finds "AAU/HU/057/21").
 */
export function matchesProject(r: Pick<ProjectRow, "id" | "name" | "developer" | "expedientes">, query: string): boolean {
  if (matches(projectSearchText(r), query)) return true;
  const key = expedienteKey(query);
  return key !== "" && r.expedientes.some((e) => expedienteKey(e).includes(key));
}

/** Statuses with at least one project, in the order the site lists them. */
export function statusesPresent(rows: readonly Pick<ProjectRow, "status">[]): Status[] {
  const present = new Set(rows.map((r) => r.status));
  return STATUSES.filter((s) => present.has(s));
}

/** The expediente numbers as the documents print them: trimmed, once each whatever the case or spacing. */
export function distinctExpedientes(values: readonly (string | null)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = v?.trim();
    if (!t) continue;
    const key = fold(t).replace(/\s+/g, " ");
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()];
}
