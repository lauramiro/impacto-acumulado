import { describe, expect, it } from "vitest";
import { classIndex, classify, metricValue } from "@/lib/metrics";
import type { MunicipalityStats } from "@/lib/types";

const stats: MunicipalityStats = {
  byStatus: {
    favorable_condicionada: { projectCount: 2, mwNominal: 100, hectares: 300, turbines: 0 },
    desfavorable: { projectCount: 1, mwNominal: 40, hectares: 50, turbines: 5 },
  },
  byTechnology: {},
  mwTotal: 140,
  haTotal: 350,
  countTotal: 3,
};

describe("metricValue", () => {
  it("sums over the active statuses only", () => {
    expect(metricValue(stats, "mw", new Set(["favorable_condicionada", "desfavorable"]))).toBe(140);
    expect(metricValue(stats, "ha", new Set(["desfavorable"]))).toBe(50);
    expect(metricValue(stats, "proyectos", new Set(["favorable_condicionada"]))).toBe(2);
  });
  it("is zero for missing stats or no statuses", () => {
    expect(metricValue(undefined, "mw", new Set(["favorable"]))).toBe(0);
    expect(metricValue(stats, "mw", new Set())).toBe(0);
  });
});

describe("classify", () => {
  it("returns four quantile thresholds for five classes over positive values", () => {
    const values = [0, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(classify(values, 5)).toEqual([30, 50, 70, 90]);
  });
  it("collapses when there are fewer distinct positive values than classes", () => {
    expect(classify([0, 5, 5, 5], 5)).toEqual([]);
    expect(classify([0, 0], 5)).toEqual([]);
    expect(classify([3, 9], 5)).toEqual([3]);
  });
});

describe("classIndex", () => {
  it("maps zero to class 0 and positive values to 1..n", () => {
    const t = [10, 20, 30, 40];
    expect(classIndex(0, t)).toBe(0);
    expect(classIndex(5, t)).toBe(1);
    expect(classIndex(10, t)).toBe(1);
    expect(classIndex(25, t)).toBe(3);
    expect(classIndex(999, t)).toBe(5);
    expect(classIndex(7, [])).toBe(1);
  });
});
