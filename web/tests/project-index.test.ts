import { describe, expect, it } from "vitest";
import { matches } from "@/lib/search";
import { distinctExpedientes, expedienteKey, matchesProject, projectSearchText, statusesPresent } from "@/lib/project-index";

const row = { id: 43, name: "Parque solar Peñaflor", developer: "Solaria Energía, S.A.", expedientes: ["PEOL-FV 020", "AAU/HU/057/21"] };

describe("project search text", () => {
  it("finds a project by name, developer, expediente or number", () => {
    const text = projectSearchText(row);
    expect(matches(text, "penaflor")).toBe(true);
    expect(matches(text, "solaria")).toBe(true);
    expect(matches(text, "AAU/HU/057/21")).toBe(true);
    expect(matches(text, "aau/hu/057")).toBe(true);
    expect(matches(text, "proyecto 43")).toBe(true);
    expect(matches(text, "AAU/HU/058/21")).toBe(false);
  });
  it("copes with a project with no developer or expediente", () => {
    expect(matches(projectSearchText({ id: 1, name: "X", developer: null, expedientes: [] }), "x")).toBe(true);
  });
});

describe("distinctExpedientes", () => {
  it("drops nulls and blanks and keeps each number once, in the first spelling", () => {
    expect(distinctExpedientes(["PEOL-FV 020", null, "AAU/HU/057/21", " peol-fv  020 ", ""])).toEqual(["PEOL-FV 020", "AAU/HU/057/21"]);
  });
});

describe("statusesPresent", () => {
  it("lists the statuses in site order, once", () => {
    expect(statusesPresent([{ status: "desfavorable" }, { status: "en_consulta" }, { status: "desfavorable" }])).toEqual(["en_consulta", "desfavorable"]);
  });
});

describe("expediente search ignores separators", () => {
  it.each(["AAU/HU/057/21", "aau hu 057", "aau-hu-057", "AAU.HU.057", "aauhu05721", " aau / hu / 057 / 21 "])("finds Tallisca with %j", (q) => {
    expect(matchesProject(row, q)).toBe(true);
  });
  it("still tells numbers apart and keeps name search", () => {
    expect(matchesProject(row, "aau hu 058")).toBe(false);
    expect(matchesProject(row, "peol fv 020")).toBe(true);
    expect(matchesProject(row, "penaflor")).toBe(true);
  });
  it("does not match everything on a query of separators only", () => {
    expect(matchesProject(row, "/ - .")).toBe(false);
    expect(expedienteKey("AAU/HU/057/21")).toBe("aauhu05721");
  });
});
