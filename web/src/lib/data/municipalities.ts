import "server-only";
import { readFile } from "node:fs/promises";
import type { Municipality } from "@/lib/types";
import { dataFile } from "./paths";
import { MunicipalitiesFileSchema } from "./schemas";

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
