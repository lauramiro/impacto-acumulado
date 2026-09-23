import { describe, expect, it } from "vitest";
import { groupDocumentsByProject, loadDocuments } from "@/lib/data/documents";
import { EvaluationSchema, loadEvaluation } from "@/lib/data/evaluation";
import { loadMapData } from "@/lib/data/map-data";
import { loadMunicipalities } from "@/lib/data/municipalities";
import { loadProjects } from "@/lib/data/projects";
import { loadMunicipalityProtectedAreas } from "@/lib/data/protected-areas";
import { loadMunicipalityStats } from "@/lib/data/stats";
import { StatsFileSchema } from "@/lib/data/schemas";

describe("loaders", () => {
  it("reads municipalities from GeoJSON properties", async () => {
    const munis = await loadMunicipalities();
    expect(munis).toHaveLength(2);
    expect(munis[0]).toEqual({ ine: "29067", name: "Málaga", province: "Málaga", areaHa: 39500, sensitivityHighShare: null });
    expect(munis[1].sensitivityHighShare).toBeCloseTo(0.4812);
  });

  it("reads municipality stats keyed by INE", async () => {
    const stats = await loadMunicipalityStats();
    const ronda = stats.get("29084")!;
    expect(ronda.mwTotal).toBe(93);
    expect(ronda.byStatus.favorable_condicionada?.projectCount).toBe(1);
    expect(ronda.byTechnology.solar_fv?.mwNominal).toBe(93);
  });

  it("reads protected areas per municipality including empty lists", async () => {
    const rel = await loadMunicipalityProtectedAreas();
    expect(rel.get("29084")).toEqual([{ siteCode: "ES0000001", name: "SIERRA", type: "ZEPA" }]);
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
    const bad = { "29084": { by_status: { aprobado: { project_count: 1, mw_nominal: 1, hectares: 0, turbines: 0 } }, by_technology: {}, mw_total: 1, ha_total: 0, count_total: 1 } };
    const result = StatsFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("aprobado");
  });

  it("loadMapData returns municipalities and a stats record that agree", async () => {
    const { municipalities, stats } = await loadMapData();
    expect(municipalities).toHaveLength(2);
    expect(Object.keys(stats).sort()).toEqual(["29067", "29084"]);
  });
});
