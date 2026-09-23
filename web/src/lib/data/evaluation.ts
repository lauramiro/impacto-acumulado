import "server-only";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Evaluation } from "@/lib/types";
import { dataFile } from "./paths";

export const EvaluationSchema = z
  .object({
    provider: z.string().min(1),
    accuracy: z.record(z.string(), z.number().min(0).max(1)),
    n_labels: z.number().int().nonnegative(),
    n_scored: z.number().int().nonnegative(),
    skipped: z.array(z.string()),
    labels_count: z.number().int().nonnegative(),
    field_samples: z.record(z.string(), z.number().int().nonnegative()),
  })
  .refine((e) => e.n_scored <= e.n_labels, { message: "n_scored exceeds n_labels" })
  // A field with an accuracy but no field_samples entry would fall back to
  // "—" on /metodologia instead of failing the build, against this
  // codebase's loud-failure style - so every accuracy key must have one.
  .refine((e) => Object.keys(e.accuracy).every((field) => field in e.field_samples), {
    message: "field_samples is missing an entry for a field present in accuracy",
  });

export async function loadEvaluation(): Promise<Evaluation> {
  const raw = EvaluationSchema.parse(JSON.parse(await readFile(dataFile("evaluation.json"), "utf-8")));
  return {
    provider: raw.provider,
    accuracy: raw.accuracy,
    nLabels: raw.n_labels,
    nScored: raw.n_scored,
    skipped: raw.skipped,
    labelsCount: raw.labels_count,
    fieldSamples: raw.field_samples,
  };
}
