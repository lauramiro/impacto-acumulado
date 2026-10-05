import { z } from "zod";
import { DOCUMENT_ROLES, EVENTS, SCOPES, STATUSES, TECHNOLOGIES, VERDICTS } from "@/lib/types";

export const CellSchema = z.object({
  status: z.enum(STATUSES),
  technology: z.enum(TECHNOLOGIES),
  project_count: z.number().int().nonnegative(),
  mw_nominal: z.number(),
  mw_count: z.number().int().nonnegative(),
  hectares: z.number(),
  ha_count: z.number().int().nonnegative(),
  mw_best: z.number(),
  mw_peak_fallback_count: z.number().int().nonnegative(),
});

export const StatsFileSchema = z.record(z.string(), z.object({ cells: z.array(CellSchema) }));

export const MunicipalityFeatureSchema = z.object({
  properties: z.object({
    ine_code: z.string().length(5),
    name: z.string(),
    province: z.string(),
    area_ha: z.number(),
    sensitivity_high_share: z.number().nullable(),
  }),
});

export const MunicipalitiesFileSchema = z.object({ features: z.array(MunicipalityFeatureSchema) });

export const ProtectedAreasFileSchema = z.record(
  z.string(),
  z.array(z.object({ site_code: z.string(), name: z.string(), type: z.string() })),
);

/** CSV cells arrive as strings; empty means null. */
const optionalNumber = z.string().transform((s, ctx) => {
  if (s === "") return null;
  const n = Number(s);
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: `not a number: ${s}` });
    return z.NEVER;
  }
  return n;
});
const optionalString = z.string().transform((s) => (s === "" ? null : s));
const semicolonList = z.string().transform((s) => (s === "" ? [] : s.split(";").map((x) => x.trim())));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ProjectRowSchema = z.object({
  id: z.coerce.number().int(),
  canonical_name: z.string().min(1),
  developer: optionalString,
  technology: z.enum(TECHNOLOGIES),
  status: z.enum(STATUSES),
  mw_peak: optionalNumber,
  mw_nominal: optionalNumber,
  hectares: optionalNumber,
  turbines: optionalNumber,
  status_document_id: optionalNumber,
  first_seen: isoDate,
  last_seen: isoDate,
  ine_codes: semicolonList,
  provinces: semicolonList,
});

export const DocumentRowSchema = z.object({
  id: z.coerce.number().int(),
  source: z.enum(["boe", "boja"]),
  source_id: z.string().min(1),
  published_at: isoDate,
  title: z.string(),
  url: z.url({ protocol: /^https?$/ }),
  project_id: optionalNumber,
  role: optionalString.pipe(z.enum(DOCUMENT_ROLES).nullable()),
  verdict: optionalString.pipe(z.enum(VERDICTS).nullable()),
  match_score: optionalNumber,
  confidence: optionalNumber,
});

export const ProtectedAreaStatsFileSchema = z.record(
  z.string(),
  z.object({ name: z.string(), type: z.string(), municipality_count: z.number().int().nonnegative(), cells: z.array(CellSchema) }),
);

const ScopeEntrySchema = z.object({ cells: z.array(CellSchema) });
// Every province and Andalucía, nothing else: a missing or unknown scope means
// the reference layer and the aggregate disagree.
export const ProvinceStatsFileSchema = z.strictObject(
  Object.fromEntries(SCOPES.map((s) => [s, ScopeEntrySchema])) as Record<(typeof SCOPES)[number], typeof ScopeEntrySchema>,
);

export const MonthlyEventRowSchema = z.object({
  month: isoDate,
  scope: z.enum(SCOPES),
  technology: z.enum(TECHNOLOGIES),
  event: z.enum(EVENTS),
  document_count: z.coerce.number().int().positive(),
});

export const OpenConsultationsFileSchema = z.object({
  generated: z.string(),
  evaluation: z.object({
    labelled: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    with_period: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
  }),
  consultations: z.array(
    z.object({
      document_id: z.number().int(),
      project_id: z.number().int(),
      project_name: z.string(),
      title: z.string(),
      url: z.string(),
      source: z.enum(["boe", "boja"]),
      source_id: z.string(),
      published_at: z.string(),
      period: z.object({ amount: z.number().int().positive(), unit: z.enum(["habiles", "naturales", "meses"]), evidence: z.string() }).nullable(),
      deadline: z.string().nullable(),
      ine_codes: z.array(z.string()),
    }),
  ),
});

export const DevelopersFileSchema = z.array(
  z.object({
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
    names: z.array(z.string()).min(1),
    family: z.string(),
    group: z.string().nullable(),
    parent_company: z.string().nullable(),
    source_url: z.string().nullable(),
    project_ids: z.array(z.number().int()).min(1),
    projects_by_status: z.partialRecord(z.enum(STATUSES), z.number().int().positive()),
    mw_by_status: z.partialRecord(z.enum(STATUSES), z.number()),
    mw_count: z.number().int().nonnegative(),
  }),
);

export const CONDITION_CATEGORIES = ["fauna", "flora", "agua", "suelo", "paisaje", "patrimonio", "vigilancia", "compensacion", "general"] as const;

export const ProjectDetailsFileSchema = z.record(
  z.string().regex(/^\d+$/),
  z.array(
    z.object({
      document_id: z.number().int(),
      expediente: z.string().nullable(),
      conditions: z.array(z.object({ category: z.enum(CONDITION_CATEGORIES), text: z.string().min(1) })),
      species_mentioned: z.array(z.string()),
      protected_areas_mentioned: z.array(z.string()),
      evidence: z.record(z.string(), z.string()),
      utm_coordinates: z.array(z.object({ x: z.number(), y: z.number(), zone: z.number().nullable().optional() })),
    }),
  ),
);

export const SplittingFileSchema = z.array(
  z.object({
    family: z.string(),
    project_ids: z.array(z.number().int()).min(2),
    mw: z.array(z.number()),
    mw_total: z.number(),
    ine_codes: z.array(z.string()),
    first_seen: z.tuple([z.string(), z.string()]),
  }),
);
