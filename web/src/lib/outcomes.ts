import type { GazetteDocument, Project, Status } from "./types";

/** Rates over fewer decided projects than this are shown as counts only. */
export const MIN_DECIDED_FOR_RATE = 10;

/** Medians over fewer cases than this are shown as counts only. */
export const MIN_CASES_FOR_MEDIAN = 10;

const GRANTED: readonly Status[] = ["favorable", "favorable_condicionada"];
const DECISION_ROLES = new Set(["dia", "aau", "informe"]);
const DECISION_VERDICTS = new Set(["favorable", "favorable_condicionada", "desfavorable"]);

export type Refusals = { refused: number; decided: number };

/** Refused over decided (refused plus granted, with or without conditions). Lapsed and pending projects are not decided. */
export function refusals(projects: readonly Project[]): Refusals {
  let refused = 0;
  let decided = 0;
  for (const p of projects) {
    if (p.status === "desfavorable") refused += 1;
    if (p.status === "desfavorable" || GRANTED.includes(p.status)) decided += 1;
  }
  return { refused, decided };
}

/**
 * Days from a project's first información pública to its first decision with
 * a verdict, published after it. Null when the project lacks either.
 */
export function daysToDecision(documents: readonly GazetteDocument[]): number | null {
  const sorted = [...documents].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const consultation = sorted.find((d) => d.role === "consulta");
  if (!consultation) return null;
  const decision = sorted.find(
    (d) => d.role !== null && DECISION_ROLES.has(d.role) && d.verdict !== null && DECISION_VERDICTS.has(d.verdict) && d.publishedAt > consultation.publishedAt,
  );
  if (!decision) return null;
  return Math.round((Date.parse(decision.publishedAt) - Date.parse(consultation.publishedAt)) / 86_400_000);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The median and how many values it came from; the median is null under MIN_CASES_FOR_MEDIAN values. */
export function sampledMedian(values: readonly number[]): { median: number | null; cases: number } {
  return { median: values.length >= MIN_CASES_FOR_MEDIAN ? median(values) : null, cases: values.length };
}
