import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/data/catalog";
import { dataFile } from "@/lib/data/paths";
import { loadMeta } from "@/lib/data/meta";

describe("catalog", () => {
  it("documents every column of each CSV, in the export's order", () => {
    for (const entry of CATALOG.filter((e) => e.columns)) {
      const header = readFileSync(dataFile(entry.file), "utf-8").split("\n")[0].trim().split(",");
      expect(entry.columns!.map((c) => c.name), entry.file).toEqual(header);
    }
  });

  it("lists only files the export wrote", async () => {
    const meta = await loadMeta();
    for (const entry of CATALOG) {
      // meta.json cannot list itself inside its own `files` map (see
      // web/src/lib/data/meta.ts): the export writes meta.json last, describing
      // every OTHER file it wrote. It is still a real, catalogued export; it is
      // just not a member of `meta.files`. Do not "fix" this by adding a
      // meta.json entry to meta.files or to the fixtures.
      if (entry.file === "meta.json") continue;
      expect(meta.files, entry.file).toHaveProperty(entry.file);
    }
  });

  it("catalogues meta.json itself as a real data file, even though it is absent from meta.files", () => {
    expect(CATALOG.some((e) => e.file === "meta.json")).toBe(true);
    expect(() => readFileSync(dataFile("meta.json"), "utf-8")).not.toThrow();
  });

  it("has eleven entries", () => {
    expect(CATALOG).toHaveLength(11);
  });
});
