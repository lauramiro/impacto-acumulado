import { fold } from "./search";
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
