import type { DocumentRole, Metric, Status, Technology, Verdict } from "./types";

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
