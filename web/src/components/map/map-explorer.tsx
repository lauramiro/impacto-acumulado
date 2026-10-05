"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { preload } from "react-dom";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { indexRank, MunicipalityIndex, type IndexRow } from "@/components/municipality-index";
import { expandMapData, type CompactMapData } from "@/lib/compact";
import { fetchJson } from "@/lib/fetch-json";
import { formatCoverage } from "@/lib/format";
import { formatMetric, NO_FIGURE_LABELS } from "@/lib/labels";
import { defaultState, parseMapState, serializeMapState, type MapState } from "@/lib/map-state";
import { classIndex, classify, metricCoverage, metricDecimals, metricValue, mwCoverage } from "@/lib/metrics";
import { PROVINCES, REGION, type Filters, type Metric, type Province, type Scope, type SensitivityLayer, type Status, type Technology } from "@/lib/types";
import type { MuniProps, ProvProps, SiteProps } from "./choropleth";
import { Controls } from "./controls";
import { OverlayKey } from "./legend";
import { NaturaTable } from "./natura-table";
import { Panel, PANEL_HEADING_ID } from "./panel";
import { ProvinceTable } from "./province-table";
import { Timeline } from "./timeline";
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
  /** Tuples rather than objects, to keep the RSC payload small; expanded once here. */
  data: CompactMapData;
  lastMonth: string;
};

