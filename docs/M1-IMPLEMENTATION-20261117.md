# M1 Implementation Handoff — 2026-11-17

## Status

- Repository: `ba-song/dsh-memory-core`
- Development branch: `feat/m1-preference-memory`
- Base: `main` at `752cd0861e9c86c9f7be4bdf18302fa72a3b95dd`
- Current branch HEAD: `b7ac5888f0b973047e5a316c44a0c3ababebd3a7`
- Scope: source-only implementation on the development branch.
- No production source, production configuration, production database, service, or deployment operation was touched.
- `main` was not changed.

## Implemented

1. `lib/pref/classify.js`
   - Conservative, content-agnostic preference persistence classifier.
   - Only explicit long-duration/repeated-use language marks a preference as `persist=true`.
   - Temporary language is classified as temporary; unspecified duration is not promoted.
   - Does not contain a vocabulary of preference topics or a desired assistant speaking style.

2. `lib/pref/merge.js`
   - Normalizes text for conservative duplicate matching.
   - Repeated explicit preferences update the existing row using `updateMemory` + expected revision (CAS), retaining a revision snapshot and incrementing evidence metadata.
   - Narrow polarity matching supersedes a prior preference only when the same normalized subject is expressed with a recognized opposite preference marker.
   - Supersession sets `valid_to` and `superseded_by`; it does not physically delete the prior record.
   - Ambiguous or non-matching statements remain separate; no semantic inference is attempted here.

3. `lib/ingest/p4.js` and `lib/ingest/classes.js`
   - Durable preference classification is attached to the existing P4 preference extraction path.
   - Explicit long-term preferences bypass the generic vector conflict branch and enter the preference lifecycle helper.
   - Preference negation/modifiers are preserved by extraction so an opposite statement is not silently rewritten as positive.
   - Non-preference kinds and non-durable preferences retain the existing path.

4. `lib/inject/preference.js` and `lib/index.js`
   - Independent `dy-preference` context registered at order 945.
   - Owner session only; rows must be active, `kind='preference'`, `scope_type='owner'`, explicitly persistent, and not expired.
   - Maximum 3 rows and 180 characters; no eligible rows means an empty string.

5. Validity and lifecycle
   - `remembered` excludes rows whose `valid_to` has passed.
   - Recall candidate IDs and keyword results exclude expired rows in the normal current-time path.
   - Explicit persistent preferences are protected from further clarity decay; this protection is restricted to `kind='preference'` and `meta.persist=true` + `meta.persistence='long_term'`.

6. Tests added
   - `tests/preference-classify.test.mjs`
   - `tests/preference-merge.test.mjs`
   - `tests/preference-inject.test.mjs`
   - `tests/preference-lifecycle.test.mjs`

## Explicitly not changed

- No new memory kind / enum.
- No database DDL or schema-version change.
- No dyMemory service contract signature change.
- No persona plugin changes.
- No dependencies added.
- No production migration, database write, restart, or deployment.
- No fixed style rules, style-word lists, personality constraints, or prompt instructions derived from any conversational example.

## Validation status — important

The GitHub branch and file writes were verified through the GitHub connector. A local clone/test attempt was made, but this execution environment could not resolve `github.com` (DNS failure). Therefore **ChatGPT has not run the new tests or the full `npm test` suite**. Do not treat the code as tested or deployment-ready until DSH independently clones this exact branch in `/tmp`, installs/uses the repository's existing dependencies, runs the complete test suite, and reports full raw output.

## DSH independent review instructions

1. Clone only `feat/m1-preference-memory` into a fresh `/tmp` directory. Do not touch the production source tree.
2. Verify branch HEAD and compare it with base `main`; inspect every changed file and confirm no unreported changes.
3. Run `npm test` and preserve complete output, Node/npm versions, and exit code. Add targeted tests for:
   - durable vs temporary vs unspecified preference classification;
   - source negation preservation;
   - duplicate preference CAS/revision update;
   - opposite preference supersession and historical `valid_to`;
   - expired rows excluded from remembered, keyword, semantic, graph and preference injection paths;
   - owner-only isolation and empty output when no eligible preferences exist;
   - clarity protection limited to explicit persisted preferences;
   - existing legacy preferences and all non-preference kinds remain behavior-compatible.
4. Review race/error paths in `mergePersistentPreference`, especially CAS conflicts and the two-step insert/supersede sequence. Confirm no active record can be silently lost on a failed revision update.
5. Confirm the new context is actually registered at order 945 and returns empty text when there are no eligible rows.
6. Verify source, tests, docs, config, and prompts do not encode any specific conversational style or example as a behavioral constraint.
7. Use synthetic preference data only. Do not read or write production `memory.db`; if production evidence is needed, use read-only queries on a separately protected copy.
8. Do not deploy, migrate, restart, sync, or modify production. Return a verdict (pass / conditional pass / fail), blockers, risks, test output, and deployment recommendation to the owner for a separate decision.
