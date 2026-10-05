import "server-only";
import { readFile } from "node:fs/promises";
import { dataFile } from "./paths";
import { CONDITION_CATEGORIES, ProjectDetailsFileSchema } from "./schemas";

export type ConditionCategory = (typeof CONDITION_CATEGORIES)[number];

/** What one document's extraction holds beyond the fact sheet. */
export type DocumentDetails = {
  documentId: number;
  expediente: string | null;
  conditions: { category: ConditionCategory; text: string }[];
  species: string[];
  protectedAreas: string[];
  /** Field name (mw_nominal, hectares...) to a short quote from the document. */
  evidence: Record<string, string>;
};

let cache: Promise<Map<number, DocumentDetails[]>> | null = null;

/** Every project's details, read once per build: the file is large and each project page needs one entry. */
export function loadProjectDetails(): Promise<Map<number, DocumentDetails[]>> {
  cache ??= readFile(dataFile("project_details.json"), "utf-8").then((text) => {
    const raw = ProjectDetailsFileSchema.parse(JSON.parse(text));
    return new Map(
      Object.entries(raw).map(([id, docs]) => [
        Number(id),
        docs.map((d) => ({
          documentId: d.document_id,
          expediente: d.expediente,
          conditions: d.conditions,
          species: d.species_mentioned,
          protectedAreas: d.protected_areas_mentioned,
          evidence: Object.fromEntries(Object.entries(d.evidence).map(([k, v]) => [k, unquote(v)])),
        })),
      ]),
    );
  });
  return cache;
}

/** The model sometimes wraps a quote in quotation marks of its own, or adds markdown emphasis. */
export function unquote(s: string): string {
  return s.replaceAll("**", "").replace(/^["'«“]+|["'»”]+$/g, "").trim();
}

const caseless = (n: string) => n.toLocaleLowerCase("es");

/**
 * Names once each across documents, in the longest spelling seen (the first, between equals), sorted.
 * Two names are the same when `key` gives the same string; by default, ignoring case.
 */
export function distinctNames(lists: readonly string[][], key: (name: string) => string = caseless): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const n of list) {
      const k = key(n);
      const prev = seen.get(k);
      if (prev === undefined || n.length > prev.length) seen.set(k, n);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Natura 2000 and bird-area designations, spelled out or abbreviated, as the documents write them. */
const DESIGNATIONS: [string, RegExp][] = [
  ["zepa", /\bzona de especial proteccion para las aves\b|\bzepa\b/g],
  ["zec", /\bzona (?:especial de|de especial) conservacion\b|\bzec\b/g],
  ["lic", /\blugar de importancia comunitaria\b|\blic\b/g],
  ["ziae", /\bzona de importancia para las aves esteparias(?: de andalucia)?\b|\bziae\b/g],
  ["iba", /\barea importante para la conservacion de las aves(?: y la biodiversidad)?\b|\bimportant bird areas?\b|\bibas?\b/g],
];

const CONNECTORS = new Set(["y", "e", "de", "del", "la", "las", "los", "el", "n"]);

/**
 * Same site, however the document spells it: "Red Natura 2000 (ZEC Andévalo Occidental)" and
 * "Zona Especial de Conservación (ZEC) Andévalo Occidental (ES6150010)" are one ZEC. Only names
 * with a designation and a site name are matched this way; anything else falls back to ignoring case.
 */
export function protectedAreaKey(name: string): string {
  let s = caseless(name).normalize("NFD").replace(/\p{M}/gu, "");
  const kinds = new Set<string>();
  for (const [kind, re] of DESIGNATIONS) {
    s = s.replace(re, () => {
      kinds.add(kind);
      return " ";
    });
  }
  const words = s
    .replace(/\bred natura 2000\b/g, " ")
    .replace(/\bes\d{5,}\b/g, " ")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  // What the designations leave around the name: "ZEC y ZEPA", "IBA n.º 264-".
  while (words.length > 0 && CONNECTORS.has(words[0]!)) words.shift();
  while (words.length > 0 && CONNECTORS.has(words.at(-1)!)) words.pop();
  const site = words.join(" ");
  if (kinds.size === 0 || site === "") return caseless(name);
  return `${[...kinds].sort().join("+")}:${site}`;
}
