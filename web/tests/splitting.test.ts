import { describe, expect, it } from "vitest";
import { developerSplittingGroups, familyLabel, type SplittingGroup } from "@/lib/data/splitting";
import type { Developer } from "@/lib/types";

const group = (family: string, projectIds: number[]): SplittingGroup => ({
  kind: "familia",
  family,
  infrastructure: null,
  projectIds,
  mwTotal: 100,
  ineCodes: ["23059"],
  firstSeen: ["2023-01-25", "2023-05-24"],
});

const dev = (key: string, name: string, family: string, projectIds: number[], group: string | null = null): Developer => ({
  key,
  name,
  names: [name],
  family,
  group,
  parentCompany: null,
  sourceUrl: null,
  projectIds,
  mwCount: projectIds.length,
});

describe("familyLabel", () => {
  it("names a one-company group by the company", () => {
    const devs = [dev("iberdrola-renovables-andalucia", "Iberdrola Renovables Andalucía, S.A.U.", "iberdrola-renovables-andalucia", [11, 75])];
    expect(familyLabel(group("iberdrola-renovables-andalucia", [11, 75]), devs)).toBe("Iberdrola Renovables Andalucía, S.A.U.");
  });

  it("names numbered siblings by the words they share", () => {
    const devs = [12, 13, 14, 15].map((n) => dev(`tayant-investment-${n}`, `Tayant Investment ${n}, S.L.`, "tayant-investment", [n]));
    expect(familyLabel(group("tayant-investment", [12, 13, 14, 15]), devs)).toBe("Tayant Investment");
  });

  it("names spellings the groups file joins by the file's name", () => {
    const g = "Greenalia Solar Power Guadame";
    const devs = [
      dev("greenalia-solar-power-guadame-i", "Greenalia Solar Power Guadame I, S.L.", "greenalia-solar-power-guadame", [183], g),
      dev("greenalia-solar-powerguadame-iii", "Greenalia Solar PowerGuadame III, S.L.", "greenalia-solar-power-guadame", [241], g),
    ];
    expect(familyLabel(group("greenalia-solar-power-guadame", [183, 241]), devs)).toBe(g);
  });

  it("ignores developers outside the group and falls back to the family key", () => {
    const devs = [dev("tayant-investment-99", "Tayant Investment 99, S.L.", "tayant-investment", [999])];
    expect(familyLabel(group("tayant-investment", [12, 13]), devs)).toBe("tayant investment");
  });
});

const shared = (projectIds: number[], lines: number[]): SplittingGroup => ({
  kind: "infraestructura",
  family: null,
  projectIds,
  mwTotal: 181.5,
  ineCodes: ["41024"],
  firstSeen: ["2023-01-19", "2023-01-20"],
  infrastructure: { projectIds: lines, substations: ["azora carmona"] },
});

describe("infrastructure groups", () => {
  it("are named by what joins them, not by a family", () => {
    expect(familyLabel(shared([275, 276], [147]), [])).toBe("Misma infraestructura de evacuación");
  });

  it("show on the page of any developer with a project in them, family groups only on the family's", () => {
    const almazara = dev("almazara-solar", "Almazara Solar, S.L.", "almazara-solar", [294, 147]);
    const groups = [shared([275, 294], [147]), group("almazara-solar", [1, 2]), group("otra", [294]), shared([1, 2], [3])];
    expect(developerSplittingGroups(groups, almazara)).toEqual([groups[0], groups[1]]);
  });
});
