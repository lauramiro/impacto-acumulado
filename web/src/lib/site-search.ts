import { expedienteKey } from "./project-index";
import { fold } from "./search";

export type SearchKind = "municipio" | "espacio" | "promotor" | "proyecto";

/** One thing the header search can find: a place, a protected site, a developer or a project. */
export type SearchEntry = {
  kind: SearchKind;
  name: string;
  /** What it is, shown beside the name: "Sevilla", "ZEC · ES6150019", "4 proyectos". */
  detail: string;
  href: string;
  /** Other text that finds it but is not shown: expediente numbers, a site code, other spellings. */
  keys: string[];
};

/** Places first: most visitors come for one (PRODUCT.md, principle 3). */
const KIND_ORDER: Record<SearchKind, number> = { municipio: 0, espacio: 1, promotor: 2, proyecto: 3 };

export const KIND_LABELS: Record<SearchKind, string> = {
  municipio: "Municipio",
  espacio: "Red Natura 2000",
  promotor: "Promotor",
  proyecto: "Proyecto",
};

/**
 * How well an entry answers the query, lower is better, or null for no match: the name starts
 * with it, a word in the name starts with it, the name contains it, then another key matches
 * (an expediente whatever its separators, a site code, another spelling).
 */
export function matchRank(e: Pick<SearchEntry, "name" | "keys">, query: string): number | null {
  const q = fold(query.trim());
  if (q === "") return null;
  const name = fold(e.name);
  if (name.startsWith(q)) return 0;
  if (name.split(/[\s«»"'(),.;/-]+/).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  if (e.keys.some((k) => fold(k).includes(q))) return 3;
  const key = expedienteKey(query);
  if (key.length >= 4 && e.keys.some((k) => expedienteKey(k).includes(key))) return 3;
  return null;
}

/** The best `limit` entries for the query: by rank, then places before projects, then the shorter name. */
export function searchSite(entries: readonly SearchEntry[], query: string, limit = 10): SearchEntry[] {
  const found: { e: SearchEntry; rank: number }[] = [];
  for (const e of entries) {
    const rank = matchRank(e, query);
    if (rank !== null) found.push({ e, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank || KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind] || a.e.name.length - b.e.name.length || a.e.name.localeCompare(b.e.name, "es"))
    .slice(0, limit)
    .map((x) => x.e);
}
