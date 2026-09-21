import "server-only";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { dataFile } from "./paths";

const MetaSchema = z.object({
  generated_at: z.string(),
  counts: z.object({
    raw_documents: z.number().int(),
    extractions: z.number().int(),
    projects: z.number().int(),
    municipalities: z.number().int(),
    protected_areas: z.number().int(),
  }),
});

export type Meta = {
  generatedAt: Date;
  counts: z.infer<typeof MetaSchema>["counts"];
};

export async function loadMeta(): Promise<Meta> {
  const raw = MetaSchema.parse(JSON.parse(await readFile(dataFile("meta.json"), "utf-8")));
  return { generatedAt: new Date(raw.generated_at), counts: raw.counts };
}
