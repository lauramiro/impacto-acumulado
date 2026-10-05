import { describe, expect, it } from "vitest";
import { daysToDecision, median, refusals } from "@/lib/outcomes";
import type { GazetteDocument, Project, Status } from "@/lib/types";

const project = (status: Status): Project => ({
  id: 1, name: "P", developer: null, technology: "solar_fv", status, mwPeak: null, mwNominal: null, hectares: null, turbines: null,
  statusDocumentId: null, firstSeen: "2024-01-01", lastSeen: "2024-01-01", ineCodes: [], provinces: [],
});
const doc = (id: number, publishedAt: string, role: GazetteDocument["role"], verdict: GazetteDocument["verdict"] = "no_aplica"): GazetteDocument => ({
  id, source: "boja", sourceId: `d${id}`, publishedAt, title: "t", url: "u", projectId: 1, role, verdict, matchScore: 1, confidence: 1,
});

describe("refusals", () => {
  it("counts refused over refused plus granted, leaving lapsed and pending out", () => {
    const r = refusals(["favorable", "favorable_condicionada", "desfavorable", "caducado", "en_consulta", "desconocido"].map((s) => project(s as Status)));
    expect(r).toEqual({ refused: 1, decided: 3 });
  });
});

describe("daysToDecision", () => {
  it("runs from the first consultation to the first decision with a verdict after it", () => {
    expect(
      daysToDecision([doc(1, "2023-01-10", "consulta"), doc(2, "2023-03-01", "aau", "no_aplica"), doc(3, "2024-01-10", "aau", "favorable"), doc(4, "2023-06-01", "consulta")]),
    ).toBe(365);
  });
  it("is null without a consultation, or with only an earlier decision", () => {
    expect(daysToDecision([doc(1, "2023-01-10", "dia", "favorable")])).toBeNull();
    expect(daysToDecision([doc(1, "2023-01-10", "dia", "favorable"), doc(2, "2024-01-10", "consulta")])).toBeNull();
  });
});

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
