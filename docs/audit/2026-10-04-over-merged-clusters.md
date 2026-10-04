# Over-merged project clusters

Date: 2026-10-04. Source: read-only query of Neon production (`project_documents` joined to `extractions`), after the Guadame split (former project 34, see `resolution_overrides`). Feeds ticket T3 in [2026-09-30-tickets.md](2026-09-30-tickets.md).

## Result

Of 444 projects, 89 have more than one document. **42 of those 89 merge documents from different plants** (184 of 638 documents, 29%). 5 more are ambiguous. The rest are one plant with its modifications (`/M1`, `MS1`) or its own evacuation line.

Effect on the published figures: each over-merged project counts once, takes its MW and status from its latest document, and unions every plant's municipalities. Project counts are too low, declared MW is too low (Guadame Solar 5's 130.7 MW was hidden this way), and municipality totals include plants that are not theirs.

## Why scoring merges them

`score_pair` (`pipeline/impacto/resolve/scoring.py`) adds name similarity (0.5), a shared municipality (0.3) and MW within 15% (0.2); 0.6 merges. Sister plants share all three: "Guadame I" to "V", "Campos de Córdoba XVI" and "XVIII", "Repotenciación P.E. El Gallego" and "... La Manga". The phase check only reads the last word of the name, so "Guadame IV y línea de evacuación" passes. Union-find then chains pairs, so one shared-infrastructure document (a common substation or line) pulls a whole hub into one project (P147: 13 plants around Guillena; P124: 10 wind farms and hybridizations around Tarifa).

## Over-merged, clear (detector score 2 or more)

| Project | Docs | What is merged |
|---|---|---|
| 147 | 18 | Guillena hub: Guillena I and II, Carmo 1 to 3, Almazara, Garita, Chapitel, Fortaleza, Atlante, FV Guillena, El Naranjo 9, common evacuation works |
| 124 | 22 | Tarifa repowerings: Los Lances, Cortijo de Iruelas, El Gallego, Río Almodóvar, El Ruedo, La Manga, Pasada de Tejeda, La Herrería, Tahivilla, FV hybridizations of La Manga, El Ruedo, El Gallego, La Torre |
| 54 | 10 | Tabernas: La Pared 2, 3 and 4, Tabernas Solar 2 and 3, Tabernas I, Tabernas 100, two substations |
| 47 | 7 | Ronda 2, Nueva Ronda III, CEPSA Ronda I to III, SET Danae (Cádiz) |
| 73 | 7 | Marchenilla VII, Marchenilla VIII, Liberty Marchenilla |
| 143 | 7 | Hybridization PE Puerto Real I, San Patricio II, Puerto Real 110, PE El Marquesado |
| 118 | 5 | El Descubrimiento 027, 028, 029, 90, 91 |
| 619 | 5 | Siroco Hydrogen 1 and 5 (two plants), Arquillo H2 |
| 620 | 5 | Espera H2, Jarico 2, Siroco 4, Abadín H2 |
| 200 | 4 | Puerto de Santa María I and II, shared SET and line |
| 14 | 4 | Caparacena 1 (Liberty), Caparacena 220, Iberdrola Caparacena, ISF Caparacena I |
| 101 | 4 | Dominion Dos Hermanas II, FV Dos Hermanas, Alpha Barroso and its line |
| 269 | 4 | Teleiro, Ingrina, Fregenal and Beliche Amate |
| 364 | 3 | Almonte II, Cascabarra Almonte, PVS Almonte solar 10 x 4.5 MW |
| 35 | 3 | Rey I to III Solar PV (Villablanca) and PSFV Adelfas 1 to 3 |
| 245 | 3 | Marmolejo Solar I (two holders), FRV Arroyadas Marmolejo Solar |
| 504 | 3 | Teleiro, Beliche and Ingrina storage, Los Barrios |
| 132 | 3 | Palintere substation, PVS Chucena, Chucena evacuation |
| 127 | 7 | PE Mamut (wind) and PV Jesús / Santa María |
| 82 | 5 | Chiclana 3 (Invercapital) and Chiclana Sol |
| 51 | 4 | Alíjar hybridization, El Barroso Solar Fase I, Suresa Alíjar |
| 335 | 3 | Casares Solar I (Solar Capital 2000) and FV Casares I (Ventaja Solar 7) |
| 449 | 3 | Parque Solar Aznalcóllar, Chucena II, common evacuation |

## Over-merged, found by manual review (detector score under 2)

