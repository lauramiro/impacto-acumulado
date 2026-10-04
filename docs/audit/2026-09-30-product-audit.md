# Impacto Acumulado: product audit

Date: 2026-09-30
Scope: live site https://impacto-acumulado.vercel.app, the repository, and the published data in `web/public/data/` (export of 2026-09-30, 433 projects, 638 documents).
Method: read the code and exported data, reviewed the home, municipality (`/municipio/11021`) and project (`/proyecto/34`) pages, profiled the CSVs with ad hoc scripts, researched comparable platforms.
Not verified: phone-width rendering (the browser resize did not apply during the review), so this audit makes no mobile claims.

Tickets derived from this audit: [2026-09-30-tickets.md](2026-09-30-tickets.md).

## 1. What the product is

Impacto Acumulado turns BOE and BOJA environmental resolutions and public-consultation notices into structured data with an LLM, groups documents into projects, and aggregates them per municipality, Natura 2000 site and province. Its thesis: every renewable project is assessed on its own, and nobody publishes the running total.

Target users:

- Environmental NGOs preparing objections (alegaciones).
- Town councils and local platforms deciding whether to oppose a project.
- Journalists and researchers covering the renewables build-out in Andalusia.

Primary task: "How much has been approved or is pending here, how much of it sits in sensitive land, and which documents prove it?"

Secondary task, the most time-sensitive one: "Is anything open for objection right now, and until when?" The site does not serve this today.

## 2. What similar platforms do

| Platform | What it offers | Limit |
|---|---|---|
| Catalonia environmental renewables viewer (Generalitat) | Official. Operating and in-permitting wind and solar, location, environmental procedure status. | Per project, no cumulative view. |
| IDEAragon renewables data | Official. CSV and GeoJSON; status classes include "Periodo de alegaciones". | Per project. |
| Ecologistas en Acción Aragón viewer (QGIS Cloud) | Built from the BOA since 2022. Project polygons, objection deadlines, developers; also batteries, hydrogen, data centres, mining. | Maintained by hand. |
| MITECO SABIA | Official procedure status for state-level assessments; search by developer, file code, status. | No aggregation. |
| MIEA, Agencia Andaluza de la Energía | Operating plants and grid in Andalusia; municipal and provincial reports every six months. | No projects in permitting. |
| SEO/BirdLife compatibility maps and permitting observatory | Bird-based sensitivity layers; NGO view of permitting. | Not project-level cumulative totals. |
| Global Energy Monitor solar and wind trackers, Ownership Tracker | Phase-level data, a footnoted fact sheet per project, ownership chains to parent companies. | Global, coarse for local use. |
| UK Renewable Energy Planning Database | Full lifecycle: inception, planning, construction, operation, decommissioning. | UK only. |
| Sabin Center Opposition Report | Links contested projects and local restrictions to outcomes. | US only. |
| PlanningAlerts, Global Forest Watch | Subscribe to an area and get alerts on new items. | Different domain; the pattern transfers. |

Gap shared by all of them: none aggregates cumulative load per municipality or protected area and ties it to sensitivity. Official viewers are per project; NGO maps are manual and go stale. That niche belongs to this product.

## 3. Gaps

### Data trust

1. MW totals omit about 6.2 GWp already in the data. 135 projects have `mw_peak` and no `mw_nominal`; the aggregate SQL (`db/aggregate/*.sql`) sums only `mw_nominal`. Hence the headline "MW declarados en 167 de 433 proyectos". A labelled peak fallback would bring coverage to roughly 308 of 433.
2. The headline sums refused projects. "En conjunto suman 10.804,2 MW, con Cádiz y Málaga a la cabeza" (`web/src/app/page.tsx`). Of Málaga's 2,178.7 MW, 1,458.1 MW is desfavorable; of Cádiz's 3,900.4 MW, 1,579.3 MW is. The province ranking is driven by refusals, which are part of the record but not cumulative impact.
3. Entity resolution over-merges. `/proyecto/34` "Guadame III" (50 MW) holds 16 documents across 8 municipalities, including the BOE DIA for "Guadame Solar 5" (138.4 MWp) and at least five Marmolejo AAU notices with distinct PP numbers. MW and hectares come from the latest document that cites them (`_latest_with` in `pipeline/impacto/resolve/run.py`), so every merged project's capacity disappears. Clusters of 10, 16, 18 and 22 documents exist. Marchenilla VII shows información pública notices in 2024 after AAU approvals in 2022.
4. Four projects carry only a generic name ("Planta Solar Fotovoltaica", "Parque solar fotovoltaico"); one refused 801 MW project appears as "Plantas Solares Fotovoltaicas" with "Promotor no identificado".
5. 123 projects (28%) have no status ("Sin veredicto leído"). 127 of their documents are BOJA AAU notices classified `no_aplica`, mostly "se da publicidad al informe vinculante" announcements whose verdict is in the body or not stated.
6. The status filter offers "Favorable (0)", which can never match.
7. Hectares is offered as an equal metric but is present for 77 of 433 projects (18%).
8. Developer names are not normalised: 362 distinct strings, e.g. "Enel Green Power España, S.L." and "Enel Green Power España, SL".

