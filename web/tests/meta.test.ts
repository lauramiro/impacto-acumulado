import { expect, it } from "vitest";
import { loadMeta } from "@/lib/data/meta";

it("loads meta.json and parses the timestamp", async () => {
  const meta = await loadMeta();
  expect(meta.generatedAt.toISOString()).toBe("2026-09-21T13:50:15.691Z");
  expect(meta.counts.projects).toBe(2);
});
