import {
  EVENTS,
  PROVINCES,
  SCOPES,
  STATUSES,
  TECHNOLOGIES,
  type MapMunicipality,
  type MonthlyEvent,
  type MunicipalityStats,
  type ProtectedAreaStats,
  type ProvinceStats,
  type Scope,
  type StatsCell,
} from "./types";

/**
 * The map page's data as tuples instead of objects: the RSC payload repeats
 * every key name for every cell, which made up most of the home page's HTML.
 * Enums travel as indexes into the constant lists in types.ts.
 */
type Cell = [status: number, technology: number, projectCount: number, mwBest: number, mwCount: number, mwPeakCount: number, hectares: number, haCount: number];
type Muni = [ine: string, name: string, province: number, areaHa: number];
type Event = [month: string, scope: number, technology: number, event: number, count: number];
type Site = [siteCode: string, name: string, type: string, municipalityCount: number, cells: Cell[]];

export type CompactMapData = {
  municipalities: Muni[];
  stats: Record<string, Cell[]>;
  provinceStats: Cell[][];
  events: Event[];
  sites: Site[];
};

export type MapExplorerData = {
  municipalities: MapMunicipality[];
  stats: Record<string, MunicipalityStats>;
  provinceStats: ProvinceStats;
  events: MonthlyEvent[];
  sites: ProtectedAreaStats[];
};

function index<T>(list: readonly T[], value: T): number {
  const i = list.indexOf(value);
  if (i < 0) throw new Error(`compact: ${String(value)} is not one of ${list.join(", ")}`);
  return i;
}

const cell = (c: StatsCell): Cell => [
  index(STATUSES, c.status),
  index(TECHNOLOGIES, c.technology),
  c.projectCount,
  c.mwBest,
  c.mwCount,
  c.mwPeakCount,
  c.hectares,
  c.haCount,
];

const uncell = ([s, t, projectCount, mwBest, mwCount, mwPeakCount, hectares, haCount]: Cell): StatsCell => ({
  status: STATUSES[s],
  technology: TECHNOLOGIES[t],
  projectCount,
  mwBest,
  mwCount,
  mwPeakCount,
  hectares,
  haCount,
});

export function compactMapData(d: MapExplorerData): CompactMapData {
  return {
    municipalities: d.municipalities.map((m) => [m.ine, m.name, index<string>(PROVINCES, m.province), m.areaHa]),
    stats: Object.fromEntries(Object.entries(d.stats).map(([ine, s]) => [ine, s.cells.map(cell)])),
    provinceStats: SCOPES.map((scope) => d.provinceStats[scope].map(cell)),
    events: d.events.map((e) => [e.month, index(SCOPES, e.scope), index(TECHNOLOGIES, e.technology), index(EVENTS, e.event), e.count]),
    sites: d.sites.map((s) => [s.siteCode, s.name, s.type, s.municipalityCount, s.cells.map(cell)]),
  };
}

export function expandMapData(d: CompactMapData): MapExplorerData {
  return {
    municipalities: d.municipalities.map(([ine, name, p, areaHa]) => ({ ine, name, province: PROVINCES[p], areaHa })),
    stats: Object.fromEntries(Object.entries(d.stats).map(([ine, cells]) => [ine, { cells: cells.map(uncell) }])),
    provinceStats: Object.fromEntries(SCOPES.map((scope, i) => [scope, d.provinceStats[i].map(uncell)])) as Record<Scope, StatsCell[]>,
    events: d.events.map(([month, scope, t, event, count]) => ({ month, scope: SCOPES[scope], technology: TECHNOLOGIES[t], event: EVENTS[event], count })),
    sites: d.sites.map(([siteCode, name, type, municipalityCount, cells]) => ({ siteCode, name, type, municipalityCount, cells: cells.map(uncell) })),
  };
}
