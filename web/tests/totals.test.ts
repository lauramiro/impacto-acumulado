import { describe, expect, it } from "vitest";
import { splitByHeadline } from "@/components/municipality/totals";
import { filterSummary } from "@/components/map/controls";
import { sumFigures } from "@/lib/metrics";
import { DEFAULT_STATUSES } from "@/lib/map-state";
import { STATUSES, TECHNOLOGIES, type StatsCell, type Status } from "@/lib/types";

const cell = (status: Status, mwBest: number): StatsCell => ({ status, technology: "solar_fv", projectCount: 1, mwBest, mwCount: 1, mwPeakCount: 0, hectares: 0, haCount: 0 });

describe("splitByHeadline", () => {
  it("keeps refused and lapsed projects out of the total, as the headline does", () => {
    const cells = [cell("favorable_condicionada", 100), cell("en_consulta", 50), cell("desconocido", 5), cell("desfavorable", 801), cell("caducado", 7)];
    const { accumulating, refused } = splitByHeadline(cells);
    expect(sumFigures(accumulating).mwBest).toBe(155);
    expect(sumFigures(accumulating).projectCount).toBe(3);
    expect(sumFigures(refused).mwBest).toBe(808);
    expect(accumulating.length + refused.length).toBe(cells.length);
  });
  it("covers every status exactly once", () => {
    const cells = STATUSES.map((s) => cell(s, 1));
    const { accumulating, refused } = splitByHeadline(cells);
    expect(accumulating.length + refused.length).toBe(STATUSES.length);
  });
});

describe("filterSummary", () => {
  const techs = new Set(TECHNOLOGIES);
  it("names the default statuses as one state", () => {
    expect(filterSummary(new Set(DEFAULT_STATUSES), techs, false, "ninguna")).toBe("Aprobados o en trámite · Todas las tecnologías");
  });
  it("still says all statuses when all are on", () => {
    expect(filterSummary(new Set(STATUSES), techs, false, "ninguna")).toBe("Todos los estados · Todas las tecnologías");
  });
});
