# Extraction fixes measured against the 20-label evaluation

Date: 2026-09-22
Status: implemented; production re-extracted with prompt v4 on 2026-09-28
Parent design: [2026-09-18-impacto-acumulado-design.md](2026-09-18-impacto-acumulado-design.md)
Related slice: [2026-09-22-web-slice-2-design.md](2026-09-22-web-slice-2-design.md), which
produced the labels and the baseline this spec is designed against, and which
explicitly deferred extraction bugs to a later slice.

## Progress log

Kept current so a compacted conversation loses nothing. Update on every
approval and every milestone.

- 2026-09-22: brainstorming. Sections 1, 2 and 3 approved in chat. Spec
  written. Work happens in the worktree
  `.claude/worktrees/extraction-fixes` on branch `worktree-extraction-fixes`,
  branched from `main` at `8071225`. Nothing implemented yet.
- 2026-09-23: scope revised by user decision. Slice 2 is deployed, so the
  reason for stopping at the extractor is gone: re-extraction, resolve,
  aggregate and export are now in scope (section 5). The BOE backfill audit
  (`2f983c8`, recovers `BOE-A-2025-11509`) was rebased and fast-forwarded
  onto `main`, and this branch was rebased onto it. Section 3 now also
  moves the eval runner's default output off `last_run.json`, because
  `export` (run weekly) copies that file to the site. Nothing implemented
  yet. Slice 3 of the web design waits for this slice.
- 2026-09-23: checked against production before planning. The fifteen
  stored `v3` names replace the capture run (section 1b); two of the nine
  misses are head misses outside the trimmer's contract, so the gate is
  seven fixed, two tail-only, six unchanged. The simplified-form rule reads
  the resolving part, because `formula informe de impacto ambiental` is only
  in the title (section 2b). Plan written at
  `docs/superpowers/plans/2026-09-23-extraction-fixes.md`.
