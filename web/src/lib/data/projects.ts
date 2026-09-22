import "server-only";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { Project } from "@/lib/types";
import { dataFile } from "./paths";
import { ProjectRowSchema } from "./schemas";

export async function loadProjects(): Promise<Project[]> {
  const text = await readFile(dataFile("projects.csv"), "utf-8");
  const rows: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true, bom: true });
  return rows.map((row, i) => {
    let r: ReturnType<typeof ProjectRowSchema.parse>;
    try {
      r = ProjectRowSchema.parse(row);
    } catch (e) {
      throw new Error(`projects.csv row ${i + 2}: ${(e as Error).message}`);
    }
    return {
      id: r.id,
      name: r.canonical_name,
      developer: r.developer,
      technology: r.technology,
      status: r.status,
      mwPeak: r.mw_peak,
      mwNominal: r.mw_nominal,
      hectares: r.hectares,
      turbines: r.turbines,
      statusDocumentId: r.status_document_id,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      ineCodes: r.ine_codes,
      provinces: r.provinces,
    };
  });
}
