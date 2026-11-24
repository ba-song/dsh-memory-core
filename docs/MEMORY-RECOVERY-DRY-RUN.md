# Memory Recovery Dry-Run Design

Status: design-only; no runtime behavior is changed by this document.

## Goal

Implement the Q149 recovery direction as an evidence-first workflow. A recovery run must identify a memory gap or contradiction, inspect only sources the caller is authorized to read, produce a reviewable proposal, and explain likely failure points. It must not silently write, revive, merge, or delete memories.

## Existing building blocks and limits

- Structured memories have provenance metadata and source locators, but a locator is not proof that the caller may read the source.
- RawArchive stores original utterances in `raw_meta` / `raw_fts`, supports tombstones, and has a default 30-day retention policy. Archive search is currently exposed through owner-scoped tools and is not a general cross-session authorization mechanism.
- `lib/archive/tools.js` provides archive search/context functions. Its `readArchive` helper is limited to the current day; historical lookup uses the separate archive research path.
- Diary entries are atomically written as Markdown under `diary/YYYY-MM-DD/*.md`. The diary store explicitly does not index, search, summarize, or inject diary contents. A future recovery workflow must add a read-only diary discovery adapter rather than assume diary entries are already searchable.
- Provenance assessment is diagnostic only. A verified quote means quote text was checked against a source string; it does not establish that a derived claim is true.
- Conflict detection is a heuristic used during ingestion. It is not sufficient by itself to resolve historical contradictions.

## Proposed stages

1. **Trigger / gap description**
   - Accept a memory ID, a disputed claim, or a user-described missing experience.
   - Record the trigger type and caller scope. Do not accept caller-supplied scope overrides.
2. **Authorized source discovery**
   - Inspect the target memory's provenance and source locator.
   - Search eligible raw archive records only through the existing owner/session authorization boundary.
   - Discover diary files through a read-only adapter, but do not expose diary contents outside the authorized owner context.
   - Do not cross Conversation boundaries merely because a source ID or path is known.
3. **Evidence normalization**
   - Keep each evidence item separate with source kind, source locator, timestamp, speaker/author, exact quote or excerpt, and access decision.
   - Distinguish direct quote evidence, derived summaries, diary narrative, external corroboration, and model hypotheses.
   - Preserve ambiguity; do not fill missing dates, people, or causal links by inference.
4. **Comparison**
   - Build a timeline and candidate claim set.
   - Detect supporting evidence, contradicting evidence, duplicates, and gaps.
   - Treat different sources as independent only when their provenance demonstrates independence; copied summaries are not independent corroboration.
5. **Proposal**
   - Return `supported`, `contradicted`, `ambiguous`, or `insufficient_evidence`.
   - Include candidate wording, evidence references, confidence rationale, unresolved questions, and a likely failure classification.
   - Keep model confidence separate from truth probability.
6. **User confirmation**
   - Ask one concrete question only when its answer materially changes the proposed recovery.
   - Preserve “I don't remember / unsure” as a valid answer and do not pressure the user to resolve ambiguity.
7. **Repair plan**
   - Produce a dry-run patch describing the exact memory operation that would be considered: add a new version, link evidence, mark a conflict, restore a soft-deleted item, or rebuild an index.
   - Include before/after preview, affected IDs, revision preconditions, rollback plan, and audit metadata.
8. **Authorized application**
   - Separate from the dry-run command. Require explicit authorization for any write that changes汐's actual memory or behavior.
   - Use compare-and-swap revision checks; never overwrite a newer revision.
   - Preserve old versions and source evidence. Never restore tombstoned raw text as if deletion had not occurred.

## Failure taxonomy

- `not_ingested`: source exists, no corresponding structured memory was created.
- `source_expired_or_missing`: locator exists but source is no longer available.
- `source_access_denied`: source may exist but this caller is not authorized to read it.
- `provenance_incomplete`: source identity/time/evidence cannot be established.
- `extraction_loss`: source exists but extraction omitted a meaningful claim.
- `decay_or_visibility`: memory exists but is no longer surfaced due to lifecycle/visibility policy.
- `recall_miss`: memory exists and is eligible, but retrieval failed to surface it.
- `conflict_unresolved`: multiple incompatible claims remain.
- `possible_overwrite`: revision history suggests replacement or supersession; requires evidence before conclusion.
- `unknown`: evidence does not support a narrower diagnosis.

## Safety invariants

- Dry-run is read-only: no database writes, diary writes, archive mutation, tombstone changes, or profile/config changes.
- No cross-session or cross-Conversation source reads without host-originated, purpose-bound authorization.
- A source locator is never treated as authorization.
- Quote verification is never described as proof of the derived claim.
- User-confirmed facts, shared experiences, diary narrative, model inference, and external facts remain distinct.
- Ambiguous memories may be retained as ambiguous; the workflow must not force certainty.
- Audit logs record operation metadata and outcome, not private memory bodies.
- No automated repair or restoration in the first implementation.

## Verification plan

Unit tests should cover: inaccessible source vs missing source; expired archive source; diary discovery without mutation; independent vs copied evidence; supporting and contradicting evidence; ambiguous experience preservation; empty evidence; malformed provenance; scope denial; revision conflict; and proof that dry-run leaves database/files byte-for-byte unchanged.

Integration tests should simulate: source utterance -> derived memory -> retrieval miss -> authorized evidence discovery -> dry-run proposal -> user-confirmation boundary -> separately authorized repair. Device-level behavior remains unverified until tested on the actual DSHA installation.


## First read-only prototype (2026-11-24)

Implemented in `lib/recovery/plan.js` with scenario tests in `tests/recovery-plan.test.mjs`.

- The planner accepts evidence records only after an upstream adapter has made an access decision; it does not open files, query SQLite, or authenticate a caller.
- It separates readable from denied/missing/expired evidence, compares supporting and contradicting items, and counts original evidence lineages rather than copied summaries as independent corroboration.
- It emits an outcome, failure classification, questions for the user, and a proposed operation label. The proposed operation is descriptive only; no write adapter exists.
- Tests cover supported, contradictory, denied, expired, copied evidence, ambiguous experience, empty evidence, and recall miss.
- This is not yet connected to RawArchive, diary discovery, memory rows, or the host authorization layer. It is not a production recovery feature.
