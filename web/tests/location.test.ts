import { describe, expect, it } from "vitest";
import { boxOf, boxOfGeometry, groupCaption, padBox, radiusMetres, sigpacUrl, unionBox } from "@/components/project/location-geometry";

describe("project location helpers", () => {
  it("boxes a polygon and a multipolygon by their coordinates", () => {
    const square = { type: "Polygon" as const, coordinates: [[[-5, 36], [-4, 36], [-4, 37], [-5, 37], [-5, 36]]] };
    expect(boxOfGeometry(square)).toEqual([-5, 36, -4, 37]);
    const two = { type: "MultiPolygon" as const, coordinates: [square.coordinates, [[[-3, 37], [-2, 37], [-2, 38], [-3, 37]]]] };
    expect(boxOfGeometry(two)).toEqual([-5, 36, -2, 38]);
    expect(boxOf([])).toBeNull();
    expect(unionBox([null, [-5, 36, -4, 37], [-6, 36.5, -5.5, 36.6]])).toEqual([-6, 36, -4, 37]);
  });

  it("widens a lone point into a frame and leaves a wide box alone", () => {
    expect(padBox([-5, 36, -5, 36])).toEqual([-5.005, 35.995, -4.995, 36.005]);
    expect(padBox([-5, 36, -4, 37])).toEqual([-5, 36, -4, 37]);
  });

  it("links the SIGPAC viewer by centre and radius, as its manual documents", () => {
    // One degree of latitude is about 111 km: half of it, times the 1.2 margin.
    expect(radiusMetres([-5, 36, -5, 37])).toBeCloseTo(55_475, 0);
    expect(sigpacUrl([-5, 36, -5, 37])).toBe("https://sigpac.mapa.gob.es/fega/visor/?x=-5.00000&y=36.50000&srid=4258&r=66570");
    // A single point gets the floor radius.
    expect(sigpacUrl([-5.24045, 36.75469, -5.24045, 36.75469])).toBe("https://sigpac.mapa.gob.es/fega/visor/?x=-5.24045&y=36.75469&srid=4258&r=600");
  });
});

describe("groupCaption", () => {
  it("quotes the sentence a group comes from, or says none was kept", () => {
    expect(groupCaption({ evidence: "vegetación riparia del arroyo de Lorilla" })).toBe("Frase del documento: «vegetación riparia del arroyo de Lorilla»");
    expect(groupCaption({ evidence: null })).toMatch(/no deja una frase/);
  });
});
