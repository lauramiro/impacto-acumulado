import "server-only";
import { readFile } from "node:fs/promises";
import type { MultiPolygon, Polygon } from "geojson";
import type { Municipality } from "@/lib/types";
import { dataFile } from "./paths";
import { MunicipalitiesFileSchema, MunicipalityOutlinesFileSchema } from "./schemas";

export async function loadMunicipalities(): Promise<Municipality[]> {
  const file = MunicipalitiesFileSchema.parse(JSON.parse(await readFile(dataFile("municipalities.geojson"), "utf-8")));
  return file.features
    .map(({ properties: p }) => ({
      ine: p.ine_code,
      name: p.name,
      province: p.province,
      areaHa: p.area_ha,
      sensitivityHighShare: p.sensitivity_high_share,
    }))
    .sort((a, b) => a.ine.localeCompare(b.ine));
}

let outlines: Promise<Map<string, Polygon | MultiPolygon>> | null = null;

/** Each municipality's coarse outline by INE code, read once per build (municipalities_map.geojson). */
export function loadMunicipalityOutlines(): Promise<Map<string, Polygon | MultiPolygon>> {
  outlines ??= readFile(dataFile("municipalities_map.geojson"), "utf-8").then((text) => {
    const file = MunicipalityOutlinesFileSchema.parse(JSON.parse(text));
    return new Map(file.features.map((f) => [f.properties.ine_code, f.geometry as Polygon | MultiPolygon]));
  });
  return outlines;
}
