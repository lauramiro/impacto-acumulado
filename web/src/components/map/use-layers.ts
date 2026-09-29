"use client";

import type { FeatureCollection, Geometry } from "geojson";
import { useCallback, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

export type LayerKey = "natura" | "ftv" | "eol";
export type LayerData = FeatureCollection<Geometry, Record<string, string>>;
export type LayerState = { status: "idle" | "loading" | "error" } | { status: "loaded"; data: LayerData };

const URLS: Record<LayerKey, string> = {
  natura: "/data/protected_areas.geojson",
  ftv: "/data/sensitivity_ftv.geojson",
  eol: "/data/sensitivity_eol.geojson",
};

const IDLE: Record<LayerKey, LayerState> = { natura: { status: "idle" }, ftv: { status: "idle" }, eol: { status: "idle" } };

/**
 * Overlays are fetched the first time they are wanted and kept for the
 * session. A failed fetch is forgotten, so wanting the layer again retries.
 * The ref, not state, guards against a second request while one is in
 * flight: ensure() is called from event handlers and the URL-hydration
 * effect, and must not depend on a render having happened in between.
 */
export function useLayers() {
  const [layers, setLayers] = useState(IDLE);
  const requested = useRef(new Set<LayerKey>());
  const ensure = useCallback((key: LayerKey) => {
    if (requested.current.has(key)) return;
    requested.current.add(key);
    setLayers((l) => ({ ...l, [key]: { status: "loading" } }));
    fetchJson<LayerData>(URLS[key]).then(
      (data) => setLayers((l) => ({ ...l, [key]: { status: "loaded", data } })),
      () => {
        requested.current.delete(key);
        setLayers((l) => ({ ...l, [key]: { status: "error" } }));
      },
    );
  }, []);
  return { layers, ensure };
}
