# Data protection note

What personal data this project handles, what it drops, and where data goes. Written 2026-10-05 when BOE section V announcements were added. It records facts about the pipeline; it is not a legal assessment. A review by someone qualified in Spanish data protection is due before the site is promoted to NGOs, councils or the press.

**Launch status:** open item. The review by someone qualified in Spanish data protection described above is not yet recorded; no reviewer, date or outcome is on file. Update this line when it is.

## Sources

Official gazettes only: the BOE (sections III and V) and the BOJA. Their texts are public and are reused under Ley 37/2007 on the reuse of public-sector information and each gazette's reuse conditions (stated on `/datos`).

## Personal data in the sources, and what happens to it

- **Landowner lists.** BOE section V announcements on energy projects can end with a list of affected land and its owners, with names and identity numbers. `impacto.privacy.strip_personal_annex` cuts that list, and everything after it, before the text is stored, cached or sent to an LLM. These announcements are fetched without the HTTP cache, so the uncut text is never written to disk. If an identity number or an owner label survives the cut, the announcement is held back and not stored at all; the fetch logs it for review.
- **Officials' names.** Resolutions are signed by the official who issues them (a delegate, a director general). Those names stay in the stored text, as part of the official act, and are not published by the site.
- **Developers.** Projects are attributed to the company that promotes them. On 2026-10-04 none of the 439 developer names in the export was a natural person; a natural person as developer would be published as the gazette names them.
- **Quotes and conditions.** Since 2026-10-05 the site publishes, per document, short quotes (at most about 200 characters) that back the fact-sheet figures, and the model's summaries of the conditions a decision sets (`project_details.json`). Quotes are limited to the fact-sheet fields (type, verdict, name, developer, expediente, technology, capacity, surface, turbines, municipalities); a quote or condition holding an identity number is dropped at export. A scan on 2026-10-05 for personal titles and identity labels (D., Dña., Don, Sr., NIF, DNI, alegante) found only place names ("Don Rodrigo", "SET Doña María").
- **People who object.** Gazette texts can name parties who submitted objections. They stay in the stored text and are not published.

What the site publishes is in `web/public/data/`: project names, developers, municipalities, figures, statuses, gazette references and links. Full gazette texts are not published.

## Where data goes

| Service | What it holds | Where |
|---|---|---|
| Neon (Postgres) | Stored gazette texts (stripped), extractions, projects | Frankfurt (project `calm-sunset-94532458`) |
| Mistral | Text of each document sent for extraction (stripped) | Mistral's API |
| Groq | Same, when the weekly run uses it | Groq's API |
| GitHub | Code, the published export, the Actions HTTP cache (gazette summaries and section III documents; section V announcements are not cached) | GitHub |
| Vercel | The built site and the export | Vercel |

The site sets no cookies and loads no analytics. It has no user accounts and stores no email addresses. Error reports go through GitHub issues, under the reporter's own GitHub account.