### Content and task

9. No objection deadlines on información pública items.
10. No way to follow a municipality or site, although the weekly pipeline already produces the new items.
11. Project pages show none of the extracted substance. The extraction schema holds `conditions`, `species_mentioned`, `protected_areas_mentioned`, `expediente`, `evidence` and `utm_coordinates`, but `pipeline/impacto/aggregate/export.py` exports none of them. Documents are labelled with IDs such as `disposition.2023.16.137`. Guadame III's status is fixed by a corrección de errores.
12. No baseline of operating capacity: a municipality with 500 MW already built and no new filings reads as "sin proyectos".
13. Rankings are not normalised by area. Jimena de la Frontera tops the index partly because an 801 MW refused project and a 216.6 MW wind project count in full in each of their 4 and 5 municipalities. `area_ha` is already in `municipalities.geojson`.
14. The Natura 2000 table repeats values: four sites show 1,040.6 MW each from the same three projects. It reads as a ranking and is not one.
15. The methodology page says the extractor does not yet separate evacuation-line municipalities, while `pipeline/impacto/extract/validate.py` already splits `evacuation_municipalities`. Either the page is stale or resolve does not use the split; to verify.

## 4. Insights available from the current data

- Possible splitting (fraccionamiento): 75 of 308 projects with a MW figure fall between 45 and 50 MW, just under the 50 MW line where competence moves from the Junta to the State. Numbered project companies cluster: Tayant Investment 12, 13, 14 and 15 (four plants of 49.8 MW in Jimena and Castellar); "Arena Green Power Ren N" appears as 16 companies.
- Refusal rates differ sharply by province (desfavorable over decided): Cádiz 22 of 78, Málaga 7 of 17, Granada 5 of 15, Sevilla 1 of 114, Huelva 0 of 32.
- Time to decision: median about 382 days between first and last document for the 79 multi-document projects (inflated by over-merging; see gap 3).
- Evidence coverage by year: 4 documents in 2019, 1 in 2020, 0 in 2021, 303 in 2023.

## 5. Opportunities

- Splitting flag on projects and municipalities (sub-50 MW clusters, numbered-company families, shared evacuation). Directly usable in objections.
- Outcome views: refusal rate and time to decision by province and technology.
- Developer pages with normalised names, company families and optional links to GEM ownership data.
- Grid access capacity by node (Red Eléctrica, monthly) to show where the next wave of applications is likely.
- Point locations from `utm_coordinates` where extracted.
- Static Atom feeds per municipality and per Natura site as a no-backend alert channel.

## 6. Priorities, by user value

1. Fix what the totals mean: peak fallback, split approved or pending from refused, MW per km². (T1, T2)
2. Review over-merged clusters with the existing `resolution_overrides`. (T3)
3. Open consultations with deadlines, plus feeds. (T5, T6)
4. Show extracted substance on project pages. (T7)
5. Splitting flag. (T9)
6. Operating baseline from MIEA. (T10)
7. Developer normalisation and pages. (T8)
8. Outcome analytics. (T11)

## Sources

- https://mediambient.gencat.cat/es/detalls/Articles/visor
- https://datos.gob.es/es/catalogo/a02002834-datos-de-energias-renovables-en-aragon-idearagon1
- https://www.diariodeteruel.es/teruel/ecologistas-en-accion-mejora-el-visor-sobre-renovables-en-aragon
- https://geoinnova.org/blog-territorio/proyecto-sabia/
- https://www.agenciaandaluzadelaenergia.es/miea/
- https://seo.org/mapaswebdecompatibilidadrenovablesresponsables/
- https://observatorioclima.seo.org/tramitacion-renovable/
- https://globalenergymonitor.org/projects/global-solar-power-tracker
- https://globalenergymonitor.org/projects/global-energy-ownership-tracker
- https://www.data.gov.uk/dataset/a5b0ed13-c960-49ce-b1f6-3a6bbe0db1b7/repd
- https://climate.law.columbia.edu/news/new-sabin-center-reports-find-widespread-restrictions-and-misinformation-are-hampering
- https://www.planningalerts.ie/about
- https://globalnaturewatch.org/help/use-gfw/monitor-forest-change/
- https://www.transicionjusta.gob.es/en/la-transicion-justa/nudo-de-transicion-justa.html
