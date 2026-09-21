"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { MunicipalityIndex, type IndexRow } from "@/components/municipality-index";
import { formatNumber } from "@/lib/format";
import { METRIC_UNITS } from "@/lib/labels";
import { parseMapState, serializeMapState, type MapState } from "@/lib/map-state";
import { classIndex, classify, metricValue } from "@/lib/metrics";
import type { Metric, Municipality, MunicipalityStats, Status } from "@/lib/types";
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

type Props = { municipalities: Municipality[]; stats: Record<string, MunicipalityStats> };

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

export function MapExplorer({ municipalities, stats }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<MapState>(() => parseMapState(new URLSearchParams(searchParams.toString())));
  const [geo, setGeo] = useState<Geo | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchJson<Geo["municipalities"]>("/data/municipalities.geojson"), fetchJson<Geo["provinces"]>("/data/provinces.geojson")])
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

  function update(next: MapState) {
    setState(next);
    startTransition(() => {
      const qs = serializeMapState(next);
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    });
  }

  const byIne = useMemo(() => new Map(municipalities.map((m) => [m.ine, m])), [municipalities]);

  const values = useMemo(() => {
    const out = new Map<string, number>();
    for (const m of municipalities) out.set(m.ine, metricValue(stats[m.ine], state.metric, state.statuses));
    return out;
  }, [municipalities, stats, state.metric, state.statuses]);

  const thresholds = useMemo(() => classify([...values.values()], 5), [values]);
  const decimals = state.metric === "proyectos" ? 0 : 1;
  const labelOf = (ine: string) => `${formatNumber(values.get(ine) ?? 0, decimals)} ${METRIC_UNITS[state.metric]}`;
  const classOf = (ine: string) => classIndex(values.get(ine) ?? 0, thresholds);

  const rows: IndexRow[] = useMemo(
    () =>
      municipalities
        .map((m) => ({ ...m, value: values.get(m.ine) ?? 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    [municipalities, values],
  );

  const selected = state.selected ? (byIne.get(state.selected) ?? null) : null;
  const select = (ine: string | null) => update({ ...state, selected: ine });

  return (
    <div>
      <Controls
        metric={state.metric}
        statuses={state.statuses}
        onMetric={(metric: Metric) => update({ ...state, metric })}
        onToggleStatus={(s: Status) => {
          const statuses = new Set(state.statuses);
          if (statuses.has(s)) statuses.delete(s);
          else statuses.add(s);
          update({ ...state, statuses });
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
          thresholds={thresholds}
          anyStatus={state.statuses.size > 0}
          onClose={() => select(null)}
        />
      </div>
      <MunicipalityIndex rows={rows} metric={state.metric} selected={state.selected} onSelect={select} />
    </div>
  );
}
