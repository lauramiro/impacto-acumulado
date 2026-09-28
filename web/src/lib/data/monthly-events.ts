import "server-only";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type { MonthlyEvent } from "@/lib/types";
import { dataFile } from "./paths";
import { MonthlyEventRowSchema } from "./schemas";

export async function loadMonthlyEvents(): Promise<MonthlyEvent[]> {
  const rows = parse(await readFile(dataFile("monthly_events.csv"), "utf-8"), { columns: true, skip_empty_lines: true }) as unknown[];
  return rows.map((raw, i) => {
    const r = MonthlyEventRowSchema.safeParse(raw);
    if (!r.success) throw new Error(`monthly_events.csv row ${i + 2}: ${r.error.message}`);
    return { month: r.data.month.slice(0, 7), scope: r.data.scope, technology: r.data.technology, event: r.data.event, count: r.data.document_count };
  });
}
