import { describe, expect, it } from "vitest";
import { groupDocumentsByProject, loadDocuments } from "@/lib/data/documents";
import { EvaluationSchema, loadEvaluation } from "@/lib/data/evaluation";
import { loadMapData } from "@/lib/data/map-data";
import { loadMonthlyEvents } from "@/lib/data/monthly-events";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjects } from "@/lib/data/projects";
import { loadProtectedAreaStats } from "@/lib/data/protected-area-stats";
import { loadMunicipalityProtectedAreas } from "@/lib/data/protected-areas";
import { loadProvinceStats } from "@/lib/data/province-stats";
import { toCell } from "@/lib/data/stats";
import { MonthlyEventRowSchema, ProvinceStatsFileSchema, StatsFileSchema } from "@/lib/data/schemas";
import { loadMunicipalityStats } from "@/lib/data/stats";

describe("loaders", () => {
  it("reads municipalities from GeoJSON properties", async () => {
    const munis = await loadMunicipalities();
    expect(munis).toHaveLength(2);
    expect(munis[0]).toEqual({ ine: "29067", name: "Málaga", province: "Málaga", areaHa: 39500, sensitivityHighShare: null });
    expect(munis[1].sensitivityHighShare).toBeCloseTo(0.4812);
  });

  it("reads municipality stats as cells keyed by INE", async () => {
    const stats = await loadMunicipalityStats();
    expect(stats.get("29084")!.cells).toEqual([
      { status: "favorable_condicionada", technology: "solar_fv", projectCount: 1, mwBest: 93, mwCount: 1, mwPeakCount: 0, hectares: 140.1, haCount: 1 },
      { status: "favorable_condicionada", technology: "linea_evacuacion", projectCount: 1, mwBest: 0, mwCount: 0, mwPeakCount: 0, hectares: 0, haCount: 0 },
    ]);
  });

  it("rejects a stats cell without ha_count", () => {
    const bad = { "29084": { cells: [{ status: "favorable", technology: "solar_fv", project_count: 1, mw_nominal: 1, mw_count: 1, hectares: 0 }] } };
    expect(StatsFileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a stats cell with an unknown technology", () => {
    const bad = { "29084": { cells: [{ status: "favorable", technology: "nuclear", project_count: 1, mw_nominal: 1, mw_count: 1, hectares: 0, ha_count: 0, turbines: 0 }] } };
    expect(StatsFileSchema.safeParse(bad).success).toBe(false);
  });

  it("reads protected areas per municipality including empty lists", async () => {
    const rel = await loadMunicipalityProtectedAreas();
    expect(rel.get("29084")).toEqual([{ siteCode: "ES0000001", name: "Sierra", type: "ZEPA" }]);
    expect(rel.get("29067")).toEqual([]);
  });

  it("parses projects with nullable numbers and ine code lists", async () => {
    const projects = await loadProjects();
    expect(projects[0]).toMatchObject({ id: 1, name: "Parque fotovoltaico Ronda I", mwPeak: 103, turbines: null, ineCodes: ["29084"], statusDocumentId: 2 });
    expect(projects[1]).toMatchObject({ developer: null, hectares: null, turbines: 10, provinces: ["Málaga"], statusDocumentId: 3 });
  });

  it("parses documents with their project link, role, verdict and scores", async () => {
    const docs = await loadDocuments();
    expect(docs).toHaveLength(3);
    expect(docs[0]).toMatchObject({ sourceId: "A", matchScore: 0.82, confidence: 0.8 });
    expect(docs[1]).toMatchObject({ sourceId: "B", projectId: 1, role: "dia", verdict: "favorable_condicionada", publishedAt: "2023-09-18", matchScore: 1 });
  });

  it("groups documents by project in publication order", async () => {
    const grouped = groupDocumentsByProject(await loadDocuments());
    expect(grouped.get(1)?.map((d) => d.sourceId)).toEqual(["A", "B"]);
    expect(grouped.get(2)?.map((d) => d.sourceId)).toEqual(["C"]);
  });

  it("loads the evaluation result", async () => {
    const ev = await loadEvaluation();
    expect(ev.provider).toBe("mistral:ministral-14b-latest");
    expect(ev.accuracy["mw_nominal"]).toBe(0.8);
    expect(ev).toMatchObject({ nLabels: 20, nScored: 20, labelsCount: 20, skipped: [] });
    // field_samples carries each field's own denominator (e.g. developer is
    // scored over 18 labels, not the 20 every other field in this fixture
    // uses), distinct from the single n_scored figure.
    expect(ev.fieldSamples).toEqual({ doc_type: 20, verdict: 20, developer: 18, technology: 20, mw_nominal: 20, municipalities: 20 });
  });

  it("rejects an evaluation with more scored than labelled", () => {
    const result = EvaluationSchema.safeParse({
      provider: "x",
      accuracy: {},
      n_labels: 1,
      n_scored: 2,
      skipped: [],
      labels_count: 1,
      field_samples: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an evaluation missing field_samples", () => {
    const result = EvaluationSchema.safeParse({ provider: "x", accuracy: {}, n_labels: 1, n_scored: 1, skipped: [], labels_count: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects an evaluation whose field_samples omits a field present in accuracy", () => {
    // Every field with an accuracy must have a sample size, or /metodologia's
    // "Muestra" column would silently render "—" for it instead of the
    // build failing loudly.
    const result = EvaluationSchema.safeParse({
      provider: "x",
      accuracy: { verdict: 1.0, turbines: 1.0 },
      n_labels: 2,
      n_scored: 2,
      skipped: [],
      labels_count: 2,
      field_samples: { verdict: 2 }, // missing "turbines"
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown status with the field named", () => {
    // Unlike the old by_status shape (where the invalid status was a record
    // key and so appeared in the issue's path), zod's enum mismatch here
    // names the field via the path ("status") but does not echo the
    // received value in the message; assert on the field instead.
    const bad = { "29084": { cells: [{ status: "aprobado", technology: "solar_fv", project_count: 1, mw_nominal: 1, mw_count: 1, hectares: 0, ha_count: 0 }] } };
    const result = StatsFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("status");
  });

  it("loadMapData returns municipalities and a stats record that agree", async () => {
    const { municipalities, stats } = await loadMapData();
    expect(municipalities).toHaveLength(2);
    expect(Object.keys(stats).sort()).toEqual(["29067", "29084"]);
  });
});

describe("slice 3 loaders", () => {
  it("reads every protected area sorted by name, with its municipality count", async () => {
    const sites = await loadProtectedAreaStats();
    expect(sites.map((s) => s.siteCode)).toEqual(["ES0000002", "ES0000001"]);
    expect(sites[0]).toEqual({ siteCode: "ES0000002", name: "Laguna", type: "ZEC", municipalityCount: 0, cells: [] });
    expect(sites[1].cells[0]).toMatchObject({ technology: "solar_fv", mwBest: 93, mwCount: 1, mwPeakCount: 0, hectares: 140.1, haCount: 1 });
  });

  it("reads province stats for every scope", async () => {
    const ps = await loadProvinceStats();
    expect(Object.keys(ps)).toHaveLength(9);
    expect(ps["Sevilla"]).toHaveLength(1);
    expect(ps["Almería"]).toEqual([]);
    expect(ps["Andalucía"].reduce((n, c) => n + c.projectCount, 0)).toBe(4);
  });

  it("rejects a province file missing a province or carrying an unknown scope", () => {
    const valid = Object.fromEntries(["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla", "Andalucía"].map((s) => [s, { cells: [] }]));
    expect(ProvinceStatsFileSchema.safeParse(valid).success).toBe(true);
    const { Jaén: _dropped, ...missing } = valid;
    expect(ProvinceStatsFileSchema.safeParse(missing).success).toBe(false);
    expect(ProvinceStatsFileSchema.safeParse({ ...valid, Madrid: { cells: [] } }).success).toBe(false);
  });

  it("reads monthly events with year-month keys", async () => {
    const events = await loadMonthlyEvents();
    expect(events).toHaveLength(9);
    expect(events[0]).toEqual({ month: "2022-01", scope: "Andalucía", technology: "solar_fv", event: "consulta", count: 1 });
  });

  it("rejects an unknown event", () => {
    const row = { month: "2023-01-01", scope: "Andalucía", technology: "solar_fv", event: "aprobado", document_count: "1" };
    expect(MonthlyEventRowSchema.safeParse(row).success).toBe(false);
  });

  it("assembles the map data with the last export month", async () => {
    const data = await loadMapData();
    expect(data.lastMonth).toBe("2026-09");
    expect(data.sites).toHaveLength(2);
    expect(data.events).toHaveLength(9);
    expect(data.provinceStats["Málaga"]).toHaveLength(3);
  });
});

describe("toCell", () => {
  it("counts a peak fallback as a project with an MW figure, and keeps the fallback count", () => {
    const cell = toCell({
      status: "favorable_condicionada",
      technology: "solar_fv",
      project_count: 3,
      mw_nominal: 100,
      mw_count: 1,
      hectares: 0,
      ha_count: 0,
      mw_best: 160,
      mw_peak_fallback_count: 1,
    });
    expect(cell).toMatchObject({ projectCount: 3, mwBest: 160, mwCount: 2, mwPeakCount: 1 });
  });
});
