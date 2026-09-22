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
    for (const entry of CATALOG) expect(meta.files, entry.file).toHaveProperty(entry.file);
  });

  it("has eleven entries", () => {
    expect(CATALOG).toHaveLength(11);
  });
});
