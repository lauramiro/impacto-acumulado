import { describe, expect, it } from "vitest";
import { absenceMark, formatBytes, formatCoverage, formatCoverageCell, formatDate, formatHa, formatHaDeclared, formatInt, formatLongDate, formatMonth, formatMw, formatMwDeclared, formatPercent, formatScore, NO_DATA, NO_PROJECTS } from "@/lib/format";

describe("format (es-ES)", () => {
  it("formats MW and hectares with one decimal and thousands separators", () => {
    expect(formatMw(1206.64)).toBe("1.206,6 MW");
    expect(formatHa(93)).toBe("93,0 ha");
  });
  it("formats integers and percentages", () => {
    expect(formatInt(1234)).toBe("1.234");
    expect(formatPercent(0.4812)).toBe("48 %");
  });
  it("formats ISO dates as long Spanish dates", () => {
    expect(formatDate("2019-08-08")).toBe("8 de agosto de 2019");
    expect(formatLongDate(new Date("2026-09-21T13:50:15Z"))).toBe("21 de septiembre de 2026");
  });
  it("formats a score with two decimals", () => {
    expect(formatScore(0.82)).toBe("0,82");
    expect(formatScore(1)).toBe("1,00");
  });
  it("formats byte counts without ever rounding a real file down to zero", () => {
    expect(formatBytes(330)).toBe("330 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(8793)).toBe("8,8 KB");
    expect(formatBytes(1_997_358)).toBe("2,0 MB");
  });
});

describe("formatMonth", () => {
  it("formats a year-month in Spanish", () => {
    expect(formatMonth("2023-06")).toBe("junio de 2023");
    expect(formatMonth("2022-01")).toBe("enero de 2022");
  });
});

describe("formatCoverage", () => {
  it("states how many projects the MW figure covers", () => {
    expect(formatCoverage(167, 433)).toBe("MW declarados en 167 de 433 proyectos");
    expect(formatCoverage(1, 1)).toBe("MW declarados en 1 de 1 proyecto");
    expect(formatCoverage(1200, 1500)).toBe("MW declarados en 1.200 de 1.500 proyectos");
  });

  it("says in how many the figure is the peak, only for MW and only when there are any", () => {
    expect(formatCoverage(205, 541, "mw", 31)).toBe("MW declarados en 205 de 541 proyectos; en 31 se usa la potencia pico");
    expect(formatCoverage(205, 541, "mw", 0)).toBe("MW declarados en 205 de 541 proyectos");
    expect(formatCoverage(3, 5, "ha", 2)).toBe("Superficie declarada en 3 de 5 proyectos");
  });
});

describe("formatCoverage for hectares", () => {
  it("states how many projects declare a surface", () => {
    expect(formatCoverage(3, 5, "ha")).toBe("Superficie declarada en 3 de 5 proyectos");
    expect(formatCoverage(0, 1, "ha")).toBe("Superficie declarada en 0 de 1 proyecto");
  });
});

describe("formatMwDeclared and formatHaDeclared", () => {
  it("say sin dato when there are projects but none declares the figure", () => {
    expect(formatMwDeclared(0, 0, 1)).toBe("sin dato de MW");
    expect(formatHaDeclared(0, 0, 4)).toBe("sin dato de ha");
  });
  it("show the sum when any project declares it, and a zero when there are no projects", () => {
    expect(formatMwDeclared(126.9, 3, 4)).toBe("126,9 MW");
    expect(formatHaDeclared(0, 1, 4)).toBe("0,0 ha");
    expect(formatHaDeclared(0, 0, 0)).toBe("0,0 ha");
  });
});

describe("absenceMark", () => {
  it("tells no projects apart from projects with no declared figure", () => {
    expect(absenceMark(0, 0)).toBe(NO_PROJECTS);
    expect(NO_PROJECTS).toBe("–");
    expect(absenceMark(0, 3)).toBe(NO_DATA);
    expect(NO_DATA).toBe("sin dato");
  });
  it("is null when any project declares the figure", () => {
    expect(absenceMark(1, 3)).toBeNull();
    expect(absenceMark(3, 3)).toBeNull();
  });
});

describe("formatCoverageCell", () => {
  it("gives the short table form, empty when there are no projects", () => {
    expect(formatCoverageCell(3, 5)).toBe("3 de 5");
    expect(formatCoverageCell(1200, 1500)).toBe("1.200 de 1.500");
    expect(formatCoverageCell(0, 0)).toBe("");
  });
});
