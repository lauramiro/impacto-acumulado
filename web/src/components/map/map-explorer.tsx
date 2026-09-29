"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { MunicipalityIndex, type IndexRow } from "@/components/municipality-index";
import { fetchJson } from "@/lib/fetch-json";
import { formatNumber } from "@/lib/format";
import { METRIC_UNITS } from "@/lib/labels";
import { defaultState, parseMapState, serializeMapState, type MapState } from "@/lib/map-state";
import { classIndex, classify, metricValue, mwCoverage } from "@/lib/metrics";
import type {
  Filters,
  MapMunicipality,
  Metric,
  MonthlyEvent,
  MunicipalityStats,
  ProtectedAreaStats,
  ProvinceStats,
  SensitivityLayer,
  Status,
  Technology,
} from "@/lib/types";
import type { MuniProps, ProvProps, SiteProps } from "./choropleth";
import { Controls } from "./controls";
import { OverlayKey } from "./legend";
import { NaturaTable } from "./natura-table";
import { Panel } from "./panel";
import { ProvinceTable } from "./province-table";
import { useLayers, type LayerData } from "./use-layers";
import styles from "./map-explorer.module.css";

const Choropleth = dynamic(() => import("./choropleth").then((m) => m.Choropleth), {
  ssr: false,
  loading: () => <p className={styles.cargando}>Cargando el mapa…</p>,
});

type Geo = {
  municipalities: FeatureCollection<Geometry, MuniProps>;
  provinces: FeatureCollection<Geometry, ProvProps>;
};

type Props = {
  municipalities: MapMunicipality[];
  stats: Record<string, MunicipalityStats>;
  provinceStats: ProvinceStats;
  events: MonthlyEvent[];
  sites: ProtectedAreaStats[];
  lastMonth: string;
};

export function MapExplorer({ municipalities, stats, provinceStats, sites }: Props) {
  const router = useRouter();
  const [state, setState] = useState<MapState>(defaultState);
  const [geo, setGeo] = useState<Geo | "error" | null>(null);
  const { layers, ensure } = useLayers();
  const ensureFor = useCallback(
    (s: MapState) => {
      if (s.natura) ensure("natura");
      if (s.sensitivity !== "ninguna") ensure(s.sensitivity);
    },
    [ensure],
  );

  useEffect(() => {
    // Hydrate from the URL after mount: window.location is not available
    // during prerendering, and reading it via useSearchParams would bail
    // this whole subtree out of static generation (see page.tsx).
    const parsed = parseMapState(new URLSearchParams(window.location.search));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(parsed);
    ensureFor(parsed);
    function onPopState() {
      const parsed = parseMapState(new URLSearchParams(window.location.search));
      setState(parsed);
      ensureFor(parsed);
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [ensureFor]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchJson<Geo["municipalities"]>("/data/municipalities_map.geojson"), fetchJson<Geo["provinces"]>("/data/provinces.geojson")])
      .then(([m, p]) => {
        if (!cancelled) setGeo({ municipalities: m, provinces: p });
      })
      .catch(() => {
        if (!cancelled) setGeo("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(
    (next: MapState) => {
      ensureFor(next);
      setState(next);
      startTransition(() => {
        const qs = serializeMapState(next);
        router.replace(qs ? `/?${qs}` : "/", { scroll: false });
      });
    },
    [router, ensureFor],
  );

  const byIne = useMemo(() => new Map(municipalities.map((m) => [m.ine, m])), [municipalities]);

  const filters = useMemo<Filters>(
    () => ({ statuses: state.statuses, technologies: state.technologies }),
    [state.statuses, state.technologies],
  );

  const coverage = useMemo(() => {
    if (state.metric !== "mw") return null;
    const c = mwCoverage(provinceStats["Andalucía"], filters);
    return c.total > 0 ? c : null;
  }, [state.metric, provinceStats, filters]);

  const values = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of municipalities) out.set(m.ine, metricValue(stats[m.ine]?.cells, state.metric, filters));
    return out;
  }, [municipalities, stats, state.metric, filters]);

  const thresholds = useMemo(() => classify([...values.values()], 5), [values]);
  const decimals = state.metric === "proyectos" ? 0 : 1;
  const labelOf = useCallback(
    (ine: string) => `${formatNumber(values.get(ine) ?? 0, decimals)} ${METRIC_UNITS[state.metric]}`,
    [values, decimals, state.metric],
  );
  const classOf = useCallback((ine: string) => classIndex(values.get(ine) ?? 0, thresholds), [values, thresholds]);

  const rows: IndexRow[] = useMemo(
    () =>
      municipalities
        .map((m) => ({ ...m, value: values.get(m.ine) ?? 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    [municipalities, values],
  );

  const selected = state.selected ? (byIne.get(state.selected) ?? null) : null;
  const select = useCallback((ine: string | null) => update({ ...state, selected: ine }), [state, update]);

  return (
    <div>
      <Controls
        metric={state.metric}
        statuses={state.statuses}
        technologies={state.technologies}
        onMetric={(metric: Metric) => update({ ...state, metric })}
        onToggleStatus={(s: Status) => {
          const statuses = new Set(state.statuses);
          if (statuses.has(s)) statuses.delete(s);
          else statuses.add(s);
          update({ ...state, statuses });
        }}
        onToggleTechnology={(t: Technology) => {
          const technologies = new Set(state.technologies);
          if (technologies.has(t)) technologies.delete(t);
          else technologies.add(t);
          update({ ...state, technologies });
        }}
        natura={state.natura}
        onNatura={(natura: boolean) => update({ ...state, natura })}
        sensitivity={state.sensitivity}
        onSensitivity={(sensitivity: SensitivityLayer) => update({ ...state, sensitivity })}
        layerError={{
          natura: state.natura && layers.natura.status === "error",
          sensitivity: state.sensitivity !== "ninguna" && layers[state.sensitivity].status === "error",
        }}
      />
      <div className={styles.layout}>
        <div className={styles.mapa}>
          {geo === "error" ? (
            <p role="alert" className={styles.error}>
              No se ha podido cargar el mapa. Recarga la página o usa el índice de municipios.
            </p>
          ) : geo === null ? (
            <p className={styles.cargando}>Cargando el mapa…</p>
          ) : (
            <Choropleth
              municipalities={geo.municipalities}
              provinces={geo.provinces}
              classOf={classOf}
              labelOf={labelOf}
              selected={state.selected}
              onSelect={select}
              sites={state.natura && layers.natura.status === "loaded" ? (layers.natura.data as FeatureCollection<Geometry, SiteProps>) : null}
              sensitivity={
                state.sensitivity !== "ninguna" && layers[state.sensitivity].status === "loaded"
                  ? { layer: state.sensitivity, data: (layers[state.sensitivity] as { data: LayerData }).data }
                  : null
              }
            />
          )}
        </div>
        <Panel
          municipality={selected}
          stats={selected ? stats[selected.ine] : undefined}
          metric={state.metric}
          filters={filters}
          thresholds={thresholds}
          anyStatus={state.statuses.size > 0}
          anyTechnology={state.technologies.size > 0}
          coverage={coverage}
          overlays={<OverlayKey natura={state.natura} sensitivity={state.sensitivity} />}
          onClose={() => select(null)}
        />
      </div>
      <ProvinceTable
        stats={provinceStats}
        metric={state.metric}
        filters={filters}
        selected={state.province}
        onSelect={(province) => update({ ...state, province })}
      />
      <MunicipalityIndex rows={rows} metric={state.metric} selected={state.selected} onSelect={select} />
      <NaturaTable sites={sites} metric={state.metric} filters={filters} />
    </div>
  );
}
