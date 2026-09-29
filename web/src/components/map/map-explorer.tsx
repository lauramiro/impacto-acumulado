"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { MunicipalityIndex, type IndexRow } from "@/components/municipality-index";
import { formatNumber } from "@/lib/format";
import { METRIC_UNITS } from "@/lib/labels";
import { defaultState, parseMapState, serializeMapState, type MapState } from "@/lib/map-state";
import { classIndex, classify, metricValue, mwCoverage } from "@/lib/metrics";
import type { Filters, MapMunicipality, Metric, MonthlyEvent, MunicipalityStats, ProtectedAreaStats, ProvinceStats, Status, Technology } from "@/lib/types";
import type { MuniProps, ProvProps } from "./choropleth";
import { Controls } from "./controls";
import { Panel } from "./panel";
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

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

export function MapExplorer({ municipalities, stats, provinceStats }: Props) {
  const router = useRouter();
  const [state, setState] = useState<MapState>(defaultState);
  const [geo, setGeo] = useState<Geo | "error" | null>(null);

  useEffect(() => {
    // Hydrate from the URL after mount: window.location is not available
    // during prerendering, and reading it via useSearchParams would bail
    // this whole subtree out of static generation (see page.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(parseMapState(new URLSearchParams(window.location.search)));
    function onPopState() {
      setState(parseMapState(new URLSearchParams(window.location.search)));
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

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
      setState(next);
      startTransition(() => {
        const qs = serializeMapState(next);
        router.replace(qs ? `/?${qs}` : "/", { scroll: false });
      });
    },
    [router],
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
          onClose={() => select(null)}
        />
      </div>
      <MunicipalityIndex rows={rows} metric={state.metric} selected={state.selected} onSelect={select} />
    </div>
  );
}
