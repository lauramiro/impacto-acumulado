import { describe, expect, it } from "vitest";
import { formatDate, formatHa, formatInt, formatLongDate, formatMw, formatPercent } from "@/lib/format";

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
});
