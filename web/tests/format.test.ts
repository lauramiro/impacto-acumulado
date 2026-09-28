import { describe, expect, it } from "vitest";
import { formatBytes, formatCoverage, formatDate, formatHa, formatInt, formatLongDate, formatMonth, formatMw, formatPercent, formatScore } from "@/lib/format";

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
});
