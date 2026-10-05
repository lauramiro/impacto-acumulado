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

/** Names once each across documents, ignoring case, in the first spelling seen, sorted. */
export function distinctNames(lists: readonly string[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) for (const n of list) if (!seen.has(n.toLocaleLowerCase("es"))) seen.set(n.toLocaleLowerCase("es"), n);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
}
