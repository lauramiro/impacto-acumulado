import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, DEFAULT_STATUSES, defaultState, parseMapState, serializeMapState } from "@/lib/map-state";
import { APPROVED_OR_PENDING, STATUSES, TECHNOLOGIES } from "@/lib/types";

describe("map state in the URL", () => {
  it("defaults to MW, the headline's statuses (approved or pending), nothing selected", () => {
    const s = parseMapState(new URLSearchParams(""));
    expect(s.metric).toBe("mw");
    expect(APPROVED_OR_PENDING).not.toContain("desconocido");
    expect([...s.statuses].sort()).toEqual([...APPROVED_OR_PENDING].sort());
    expect(s.statuses.has("desconocido")).toBe(false);
    expect(s.statuses.has("desfavorable")).toBe(false);
    expect(s.statuses.has("caducado")).toBe(false);
    expect(DEFAULT_STATUSES).toEqual(STATUSES.filter((x) => APPROVED_OR_PENDING.includes(x)));
    expect(s.selected).toBeNull();
  });
  it("carries every status in the URL, since leaving estado out now means approved or pending", () => {
    const all = { ...DEFAULT_STATE, statuses: new Set(STATUSES) };
    const qs = serializeMapState(all);
    expect(new URLSearchParams(qs).get("estado")).toBe(STATUSES.join(","));
    expect([...parseMapState(new URLSearchParams(qs)).statuses].sort()).toEqual([...STATUSES].sort());
  });
  it("reads a deep link to a municipality with the default statuses", () => {
    const s = parseMapState(new URLSearchParams("metrica=ha&m=41024"));
    expect(s).toMatchObject({ metric: "ha", selected: "41024" });
    expect([...s.statuses].sort()).toEqual([...DEFAULT_STATUSES].sort());
  });
  it("reads metric, statuses and selection", () => {
    const s = parseMapState(new URLSearchParams("metrica=ha&estado=desfavorable,caducado&m=29084"));
    expect(s.metric).toBe("ha");
    expect([...s.statuses]).toEqual(["desfavorable", "caducado"]);
    expect(s.selected).toBe("29084");
  });
  it("ignores unknown values and keeps an explicit empty status list", () => {
    const s = parseMapState(new URLSearchParams("metrica=kw&estado=aprobado&m=1"));
    expect(s.metric).toBe("mw");
    expect(s.statuses.size).toBe(0);
    expect(s.selected).toBeNull();
  });
  it("serialises only what differs from the defaults", () => {
    expect(serializeMapState(DEFAULT_STATE)).toBe("");
    expect(serializeMapState({ ...DEFAULT_STATE, metric: "proyectos", statuses: new Set(["favorable"]), selected: "04016" })).toBe(
      "metrica=proyectos&estado=favorable&m=04016",
    );
  });
});

describe("slice 3 map state", () => {
  it("defaults to every technology, no overlays, no province", () => {
    const s = parseMapState(new URLSearchParams(""));
    expect([...s.technologies].sort()).toEqual([...TECHNOLOGIES].sort());
    expect(s).toMatchObject({ natura: false, sensitivity: "ninguna", province: null });
  });
  it("reads technologies, overlays and province", () => {
    const s = parseMapState(new URLSearchParams("tecnologia=solar_fv,eolica&natura=1&sensibilidad=eolica&provincia=sevilla"));
    expect([...s.technologies]).toEqual(["solar_fv", "eolica"]);
    expect(s).toMatchObject({ natura: true, sensitivity: "eol", province: "Sevilla" });
    expect(parseMapState(new URLSearchParams("sensibilidad=fv")).sensitivity).toBe("ftv");
  });
  it("ignores unknown values", () => {
    const s = parseMapState(new URLSearchParams("tecnologia=nuclear&natura=si&sensibilidad=alta&provincia=madrid"));
    expect(s.technologies.size).toBe(0);
    expect(s).toMatchObject({ natura: false, sensitivity: "ninguna", province: null });
  });
  it("round-trips a full state and omits defaults", () => {
    const full = { ...defaultState(), technologies: new Set(["eolica"] as const), natura: true, sensitivity: "ftv" as const, province: "Cádiz" as const };
    const qs = serializeMapState(full);
    expect(qs).toBe("tecnologia=eolica&natura=1&sensibilidad=fv&provincia=cadiz");
    expect(parseMapState(new URLSearchParams(qs))).toEqual(full);
    expect(serializeMapState(defaultState())).toBe("");
  });
  it("hands out independent sets", () => {
    const a = defaultState();
    a.technologies.delete("solar_fv");
    expect(defaultState().technologies.has("solar_fv")).toBe(true);
  });
});
