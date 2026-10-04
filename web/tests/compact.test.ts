import { describe, expect, it } from "vitest";
import { compactMapData, expandMapData, type MapExplorerData } from "@/lib/compact";
import { SCOPES, type StatsCell } from "@/lib/types";

const cell: StatsCell = { status: "favorable_condicionada", technology: "solar_fv", projectCount: 3, mwBest: 447.23, mwCount: 2, mwPeakCount: 0, hectares: 90.5, haCount: 1 };

const data: MapExplorerData = {
  municipalities: [{ ine: "29067", name: "Málaga", province: "Málaga" }],
  stats: { "29067": { cells: [cell] } },
  provinceStats: Object.fromEntries(SCOPES.map((s) => [s, s === "Málaga" ? [cell] : []])) as MapExplorerData["provinceStats"],
  events: [{ month: "2024-05", scope: "Andalucía", technology: "eolica", event: "consulta", count: 4 }],
  sites: [{ siteCode: "ES0000001", name: "Sierra", type: "ZEPA", municipalityCount: 1, cells: [cell] }],
};

describe("compact map data", () => {
  it("expands back to exactly what was compacted", () => {
    expect(expandMapData(compactMapData(data))).toEqual(data);
  });

  it("survives the JSON round trip the RSC payload makes", () => {
    expect(expandMapData(JSON.parse(JSON.stringify(compactMapData(data))))).toEqual(data);
  });

  it("refuses a value outside the known lists instead of guessing", () => {
    expect(() => compactMapData({ ...data, municipalities: [{ ine: "28079", name: "Madrid", province: "Madrid" }] })).toThrow(/Madrid/);
  });
});
