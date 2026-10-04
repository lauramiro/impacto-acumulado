import { formatNumber } from "./format";
import { metricDecimals } from "./metrics";
import { fold } from "./search";
import { PROVINCES, type DocumentRole, type EventKind, type Metric, type Province, type SensitivityLayer, type Status, type Technology, type Verdict } from "./types";

export const STATUS_LABELS: Record<Status, string> = {
  en_consulta: "Información pública",
  favorable: "Favorable",
  favorable_condicionada: "Favorable con condiciones",
  desfavorable: "Desfavorable",
  caducado: "Caducado",
  // Most of these projects' last document is a BOJA notice that publishes the
  // decision without stating it (the full text is on the department's site):
  // the gazette has no verdict to read, which is not an extraction failure.
  desconocido: "Sin veredicto en el boletín",
};

export const TECHNOLOGY_LABELS: Record<Technology, string> = {
  solar_fv: "Solar fotovoltaica",
  eolica: "Eólica",
  hibrida: "Híbrida",
  almacenamiento: "Almacenamiento",
  linea_evacuacion: "Línea de evacuación",
  otra: "Otra",
};

export const ROLE_LABELS: Record<DocumentRole, string> = {
  consulta: "Información pública",
  informe: "Informe de impacto",
  dia: "Declaración de impacto ambiental",
  aau: "Autorización ambiental unificada",
  modificacion: "Modificación",
  caducidad: "Caducidad",
  otro: "Otro",
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  favorable: "Favorable",
  favorable_condicionada: "Favorable con condiciones",
  desfavorable: "Desfavorable",
  no_aplica: "No aplica",
};

export const METRIC_LABELS: Record<Metric, string> = {
  mw: "MW",
  densidad: "MW por km²",
  ha: "Hectáreas",
  proyectos: "Proyectos",
};

const METRIC_UNITS: Record<Metric, { one: string; other: string }> = {
  mw: { one: "MW", other: "MW" },
  densidad: { one: "MW/km²", other: "MW/km²" },
  ha: { one: "ha", other: "ha" },
  proyectos: { one: "proyecto", other: "proyectos" },
};

/** The unit that goes after `n` as displayed: "1 proyecto", "0 proyectos", "1,0 MW". */
export function metricUnit(metric: Metric, n: number): string {
  return Number(n.toFixed(metricDecimals(metric))) === 1 ? METRIC_UNITS[metric].one : METRIC_UNITS[metric].other;
}

/** A metric value with its unit: "120,3 MW", "1 proyecto", "12 proyectos". */
export function formatMetric(value: number, metric: Metric): string {
  return `${formatNumber(value, metricDecimals(metric))} ${metricUnit(metric, value)}`;
}

/** What is missing when a municipality has projects but a zero MW or ha figure. */
export const NO_FIGURE_LABELS: Record<Exclude<Metric, "proyectos">, string> = {
  mw: "sin MW declarado",
  densidad: "sin MW declarado",
  ha: "sin superficie declarada",
};

const SINGLE_CLASS_LABELS: Record<Metric, string> = {
  mw: "Con MW declarado",
  densidad: "Con MW declarado",
  ha: "Con superficie declarada",
  proyectos: "Con proyectos",
};

/**
 * Legend labels for map classes 1..thresholds.length + 1. A class covers values
 * above the previous threshold up to and including its own, compared as
 * displayed, so integer classes read "2 a 3 proyectos" and decimal ones start
 * one display step above the previous class's upper bound.
 */
export function classLabels(metric: Metric, thresholds: number[]): string[] {
  if (thresholds.length === 0) return [SINGLE_CLASS_LABELS[metric]];
  const decimals = metricDecimals(metric);
  const step = 10 ** -decimals;
  const num = (n: number) => formatNumber(n, decimals);
  const labels: string[] = [];
  for (let i = 0; i <= thresholds.length; i++) {
    const prev = i === 0 ? null : thresholds[i - 1];
    const hi = i < thresholds.length ? thresholds[i] : null;
    if (hi === null) {
      const lo = Number((prev! + step).toFixed(decimals));
      labels.push(decimals === 0 ? `${num(lo)} o más ${metricUnit(metric, 2)}` : `Más de ${formatMetric(prev!, metric)}`);
      continue;
    }
    if (prev === null && decimals > 0) {
      labels.push(`Hasta ${formatMetric(hi, metric)}`);
      continue;
    }
    const lo = prev === null ? 1 : Number((prev + step).toFixed(decimals));
    labels.push(lo === hi ? formatMetric(hi, metric) : `${num(lo)} a ${formatMetric(hi, metric)}`);
  }
  return labels;
}

/**
 * Timeline rows. They count documents by the verdict each one states, not
 * projects by current status, but use the same words as STATUS_LABELS so a
 * row reads as the status that document would give.
 */
export const EVENT_LABELS: Record<EventKind, string> = {
  consulta: "Información pública",
  favorable: "Favorable",
  favorable_condicionada: "Favorable con condiciones",
  desfavorable: "Desfavorable",
  sin_veredicto: "Sin veredicto en el boletín",
};

export const SENSITIVITY_LABELS: Record<SensitivityLayer, string> = {
  ninguna: "Ninguna",
  ftv: "Fotovoltaica",
  eol: "Eólica",
};

/** "Almería" to "almeria": the URL form of a province. */
export function provinceSlug(p: Province): string {
  return fold(p);
}

export function provinceFromSlug(slug: string | null): Province | null {
  if (slug === null) return null;
  return PROVINCES.find((p) => provinceSlug(p) === slug) ?? null;
}
