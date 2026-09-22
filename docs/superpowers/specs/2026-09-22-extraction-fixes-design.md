# Extraction fixes measured against the 20-label evaluation

Date: 2026-09-22
Status: spec written, pre-implementation
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
3. This slice stops at the extractor. Re-extraction, resolve and export are
   deferred. **This is an assumption, not a user decision** - the question
   was put twice and not answered, and the reasoning is in "Scope" below.
   Overriding it changes only what runs after the code lands, not the code.
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
5. Persisting miss detail from the eval runner - section 3.

## Implementation order

Cost order is not build order. Section 3 comes first because section 1
depends on its output:

1. **Section 3**, miss persistence, then a miss-capture eval run to
   regenerate the nine `project_name` pairs.
2. **Section 1c**, the `name_key` fix. Independent of everything and repairs
   live data on its own.
3. **Section 1b**, the trimmer, derived from the captured pairs.
4. **Section 2a and 2b**, in either order.
5. **Section 4**, the prompt half, last, after 1 to 3 are green.
6. A final eval run to record the after-figure.

### `last_run.json` must survive the capture run

`run_eval` overwrites `pipeline/evaluation/last_run.json` unconditionally.
The committed copy is the pre-tuning baseline that slice 2 publishes, and it
is the last figure measurable on unseen documents - it cannot be regenerated
once this slice merges.

After the miss-capture run in step 1, and after any intermediate run,
`git checkout pipeline/evaluation/last_run.json` to restore it. Only the
final run in step 6 may update it, and that update must be labelled in the
commit message as a post-tuning figure.

A capture run is a fresh model run, so its miss strings may differ from the
original 18. That is acceptable for deriving the trimmer, which needs a
representative sample of tails rather than those exact strings, and the
validation gate in section 1b is defined over all 15 label pairs regardless
of which ones a given run fails.

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

### Scope assumption: this slice stops at the extractor

The fixes change extraction output, so corrected groupings and corrected
municipality attributions reach the site only after a re-extraction, then
`resolve`, then `export`. This spec does not carry that through, because:

- Slice 2 is in flight and owns `export.py` and the published dataset.
  Re-extracting the corpus mid-slice republishes data underneath it.
- The eval verifies every fix here directly, without touching production.
- Section 3b repairs grouping on the existing stored data with no LLM call
  at all, so deferring the re-run leaves nothing broken that is broken today.

That third point is what makes the assumption safe rather than merely
convenient. If the re-run is wanted in this slice, it is additive: nothing
in the code changes.

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

The exact cut patterns are **derived during implementation** from the nine
expected-versus-got pairs. The spec fixes the contract and the gate; it does
not guess regexes.

Those pairs are not currently reachable in this worktree - they exist only in
the controller session's `$TMP/eval-misses.txt`. **Section 3 is therefore
implemented first**, and a miss-capture eval run regenerates them. Ordering
the sections this way removes the circularity of needing the file that
section 3 creates; see "Implementation order".

If `$TMP/eval-misses.txt` is pasted or committed before implementation
starts, that supersedes the capture run and section 3 can move back to its
cost-ordered position.

**Validation gate.** On the nine failing pairs the trimmer must produce the
label string, and on the six that already pass it must be a no-op. The second
half is the real test: a trimmer that fixes nine and breaks one of the six is
+8 on this set and has still demonstrated it eats real names. That is a fail,
not a trade.

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

- `formula informe de impacto ambiental` ... `no es necesario el
  sometimiento` -> `informe_impacto` / `favorable_condicionada`
- the same opening followed by a requirement to undergo ordinary evaluation
  -> `informe_impacto` / `no_aplica`, because that report routes the
  procedure and says nothing about the project's effects

The second branch is not in the label set and will not move the number. It
exists because writing only the favourable branch would make the rule assert
a favourable verdict on the form's other half.

`_OVERRIDABLE_DOC_TYPES` in `extract/run.py` gains
`"informe_impacto": {"informe_impacto", "otro"}`.

## Section 3: Miss persistence

`run_eval` prints each miss to stdout and persists none of them, so miss
detail survives only in terminal scrollback. That is how the nine
`project_name` pairs this spec depends on came to be unreachable.

`run_eval` writes `pipeline/evaluation/last_run_misses.json`, a list of
`{source_id, field, expected, actual}`.

It is a sibling file, not a key in `last_run.json`, because slice 2 copies
`last_run.json` wholesale to `web/public/data/evaluation.json`. Adding a key
there would collide with slice 2's file contract and publish raw model output
to the site as a side effect of a debugging aid.

## Section 4: The prompt half

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
`last_run_misses.json` is the actual instrument.

## Testing

Unit tests only. No eval run *verifies* sections 1, 2 or 3 - a unit test is
the instrument for all three. The miss-capture run in step 1 of the
implementation order is data gathering, not verification, and its accuracy
output is discarded.

- `tests/test_names.py` (new): `trim_project_name` against all 15 label
  pairs - nine corrected, six unchanged.
- `tests/test_operative.py`: both branches of the simplified form; existing
  cases must not regress.
- `tests/test_validate.py`: the role split, including `role = None` staying
  in `municipalities`.
- `tests/test_resolve_pure.py`: `name_key` and `phase_token` on the three
  strings in section 1a.
- `tests/test_extract_run.py`: `_sanitize` on an out-of-enum `role`.
- `tests/test_eval.py`: `last_run_misses.json` is written with the expected
  shape.

The eval is re-run once at the end to record the after-figure, understood per
"The one-way door" as a tuning figure rather than evidence about unseen
documents.

### Known environment limitation

`tests/test_aggregate.py`, `test_export.py`, `test_reference.py` and
`test_resolve_run.py` fail to collect on this machine on the pyproj DLL block
already recorded in `docs/sources.md`. Baseline on the worktree is 117 passed,
21 skipped with those four excluded. `test_resolve_pure.py` collects fine, so
section 1c is testable here; anything touching `test_resolve_run.py` is not.

## Documentation

- `docs/sources.md`: the five out-of-scope operative gaps are already
  recorded; append that measurement showed them covered by the model, so a
  later reader does not re-derive them as open bugs.
- `pipeline/evaluation/README.md`: record that the 20 labels became a tuning
  set on merge of this slice, and that any figure published afterwards needs
  labels written later.
