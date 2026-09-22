import { describe, expect, it } from "vitest";
import { loadProjectRecord } from "@/lib/data/project-record";

describe("loadProjectRecord", () => {
  it("joins a project with its documents in publication order and marks the status document", async () => {
    const record = await loadProjectRecord(1);
    expect(record?.project.name).toBe("Parque fotovoltaico Ronda I");
    expect(record?.documents.map((d) => d.sourceId)).toEqual(["A", "B"]);
    expect(record?.statusDocument?.sourceId).toBe("B");
    expect(record?.latestDocument?.sourceId).toBe("B");
  });

  it("returns null for an unknown id", async () => {
    expect(await loadProjectRecord(999)).toBeNull();
  });
});
