import "server-only";
import type { Municipality, MunicipalityStats } from "@/lib/types";
import { loadMunicipalities } from "./municipalities";
import { loadMunicipalityStats } from "./stats";

export type MapData = { municipalities: Municipality[]; stats: Record<string, MunicipalityStats> };

/** Loads both files in parallel and refuses a stats key that has no municipality. */
export async function loadMapData(): Promise<MapData> {
  const [municipalities, statsMap] = await Promise.all([loadMunicipalities(), loadMunicipalityStats()]);
  const known = new Set(municipalities.map((m) => m.ine));
  for (const ine of statsMap.keys()) {
    if (!known.has(ine)) throw new Error(`municipality_stats.json has INE ${ine} that municipalities.geojson lacks`);
  }
  return { municipalities, stats: Object.fromEntries(statsMap) };
}
