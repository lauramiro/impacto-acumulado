import { provinceFromSlug, provinceSlug } from "./labels";
import { APPROVED_OR_PENDING, METRICS, STATUSES, TECHNOLOGIES, type Metric, type Province, type SensitivityLayer, type Status, type Technology } from "./types";

export type MapState = {
  metric: Metric;
  statuses: Set<Status>;
  technologies: Set<Technology>;
  natura: boolean;
  sensitivity: SensitivityLayer;
  province: Province | null;
  selected: string | null;
};

/**
 * Statuses on when the URL names none: the headline's basis (approved or pending; the headline
 * shows projects with no verdict in the bulletin on their own line), so the map, the province
 * table and the index count the same projects the headline does. Those and refused or lapsed
 * projects are one tick away in the filters, and `estado=` in the URL carries any choice.
 */
export const DEFAULT_STATUSES: readonly Status[] = STATUSES.filter((s) => APPROVED_OR_PENDING.includes(s) && s !== "desconocido");

function sameSet<T>(a: ReadonlySet<T>, b: readonly T[]): boolean {
  return a.size === b.length && b.every((v) => a.has(v));
}

export function defaultState(): MapState {
  return {
    metric: "mw",
    statuses: new Set(DEFAULT_STATUSES),
    technologies: new Set(TECHNOLOGIES),
    natura: false,
    sensitivity: "ninguna",
    province: null,
    selected: null,
  };
}

export const DEFAULT_STATE: MapState = defaultState();

const INE = /^\d{5}$/;
const SENSITIVITY_PARAM: Record<Exclude<SensitivityLayer, "ninguna">, string> = { ftv: "fv", eol: "eolica" };

function isMetric(s: string | null): s is Metric {
  return s !== null && (METRICS as readonly string[]).includes(s);
}

function listParam<T extends string>(params: URLSearchParams, name: string, all: readonly T[], whenAbsent: readonly T[] = all): Set<T> {
  const raw = params.get(name);
  if (raw === null) return new Set(whenAbsent);
  return new Set(raw.split(",").filter((v): v is T => (all as readonly string[]).includes(v)));
}

function sensitivityParam(raw: string | null): SensitivityLayer {
  if (raw === SENSITIVITY_PARAM.ftv) return "ftv";
  if (raw === SENSITIVITY_PARAM.eol) return "eol";
  return "ninguna";
}

export function parseMapState(params: URLSearchParams): MapState {
  const metricParam = params.get("metrica");
  const m = params.get("m");
  return {
    metric: isMetric(metricParam) ? metricParam : "mw",
    statuses: listParam(params, "estado", STATUSES, DEFAULT_STATUSES),
    technologies: listParam(params, "tecnologia", TECHNOLOGIES),
    natura: params.get("natura") === "1",
    sensitivity: sensitivityParam(params.get("sensibilidad")),
    province: provinceFromSlug(params.get("provincia")),
    selected: m !== null && INE.test(m) ? m : null,
  };
}

export function serializeMapState(state: MapState): string {
  const params = new URLSearchParams();
  if (state.metric !== "mw") params.set("metrica", state.metric);
  if (!sameSet(state.statuses, DEFAULT_STATUSES)) params.set("estado", STATUSES.filter((s) => state.statuses.has(s)).join(","));
  if (state.technologies.size !== TECHNOLOGIES.length) params.set("tecnologia", TECHNOLOGIES.filter((t) => state.technologies.has(t)).join(","));
  if (state.natura) params.set("natura", "1");
  if (state.sensitivity !== "ninguna") params.set("sensibilidad", SENSITIVITY_PARAM[state.sensitivity]);
  if (state.province) params.set("provincia", provinceSlug(state.province));
  if (state.selected) params.set("m", state.selected);
  return params.toString();
}
