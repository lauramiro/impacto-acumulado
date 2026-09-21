import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, parseMapState, serializeMapState } from "@/lib/map-state";
import { STATUSES } from "@/lib/types";

describe("map state in the URL", () => {
  it("defaults to MW, every status, nothing selected", () => {
    const s = parseMapState(new URLSearchParams(""));
    expect(s.metric).toBe("mw");
    expect([...s.statuses].sort()).toEqual([...STATUSES].sort());
    expect(s.selected).toBeNull();
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
    expect(serializeMapState({ metric: "proyectos", statuses: new Set(["favorable"]), selected: "04016" })).toBe(
      "metrica=proyectos&estado=favorable&m=04016",
    );
  });
});
