import { describe, expect, it } from "vitest";
import { classIndex, classify, matching, metricValue, mwCoverage, splitBy, sumFigures } from "@/lib/metrics";
import { STATUSES, TECHNOLOGIES, type StatsCell } from "@/lib/types";

const cells: StatsCell[] = [
  { status: "favorable_condicionada", technology: "solar_fv", projectCount: 2, mwNominal: 100, mwCount: 1, hectares: 300 },
  { status: "favorable_condicionada", technology: "linea_evacuacion", projectCount: 1, mwNominal: 0, mwCount: 0, hectares: 0 },
  { status: "desfavorable", technology: "eolica", projectCount: 1, mwNominal: 40, mwCount: 1, hectares: 50 },
];
const all = { statuses: new Set(STATUSES), technologies: new Set(TECHNOLOGIES) };

describe("metricValue", () => {
  it("sums cells matching both filters", () => {
    expect(metricValue(cells, "mw", all)).toBe(140);
    expect(metricValue(cells, "proyectos", all)).toBe(4);
    expect(metricValue(cells, "ha", { ...all, statuses: new Set(["desfavorable"]) })).toBe(50);
    expect(metricValue(cells, "proyectos", { ...all, technologies: new Set(["solar_fv", "eolica"]) })).toBe(3);
  });
  it("is zero for missing cells or an empty filter", () => {
    expect(metricValue(undefined, "mw", all)).toBe(0);
    expect(metricValue(cells, "mw", { ...all, statuses: new Set() })).toBe(0);
    expect(metricValue(cells, "mw", { ...all, technologies: new Set() })).toBe(0);
  });
});

describe("mwCoverage", () => {
  it("counts lines and projects without MW in the total only", () => {
    expect(mwCoverage(cells, all)).toEqual({ withMw: 2, total: 4 });
    expect(mwCoverage(cells, { ...all, technologies: new Set(["linea_evacuacion"]) })).toEqual({ withMw: 0, total: 1 });
    expect(mwCoverage(undefined, all)).toEqual({ withMw: 0, total: 0 });
  });
});

describe("splitBy and sumFigures", () => {
  it("groups figures by status or technology", () => {
    const byStatus = splitBy(cells, "status");
    expect(byStatus.get("favorable_condicionada")).toEqual({ projectCount: 3, mwNominal: 100, mwCount: 1, hectares: 300 });
    expect(byStatus.has("en_consulta")).toBe(false);
    expect(splitBy(cells, "technology").get("eolica")?.mwNominal).toBe(40);
  });
  it("sums everything, and nothing to zeros", () => {
    expect(sumFigures(cells)).toEqual({ projectCount: 4, mwNominal: 140, mwCount: 2, hectares: 350 });
    expect(sumFigures([])).toEqual({ projectCount: 0, mwNominal: 0, mwCount: 0, hectares: 0 });
    expect(matching(cells, { ...all, statuses: new Set(["desfavorable"]) })).toHaveLength(1);
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
