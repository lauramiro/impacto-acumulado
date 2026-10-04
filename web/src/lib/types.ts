/** "sin_resolucion": a consultation with no decision published 24 months later (pipeline/impacto/resolve/status.py). */
export const STATUSES = ["en_consulta", "sin_resolucion", "favorable", "favorable_condicionada", "desfavorable", "caducado", "desconocido"] as const;
export type Status = (typeof STATUSES)[number];

/**
 * The headline's two sums: what is accumulating (approved, or still in
 * process) and what was refused or lapsed. Projects with no verdict in the
 * gazette count with the first, and the headline says how many there are.
 */
export const APPROVED_OR_PENDING: readonly Status[] = ["favorable", "favorable_condicionada", "en_consulta", "sin_resolucion", "desconocido"];
export const REFUSED_OR_LAPSED: readonly Status[] = ["desfavorable", "caducado"];

export const TECHNOLOGIES = ["solar_fv", "eolica", "hibrida", "almacenamiento", "linea_evacuacion", "otra"] as const;
export type Technology = (typeof TECHNOLOGIES)[number];

export const DOCUMENT_ROLES = ["consulta", "informe", "dia", "aau", "modificacion", "caducidad", "otro"] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

export const VERDICTS = ["favorable", "favorable_condicionada", "desfavorable", "no_aplica"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** "densidad": MW per km² of the municipal (or provincial) area; it reads MW and divides by area. */
export const METRICS = ["mw", "densidad", "ha", "proyectos"] as const;
export type Metric = (typeof METRICS)[number];

export const PROVINCES = ["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla"] as const;
export type Province = (typeof PROVINCES)[number];
export const REGION = "Andalucía" as const;
export const SCOPES = [...PROVINCES, REGION] as const;
export type Scope = (typeof SCOPES)[number];
export const EVENTS = ["consulta", "favorable", "favorable_condicionada", "desfavorable", "sin_veredicto"] as const;
export type EventKind = (typeof EVENTS)[number];
export const SENSITIVITY_LAYERS = ["ninguna", "ftv", "eol"] as const;
export type SensitivityLayer = (typeof SENSITIVITY_LAYERS)[number];
export type MonthlyEvent = { month: string; scope: Scope; technology: Technology; event: EventKind; count: number }; // month "YYYY-MM"

export type Municipality = {
  ine: string;
  name: string;
  province: string;
  areaHa: number;
  sensitivityHighShare: number | null;
};

/** The subset of Municipality the map explorer needs: no per-request weight from unused figures. */
export type MapMunicipality = Pick<Municipality, "ine" | "name" | "province" | "areaHa">;

/**
 * Sums over a set of cells. mwBest sums each project's nominal MW, or its peak (MWp)
 * where only the peak is declared; mwCount counts the projects with either
 * figure and mwPeakCount those whose figure is the peak.
 */
export type Figures = { projectCount: number; mwBest: number; mwCount: number; mwPeakCount: number; hectares: number; haCount: number };
export type StatsCell = Figures & { status: Status; technology: Technology };
export type MunicipalityStats = { cells: StatsCell[] };
export type Filters = { statuses: ReadonlySet<Status>; technologies: ReadonlySet<Technology> };

export type ProtectedAreaStats = { siteCode: string; name: string; type: string; municipalityCount: number; cells: StatsCell[] };
export type ProvinceStats = Record<Scope, StatsCell[]>;

export type ProtectedAreaRef = { siteCode: string; name: string; type: string };

export type Project = {
  id: number;
  name: string;
  developer: string | null;
  technology: Technology;
  status: Status;
  mwPeak: number | null;
  mwNominal: number | null;
  hectares: number | null;
  turbines: number | null;
  statusDocumentId: number | null;
  firstSeen: string;
  lastSeen: string;
  ineCodes: string[];
  provinces: string[];
};

export type GazetteDocument = {
  id: number;
  source: "boe" | "boja";
  sourceId: string;
  publishedAt: string;
  title: string;
  url: string;
  projectId: number | null;
  role: DocumentRole | null;
  verdict: Verdict | null;
  matchScore: number | null;
  confidence: number | null;
};

export type Evaluation = {
  provider: string;
  accuracy: Record<string, number>;
  nLabels: number;
  nScored: number;
  skipped: string[];
  labelsCount: number;
  /** Per field, how many labels carry it under `expected` - each field's own denominator, not a single shared sample size. */
  fieldSamples: Record<string, number>;
  /** How the operative rule reads AAU publication notices (T4), when the export carries it. */
  aauPublication: {
    heldOut: { measured: string; labelled: number; correct: number };
    live: { labelled: number; correct: number };
    unknownProjects: number;
    projects: number;
  } | null;
};
