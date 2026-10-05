import { describe, expect, it } from "vitest";
import { developerParts, developerTotals, projectMwBest } from "@/lib/developers";
import type { Project } from "@/lib/types";

const base: Project = {
  id: 1,
  name: "P",
  developer: null,
  technology: "solar_fv",
  status: "favorable",
  mwPeak: null,
  mwNominal: null,
  hectares: null,
  turbines: null,
  statusDocumentId: null,
  firstSeen: "2024-01-01",
  lastSeen: "2024-01-01",
  ineCodes: [],
  provinces: [],
};

describe("projectMwBest", () => {
  it("takes nominal, else peak, and nothing for a line", () => {
    expect(projectMwBest({ ...base, mwNominal: 40, mwPeak: 50 })).toBe(40);
    expect(projectMwBest({ ...base, mwPeak: 50 })).toBe(50);
    expect(projectMwBest({ ...base, technology: "linea_evacuacion", mwNominal: 200 })).toBeNull();
    expect(projectMwBest(base)).toBeNull();
  });
});

describe("developerTotals", () => {
  it("never sums refused projects with the rest", () => {
    const t = developerTotals([
      { ...base, mwNominal: 40 },
      { ...base, status: "desconocido", mwPeak: 10 },
      { ...base, status: "desfavorable", mwNominal: 49.8 },
      { ...base, status: "caducado" },
    ]);
    expect(t.accumulating).toEqual({ projects: 2, mw: 50, withMw: 2, peak: 1 });
    expect(t.refused).toEqual({ projects: 2, mw: 49.8, withMw: 1, peak: 0 });
  });
});

describe("developerParts", () => {
  it("links each printed name that has a key", () => {
    const keys = new Map([["Amura Solar, S.L.", "amura-solar"]]);
    expect(developerParts("Amura Solar, S.L.; Trofeo Solar, S.L.", keys)).toEqual([
      { name: "Amura Solar, S.L.", key: "amura-solar" },
      { name: "Trofeo Solar, S.L.", key: null },
    ]);
    expect(developerParts(null, keys)).toEqual([]);
  });
});
