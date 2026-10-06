import { describe, expect, it } from "vitest";
import { matchRank, searchSite, type SearchEntry } from "@/lib/site-search";

const entry = (kind: SearchEntry["kind"], name: string, keys: string[] = []): SearchEntry => ({ kind, name, detail: "", href: `/${kind}/${name}`, keys });

const entries: SearchEntry[] = [
  entry("proyecto", "Parque solar Ronda I", ["AAU/MA/012/21"]),
  entry("municipio", "Ronda"),
  entry("municipio", "Arriate"),
  entry("promotor", "Ronda Solar, S.L."),
  entry("espacio", "Doñana", ["ES0000024"]),
  entry("proyecto", "Planta Huelva Norte", ["AAU/HU/057/21"]),
];

describe("matchRank", () => {
  it("ranks a name that starts with the query over a word inside it, over text inside it", () => {
    expect(matchRank(entry("municipio", "Ronda"), "ron")).toBe(0);
    expect(matchRank(entry("proyecto", "Parque solar Ronda I"), "ron")).toBe(1);
    expect(matchRank(entry("municipio", "Carmona"), "mona")).toBe(2);
  });
  it("ignores accents and case", () => {
    expect(matchRank(entry("espacio", "Doñana"), "donana")).toBe(0);
  });
  it("finds an expediente whatever its separators, and a site code", () => {
    expect(matchRank(entries[5]!, "aau hu 057")).toBe(3);
    expect(matchRank(entries[4]!, "es0000024")).toBe(3);
  });
  it("does not match on nothing", () => {
    expect(matchRank(entry("municipio", "Ronda"), "  ")).toBeNull();
    expect(matchRank(entry("municipio", "Ronda"), "xyz")).toBeNull();
  });
});

describe("searchSite", () => {
  it("puts the place first when names tie, then the developer, then the project", () => {
    expect(searchSite(entries, "ronda").map((e) => e.kind)).toEqual(["municipio", "promotor", "proyecto"]);
  });
  it("keeps to the limit", () => {
    expect(searchSite(entries, "a", 2)).toHaveLength(2);
  });
});
