import { expect, it } from "vitest";
import { METRIC_LABELS, ROLE_LABELS, STATUS_LABELS, TECHNOLOGY_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { DOCUMENT_ROLES, METRICS, STATUSES, TECHNOLOGIES, VERDICTS } from "@/lib/types";

it("has a Spanish label for every enum value", () => {
  for (const s of STATUSES) expect(STATUS_LABELS[s]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const t of TECHNOLOGIES) expect(TECHNOLOGY_LABELS[t]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const r of DOCUMENT_ROLES) expect(ROLE_LABELS[r]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const v of VERDICTS) expect(VERDICT_LABELS[v]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  for (const m of METRICS) expect(METRIC_LABELS[m]).toMatch(/^[A-ZÁÉÍÓÚ]/);
  expect(STATUS_LABELS.desconocido).toBe("Sin determinar");
  expect(STATUS_LABELS.favorable_condicionada).toBe("Favorable con condiciones");
});
