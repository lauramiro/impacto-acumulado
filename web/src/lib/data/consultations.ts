import "server-only";
import { readFile } from "node:fs/promises";
import type { Consultation } from "@/lib/consultations";
import { dataFile } from "./paths";
import { OpenConsultationsFileSchema } from "./schemas";

export type OpenConsultations = {
  consultations: Consultation[];
  /** Hand-labelled notices the period parser was scored against, and how many it read right. */
  evaluation: { labelled: number; correct: number; withPeriod: number };
};

export async function loadOpenConsultations(): Promise<OpenConsultations> {
  const raw = OpenConsultationsFileSchema.parse(JSON.parse(await readFile(dataFile("open_consultations.json"), "utf-8")));
  return {
    evaluation: { labelled: raw.evaluation.labelled, correct: raw.evaluation.correct, withPeriod: raw.evaluation.with_period },
    consultations: raw.consultations.map((c) => ({
      documentId: c.document_id,
      projectId: c.project_id,
      projectName: c.project_name,
      title: c.title,
      url: c.url,
      source: c.source,
      sourceId: c.source_id,
      publishedAt: c.published_at,
      period: c.period,
      deadline: c.deadline,
      ineCodes: c.ine_codes,
    })),
  };
}
