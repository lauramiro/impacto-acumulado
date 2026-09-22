import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProjectRecord } from "@/lib/data/project-record";

// A separate, deliberately inconsistent fixture directory: project 1's
// status_document_id (99) names a document that does not exist among its
// own documents (only document 1 belongs to project 1). This exercises the
// resolve/export disagreement guard without touching the shared fixtures
// under tests/fixtures/data, which mirror production shape and back other
// tests' assertions.
const INVALID_DATA_DIR = path.resolve(process.cwd(), "tests", "fixtures", "data-invalid");

describe("loadProjectRecord: status_document_id integrity", () => {
  const originalDataDir = process.env["IMPACTO_DATA_DIR"];

  beforeEach(() => {
    process.env["IMPACTO_DATA_DIR"] = INVALID_DATA_DIR;
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env["IMPACTO_DATA_DIR"];
    else process.env["IMPACTO_DATA_DIR"] = originalDataDir;
  });

  it("throws naming the project id and the offending status_document_id when it names a document outside the project", async () => {
    await expect(loadProjectRecord(1)).rejects.toThrow("projects.csv: project 1 status_document_id 99 is not among its documents");
  });
});