| Project | What is merged |
|---|---|
| 11 | Iberdrola hybridizations La Retuerta, Tallisca, Valdefuentes |
| 81 | Palillos Energy, Viso Energy, HSF Viso Solar |
| 86 | PE Villanueva and Villanueva II |
| 89 | Adar and Mitralex, Puerto de Santa María |
| 95 | PE El Búho and PSFV LDV Sierra de Arcas |
| 129 | Repowering Carrascal I and Cerradilla I |
| 138 | Repowering Carrascal II and Cerradilla II |
| 162 | Crisadar and Mitralex, Tajo de la Encantada |
| 201 | Benahadux and Benahadux Solar 59 |
| 209 | Crisadar Gabias and Las Gabias 1 |
| 279 | Hinojos A and Hinojos B |
| 287 | Andújar I to III (Ence) and Olivares I and II |
| 304 | PSFV Los Isletes hybrid and PE Híbrido Jerez |
| 326 | Gibralgalia and Gibralgalia II |
| 382 | Martín Alonso Pinzón and Vicente Yáñez Pinzón |
| 407 | Puerto de Santa María and Puerto de Santa María 2 |
| 451 | Campos de Córdoba XVI and XVIII |
| 516 | Humilladero Hive and Magasquilla Hive |
| 517 | El Cortijo and El Cortijo Fase II |

## Ambiguous, check the gazette text

| Project | Question |
|---|---|
| 25 | PFot-365 (Posets, Faballones) and PFot-365 AC (Natera, Orla): one procedure or two? |
| 40 | Campos del Condado VI under Arena Power Solar 33 and 35 |
| 42 | Joint DIA for Ciudad de Tartessos I and II, plus the AAU for II only |
| 108 | PE Perdices with SET Borbollón y Perdices, and Borbollón |
| 259 | Marmolejo Solar II: 2020 AAU (Cleveland Bronwns Time) and 2023 AAU (Greenalia San Julián I) |

## Recommendation

Manual overrides cannot keep up: 42 clusters, and new documents can re-bridge a split one. Fix the rule, then use overrides for what it gets wrong:

1. In `score_pair`, return 0 when both documents have an expediente of the same family and province (`AAU/JA`, `AAUS/SE`, `AAI/CA`...) and their base numbers differ, ignoring modification suffixes (`/M1`, `MS1`, `/N`). This splits every row above that has expedientes. Cost: a plant with a second AAU under a new number (Guadame II to V, Zumajo I and II: 2020 and 2023 AAUs) splits too; key those few with `resolution_overrides`, which since 33ce12b is authoritative.
2. Read phase markers anywhere in the name, not only the last word, and treat disjoint sets as a mismatch.
3. Stop a shared-infrastructure document from chaining plants: a document whose name says "infraestructura común", "evacuación común" or "SET colectora" should not union two groups that already disagree.
4. Before shipping, rerun this query and compare cluster counts; add the clusters above as resolve fixtures.

Detector script and raw output: session scratch files, not kept. The query is the join above; signals were distinct expedientes per family, distinct developers after stripping legal forms, and disjoint phase markers.

## Implemented (2026-10-04)

Commit fa2b8fa (`pipeline/impacto/resolve/`):

- `conflict(a, b)` in `scoring.py`: same procedure type and province with a different base number (`procedure_key`, suffixes such as `/M1`, ` MS1`, `/N` ignored), or disjoint phase markers anywhere in the name (`phase_markers`).
- `resolve()` in `run.py` merges scored pairs strongest first, and only when no document of one group conflicts with a document of the other; documents sharing an override key are joined first, even across a conflict, and an unkeyed document that conflicts with a keyed member stays out unless it shares an expediente with another member.
- A modification matches its original procedure in both blocking and scoring.
- `name_key` drops the kind of works (repotenciación, hibridación, híbrido, FV, PSF, HSF, ISF, PVS, modificación, sustancial).

49 override rows were added to production for what the rule cannot see (re-authorised plants under a new number: Marmolejo Solar I and II, Zumajo I and II, Cañuelo I, Siroco Hydrogen 1 and 5, SET Danae; merges across procedure families or without expedientes: Alíjar, El Barroso, El Búho, Sierra de Arcas, Los Isletes, Jerez híbrido, La Herrería, El Ruedo, El Marquesado, Puerto Real I hybridization, the four Caparacena plants, Almonte II, Cascabarra, Tabernas 100, Tabernas I, Tabernas Solar 2 and 3, Viso Solar, Viso Energy, Siroco Hydrogen 6, Ronda 2). Total in `resolution_overrides`: 65 rows, 44 keys.

Result after the production rebuild (export 55591da): 444 projects to 541; 46 over-merged projects split; two modifications joined their originals (Cimera Solar, Celeno Solar); declared MW 11,175.1 to 13,236.6 in 205 projects (was 174).

Left as is, worth a look: P47 keeps CEPSA's joint Ronda I to III document with Nueva Ronda III (Vaguadas) and SET Danae; P51 keeps Suresa's "Módulo PSFV Alíjar" with the Alíjar hybridization; P143 keeps Fénix's "Puerto Real 110" with the Puerto Real I hybridization; P54 keeps the Tabernas collector substation with Tabernas 100; plants are now separate from their own evacuation lines (Esparragal II, Benacazón). An unkeyed document still joins a keyed group when nothing conflicts, so a new document can attach to the wrong keyed plant.
