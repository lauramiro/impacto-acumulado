import { expect, it } from "vitest";
import { loadMeta } from "@/lib/data/meta";

it("loads meta.json and parses the timestamp", async () => {
  const meta = await loadMeta();
  expect(meta.generatedAt.toISOString()).toBe("2026-09-21T13:50:15.691Z");
  expect(meta.counts.projects).toBe(2);
});

it("lists every export with rows and bytes", async () => {
  const meta = await loadMeta();
  expect(meta.files["projects.csv"]).toEqual({ rows: 2, bytes: 400 });
  expect(Object.keys(meta.files)).toHaveLength(21);
});

it("carries the newest document date and the BOJA coverage check", async () => {
  const meta = await loadMeta();
  expect(meta.lastDocument).toBe("2026-09-08");
  expect(meta.bojaCoverage).toMatchObject({ selected: 10, stored: 9, missing_count: 1 });
  expect(meta.bojaCoverage?.years["2026"]).toEqual({ total_hits: 100, received: 100, selected: 10, stored: 9 });
  // A check that ran out of time says which year it reached back to.
  expect(meta.bojaCoverage).toMatchObject({ timed_out: true, scanned_from: "2026-01-01" });
});
