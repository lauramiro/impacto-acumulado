import { fold } from "./search";
import { PROVINCES, type DocumentRole, type EventKind, type Metric, type Province, type SensitivityLayer, type Status, type Technology, type Verdict } from "./types";

export const STATUS_LABELS: Record<Status, string> = {
  en_consulta: "En consulta",
  favorable: "Favorable",
  favorable_condicionada: "Favorable con condiciones",
  desfavorable: "Desfavorable",
  caducado: "Caducado",
  desconocido: "Sin determinar",
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
  ha: "Hectáreas",
  proyectos: "Proyectos",
};

export const METRIC_UNITS: Record<Metric, string> = {
  mw: "MW",
  ha: "ha",
  proyectos: "proyectos",
};

export const EVENT_LABELS: Record<EventKind, string> = {
  consulta: "Información pública",
  favorable: "Favorable",
  favorable_condicionada: "Favorable con condiciones",
  desfavorable: "Desfavorable",
  sin_veredicto: "Resolución sin veredicto leído",
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
