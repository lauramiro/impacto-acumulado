import "server-only";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { GazetteDocument } from "@/lib/types";
import { dataFile } from "./paths";
import { DocumentRowSchema } from "./schemas";

export async function loadDocuments(): Promise<GazetteDocument[]> {
  const text = await readFile(dataFile("documents.csv"), "utf-8");
  const rows: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true, bom: true });
  return rows.map((row, i) => {
    let r: ReturnType<typeof DocumentRowSchema.parse>;
    try {
      r = DocumentRowSchema.parse(row);
    } catch (e) {
      throw new Error(`documents.csv row ${i + 2}: ${(e as Error).message}`);
    }
    return {
      id: r.id,
      source: r.source,
      sourceId: r.source_id,
      publishedAt: r.published_at,
      title: r.title,
      url: r.url,
      projectId: r.project_id,
      role: r.role,
      verdict: r.verdict,
      matchScore: r.match_score,
      confidence: r.confidence,
    };
  });
}

/** Documents per project, oldest first: a timeline reads forward. */
export function groupDocumentsByProject(docs: GazetteDocument[]): Map<number, GazetteDocument[]> {
  const byProject = new Map<number, GazetteDocument[]>();
  for (const d of docs) {
    if (d.projectId === null) continue;
    const list = byProject.get(d.projectId) ?? [];
    list.push(d);
    byProject.set(d.projectId, list);
  }
  for (const list of byProject.values()) list.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id - b.id);
  return byProject;
}
