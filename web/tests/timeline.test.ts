import { describe, expect, it } from "vitest";
import { buildSeries, monthRange, seriesMax, TIMELINE_START, yearTotals } from "@/lib/timeline";
import { TECHNOLOGIES, type MonthlyEvent } from "@/lib/types";

const ALL = new Set(TECHNOLOGIES);
const events: MonthlyEvent[] = [
  { month: "2021-11", scope: "Andalucía", technology: "solar_fv", event: "consulta", count: 1 },
  { month: "2022-01", scope: "Andalucía", technology: "solar_fv", event: "consulta", count: 2 },
  { month: "2022-03", scope: "Andalucía", technology: "eolica", event: "desfavorable", count: 1 },
  { month: "2022-03", scope: "Sevilla", technology: "eolica", event: "desfavorable", count: 1 },
  { month: "2023-01", scope: "Andalucía", technology: "solar_fv", event: "sin_veredicto", count: 4 },
];

describe("monthRange", () => {
  it("is inclusive and crosses years", () => {
    expect(monthRange("2022-11", "2023-02")).toEqual(["2022-11", "2022-12", "2023-01", "2023-02"]);
  });
  it("starts the timeline in January 2022", () => {
    expect(TIMELINE_START).toBe("2022-01");
    expect(monthRange(TIMELINE_START, "2022-01")).toEqual(["2022-01"]);
  });
  it("is empty when the end precedes the start", () => {
    expect(monthRange("2023-01", "2022-12")).toEqual([]);
  });
});

describe("buildSeries", () => {
  const months = monthRange("2022-01", "2023-01");
  it("fills every month, drops months before the start, and filters scope and technology", () => {
    const s = buildSeries(events, "Andalucía", ALL, months);
    expect(s.consulta).toHaveLength(13);
    expect(s.consulta[0]).toBe(2);
    expect(s.desfavorable[2]).toBe(1);
    expect(s.sin_veredicto[12]).toBe(4);
    expect(s.favorable.every((n) => n === 0)).toBe(true);
    expect(buildSeries(events, "Andalucía", new Set(["eolica"]), months).consulta[0]).toBe(0);
    expect(buildSeries(events, "Sevilla", ALL, months).desfavorable[2]).toBe(1);
  });
  it("gives zero everywhere when no technology is active", () => {
    expect(seriesMax(buildSeries(events, "Andalucía", new Set(), months))).toBe(0);
  });
});

describe("yearTotals", () => {
  it("sums each series per year", () => {
    const months = monthRange("2022-01", "2023-01");
    const rows = yearTotals(buildSeries(events, "Andalucía", ALL, months), months);
    expect(rows.map((r) => r.year)).toEqual(["2022", "2023"]);
    expect(rows[0].counts).toEqual({ consulta: 2, favorable: 0, favorable_condicionada: 0, desfavorable: 1, sin_veredicto: 0 });
    expect(rows[1].counts.sin_veredicto).toBe(4);
  });
});
