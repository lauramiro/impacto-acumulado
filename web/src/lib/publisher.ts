/**
 * Who publishes the site. Not decided yet, so every field is null and nothing
 * here is invented: each page that uses a constant renders it only when it is
 * set, and reads correctly with all of them null. Fill them in here, nowhere else.
 */

/** Full name of the person who maintains and publishes the site (an individual, independent personal project). */
export const PUBLISHER_NAME: string | null = null;

/** Public URL of the publisher (personal page or profile), if there is one. */
export const PUBLISHER_URL: string | null = null;

/** Contact email for corrections and questions. */
export const CONTACT_EMAIL: string | null = null;

/** One or two sentences on who funds the project, or that it has no funding. */
export const FUNDING_STATEMENT: string | null = null;

/** Licence of the source code (the data is CC BY 4.0), as an SPDX-style name, e.g. "MIT". */
export const CODE_LICENSE: string | null = "MIT";

/** URL of the licence text, if CODE_LICENSE is set. */
export const CODE_LICENSE_URL: string | null = "https://spdx.org/licenses/MIT.html";

const SITE_NAME = "Impacto Acumulado";

/**
 * The citation line, shared by /datos and /acerca. With a publisher it leads the
 * reference and the site is the title; without one the site itself is the author.
 */
export function citationText(args: { year: number; date: string; url: string; publisher?: string | null }): string {
  const publisher = args.publisher === undefined ? PUBLISHER_NAME : args.publisher;
  const lead = publisher ? `${publisher} (${args.year}). ${SITE_NAME}. ` : `${SITE_NAME} (${args.year}). `;
  return `${lead}Resoluciones ambientales de proyectos renovables en Andalucía, 2019 a ${args.year}. Datos a ${args.date}. ${args.url}`;
}

/** schema.org creator for the Dataset: the publisher (a Person) when known, else the site itself. */
export function datasetCreator(
  siteUrl: string,
  publisher: { name: string | null; url: string | null } = { name: PUBLISHER_NAME, url: PUBLISHER_URL },
) {
  return publisher.name
    ? { "@type": "Person", name: publisher.name, ...(publisher.url ? { url: publisher.url } : {}) }
    : { "@type": "Organization", name: SITE_NAME, url: siteUrl };
}
