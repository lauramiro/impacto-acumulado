export const STATUSES = ["en_consulta", "favorable", "favorable_condicionada", "desfavorable", "caducado", "desconocido"] as const;
export type Status = (typeof STATUSES)[number];

export const TECHNOLOGIES = ["solar_fv", "eolica", "hibrida", "almacenamiento", "linea_evacuacion", "otra"] as const;
export type Technology = (typeof TECHNOLOGIES)[number];

export const DOCUMENT_ROLES = ["consulta", "informe", "dia", "aau", "modificacion", "caducidad", "otro"] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

export const VERDICTS = ["favorable", "favorable_condicionada", "desfavorable", "no_aplica"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const METRICS = ["mw", "ha", "proyectos"] as const;
export type Metric = (typeof METRICS)[number];

export type Municipality = {
  ine: string;
  name: string;
  province: string;
  areaHa: number;
  sensitivityHighShare: number | null;
};

/** The subset of Municipality the map explorer needs: no per-request weight from unused figures. */
export type MapMunicipality = Pick<Municipality, "ine" | "name" | "province">;

export type StatusFigures = { projectCount: number; mwNominal: number; hectares: number; turbines: number };
export type TechnologyFigures = { projectCount: number; mwNominal: number; hectares: number };

export type MunicipalityStats = {
  byStatus: Partial<Record<Status, StatusFigures>>;
  byTechnology: Partial<Record<Technology, TechnologyFigures>>;
  mwTotal: number;
  haTotal: number;
  countTotal: number;
};

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
};
