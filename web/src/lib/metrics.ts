import type { Figures, Filters, Metric, StatsCell } from "./types";

const ZERO: Figures = { projectCount: 0, mwBest: 0, mwCount: 0, mwPeakCount: 0, hectares: 0, haCount: 0 };

function add(a: Figures, c: Figures): Figures {
  return {
    projectCount: a.projectCount + c.projectCount,
    mwBest: a.mwBest + c.mwBest,
    mwCount: a.mwCount + c.mwCount,
    mwPeakCount: a.mwPeakCount + c.mwPeakCount,
    hectares: a.hectares + c.hectares,
    haCount: a.haCount + c.haCount,
  };
}

export function matching(cells: readonly StatsCell[], f: Filters): StatsCell[] {
  return cells.filter((c) => f.statuses.has(c.status) && f.technologies.has(c.technology));
}

export function sumFigures(cells: readonly StatsCell[]): Figures {
  return cells.reduce(add, ZERO);
}

/** The figure a metric reads from the cells: "densidad" reads MW and divides it by area. */
export function baseMetric(metric: Metric): Exclude<Metric, "densidad"> {
  return metric === "densidad" ? "mw" : metric;
}

/**
 * The metric's value over the matching cells. "densidad" needs `areaHa`, the
 * area of the municipality or province the cells belong to (MW / km²).
 */
export function metricValue(cells: readonly StatsCell[] | undefined, metric: Metric, f: Filters, areaHa?: number): number {
  const t = sumFigures(matching(cells ?? [], f));
  if (metric === "densidad") return areaHa ? t.mwBest / (areaHa / 100) : 0;
  return metric === "mw" ? t.mwBest : metric === "ha" ? t.hectares : t.projectCount;
}

/** How many of the matching projects have an MW figure that is summed, and in how many that figure is the peak. */
export function mwCoverage(cells: readonly StatsCell[] | undefined, f: Filters): { withMw: number; total: number; peak: number } {
  const t = sumFigures(matching(cells ?? [], f));
  return { withMw: t.mwCount, total: t.projectCount, peak: t.mwPeakCount };
}

/** How many of the matching projects declare the metric's figure (every project for "proyectos"). */
export function metricCoverage(
  cells: readonly StatsCell[] | undefined,
  metric: Metric,
  f: Filters,
): { declared: number; total: number; peak: number } {
  const t = sumFigures(matching(cells ?? [], f));
  const base = baseMetric(metric);
  const declared = base === "mw" ? t.mwCount : base === "ha" ? t.haCount : t.projectCount;
  return { declared, total: t.projectCount, peak: base === "mw" ? t.mwPeakCount : 0 };
}

export function splitBy<K extends "status" | "technology">(cells: readonly StatsCell[], key: K): Map<StatsCell[K], Figures> {
  const out = new Map<StatsCell[K], Figures>();
  for (const c of cells) out.set(c[key], add(out.get(c[key]) ?? ZERO, c));
  return out;
}

/** Decimals a metric is shown with; class boundaries use the same precision. */
export function metricDecimals(metric: Metric): 0 | 1 | 2 {
  // A typical density is a fraction of 1 MW/km²: one decimal would put most municipalities in one class.
  return metric === "proyectos" ? 0 : metric === "densidad" ? 2 : 1;
}

/** A value rounded as it is displayed, so class boundaries match the labels. */
function shown(value: number, decimals: 0 | 1 | 2): number {
  return Number(value.toFixed(decimals));
}

/**
 * Quantile thresholds over the positive values, rounded to `decimals`. Returns
 * at most `classes - 1` ascending, distinct thresholds below the maximum; fewer
 * when the data has fewer distinct values.
 */
export function classify(values: number[], classes: number, decimals: 0 | 1 | 2 = 0): number[] {
  const positive = values
    .map((v) => shown(v, decimals))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
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

/** Map class for a municipality with no matching projects. */
export const NO_PROJECTS_CLASS = 0;
/** Map class for a municipality with projects but no declared MW (or ha). */
export const NO_FIGURE_CLASS = -1;

/**
 * NO_PROJECTS_CLASS when there are no projects, NO_FIGURE_CLASS when there are
 * projects but the value is zero, otherwise 1 + number of thresholds strictly
 * below the value as displayed with `decimals`.
 */
export function classIndex(value: number, projects: number, thresholds: number[], decimals: 0 | 1 | 2 = 0): number {
  if (projects <= 0) return NO_PROJECTS_CLASS;
  if (value <= 0) return NO_FIGURE_CLASS;
  const v = shown(value, decimals);
  let i = 0;
  while (i < thresholds.length && v > thresholds[i]) i++;
  return i + 1;
}

/**
 * For each site with matching projects, how many other sites hold exactly the
 * same matching cells. Sites that touch the same municipalities with projects
 * share their project set, so their figures repeat; identical cells stand in
 * for an identical set, since the published stats carry no project ids.
 */
export function sharedFigures<T extends { cells: readonly StatsCell[] }>(
  sites: readonly T[],
  key: (s: T) => string,
  f: Filters,
): Map<string, number> {
  const signature = (s: T) =>
    JSON.stringify(
      matching(s.cells, f)
        .map((c) => [c.status, c.technology, c.projectCount, c.mwBest, c.mwCount, c.hectares, c.haCount])
        .sort(),
    );
  const groups = new Map<string, string[]>();
  for (const s of sites) {
    if (matching(s.cells, f).length === 0) continue;
    const sig = signature(s);
    groups.set(sig, [...(groups.get(sig) ?? []), key(s)]);
  }
  const out = new Map<string, number>();
  for (const members of groups.values()) for (const k of members) if (members.length > 1) out.set(k, members.length - 1);
  return out;
}
