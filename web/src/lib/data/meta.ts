import "server-only";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { dataFile } from "./paths";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Count = z.number().int().nonnegative();
const CoverageCounts = z.object({ total_hits: Count, received: Count, selected: Count, stored: Count });

/** pipeline/impacto/fetch/coverage.py: the BOJA search against the stored documents, same selection. */
const BojaCoverageSchema = CoverageCounts.extend({
  checked: DAY,
  from: DAY,
  queries: z.array(z.string()),
  complete: z.boolean(),
  years: z.record(z.string(), CoverageCounts),
  missing: z.array(z.string()),
  missing_count: Count,
}).refine((c) => c.stored <= c.selected, { message: "more BOJA documents stored than selected" });

const MetaSchema = z.object({
  generated_at: z.string(),
  // Older exports have neither; the site then leaves them out.
  last_document: DAY.nullable().optional(),
  boja_coverage: BojaCoverageSchema.nullable().optional(),
  counts: z.object({
    raw_documents: z.number().int(),
    extractions: z.number().int(),
    projects: z.number().int(),
    municipalities: z.number().int(),
    protected_areas: z.number().int(),
  }),
  files: z.record(z.string(), z.object({ rows: z.number().int().nonnegative(), bytes: z.number().int().positive() })),
});

export type BojaCoverage = z.infer<typeof BojaCoverageSchema>;

export type Meta = {
  generatedAt: Date;
  /** Newest publication date among the stored documents, YYYY-MM-DD. */
  lastDocument: string | null;
  bojaCoverage: BojaCoverage | null;
  counts: z.infer<typeof MetaSchema>["counts"];
  files: z.infer<typeof MetaSchema>["files"];
};

export async function loadMeta(): Promise<Meta> {
  const raw = MetaSchema.parse(JSON.parse(await readFile(dataFile("meta.json"), "utf-8")));
  return {
    generatedAt: new Date(raw.generated_at),
    lastDocument: raw.last_document ?? null,
    bojaCoverage: raw.boja_coverage ?? null,
    counts: raw.counts,
    files: raw.files,
  };
}
