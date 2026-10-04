/** An información pública notice from open_consultations.json, with its objection deadline. */
export type Consultation = {
  documentId: number;
  projectId: number;
  projectName: string;
  title: string;
  url: string;
  source: "boe" | "boja";
  sourceId: string;
  publishedAt: string;
  period: { amount: number; unit: "habiles" | "naturales" | "meses"; evidence: string } | null;
  /** ISO date, or null when the notice states no period. */
  deadline: string | null;
  ineCodes: string[];
};

/** Days a notice with no stated period stays listed after publication; the pipeline uses the same window. */
export const UNSTATED_PERIOD_DAYS = 30;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The notices still open on `today` (the build date), nearest deadline first:
 * the export is weekly, so a deadline can pass between export and build.
 */
export function stillOpen(items: readonly Consultation[], today: Date): Consultation[] {
  const day = isoDay(today);
  const unstatedFrom = isoDay(new Date(today.getTime() - UNSTATED_PERIOD_DAYS * 86_400_000));
  return items
    .filter((c) => (c.deadline ? c.deadline >= day : c.publishedAt >= unstatedFrom))
    .sort((a, b) => (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") || a.publishedAt.localeCompare(b.publishedAt));
}
