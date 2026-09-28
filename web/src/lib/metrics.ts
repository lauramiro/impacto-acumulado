import type { Figures, Filters, Metric, StatsCell } from "./types";

const ZERO: Figures = { projectCount: 0, mwNominal: 0, mwCount: 0, hectares: 0 };

function add(a: Figures, c: Figures): Figures {
  return {
    projectCount: a.projectCount + c.projectCount,
    mwNominal: a.mwNominal + c.mwNominal,
    mwCount: a.mwCount + c.mwCount,
    hectares: a.hectares + c.hectares,
  };
}

export function matching(cells: readonly StatsCell[], f: Filters): StatsCell[] {
  return cells.filter((c) => f.statuses.has(c.status) && f.technologies.has(c.technology));
}

export function sumFigures(cells: readonly StatsCell[]): Figures {
  return cells.reduce(add, ZERO);
}

export function metricValue(cells: readonly StatsCell[] | undefined, metric: Metric, f: Filters): number {
  const t = sumFigures(matching(cells ?? [], f));
  return metric === "mw" ? t.mwNominal : metric === "ha" ? t.hectares : t.projectCount;
}

/** How many of the matching projects have an MW figure that is summed. */
export function mwCoverage(cells: readonly StatsCell[] | undefined, f: Filters): { withMw: number; total: number } {
  const t = sumFigures(matching(cells ?? [], f));
  return { withMw: t.mwCount, total: t.projectCount };
}

export function splitBy<K extends "status" | "technology">(cells: readonly StatsCell[], key: K): Map<StatsCell[K], Figures> {
  const out = new Map<StatsCell[K], Figures>();
  for (const c of cells) out.set(c[key], add(out.get(c[key]) ?? ZERO, c));
  return out;
}

/**
 * Quantile thresholds over the positive values. Returns at most `classes - 1`
 * ascending, distinct thresholds below the maximum; fewer when the data has
 * fewer distinct values.
 */
export function classify(values: number[], classes: number): number[] {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return [];
  const thresholds: number[] = [];
  for (let k = 1; k < classes; k++) {
    const idx = Math.min(positive.length - 1, Math.floor((positive.length * k) / classes));
    const t = positive[idx];
    if (thresholds.length === 0 || t > thresholds[thresholds.length - 1]) thresholds.push(t);
  }
  const max = positive[positive.length - 1];
  return thresholds.filter((t) => t < max);
}

/** 0 for zero or negative, otherwise 1 + number of thresholds strictly below the value. */
export function classIndex(value: number, thresholds: number[]): number {
  if (value <= 0) return 0;
  let i = 0;
  while (i < thresholds.length && value > thresholds[i]) i++;
  return i + 1;
}
