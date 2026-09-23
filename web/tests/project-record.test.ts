import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

// A separate fixture directory: project 1's status is "desconocido" and its
// status_document_id (2) names a real document among its own documents (the
// latest one). derive_status (pipeline/impacto/resolve/status.py) seeds
// status_document_id with the latest document before scanning for one that
// resolves the status, and never clears that seed when none does - so this
// id is not a resolve/export disagreement, but it must still not be shown
// as "the document that fixed the status" since none did.
const DESCONOCIDO_DATA_DIR = path.resolve(process.cwd(), "tests", "fixtures", "data-desconocido");

describe("loadProjectRecord: desconocido status has no status document", () => {
  const originalDataDir = process.env["IMPACTO_DATA_DIR"];

  beforeEach(() => {
    process.env["IMPACTO_DATA_DIR"] = DESCONOCIDO_DATA_DIR;
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env["IMPACTO_DATA_DIR"];
    else process.env["IMPACTO_DATA_DIR"] = originalDataDir;
  });

  it("treats statusDocument as null even though status_document_id names a real document of the project", async () => {
    const record = await loadProjectRecord(1);
    expect(record?.project.status).toBe("desconocido");
    expect(record?.project.statusDocumentId).toBe(2);
    expect(record?.statusDocument).toBeNull();
    expect(record?.latestDocument?.id).toBe(2);
  });
});
