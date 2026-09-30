import { describe, expect, it } from "vitest";
import {
  classIndex,
  classify,
  matching,
  metricCoverage,
  metricDecimals,
  metricValue,
  mwCoverage,
  NO_FIGURE_CLASS,
  NO_PROJECTS_CLASS,
  splitBy,
  sumFigures,
} from "@/lib/metrics";
import { STATUSES, TECHNOLOGIES, type StatsCell } from "@/lib/types";

const cells: StatsCell[] = [
  { status: "favorable_condicionada", technology: "solar_fv", projectCount: 2, mwNominal: 100, mwCount: 1, hectares: 300, haCount: 1 },
  { status: "favorable_condicionada", technology: "linea_evacuacion", projectCount: 1, mwNominal: 0, mwCount: 0, hectares: 0, haCount: 0 },
  { status: "desfavorable", technology: "eolica", projectCount: 1, mwNominal: 40, mwCount: 1, hectares: 50, haCount: 1 },
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

describe("metricCoverage", () => {
  it("counts the projects declaring the metric's figure", () => {
    expect(metricCoverage(cells, "mw", all)).toEqual({ declared: 2, total: 4 });
    expect(metricCoverage(cells, "ha", all)).toEqual({ declared: 2, total: 4 });
    expect(metricCoverage(cells, "ha", { ...all, technologies: new Set(["linea_evacuacion"]) })).toEqual({ declared: 0, total: 1 });
    expect(metricCoverage(cells, "proyectos", all)).toEqual({ declared: 4, total: 4 });
    expect(metricCoverage(undefined, "ha", all)).toEqual({ declared: 0, total: 0 });
  });
});

describe("splitBy and sumFigures", () => {
  it("groups figures by status or technology", () => {
    const byStatus = splitBy(cells, "status");
    expect(byStatus.get("favorable_condicionada")).toEqual({ projectCount: 3, mwNominal: 100, mwCount: 1, hectares: 300, haCount: 1 });
    expect(byStatus.has("en_consulta")).toBe(false);
    expect(splitBy(cells, "technology").get("eolica")?.mwNominal).toBe(40);
  });
  it("sums everything, and nothing to zeros", () => {
    expect(sumFigures(cells)).toEqual({ projectCount: 4, mwNominal: 140, mwCount: 2, hectares: 350, haCount: 2 });
    expect(sumFigures([])).toEqual({ projectCount: 0, mwNominal: 0, mwCount: 0, hectares: 0, haCount: 0 });
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
  it("rounds thresholds to the displayed precision", () => {
    expect(classify([10.04, 29.74, 50.26, 70.1, 99.99], 5, 1)).toEqual([29.7, 50.3, 70.1]);
    expect(classify([0.04, 0.02, 5], 5, 1)).toEqual([]);
  });
});

describe("metricDecimals", () => {
  it("shows project counts as integers and MW and ha with one decimal", () => {
    expect(metricDecimals("proyectos")).toBe(0);
    expect(metricDecimals("mw")).toBe(1);
    expect(metricDecimals("ha")).toBe(1);
  });
});

describe("classIndex", () => {
  it("separates no projects from projects without a figure", () => {
    const t = [10, 20, 30, 40];
    expect(classIndex(0, 0, t)).toBe(NO_PROJECTS_CLASS);
    expect(classIndex(0, 5, t)).toBe(NO_FIGURE_CLASS);
    expect(NO_FIGURE_CLASS).not.toBe(NO_PROJECTS_CLASS);
  });
  it("maps positive values to 1..n, a value equal to a threshold in the lower class", () => {
    const t = [10, 20, 30, 40];
    expect(classIndex(5, 1, t)).toBe(1);
    expect(classIndex(10, 1, t)).toBe(1);
    expect(classIndex(11, 1, t)).toBe(2);
    expect(classIndex(25, 1, t)).toBe(3);
    expect(classIndex(999, 1, t)).toBe(5);
    expect(classIndex(7, 1, [])).toBe(1);
  });
  it("compares values as displayed, so the class matches the legend", () => {
    const t = [29.7, 59.8];
    expect(classIndex(29.74, 1, t, 1)).toBe(1);
    expect(classIndex(29.75, 1, t, 1)).toBe(2);
    expect(classIndex(0.02, 1, t, 1)).toBe(1);
  });
});
