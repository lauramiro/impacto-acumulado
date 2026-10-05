import { describe, expect, it } from "vitest";
import { sortRows } from "@/components/lookup-table";
import { developerMwMark, developerMwSort, type DeveloperRow } from "@/components/developer-index";
import { NO_DATA, NO_PROJECTS } from "@/lib/format";

describe("sortRows", () => {
  const rows = [
    { k: "a", v: null },
    { k: "b", v: 5 },
    { k: "c", v: null },
    { k: "d", v: 1 },
  ] as const;
  const keys = (rs: readonly { k: string }[]) => rs.map((r) => r.k);

  it("puts null values last in either direction, keeping their order", () => {
    expect(keys(sortRows(rows, (r) => r.v, "ascending"))).toEqual(["d", "b", "a", "c"]);
    expect(keys(sortRows(rows, (r) => r.v, "descending"))).toEqual(["b", "d", "a", "c"]);
  });

  it("sorts text with the Spanish collator", () => {
    const names = [{ k: "Ávila" }, { k: "zamora" }, { k: "Almería" }];
    expect(keys(sortRows(names, (r) => r.k, "ascending"))).toEqual(["Almería", "Ávila", "zamora"]);
  });
});

describe("developer MW column", () => {
  const row = (o: Partial<DeveloperRow>): DeveloperRow => ({
    key: "k",
    name: "n",
    names: ["n"],
    projects: 1,
    accumulatingMw: 0,
    accumulatingWithMw: 0,
    refused: 0,
    municipalities: 1,
    ...o,
  });

  it("marks no approved or pending projects apart from projects without MW", () => {
    expect(developerMwMark(row({ projects: 1, refused: 1 }))).toBe(NO_PROJECTS);
    expect(developerMwMark(row({ projects: 2, refused: 1 }))).toBe(NO_DATA);
    expect(developerMwMark(row({ projects: 2, accumulatingMw: 50, accumulatingWithMw: 1 }))).toBeNull();
  });

  it("gives a missing figure no rank, so it sorts after every number", () => {
    expect(developerMwSort(row({ projects: 1, refused: 1 }))).toBeNull();
    expect(developerMwSort(row({ projects: 1 }))).toBeNull();
    expect(developerMwSort(row({ accumulatingMw: 0.5, accumulatingWithMw: 1 }))).toBe(0.5);
  });
});
