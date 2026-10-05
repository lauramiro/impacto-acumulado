import { describe, expect, it } from "vitest";
import { findPlaces } from "@/components/map/place-search";

const places = [
  { ine: "29084", name: "Ronda" },
  { ine: "41024", name: "Aznalcóllar" },
  { ine: "11020", name: "Jerez de la Frontera" },
  { ine: "11021", name: "Jimena de la Frontera" },
  { ine: "29067", name: "Gaucín" },
  { ine: "14021", name: "Fuente Obejuna" },
];

describe("findPlaces", () => {
  it("returns nothing for an empty query", () => {
    expect(findPlaces(places, "")).toEqual([]);
    expect(findPlaces(places, "   ")).toEqual([]);
  });
  it("ignores accents and case", () => {
    expect(findPlaces(places, "AZNALCOLLAR").map((p) => p.ine)).toEqual(["41024"]);
    expect(findPlaces(places, "gaucin").map((p) => p.ine)).toEqual(["29067"]);
  });
  it("lists names that start with the query before names that contain it", () => {
    expect(findPlaces(places, "ro").map((p) => p.name)).toEqual(["Ronda", "Jerez de la Frontera", "Jimena de la Frontera"]);
  });
  it("caps the list", () => {
    expect(findPlaces(places, "a", 2)).toHaveLength(2);
  });
});
