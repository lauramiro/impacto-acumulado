import type { Metric, MunicipalityStats, Status } from "./types";

export function metricValue(
  stats: MunicipalityStats | undefined,
  metric: Metric,
  statuses: ReadonlySet<Status>,
): number {
  if (!stats) return 0;
  let total = 0;
  for (const status of statuses) {
    const f = stats.byStatus[status];
    if (!f) continue;
    total += metric === "mw" ? f.mwNominal : metric === "ha" ? f.hectares : f.projectCount;
  }
  return total;
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
