import "server-only";
import type { MonthlyEvent, Municipality, MunicipalityStats, ProtectedAreaStats, ProvinceStats } from "@/lib/types";
import { loadMeta } from "./meta";
import { loadMonthlyEvents } from "./monthly-events";
import { loadMunicipalities } from "./municipalities";
import { loadMunicipalityProtectedAreas } from "./protected-areas";
import { loadProtectedAreaStats } from "./protected-area-stats";
import { loadProvinceStats } from "./province-stats";
import { loadMunicipalityStats } from "./stats";

export type MapData = {
  municipalities: Municipality[];
  stats: Record<string, MunicipalityStats>;
  provinceStats: ProvinceStats;
  events: MonthlyEvent[];
  sites: ProtectedAreaStats[];
  /** "YYYY-MM" of the export: the timeline's last month. */
  lastMonth: string;
};

/** Loads every file the map page needs and refuses data the reference layers contradict. */
export async function loadMapData(): Promise<MapData> {
  const [municipalities, statsMap, provinceStats, events, sites, relation, meta] = await Promise.all([
    loadMunicipalities(),
    loadMunicipalityStats(),
    loadProvinceStats(),
    loadMonthlyEvents(),
    loadProtectedAreaStats(),
    loadMunicipalityProtectedAreas(),
    loadMeta(),
  ]);
  const known = new Set(municipalities.map((m) => m.ine));
  for (const ine of statsMap.keys()) {
    if (!known.has(ine)) throw new Error(`municipality_stats.json has INE ${ine} that municipalities.geojson lacks`);
  }
  const listed = new Map<string, number>();
  for (const areas of relation.values()) for (const a of areas) listed.set(a.siteCode, (listed.get(a.siteCode) ?? 0) + 1);
  for (const s of sites) {
    if ((listed.get(s.siteCode) ?? 0) !== s.municipalityCount) {
      throw new Error(`protected_area_stats.json gives ${s.siteCode} ${s.municipalityCount} municipalities; municipality_protected_areas.json lists ${listed.get(s.siteCode) ?? 0}`);
    }
  }
  return {
    municipalities,
    stats: Object.fromEntries(statsMap),
    provinceStats,
    events,
    sites,
    lastMonth: meta.generatedAt.toISOString().slice(0, 7),
  };
}
