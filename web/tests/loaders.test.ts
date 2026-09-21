import { describe, expect, it } from "vitest";
import { loadDocuments } from "@/lib/data/documents";
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
    expect(projects[0]).toMatchObject({ id: 1, name: "Parque fotovoltaico Ronda I", mwPeak: 103, turbines: null, ineCodes: ["29084"] });
    expect(projects[1]).toMatchObject({ developer: null, hectares: null, turbines: 10, provinces: ["Málaga"] });
  });

  it("parses documents with their project link, role and verdict", async () => {
    const docs = await loadDocuments();
    expect(docs).toHaveLength(3);
    expect(docs[1]).toMatchObject({ sourceId: "B", projectId: 1, role: "dia", verdict: "favorable_condicionada", publishedAt: "2023-09-18" });
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
