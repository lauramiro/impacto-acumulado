import { describe, expect, it } from "vitest";
import { stillOpen, type Consultation } from "@/lib/consultations";

const base: Omit<Consultation, "documentId" | "deadline" | "publishedAt" | "period"> = {
  projectId: 1,
  projectName: "P",
  title: "T",
  url: "u",
  source: "boja",
  sourceId: "s",
  ineCodes: [],
};
const withDeadline = (id: number, publishedAt: string, deadline: string): Consultation => ({
  ...base,
  documentId: id,
  publishedAt,
  deadline,
  period: { amount: 30, unit: "habiles", evidence: "plazo de 30 días hábiles" },
});
const unstated = (id: number, publishedAt: string): Consultation => ({ ...base, documentId: id, publishedAt, deadline: null, period: null });

describe("stillOpen", () => {
  const items = [withDeadline(1, "2026-07-27", "2026-09-07"), withDeadline(2, "2026-07-24", "2026-09-04"), unstated(3, "2026-08-20")];

  it("keeps notices whose deadline is today or later, nearest first, and unstated ones for 30 days", () => {
    expect(stillOpen(items, new Date("2026-09-04T10:00:00Z")).map((c) => c.documentId)).toEqual([2, 1, 3]);
    expect(stillOpen(items, new Date("2026-09-05T10:00:00Z")).map((c) => c.documentId)).toEqual([1, 3]);
    expect(stillOpen(items, new Date("2026-09-19T10:00:00Z")).map((c) => c.documentId)).toEqual([3]);
    expect(stillOpen(items, new Date("2026-09-20T10:00:00Z"))).toEqual([]);
  });
});
