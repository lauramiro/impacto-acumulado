import { describe, expect, it } from "vitest";
import { developerParts, developerRollups, developerTotals, projectMwBest } from "@/lib/developers";
import type { Developer, Project } from "@/lib/types";

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

describe("developerRollups", () => {
  const dev = (key: string, name: string, family: string, projectIds: number[], extra: Partial<Developer> = {}): Developer => ({
    key,
    name,
    names: [name],
    family,
    group: null,
    parentCompany: null,
    sourceUrl: null,
    projectIds,
    mwCount: projectIds.length,
    ...extra,
  });
  const projects = new Map<number, Project>(
    [1, 2, 3, 4, 5, 6].map((id) => [id, { ...base, id, mwNominal: 10, ineCodes: [`4100${id}`] }]),
  );
  const greenalia = { group: "Greenalia", parentCompany: "Greenalia", sourceUrl: "https://greenalia.es/x" };

  it("adds up a sourced group across families and a naming family, and leaves single companies out", () => {
    const rows = developerRollups(
      [
        dev("gsp-guadame-1", "Greenalia Solar Power Guadame I, S.L.U.", "gsp-guadame", [1], greenalia),
        dev("gsp-guadame-2", "Greenalia Solar Power Guadame II, S.L.U.", "gsp-guadame", [2, 3], greenalia),
        dev("gsp-zumajo-1", "Greenalia Solar Power Zumajo I, S.L.U.", "gsp-zumajo", [3], greenalia),
        dev("tayant-investment-12", "Tayant Investment 12, S.L.", "tayant-investment", [4]),
        dev("tayant-investment-13", "TAYANT INVESTMENT 13, S.L.", "tayant-investment", [5]),
        dev("olivento", "Olivento, S.L.", "olivento", [6]),
      ],
      projects,
    );
    expect(rows.map((r) => [r.kind, r.name, r.companies, r.projects, r.parentCompany])).toEqual([
      ["grupo", "Greenalia", 3, 3, "Greenalia"],
      ["familia", "Tayant Investment", 2, 2, null],
    ]);
    // Project 3 names two of the group's companies and counts once.
    expect(rows[0]).toMatchObject({ key: "gsp-guadame-2", accumulatingMw: 30, sourceUrl: "https://greenalia.es/x" });
  });

  it("names a family by the name its spellings are joined under, and a one-company group when a source names its parent", () => {
    const rows = developerRollups(
      [
        dev("siroco-hydrogen-1", "Siroco Hydrogen, 1 S.L.", "siroco-hydrogen", [1], { group: "Siroco Hydrogen" }),
        dev("siroco-hydrogene-4", "Siroco Hydrogene 4, S.L.", "siroco-hydrogen", [2], { group: "Siroco Hydrogen" }),
        dev("enel-green-power-espana", "Enel Green Power España, S.L.", "enel-green-power-espana", [3], {
          group: "Endesa",
          parentCompany: "Endesa, S.A.",
          sourceUrl: "https://www.endesa.com/x",
        }),
      ],
      projects,
    );
    expect(rows.map((r) => [r.kind, r.name])).toEqual([
      ["familia", "Siroco Hydrogen"],
      ["grupo", "Endesa"],
    ]);
  });
});
