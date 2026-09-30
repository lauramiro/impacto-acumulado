import "server-only";
import { readFile } from "node:fs/promises";
import type { ProtectedAreaRef } from "@/lib/types";
import { dataFile } from "./paths";
import { ProtectedAreasFileSchema } from "./schemas";
import { siteName } from "./site-names";

export async function loadMunicipalityProtectedAreas(): Promise<Map<string, ProtectedAreaRef[]>> {
  const file = ProtectedAreasFileSchema.parse(
    JSON.parse(await readFile(dataFile("municipality_protected_areas.json"), "utf-8")),
  );
  return new Map(
    Object.entries(file).map(([ine, areas]) => [
      ine,
      areas.map((a) => ({ siteCode: a.site_code, name: siteName(a.site_code, a.name), type: a.type })),
    ]),
  );
}
