import { describe, expect, it } from "vitest";
import { correctionsByTarget } from "@/components/project/document-timeline";
import type { GazetteDocument } from "@/lib/types";

const doc = (id: number, publishedAt: string, extra: Partial<GazetteDocument> = {}): GazetteDocument => ({
  id, source: "boja", sourceId: `d${id}`, publishedAt, title: "t", url: "https://example.org", projectId: 1,
  role: "aau", verdict: "favorable_condicionada", matchScore: 1, confidence: 1, correctsDocumentId: null, ...extra,
});

describe("correctionsByTarget", () => {
  it("marks the corrected document and its verdict superseded when the correction decides", () => {
    const original = doc(194, "2023-07-24");
    const fix = doc(122, "2023-07-28", { verdict: "desfavorable", correctsDocumentId: 194 });
    const found = correctionsByTarget([original, fix]).get(194);
    expect(found?.by.id).toBe(122);
    expect(found?.supersedesVerdict).toBe(true);
  });

  it("leaves the verdict standing when the correction states none", () => {
    const fix = doc(49, "2023-10-18", { verdict: "no_aplica", correctsDocumentId: 47 });
    expect(correctionsByTarget([doc(47, "2023-09-18"), fix]).get(47)?.supersedesVerdict).toBe(false);
    expect(correctionsByTarget([doc(47, "2023-09-18"), { ...fix, verdict: null }]).get(47)?.supersedesVerdict).toBe(false);
  });

  it("keeps the latest of several corrections", () => {
    const first = doc(2, "2023-08-01", { correctsDocumentId: 1 });
    const second = doc(3, "2023-09-01", { correctsDocumentId: 1 });
    expect(correctionsByTarget([doc(1, "2023-07-01"), second, first]).get(1)?.by.id).toBe(3);
  });

  it("is empty when no document corrects another", () => {
    expect(correctionsByTarget([doc(1, "2023-07-01")]).size).toBe(0);
  });
});