- 2026-09-24: Task 6 (section 4, the prompt half). Step 1's eval against
  production, with sections 1 through 3 and section 2a's role bullet all
  live, regressed 8 pairs against the `last_run.json` (`v3`) baseline that
  section 4 had not yet touched:
  `[('BOE-A-2022-18089','mw_nominal'), ('BOE-A-2023-19635','municipalities'),
  ('BOE-A-2023-2580','municipalities'), ('BOE-A-2023-2580','mw_nominal'),
  ('BOE-A-2023-2907','technology'), ('BOE-A-2025-24233','technology'),
  ('BOE-A-2026-3880','mw_nominal'), ('disposition.2023.19.81','municipalities')]`,
  the brief's own stop condition. A diagnostic (with only the section 2a
  `municipalities` bullet swapped for its pre-`ae893e9` wording, everything
  else held at HEAD, then restored) isolated the cause: reverting only that
  bullet collapsed NEW from 8 to 1 (`BOE-A-2022-15703/hectares`, on a field
  the bullet cannot touch - ordinary run-to-run noise), while an identical
  rerun of the unreverted HEAD code produced a *different* 8-pair NEW set
  (2 of 8 pairs churned between the two draws), confirming the bullet, not
  variance, was the dominant cause. Per-field accuracy across the three
  diagnostic runs (before_prompt HEAD / HEAD rerun / reverted bullet):
  municipalities 0.75 / 0.80 / 0.80, mw_nominal 0.80 / 0.80 / 0.90,
  technology 0.85 / 0.90 / 0.95. NEW-pair count: 8 / 8 / 1. Across every
  visible (missed) `municipalities` entry in all three runs the model never
  once tagged a municipality `"evacuacion"` - the role split moved nothing
  in this eval. By user decision, section 2a's prompt wording (the
  `municipalities` bullet asking for a `role`) was dropped and restored to
  its exact pre-`ae893e9` (`v3`) text; the plumbing it added -
  `Municipality.role`, `Extraction.evacuation_municipalities`, the
  `_sanitize` role handling, and the `validate_and_score` split - stays,
  inert until a later prompt actually requests tags (Step 0 commit
  `535f422`, full suite 174 passed).

  With that reverted, Step 1 onward used a variance-aware acceptance rule
  (single-run comparisons are too noisy at n=20 and temperature 0 is not
  fully deterministic on this provider): any non-empty `NEW` from
  `compare_misses.py` is rerun once to a second output path, and a pair
  counts as a regression only when it is `NEW` in both runs. Step 1's rerun
  (post-revert) came back with `NEW` empty on the first draw, so it
  proceeded directly to Step 2.

  Section 4's prompt text (the "instalaciones objeto de esta evaluación"
  paragraph, directly after the capacity bullet) went through three
  revisions against this rule, each revision's acceptance requiring
  recurring `NEW` empty AND the three target misses
  (`BOE-A-2022-15703/technology`, `BOE-A-2022-15703/mw_nominal`,
  `BOE-A-2023-2907/mw_nominal`) fixed in both runs of that revision:
  - Revision 0 (brief's exact text): recurring `NEW`
    `{(BOE-A-2022-15703,mw_peak), (BOE-A-2023-2907,technology)}` - not
    accepted.
  - Revision 1 (added the "hibrida only when several new installations of
    different technology" clause; scoped the solicitud-inicial/descripción-
    final substitution to "the same field, not copied to another field"):
    recurring `NEW` `{(disposition.2025.63.37,technology),
    (disposition.2026.125.87,mw_nominal)}`, and
    `BOE-A-2022-15703/technology` was not fixed in either run of this
    revision - not accepted.
  - Revision 2 (made explicit that hybridising with an existing installation
    is never "hibrida", even when the text says "hibridación"; reworded the
    multi-new-technology clause as its own sentence): all three targets
    fixed in both runs, but recurring `NEW`
    `{(BOE-A-2023-2907,technology), (disposition.2023.221.80,technology)}` -
    not accepted. (One of this revision's two verification runs hit a Neon
    dropped-idle-connection error mid-run with no output produced - a known
    infrastructure issue, not a data point - and was retried.)
  - Revision 3 (kept revision 2's explicit "never hibrida when hybridising
    with an existing installation" wording, reverted to revision 1's
    connective phrasing for the multi-new-technology clause): all three
    targets fixed in both runs and `technology` scored 100% in both runs,
    but recurring `NEW` `{(BOE-A-2022-15703,mw_peak),
    (BOE-A-2022-18089,mw_nominal), (BOE-A-2023-17621,mw_nominal)}` - still
    not accepted.

  Three revisions is the brief's limit. Section 4's prompt text and its
  Step 2 test were reverted to byte-identical `v3` wording (verified by
  diff against `pipeline/impacto/extract/prompts.py` at `87385d6`), and
  `impacto eval --provider mistral` was rerun so `tuned_run.json` reflects
  the shipped code. **Section 4 did not ship.** The two Retuerta
  (`BOE-A-2022-15703`) and `BOE-A-2023-2907` misses the section targeted
  remain in the tuning set, unresolved by this slice.

  Before/after (Task 6 start, i.e. after Tasks 1-5 and the section-2a
  revert, vs. the final shipped-code run) against the `v3` baseline:
  FIXED `[('BOE-A-2022-15703','project_name'), ('BOE-A-2022-18089','project_name'),
  ('BOE-A-2024-16661','project_name'), ('BOE-A-2025-24233','doc_type'),
  ('BOE-A-2025-24233','verdict'), ('disposition.2024.38.48','project_name'),
  ('disposition.2025.23.46','project_name'), ('disposition.2025.63.37','project_name'),
  ('disposition.2026.125.87','project_name')]`; STILL MISSED
  `[('BOE-A-2022-15703','mw_nominal'), ('BOE-A-2022-15703','technology'),
  ('BOE-A-2022-18089','municipalities'), ('BOE-A-2023-19636','municipalities'),
  ('BOE-A-2023-2422','municipalities'), ('BOE-A-2023-2907','mw_nominal'),
  ('BOE-A-2026-3880','municipalities'), ('disposition.2025.144.69','project_name'),
  ('disposition.2026.142.33','project_name')]`; a final single-run comparison
  against `last_run.json`, not subject to the two-run variance rule applied to
  revisions: `BOE-A-2022-15703/hectares` was new against the baseline but not
  reconfirmed in a second run, while `BOE-A-2023-2580/mw_nominal` recurred as new
  across four separate single runs at different revisions (revision 0 run 2,
  revision 1 run 1, revision 2 run 2, post-drop confirmation), suggesting a
  possible instability rather than noise, worth investigation in a later
  data-quality pass. Full per-field accuracy on
  the final shipped-code run is in `pipeline/evaluation/tuned_run.json` and
  quoted in `docs/sources.md`.

  Commit hashes: Task 1 `476ab6b`, Task 2 `37928de`, Task 3 `87385d6`,
  Task 4 `ae893e9`, Task 5 `356fb7e`, Task 7 `5ac5b83`, Task 6 Step 0
  (section 2a prompt revert) `535f422`, Task 6 (this entry, section 4
  measured and dropped) is the commit that carries this progress-log entry.
- 2026-09-24: final whole-branch review (opus, `2f983c8..3317d07`) found
  that `impacto/extract/names.py`'s `_TRAILING_UNIT` dropped a unit after
  any trailing number, not only a 3+-digit one, re-creating the
  capacity-as-phase corruption section 1c had just closed: "Parque eolico
  Ronda II 50 MW" trimmed to "...Ronda II 50", whose `name_key` is "ronda
  ii 50" and `phase_token` "50" (`PHASE` matches `\d{1,2}`), a hard
  `phase_mismatch` block; "PSFV Carmona 49,9 MWp" likewise lost its unit to
  key "carmona 49 9". Fixed by dropping the unit only after an integer of 3
  or more digits that is not the tail of a decimal, with tests
  (`trim_project_name` and `phase_token`/`name_key` on both strings) added
  first and confirmed failing before the fix; code commit `8cf9ac4`, full
  suite 176 passed, ruff clean. The review also found this plan and spec
  still described the section 2a role prompt and section 4 as shipped when
  both were dropped during execution, and that section 5 step 5's plan text
  had no numeric-drift check before export; this commit brings the plan and
  spec in line with what shipped (see the notes on section 2a, section 4
  and section 5 step 1 above, and the corresponding plan edits) and adds
  the numeric-drift check to the plan's Task 9 Step 5. This is the commit
  that carries this progress-log entry.
- 2026-09-28: production re-run (section 5). Branch merged to `main` by
  fast-forward (`2f983c8..5426ea8`). The weekly workflow was disabled for the
  run (today's scheduled run had not fired). Backup branch
  `pre-v4-reextract` = `br-snowy-feather-b26zgt2j`. Fetch stored
  `BOE-A-2025-11509`; documents 71 BOE + 566 BOJA -> 72 + 566. Re-extraction
  finished at 638 `v4 / ok`, no failed rows; served model
  `mistral:ministral-14b-latest`. `evacuation_municipalities` non-empty: 0,
  as expected. doc_type before -> after: aau 477 -> 476, caducidad 1 -> 1,
  dia 61 -> 60, informacion_publica 78 -> 78, informe_impacto 0 -> 4,
  modificacion 11 -> 14, otro 9 -> 5.

  Three section 5 stops tripped and were investigated before export, by
  user decision. Projects 347 -> 433 (+24.8%; 90 new ids, retired ids 26,
  43, 302, 531). Resolving in memory isolated the cause: v3 payloads with
  the current code give 346 projects, v3 payloads with only the names
  trimmed give 431, and swapping in v4 municipalities or v4 `mw_nominal`
  leaves 346. The trimmer accounts for the whole change, and it is a
  correction: in v3 the shared tail "... y su infraestructura/linea de
  evacuacion" made unrelated plants similar enough to chain, so one v3
  project held 32 distinct Sevilla plants (Salteras 1 to 5, Alcala I to V,
  Metaway, Guillena and others, each with its own expediente) and another
  held 10 distinct Tabernas plants. One split looks wrong: Celeno Solar and
  its modification "Soterramiento de Linea de Evacuacion ... Celeno Solar"
  (expedientes `aau/ma/38/20` and `aau/ma/38/20/m1`) are now two projects.
  Total `mw_nominal` moved solar_fv -5.8% and linea_evacuacion +12.0%
  (hibrida -1.8%, eolica and almacenamiento 0%); 40 of 637 documents changed
  `mw_nominal`, `mw_peak` or `hectares` by more than 2%. No code in this
  slice touches capacity; the largest changes are the model reading figures
  differently on a second run (disposition.2023.11.82 300 -> 0.3,
  BOE-A-2023-2578 199.5 -> null, BOE-A-2023-1929 null -> 300), the same
  run-to-run noise the eval measured, some correcting v3 and some
  introducing errors. The user chose to export. Open for a later slice:
  confirming disagreeing capacity figures with a second extraction, and
  grouping a modification with its parent expediente (`/m1`).

## The baseline this is designed against

`pipeline/evaluation/last_run.json`, provider `mistral:ministral-14b-latest`,
20 of 20 labels scored, nothing skipped:

| field | accuracy | n | | field | accuracy | n |
|---|---|---|---|---|---|---|
| developer | 100% | 18 | | doc_type | 95% | 20 |
| mw_peak | 100% | 4 | | verdict | 95% | 20 |
| hectares | 100% | 4 | | technology | 95% | 20 |
| turbines | 100% | 2 | | mw_nominal | 90% | 20 |
| expediente | 100% | 8 | | municipalities | 80% | 20 |
| | | | | project_name | 40% | 15 |

18 misses in total, accounting as: `project_name` 9, `municipalities` 4,
BOE-A-2025-24233 2 (`doc_type` and `verdict`), BOE-A-2022-15703 2
(`technology` and `mw_nominal`), BOE-A-2023-2907 1 (`mw_nominal`).

This figure measures an extractor that had never been tuned on these
documents: nobody opened an extraction while labelling. It is therefore
genuine evidence about unseen documents, caveated only on sample size, and
slice 2 should publish it as it stands.

## Decisions taken during brainstorming, in order

1. The work splits by mechanism, and only the prompt half waits for
   measurement. The deterministic fixes are string matching over document
   text; a unit test measures them, and it is a faster and sharper
   instrument than an eval run.
2. `municipalities` is fixed by adding a role field the model fills, not by
   sharpening an instruction it has already ignored. The prompt has told it
   to exclude evacuation-line municipalities all along.

   **Note, added 2026-09-24:** the prompt half of this decision (the
   `municipalities` bullet asking for a `role`) was dropped during
   execution and reverted to its exact pre-fix `v3` wording, after
   measurement showed the model tagged every municipality `generacion` and
   moved nothing (see the 2026-09-24 progress-log entry). The plumbing -
   `Municipality.role`, `Extraction.evacuation_municipalities`, the
   `_sanitize` role handling and the `validate_and_score` split - shipped
   and stays; it is inert until a later prompt actually requests tags.
3. ~~This slice stops at the extractor.~~ Superseded on 2026-09-23 by user
   decision: the slice carries the fixes through re-extraction, resolve,
   aggregate and export to the published site, and picks up the document
   recovered by the BOE backfill audit on the way. See section 5.
4. The five latent operative-rule gaps found while labelling are recorded
   and deliberately not fixed. See "Deliberately out of scope".
5. Miss detail is persisted to a sibling file, not into `last_run.json`,
   because slice 2 owns that file's contract and copies it to the website.

## The one-way door

Every fix in this spec except one is validated against the same 20 labels
that measure it. On merge, those 20 become a tuning set permanently, and any
accuracy figure published afterwards must come from labels written later.

This is wider than prompt tuning. A `project_name` trimmer derived from the
nine expected-versus-got pairs is tuned on the test set exactly as a prompt
change is; being deterministic and unit-testable makes it sharper, not
blinder. The door is closed by the slice as a whole, not by its prompt half.
Nobody reading "deterministic" later should take it to mean "safe to tune
freely against these 20".

The single exception is the simplified `informe de impacto ambiental` rule in
section 2b. That wording is a fixed statutory form and the rule would be
written identically had BOE-A-2025-24233 never been labelled.

Consequence for the methodology page: publish the figure above, which
predates all tuning. After this slice, `/metodologia` may only publish a
figure measured on labels written after it.

## Scope

In scope, ordered by measured cost. The section that specifies each is named,
because the sections are not in this order:

1. `project_name` tail trimming (9 misses) plus the `phase_token` corruption
   it causes in resolve - section 1.
2. `municipalities` role field (4 misses) - section 2a.
3. The simplified `informe de impacto ambiental` form in `operative.py`
   (2 misses) - section 2b.
4. BOE-A-2022-15703 hibridación and BOE-A-2023-2907 per-plant summing
   (3 misses), the prompt half - section 4.
5. Persisting miss detail from the eval runner, and keeping eval runs off
   the published file - section 3.
6. Re-extracting the corpus and republishing the dataset - section 5.

## Implementation order

Cost order is not build order. Section 3 comes first because every later
eval run depends on it writing somewhere other than the published file:

1. **Section 3**, miss persistence and the output path. No capture run: the
   nine `project_name` pairs are read from production instead (section 1b).
2. **Section 1c**, the `name_key` fix. Independent of everything and repairs
   live data on its own.
3. **Section 1b**, the trimmer, derived from the production pairs.
4. **Section 2a and 2b**, in either order.
5. **Section 4**, the prompt half, last, after 1 to 3 are green.
6. A final eval run to record the after-figure, written to
   `tuned_run.json` (section 3), never to `last_run.json`.
7. **Section 5**, the production re-run, only after the branch is merged to
   `main`, so production data is never produced by unmerged code.

### `last_run.json` must survive every run

`run_eval` today overwrites `pipeline/evaluation/last_run.json`
unconditionally, and `impacto export`, which the weekly workflow runs, copies
that file to `web/public/data/evaluation.json`. The committed copy is the
pre-tuning baseline that `/metodologia` publishes, and it is the last figure
measurable on unseen documents - it cannot be regenerated once this slice
merges.

Restoring it with `git checkout` after each run, as this spec first
proposed, relies on nobody forgetting, and one forgotten commit publishes a
tuning figure on the next weekly run. Section 3 therefore removes the path
instead: after it lands, no code path writes `last_run.json`. It is frozen
as the published baseline until a later slice writes new labels and
replaces it deliberately.

### Deliberately out of scope

Five operative-rule gaps were recorded in `docs/sources.md` while labelling
and predicted to be defects. Measurement showed they are not: the model got
`doc_type` and `verdict` right on every one of them without the rule firing.

- `disposition.2023.19.81` (Gelo), "autorización ambiental unificada
  **otorgada** por", noun before participle, which the grant pattern misses.
- `disposition.2025.63.37` (Los Morales revocation), which reads as an AAU
  denial but is a `caducidad`.
- `disposition.2023.169.46` (Los Barrios), whose denial wording sits in a
  "da publicidad" title, ahead of any resolving marker.
- `disposition.2023.221.80` (Vico y Mizán), with no resolving marker at all,
  and `disposition.2025.144.69` (Tabernas Solar 3), headed "Acuerdo" but
  publishing a change of condicionado.
- `disposition.2024.38.48` (Solar Airport PV), an información pública notice
  inside a "modificación sustancial" procedure.

These are latent gaps the model currently covers, not defects. Building
patterns for them is unmeasurable work against this label set, and every
pattern added is surface area that can misfire on an unlabelled document.
Recorded here so a later slice with a larger label set can revisit them.

Also out of scope: the BOE-A-2023-19636 `developer` question. `developer`
scored 100%, both reviewers read the document as naming Green Capital Power
as sole promotor with the later entry a transfer of title, and the same
company is the labelled developer on two other labels. It is a label
consistency question, logged as a deferred minor, not an extractor bug.

### Scope: this slice carries the fixes to the site

The fixes change extraction output, so corrected groupings and corrected
municipality attributions reach the site only after a re-extraction, then
`resolve`, `aggregate` and `export`. The first version of this spec deferred
that because slice 2 was in flight and owned `export.py` and the published
dataset. Slice 2 is deployed, so that reason is gone, and the web slice that
follows (technology filter, overlays, province table, monthly timeline)
would otherwise be built and checked against data this slice knows to be
wrong. Section 5 specifies the re-run.

## Section 1: `project_name` and resolve hardening

### 1a. The defect

`project_name` comes back with the gazette's descriptive tail attached:
`"Planta fotovoltaica Carbo de 90 MWp y su infraestructura de evacuación"`
where the label says `"Planta fotovoltaica Carbo"`. Nine of fifteen scored
names miss this way.

This is not a scorer-strictness artefact. `resolve/scoring.py:phase_token`
reads the **last** token of `name_key(project_name)`, and a tail breaks it
two ways, both verified against the real functions:

```
'Parque eolico Ronda I'                                  -> 'ronda i'                                  phase='i'
'Parque eolico Ronda I de 50 MW y su infraestructura...' -> 'ronda i 50 su infraestructura evacuacion'  phase=None
'Parque eolico Ronda II de 50 MW'                        -> 'ronda ii 50'                               phase='50'
```

The second disables the phase-mismatch guard, so Ronda I becomes eligible to
merge with Ronda II. The third is worse: the capacity is read *as* the phase
token, and `score_pair` returns a hard `0.0, "phase_mismatch"` - a block, not
a lowered score - so two records of one project can never group. `GENERIC` in
`resolve/blocking.py` strips `mw`/`mwp`/`mwn` but leaves the bare number in
front of them, which is what exposes this.

Roughly 60% of stored names carry tails today, so production may already hold
both wrong merges and wrong non-merges.

### 1b. The trimmer

New module `impacto/extract/names.py` exposing `trim_project_name(name)`,
applied once in `extract_document` to the merged name, not per-chunk in
`_sanitize`, so it runs on the value actually chosen.

Contract, fixed by this spec:

- **Suffix removal only.** It never rewrites the head of a name, so a wrong
  rule can truncate but cannot corrupt.
- **Never returns empty.** If a cut would empty the name, no cut happens.
- **Cuts** the descriptive tails gazette grammar attaches to names: capacity
  clauses, evacuation-infrastructure conjunctions, and "de potencia
  instalada"-style appositives.
- **Must not cut** a trailing phase marker, nor a trailing number with no
  unit after it. `"Parque fotovoltaico Tabernas 100"` survives intact.

**Note, added 2026-09-24:** the unit-after-a-trailing-number rule is
narrower than first shipped. A unit is dropped alone only after an integer
of 3 or more digits, never after a shorter number or after the decimal
tail of any number. A 1- or 2-digit number left bare at the end of a name
is read by `resolve`'s `PHASE` (`\d{1,2}`) as a phase marker, so dropping
the unit after e.g. "Ronda II 50 MW" would have re-created the
phase-mismatch block the `name_key` capacity fix (section 1c) closed;
"Carmona 49,9 MWp" is likewise left whole rather than cut to "Carmona
49,9". A 3+-digit integer cannot be misread as a phase, so its unit is
still dropped alone ("Tabernas 100 MW" -> "Tabernas 100").

The exact cut patterns are derived from the fifteen expected-versus-got
pairs. Added 2026-09-23: those pairs are the `project_name` values stored in
production for the fifteen labelled documents, which were extracted with the
same model (`mistral:ministral-14b-latest`) and prompt (`v3`) as the
baseline. They contain exactly nine misses, matching the baseline's 40%, so
they stand in for the capture run the first version of this spec planned.
The plan copies them verbatim into `tests/test_names.py`.

Two of the nine are head misses the contract forbids fixing:
`"Proyecto de parque fotovoltaico Tabernas Solar 3 de 35 MWP y su
infraestructura de evacuación"` (label `"Tabernas Solar 3"`) and
`"Repotenciación del Parque Eólico Carrascal I"` (label `"Parque Eólico
Carrascal I"`). Suffix removal cannot reach either, and the first keeps its
head after its tail is cut.

**Validation gate.** On the seven tail-only misses the trimmer must produce
the label string. On the two head misses it must remove only the tail (the
first becomes `"Proyecto de parque fotovoltaico Tabernas Solar 3"`, the
second is unchanged), and they stay misses. On the six that already pass it
must be a no-op. The last condition is the real test: a trimmer that fixes
seven and breaks one of the six has demonstrated it eats real names. That is
a fail, not a trade.

**Exit.** If the pairs support no rule meeting the safety property, this item
drops to the prompt half rather than shipping a rule that guesses. Naming the
exit here keeps implementation from improvising one.

### 1c. Resolve hardening

Fix `name_key` in `resolve/blocking.py` to drop a number immediately followed
by a unit token, so `'ronda ii 50'` becomes `'ronda ii'` and `phase_token`
returns `'ii'`.

This is not optional and does not depend on 1b. The 347 stored projects keep
their tailed names until something re-extracts them, so the trimmer alone
protects nothing that already exists. This fix repairs grouping on live data
with no LLM call.

## Section 2: `municipalities` and the operative rule

### 2a. `municipalities` role field

**Note, added 2026-09-24:** the prompt change below (asking the model to
return every municipality with a `role`) was dropped during execution. It
was measured against the eval (see the 2026-09-24 progress-log entry) and
found to move nothing - the model tagged every municipality `generacion`,
including the four it should have excluded - and was reverted to its
pre-fix `v3` wording. The schema and validation changes below shipped and
stay; the model is not asked for roles. The original text is kept as
written, since it records the decision as brainstormed.

The prompt already instructs the model to exclude municipalities the
evacuation line merely crosses. It ignored that instruction on 4 of 20
documents: Almodóvar del Río (BOE-A-2022-18089), Torre Alháquime
(BOE-A-2023-19636), Cañete la Real / El Burgo / Casarabonela
(BOE-A-2023-2422), Puerto Real (BOE-A-2026-3880).

The field is not display-only. It feeds `resolve/blocking.py` and
`resolve/scoring.py` as a grouping signal, and `project_municipalities`
drives the municipality pages and the map, so a line-only municipality
attributes a project to a municipality that has only a cable crossing it.

Changes:

- `schema.py`: `Municipality` gains
  `role: Literal["generacion", "evacuacion"] | None = None`.
  `Extraction` gains `evacuation_municipalities: list[Municipality]`.
- Prompt: stop asking the model to omit line-only municipalities; ask it to
  return all of them, each with a `role`. Omission is a silent judgement, a
  tag is a visible one, and a wrong tag stays inspectable in the stored JSON.
- `_sanitize`: a `role` outside the enum becomes `None`, matching how
  `technology` and `conditions[].category` are already handled.
- `validate_and_score`: move `role == "evacuacion"` entries into
  `evacuation_municipalities`, leaving `municipalities` as the generation
  site.

`role = None` entries stay in `municipalities`. This is deliberate: on a
document the model declines to tag, behaviour is unchanged, so the change can
only remove false positives and never introduce false negatives.
`municipalities` keeps its existing meaning exactly, which means the scorer
needs no change and resolve inherits the fix through `project_municipalities`.
Not touching the metric in the slice that measures against it is the point.

### 2b. The simplified `informe de impacto ambiental` form

BOE-A-2025-24233 (OPDE Miramundo) is a simplified evaluation whose operative
sentence is `"resuelve ... que no es necesario el sometimiento al
procedimiento de evaluación ambiental ordinaria ... siempre que se cumplan
las medidas y prescripciones"`. Neither DIA form appears, `find_operative`
has nothing to match, and the model returned `otro` / `no_aplica`.

Add two branches to `operative.py`, both from the Ley 21/2013 wording rather
than from this one document:

- `no es necesario el sometimiento al procedimiento de evaluación ambiental
  ordinaria` -> `informe_impacto` / `favorable_condicionada`
- a requirement to undergo ordinary evaluation (`es necesario el
  sometimiento ...`, `debe someterse a ... evaluación ... ordinaria`)
  -> `informe_impacto` / `no_aplica`, because that report routes the
  procedure and says nothing about the project's effects

Corrected 2026-09-23 against the stored text: `formula informe de impacto
ambiental` appears only in the title, which `find_operative` never sees, so
the rule cannot anchor on it. The body carries both halves of the form in
its legal grounds (article 47: "si el proyecto debe someterse a una
evaluación de impacto ambiental ordinaria ... o si por el contrario no es
necesario dicho procedimiento") before the operative sentence. Both
branches are therefore read only inside the resolving part, after the last
resolving marker, exactly as the AAU verbs already are.

The second branch is not in the label set and will not move the number. It
exists because writing only the favourable branch would make the rule assert
a favourable verdict on the form's other half.

`_OVERRIDABLE_DOC_TYPES` in `extract/run.py` gains
`"informe_impacto": {"informe_impacto", "otro"}`.

## Section 3: Miss persistence

`run_eval` prints each miss to stdout and persists none of them, so miss
detail survives only in terminal scrollback. That is how the nine
`project_name` pairs this spec depends on came to be unreachable.

### 3a. The output path

`run_eval`'s default output moves from `last_run.json` to
`pipeline/evaluation/tuned_run.json`, and the CLI gains `--out` to override
it. `impacto export` keeps reading `last_run.json` and is not changed. After
this, no code path writes the published file; see "`last_run.json` must
survive every run".

`--out` must refuse `last_run.json` itself, so the frozen file cannot be
overwritten by passing its path by hand. A later slice that writes new
labels and wants to publish a new figure removes that guard in the same
commit, which makes the replacement a visible decision in the history.

### 3b. The misses file

Each run also writes `<out stem>_misses.json` next to its output (by
default `tuned_run_misses.json`), a list of
`{source_id, field, expected, actual}`.

It is a sibling file, not a key in the run result, because `export` copies
`last_run.json` wholesale to `web/public/data/evaluation.json`. Keeping the
same shape across run files means a later deliberate replacement of
`last_run.json` cannot carry raw model output to the site as a side effect
of a debugging aid.

## Section 4: The prompt half

**Note, added 2026-09-24:** this section's prompt text was measured over
three revisions against the eval (each revision's acceptance requiring an
empty recurring `NEW` set and the three target misses fixed in both runs
of a two-run variance check) and did not meet acceptance in any revision;
see the 2026-09-24 progress-log entry for the per-revision `NEW` sets.
Section 4 was dropped: the prompt text was reverted to byte-identical `v3`
wording, and the two documents it targeted, Retuerta (`BOE-A-2022-15703`)
and `BOE-A-2023-2907`, remain misses. The description below is kept as
written, since it records the section as designed.

Three misses, both documents already understood:

- **BOE-A-2022-15703 (Retuerta)**: `"Parque Fotovoltaico Retuerta de 38 MW
  ... para su hibridación con el Parque Eólico existente Retuerta de 38 MW"`.
  Extracted as `hibrida` with `mw_nominal` 76, summing in a wind farm that
  has existed since 2009 and only shares a substation. The object of
  evaluation is the photovoltaic plant alone: `solar_fv`, 38.
- **BOE-A-2023-2907**: `mw_nominal` 169.125 against a label of 326, a
  per-plant summing failure on a multi-plant resolution.

Both are the same underlying question - which installations the printed
figures belong to - so they are treated as one prompt change, not two. The
prompt must distinguish the installations under evaluation from existing
installations the document merely references.

This section is the one where a change can fix its two documents and quietly
break something else, invisibly, because at n=20 one document's field is 5
percentage points. It is therefore implemented last, after sections 1 to 3
are green, and it is the section for which the before-and-after in
`tuned_run_misses.json` is the actual instrument.

## Section 5: The production re-run

Runs after the branch is merged to `main`, against Neon production, with
`mistral` as the provider the baseline was measured on.

1. **Bump `PROMPT_VERSION`** in `impacto/extract/prompts.py` from `v3` to
   `v4`. **Corrected 2026-09-24:** the bump happened in Task 3, not in the
   same commit as the section 2a and section 4 prompt changes, because
   those two prompt changes were both dropped during execution (see the
   notes on section 2a and section 4, and the 2026-09-24 progress-log
   entry). What actually changes `v4` output against `v3` is the
   project-name trimmer (section 1b), the `name_key` capacity fix (section
   1c) and the simplified-evaluation-form rule (section 2b) - all
   deterministic, prompt-text-independent changes - plus the inert
   `Municipality.role` plumbing (section 2a) that the prompt does not yet
   populate. The prompt text itself is byte-identical to `v3`.
2. **Fetch the recovered document.** `impacto fetch --source boe --from
   2025-06-07 --to 2025-06-07` stores `BOE-A-2025-11509` (Puerto Real,
   published 2025-06-07 per `docs/sources.md`). It is extracted in step 3
   with everything else, so it is never extracted under `v3`.
3. **Re-extract.** `impacto extract --provider mistral --redo-prompt-version
   v3 --limit N`, repeated until it reports 0 documents. The existing
   `--redo-prompt-version` path re-selects `ok` rows extracted under `v3`,
   so no rows are deleted and an interrupted run resumes where it stopped.
4. **Check before publishing.** Before `export`, compare against the
   current published data and record in the progress log: document count
   (expected 638 = 72 BOE + 566 BOJA), project count against today's 347,
   the number of extractions whose `evacuation_municipalities` is non-empty,
   and the `project_id`s that disappear. An unexplained swing in the project
   count stops the run here rather than going to the site. **Corrected
   2026-09-24:** since section 2a's prompt change was dropped and the model
   is never asked for a `role`, the `evacuation_municipalities` count is
   expected to be exactly 0; a non-zero count means the model volunteered
   roles unprompted and must be reported to the user, not treated as the
   fix working.
5. `impacto resolve`, `impacto aggregate`, `impacto export`, then commit the
   exported data in `web/public/data/` as the weekly workflow would.

Known consequences, accepted:

- **Retired project URLs.** Project ids are `min(document_id)` of a group
  (slice 2, decision 7), so a group split or merged by the `name_key` fix or
  the trimmer changes or retires ids, and those `/proyecto/[id]` URLs 404.
  The sitemap is regenerated by the build. The retired ids are listed in
  the progress log.
- **The published accuracy describes the previous extractor.** The site's
  data will come from `v4` while `/metodologia` keeps showing the `v3`
  baseline from `last_run.json`, per "The one-way door". The paragraph
  under "Precisión medida" in `web/src/app/metodologia/page.tsx` gains one
  sentence saying so: the figure was measured before the extractor was
  corrected against those same documents, and a figure for the current
  version needs newly labelled documents. That is the only web change in
  this slice.

## Testing

Unit tests only. No eval run *verifies* sections 1, 2 or 3 - a unit test is
the instrument for all three.

- `tests/test_names.py` (new): `trim_project_name` against all 15 label
  pairs - seven corrected, two head misses tail-trimmed only, six unchanged.
- `tests/test_operative.py`: both branches of the simplified form; existing
  cases must not regress.
- `tests/test_validate.py`: the role split, including `role = None` staying
  in `municipalities`.
- `tests/test_resolve_pure.py`: `name_key` and `phase_token` on the three
  strings in section 1a.
- `tests/test_extract_run.py`: `_sanitize` on an out-of-enum `role`.
- `tests/test_eval.py`: the misses file is written next to the output with
  the expected shape; the default output is `tuned_run.json`, not
  `last_run.json`; passing `last_run.json` as `--out` is refused.
- `web/e2e/metodologia.spec.ts`: asserts the new sentence. The existing
  axe sweep in `web/e2e/a11y.spec.ts` covers the page otherwise.

The eval is re-run once at the end to record the after-figure, understood per
"The one-way door" as a tuning figure rather than evidence about unseen
documents.

### Known environment limitation

`tests/test_aggregate.py`, `test_export.py`, `test_reference.py` and
`test_resolve_run.py` fail to collect on this machine on the pyproj DLL block
already recorded in `docs/sources.md`. Baseline in this worktree after the
2026-09-23 rebase is 121 passed, 21 skipped with those four excluded.
`test_resolve_pure.py` collects fine, so
section 1c is testable here; anything touching `test_resolve_run.py` is not.

## Documentation

- `docs/sources.md`: the five out-of-scope operative gaps are already
  recorded; append that measurement showed them covered by the model, so a
  later reader does not re-derive them as open bugs.
- `pipeline/evaluation/README.md`: record that the 20 labels became a tuning
  set on merge of this slice, that any figure published afterwards needs
  labels written later, that `last_run.json` is frozen as the published
  `v3` baseline, and that runs now write `tuned_run.json`.
- `README.md`: the status paragraph's document and project counts, updated
  from the section 5 figures.
