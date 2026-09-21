import { expect, it } from "vitest";
import { fold, matches } from "@/lib/search";

it("folds accents and case", () => {
  expect(fold("Jaén")).toBe("jaen");
  expect(fold("El Ejido")).toBe("el ejido");
});

it("matches accent-insensitively on any position", () => {
  expect(matches("Almería", "almeria")).toBe(true);
  expect(matches("Jerez de la Frontera", "front")).toBe(true);
  expect(matches("Ronda", "rondas")).toBe(false);
  expect(matches("Ronda", "")).toBe(true);
});