export function MapExplorer({ data, lastMonth }: Props) {
  // Here, not in the page: a hint issued in the server component travels in the RSC payload that every link to "/" prefetches.
  preload("/data/municipalities_map.geojson", { as: "fetch", crossOrigin: "anonymous" });
  preload("/data/provinces.geojson", { as: "fetch", crossOrigin: "anonymous" });
  const { municipalities, stats, provinceStats, events, sites } = useMemo(() => expandMapData(data), [data]);
  // Hectares per province and for Andalucía, the denominators of MW per km².
  const areas = useMemo(() => {
    const out = Object.fromEntries([...PROVINCES, REGION].map((s) => [s, 0])) as Record<Scope, number>;
    for (const m of municipalities) {
      out[m.province as Province] += m.areaHa;
      out[REGION] += m.areaHa;
    }
    return out;
  }, [municipalities]);
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
    if (state.metric !== "mw" && state.metric !== "densidad") return null;
    const c = mwCoverage(provinceStats["Andalucía"], filters);
    return c.total > 0 ? c : null;
  }, [state.metric, provinceStats, filters]);

  const values = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of municipalities) out.set(m.ine, metricValue(stats[m.ine]?.cells, state.metric, filters, m.areaHa));
    return out;
  }, [municipalities, stats, state.metric, filters]);

  const coverages = useMemo(() => {
    const out = new Map<string, { declared: number; total: number; peak: number }>();
    for (const m of municipalities) out.set(m.ine, metricCoverage(stats[m.ine]?.cells, state.metric, filters));
    return out;
  }, [municipalities, stats, state.metric, filters]);

  const decimals = metricDecimals(state.metric);
  const thresholds = useMemo(() => classify([...values.values()], 5, decimals), [values, decimals]);
  const labelOf = useCallback(
    (ine: string) => {
      const value = values.get(ine) ?? 0;
      const c = coverages.get(ine) ?? { declared: 0, total: 0, peak: 0 };
      if (c.total === 0) return "Sin proyectos";
      if (state.metric !== "proyectos" && value <= 0) return `${formatMetric(c.total, "proyectos")}, ${NO_FIGURE_LABELS[state.metric]}`;
      const label = formatMetric(value, state.metric);
      return state.metric === "mw" || state.metric === "densidad" ? `${label} (${formatCoverage(c.declared, c.total, "mw", c.peak)})` : label;
    },
    [values, coverages, state.metric],
  );
  const classOf = useCallback(
    (ine: string) => classIndex(values.get(ine) ?? 0, coverages.get(ine)?.total ?? 0, thresholds, decimals),
    [values, coverages, thresholds, decimals],
  );

  // Every municipality with a matching project, including those whose MW or ha
  // figure is zero because none of its projects declares one, limited to the
  // province picked in the province table.
  const rows: IndexRow[] = useMemo(
    () =>
      municipalities
        .filter((m) => state.province === null || m.province === state.province)
        .map((m) => ({ ...m, value: values.get(m.ine) ?? 0, ...(coverages.get(m.ine) ?? { declared: 0, total: 0 }) }))
        .filter((r) => r.total > 0)
        .sort((a, b) => indexRank(b) - indexRank(a) || b.total - a.total),
    [municipalities, values, coverages, state.province],
  );

  const selected = state.selected ? (byIne.get(state.selected) ?? null) : null;
  // Set by a user selection (map or index), not by URL hydration or back/forward,
  // so only a deliberate pick moves the viewport and focus to the panel.
  const revealPending = useRef(false);
  const select = useCallback(
    (ine: string | null) => {
      revealPending.current = ine !== null;
      update({ ...state, selected: ine });
    },
    [state, update],
  );
  useEffect(() => {
    if (!revealPending.current || state.selected === null) return;
    revealPending.current = false;
    const heading = document.getElementById(PANEL_HEADING_ID);
    if (!heading) return;
    const rect = heading.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      // Scroll the whole panel so the province and INE line above the name shows too.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      (heading.closest("aside") ?? heading).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    heading.focus({ preventScroll: true });
  }, [state.selected]);
  const clearProvince = useCallback(() => update({ ...state, province: null }), [state, update]);

  const sensitivityLayer = state.sensitivity !== "ninguna" ? layers[state.sensitivity] : null;
  const sensitivity = useMemo<{ layer: "ftv" | "eol"; data: LayerData } | null>(() => {
    if (state.sensitivity === "ninguna" || !sensitivityLayer || sensitivityLayer.status !== "loaded") return null;
    return { layer: state.sensitivity, data: sensitivityLayer.data };
  }, [state.sensitivity, sensitivityLayer]);

  return (
    <div>
      <Controls
        metric={state.metric}
        regionCells={provinceStats["Andalucía"]}
        statuses={state.statuses}
        technologies={state.technologies}
        onMetric={(metric: Metric) => update({ ...state, metric })}
        onToggleStatus={(s: Status) => {
          const statuses = new Set(state.statuses);
          if (statuses.has(s)) statuses.delete(s);
          else statuses.add(s);
          update({ ...state, statuses });
        }}
        onStatuses={(statuses) => update({ ...state, statuses: new Set(statuses) })}
        onToggleTechnology={(t: Technology) => {
          const technologies = new Set(state.technologies);
          if (technologies.has(t)) technologies.delete(t);
          else technologies.add(t);
          update({ ...state, technologies });
        }}
        onTechnologies={(technologies) => update({ ...state, technologies: new Set(technologies) })}
        natura={state.natura}
        onNatura={(natura: boolean) => update({ ...state, natura })}
        sensitivity={state.sensitivity}
        onSensitivity={(sensitivity: SensitivityLayer) => update({ ...state, sensitivity })}
        layerError={{
          natura: state.natura && layers.natura.status === "error",
          sensitivity: state.sensitivity !== "ninguna" && layers[state.sensitivity].status === "error",
        }}
      />
      <div className={styles.layout} id="mapa">
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
              province={state.province}
              sites={state.natura && layers.natura.status === "loaded" ? (layers.natura.data as FeatureCollection<Geometry, SiteProps>) : null}
              sensitivity={sensitivity}
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
        indexCount={rows.length}
        areas={areas}
      />
      <Timeline
        events={events}
        province={state.province}
        technologies={state.technologies}
        lastMonth={lastMonth}
        onClearProvince={clearProvince}
      />
      <MunicipalityIndex
        rows={rows}
        metric={state.metric}
        filters={filters}
        selected={state.selected}
        onSelect={select}
        province={state.province}
        onClearProvince={clearProvince}
      />
      <NaturaTable sites={sites} metric={state.metric} filters={filters} />
    </div>
  );
}
