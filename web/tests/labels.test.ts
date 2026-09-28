import { describe, expect, it } from "vitest";
import { EVENT_LABELS, METRIC_LABELS, provinceFromSlug, provinceSlug, ROLE_LABELS, STATUS_LABELS, TECHNOLOGY_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { DOCUMENT_ROLES, EVENTS, METRICS, PROVINCES, STATUSES, TECHNOLOGIES, VERDICTS } from "@/lib/types";

it("has a Spanish label for every enum value", () => {
  for (const s of STATUSES) expect(STATUS_LABELS[s]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const t of TECHNOLOGIES) expect(TECHNOLOGY_LABELS[t]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const r of DOCUMENT_ROLES) expect(ROLE_LABELS[r]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const v of VERDICTS) expect(VERDICT_LABELS[v]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const m of METRICS) expect(METRIC_LABELS[m]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  expect(STATUS_LABELS.desconocido).toBe("Sin determinar");
  expect(STATUS_LABELS.favorable_condicionada).toBe("Favorable con condiciones");
});

describe("province slugs", () => {
  it("round-trips all eight provinces through ASCII slugs", () => {
    expect(PROVINCES.map(provinceSlug)).toEqual(["almeria", "cadiz", "cordoba", "granada", "huelva", "jaen", "malaga", "sevilla"]);
    for (const p of PROVINCES) expect(provinceFromSlug(provinceSlug(p))).toBe(p);
  });
  it("rejects unknown or missing slugs", () => {
    expect(provinceFromSlug("madrid")).toBeNull();
    expect(provinceFromSlug(null)).toBeNull();
    expect(provinceFromSlug("Sevilla")).toBeNull();
  });
});

describe("event labels", () => {
  it("labels every event", () => {
    expect(EVENTS.map((e) => EVENT_LABELS[e])).toEqual([
      "Información pública",
      "Favorable",
      "Favorable con condiciones",
      "Desfavorable",
      "Resolución sin veredicto leído",
    ]);
  });
});
