import { formatDate } from "@/lib/format";
import { ROLE_LABELS, VERDICT_LABELS } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import type { GazetteDocument } from "@/lib/types";

/** Entries per feed: the newest documents only. */
export const FEED_SIZE = 50;

/** Tag URIs (RFC 4151) keep entry ids stable if the site moves; the date is the authority's start. */
const TAG = "tag:impacto-acumulado.vercel.app,2026-09-20";
const GAZETTE = { boe: "BOE", boja: "BOJA" } as const;

export type FeedEntry = { doc: GazetteDocument; projectName: string | null };

export type Feed = {
  /** Path under the site, e.g. "/feeds/municipio/11021.xml". */
  path: string;
  /** Page the feed follows, e.g. "/municipio/11021". */
  page: string;
  title: string;
  subtitle: string;
  /** When the data was generated: the feed's <updated> when it has no entries. */
  generatedAt: Date;
  entries: readonly FeedEntry[];
};

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Newest first (by publication date, then document id), at most FEED_SIZE. */
export function newest(entries: readonly FeedEntry[]): FeedEntry[] {
  return [...entries]
    .sort((a, b) => b.doc.publishedAt.localeCompare(a.doc.publishedAt) || b.doc.id - a.doc.id)
    .slice(0, FEED_SIZE);
}

function entryXml({ doc, projectName }: FeedEntry): string {
  const kind = doc.role ? ROLE_LABELS[doc.role] : "Documento";
  const verdict = doc.verdict && doc.verdict !== "no_aplica" ? VERDICT_LABELS[doc.verdict] : null;
  const title = projectName ? `${kind}: ${projectName}` : `${kind}: ${doc.title}`;
  const summary = [
    `${kind}${verdict ? `, ${verdict.toLowerCase()}` : ""}, publicado en el ${GAZETTE[doc.source]} el ${formatDate(doc.publishedAt)}.`,
    doc.title,
  ].join(" ");
  const project = doc.projectId !== null ? `\n    <link rel="related" type="text/html" href="${SITE_URL}/proyecto/${doc.projectId}"/>` : "";
  return `  <entry>
    <id>${TAG}:documento/${doc.id}</id>
    <title>${xml(title)}</title>
    <updated>${doc.publishedAt}T00:00:00Z</updated>
    <link rel="alternate" type="${doc.source === "boe" ? "text/html" : "application/pdf"}" href="${xml(doc.url)}"/>${project}
    <category term="${doc.role ?? "documento"}" label="${xml(kind)}"/>
    <summary type="text">${xml(summary)}</summary>
  </entry>`;
}

/** An Atom 1.0 document (RFC 4287): feed id, title, updated, author, self and alternate links, entries. */
export function atomFeed(feed: Feed): string {
  const entries = newest(feed.entries);
  const updated = entries.length > 0 ? `${entries[0].doc.publishedAt}T00:00:00Z` : feed.generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="es">
  <id>${SITE_URL}${feed.path}</id>
  <title>${xml(feed.title)}</title>
  <subtitle>${xml(feed.subtitle)}</subtitle>
  <updated>${updated}</updated>
  <author><name>Impacto Acumulado</name><uri>${SITE_URL}/</uri></author>
  <link rel="self" type="application/atom+xml" href="${SITE_URL}${feed.path}"/>
  <link rel="alternate" type="text/html" href="${SITE_URL}${feed.page}"/>
${entries.map(entryXml).join("\n")}
</feed>
`;
}

export function atomResponse(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
}
