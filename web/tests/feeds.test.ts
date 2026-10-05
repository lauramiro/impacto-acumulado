import { describe, expect, it } from "vitest";
import { atomFeed, FEED_SIZE, newest, type FeedEntry } from "@/lib/feeds";
import type { GazetteDocument } from "@/lib/types";

const doc = (id: number, publishedAt: string, extra: Partial<GazetteDocument> = {}): GazetteDocument => ({
  id,
  source: "boja",
  sourceId: `d${id}`,
  publishedAt,
  title: `Anuncio ${id}`,
  url: `https://example.org/${id}.pdf?a=1&b=2`,
  projectId: 7,
  role: "aau",
  verdict: "favorable_condicionada",
  matchScore: 1,
  correctsDocumentId: null,
  confidence: 0.9,
  ...extra,
});
const entry = (d: GazetteDocument, projectName: string | null = "Planta <Uno> & Dos"): FeedEntry => ({ doc: d, projectName });
const feed = (entries: FeedEntry[]) =>
  atomFeed({ path: "/feeds/municipio/11021.xml", page: "/municipio/11021", title: "Impacto Acumulado · Jimena", subtitle: "S", generatedAt: new Date("2026-10-04T08:00:00Z"), entries });

describe("atomFeed", () => {
  it("writes the elements Atom requires and escapes text and URLs", () => {
    const xml = feed([entry(doc(1, "2026-07-24"))]);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom"/);
    for (const tag of ["<id>", "<title>", "<updated>2026-07-24T00:00:00Z</updated>", "<author><name>", 'rel="self"', "<entry>"]) expect(xml).toContain(tag);
    expect(xml).toContain("<title>Autorización ambiental unificada: Planta &lt;Uno&gt; &amp; Dos</title>");
    expect(xml).toContain('href="https://example.org/1.pdf?a=1&amp;b=2"');
    expect(xml).toContain('<link rel="related" type="text/html" href="https://impacto-acumulado.vercel.app/proyecto/7"/>');
    expect(xml).toContain("<id>tag:impacto-acumulado.vercel.app,2026-09-20:documento/1</id>");
    expect(xml).toContain("favorable con condiciones, publicado en el BOJA el 24 de julio de 2026");
  });

  it("falls back to the generation date when a feed has no entries", () => {
    expect(feed([])).toContain("<updated>2026-10-04T08:00:00Z</updated>");
  });
});

describe("newest", () => {
  it("keeps the newest FEED_SIZE documents, newest first", () => {
    const many = Array.from({ length: FEED_SIZE + 5 }, (_, i) => entry(doc(i + 1, `2025-01-${String((i % 28) + 1).padStart(2, "0")}`)));
    const kept = newest(many);
    expect(kept).toHaveLength(FEED_SIZE);
    for (let i = 1; i < kept.length; i++) expect(kept[i - 1].doc.publishedAt >= kept[i].doc.publishedAt).toBe(true);
  });
});
