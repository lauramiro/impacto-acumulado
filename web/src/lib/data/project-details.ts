import "server-only";
import { readFile } from "node:fs/promises";
import { dataFile } from "./paths";
import { CONDITION_CATEGORIES, type DocumentLocationSchema, ProjectDetailsFileSchema } from "./schemas";
import type { z } from "zod";

export type ConditionCategory = (typeof CONDITION_CATEGORIES)[number];

type RawLocation = z.infer<typeof DocumentLocationSchema>;

export type LocationPoint = { label: string | null; x: number; y: number; lon: number; lat: number };

/** One table or list of coordinates a document prints, converted to longitude and latitude. */
export type LocationGroup = {
  kind: "puntos" | "poligono";
  zone: 29 | 30;
  /** False when the document gives no zone and the export chose the one that places the points in the project's municipalities. */
  zoneStated: boolean;
  datum: "ETRS89" | "ED50";
  /** The heading that announces the coordinates, quoted from the document. */
  evidence: string | null;
  points: LocationPoint[];
};

/** Where one document places the project: read by rule from its text, or the model's reading when the rule finds nothing. */
export type DocumentLocation = { source: "texto" | "modelo"; groups: LocationGroup[] };

function toLocation(raw: RawLocation | null | undefined): DocumentLocation | null {
  if (!raw) return null;
  return {
    source: raw.source,
    groups: raw.groups.map((g) => ({
      kind: g.kind,
      zone: g.zone,
      zoneStated: g.zone_stated,
      datum: g.datum,
      evidence: g.evidence,
      points: g.points,
    })),
  };
}

/** What one document's extraction holds beyond the fact sheet. */
export type DocumentDetails = {
  documentId: number;
  expediente: string | null;
  conditions: { category: ConditionCategory; text: string }[];
  species: string[];
  protectedAreas: string[];
  /** Field name (mw_nominal, hectares...) to a short quote from the document. */
  evidence: Record<string, string>;
  location: DocumentLocation | null;
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
          location: toLocation(d.location),
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
