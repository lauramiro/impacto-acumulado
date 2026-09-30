import { describe, expect, it } from "vitest";
import { classLabels, EVENT_LABELS, formatMetric, METRIC_LABELS, metricUnit, provinceFromSlug, provinceSlug, ROLE_LABELS, STATUS_LABELS, TECHNOLOGY_LABELS, VERDICT_LABELS } from "@/lib/labels";
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

describe("metric units", () => {
  it("pluralizes project counts and leaves MW and ha invariant", () => {
    expect(formatMetric(1, "proyectos")).toBe("1 proyecto");
    expect(formatMetric(0, "proyectos")).toBe("0 proyectos");
    expect(formatMetric(2, "proyectos")).toBe("2 proyectos");
    expect(formatMetric(1234, "proyectos")).toBe("1.234 proyectos");
    expect(formatMetric(1, "mw")).toBe("1,0 MW");
    expect(formatMetric(120.34, "mw")).toBe("120,3 MW");
    expect(formatMetric(0.5, "ha")).toBe("0,5 ha");
    expect(metricUnit("proyectos", 1)).toBe("proyecto");
    expect(metricUnit("mw", 2)).toBe("MW");
  });
});

describe("classLabels", () => {
  it("gives integer classes disjoint ranges", () => {
    expect(classLabels("proyectos", [1, 3, 5])).toEqual(["1 proyecto", "2 a 3 proyectos", "4 a 5 proyectos", "6 o más proyectos"]);
    expect(classLabels("proyectos", [2, 3, 7])).toEqual(["1 a 2 proyectos", "3 proyectos", "4 a 7 proyectos", "8 o más proyectos"]);
    expect(classLabels("proyectos", [1])).toEqual(["1 proyecto", "2 o más proyectos"]);
  });
  it("starts each decimal class one display step above the previous one", () => {
    expect(classLabels("mw", [29.7, 59.8, 120])).toEqual(["Hasta 29,7 MW", "29,8 a 59,8 MW", "59,9 a 120,0 MW", "Más de 120,0 MW"]);
    expect(classLabels("ha", [0.1, 0.2])).toEqual(["Hasta 0,1 ha", "0,2 ha", "Más de 0,2 ha"]);
  });
  it("has a single class when there are no thresholds", () => {
    expect(classLabels("proyectos", [])).toEqual(["Con proyectos"]);
    expect(classLabels("mw", [])).toEqual(["Con MW declarado"]);
    expect(classLabels("ha", [])).toEqual(["Con superficie declarada"]);
  });
});
