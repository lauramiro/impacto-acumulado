import { METRICS, STATUSES, type Metric, type Status } from "./types";

export type MapState = { metric: Metric; statuses: Set<Status>; selected: string | null };

export const DEFAULT_STATE: MapState = { metric: "mw", statuses: new Set(STATUSES), selected: null };

const INE = /^\d{5}$/;

function isMetric(s: string | null): s is Metric {
  return s !== null && (METRICS as readonly string[]).includes(s);
}

function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

export function parseMapState(params: URLSearchParams): MapState {
  const metricParam = params.get("metrica");
  const metric: Metric = isMetric(metricParam) ? metricParam : "mw";

  const statusParam = params.get("estado");
  const statuses = statusParam === null ? new Set<Status>(STATUSES) : new Set<Status>(statusParam.split(",").filter(isStatus));

  const m = params.get("m");
  const selected = m !== null && INE.test(m) ? m : null;
  return { metric, statuses, selected };
}

export function serializeMapState(state: MapState): string {
  const params = new URLSearchParams();
  if (state.metric !== "mw") params.set("metrica", state.metric);
  if (state.statuses.size !== STATUSES.length) params.set("estado", STATUSES.filter((s) => state.statuses.has(s)).join(","));
  if (state.selected) params.set("m", state.selected);
  return params.toString();
}
