import { describe, expect, it } from "vitest";
import { accumulation } from "@/lib/accumulation";
import type { Project, Status, Technology } from "@/lib/types";

const project = (id: number, firstSeen: string, status: Status, mwNominal: number | null, mwPeak: number | null, ineCodes = ["41024"], technology: Technology = "solar_fv"): Project => ({
  id,
  name: `P${id}`,
  developer: null,
  technology,
  status,
  mwPeak,
  mwNominal,
  hectares: null,
  turbines: null,
  statusDocumentId: null,
  firstSeen,
  lastSeen: firstSeen,
  ineCodes,
  provinces: ["Sevilla"],
});

describe("accumulation", () => {
  it("adds approved or pending projects in order of first notice, nominal else peak", () => {
    const steps = accumulation(
      [
        project(3, "2022-05-01", "favorable_condicionada", 10, 12),
        project(1, "2020-01-10", "en_consulta", null, 5),
        project(2, "2021-03-02", "favorable", 20, null),
      ],
      "41024",
    );
    expect(steps.map((s) => s.projectId)).toEqual([1, 2, 3]);
    expect(steps.map((s) => s.mw)).toEqual([5, 20, 10]);
    expect(steps.map((s) => s.total)).toEqual([5, 25, 35]);
    expect(steps.map((s) => s.count)).toEqual([1, 2, 3]);
  });

  it("leaves out refused, lapsed and no-verdict projects and other municipalities", () => {
    const steps = accumulation(
      [
        project(1, "2020-01-01", "desfavorable", 50, null),
        project(2, "2020-02-01", "caducado", 50, null),
        project(3, "2020-03-01", "desconocido", 50, null),
        project(4, "2020-04-01", "favorable", 50, null, ["29067"]),
        project(5, "2020-05-01", "favorable", 7, null, ["29067", "41024"]),
      ],
      "41024",
    );
    expect(steps.map((s) => s.projectId)).toEqual([5]);
    expect(steps.at(-1)?.total).toBe(7);
  });

  it("counts a project with no figure but does not add to the MW", () => {
    const steps = accumulation([project(1, "2020-01-01", "favorable", null, null), project(2, "2020-02-01", "favorable", 4, null)], "41024");
    expect(steps.map((s) => [s.mw, s.total, s.count])).toEqual([
      [null, 0, 1],
      [4, 4, 2],
    ]);
  });

  it("counts an evacuation line as a project but adds none of its MW, as the totals do", () => {
    const steps = accumulation([project(1, "2020-01-01", "favorable", 30, null), project(2, "2020-02-01", "favorable", 90, null, ["41024"], "linea_evacuacion")], "41024");
    expect(steps.map((s) => [s.mw, s.line, s.total, s.count])).toEqual([
      [30, false, 30, 1],
      [null, true, 30, 2],
    ]);
  });
});
