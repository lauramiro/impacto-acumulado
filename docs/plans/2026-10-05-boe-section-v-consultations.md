# Plan: BOE section V consultations (item 6)

Date: 2026-10-05. Status: done 2026-10-05. 120 announcements stored, after removing three Red Eléctrica grid works and 18 storage modules exempt from assessment (Real Decreto 997/2025; commits 5f4dc0c, b0c325a); assessed storage modules resolve as projects of their own. 585 projects. Source of every figure below: the cached BOE daily summaries in `pipeline/.cache` (2019-01-01 to 2026-10-04), read without network requests.

## What is missing today

The BOE fetcher reads section III only, where the ministry publishes its decisions (impact declarations). Consultations on state-authorised plants (over 50 MW) are announcements in section V, published by the Government's industry and energy offices. None are in the database, so a large plant appears only when its decision arrives, after the consultation has closed.

## What the cache holds

- 521 section V announcements put a renewable project in Andalucía to "información pública" (the fetcher's own Andalucía test on the title).
- 101 name the environmental assessment in the title ("impacto ambiental", "evaluación ambiental", "estudio de impacto"): 97 from State offices, 3 from the Junta, 1 other. By year: 2019 2, 2020 4, 2021 56, 2022 10, 2023 2, 2024 15, 2025 9, 2026 3.
- 420 others are energy-only in the title (administrative authorisation, public utility for expropriation): 288 Junta, 132 State. Some may include the environmental assessment without saying so in the title.
- Nothing among the 101 is open today: the latest is BOE-B-2026-20864 (19 June 2026), whose 30 business days ended in early August.
- 85 of the 101 match an existing project by name (similarity 90 or more): they add the consultation to that project's history. About 16 would start new projects, among them four 2025 wind farms with no decision yet (Montegordo, Chiquera, Chicuco, Chiclanejos), two Ministry of Agriculture irrigation solar plants (2024), the Carboneras desalination plant's solar plant (Ministry for the Ecological Transition, water directorate, 2025), and some 2020-2022 projects with no decision published since.
- One publisher is outside Andalucía (BOE-B-2024-42516, Delegación del Gobierno en Castilla-La Mancha): kept only if its text names an Andalusian municipality.

## Steps

1. Code, with tests: a section V rule in `impacto.fetch.boe.select_items`; parsing of section V XML (to be checked against real documents in step 2); a stripper that removes landowner annexes ("relación de bienes y derechos afectados", tables of owners and parcels) before anything is stored; the deadline parser run on the BOE wording.
2. Dry run, no database writes and no LLM calls: fetch the 101 and the 420 into the HTTP cache only, and report per announcement whether an annex was found and how much text it removed, the objection period read, the Andalusian municipalities named, and, for the 420, whether the body includes the environmental assessment. The report comes to you before step 3.
3. On approval: store and extract through the weekly workflow (`from` 2019-01-01, an extraction limit that covers the set), on Mistral `ministral-14b-latest`: about 101 calls plus whatever the body check adds.
4. Resolve, aggregate, export; the resolve check's report lists every project the new documents joined or split; verify the open list, the timeline and the headline.
5. A data-protection note in the repository: what is processed, its legal basis (reuse of public-sector information, Ley 37/2007), what is dropped (landowner annexes), and where data goes (Neon, Mistral, Groq, Vercel).

## Effects

- Open-consultations list: no change today; from now on, State consultations appear the week they are published (about 9 a year in 2025-2026, the largest projects).
- Project histories: about 85 projects gain their consultation; about 16 new projects, most "en consulta".
- Headline: new projects with declared MW add to "aprobados o en trámite".
- Timeline: about 100 more consultation events, most in 2021.

## Cost and risk

- About 520 one-off BOE requests (cached afterwards); about 101 to 150 Mistral calls; then a few a week.
- Personal data: landowner annexes are removed before storage and before the LLM; an announcement where the stripper cannot find the annex boundary is held back for review, not stored whole.
- The over-merge rule already reads State files (PFot, PEol, PHib), so new announcements land under it, and the weekly resolve check reports anything they merge or split.
