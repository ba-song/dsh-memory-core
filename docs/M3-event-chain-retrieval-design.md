# M3 Event-chain Retrieval: Evidence-constrained Design

Status: design note only. This document does not claim event-chain retrieval is implemented.

## Existing primitives

- `memories.source_msg_id` carries several known forms:
  - `raw:<raw_meta.id>`
  - `p4:<sessionId>:<seq>`
  - `explicit:<sessionId>:<seq>`
  - `group-turn:<groupId>:<timestamp>`
- `memories.source_ts`, `source_file`, `scope_type`, `scope_id`, `valid_from`, `valid_to`, and `temporal_kind` provide additional provenance and filtering context.
- `findAnchorRow()` resolves raw-id, session-seq, timestamp, and text fallback anchors. Its SQL is constrained by cwd and `tombstone=0`.
- `buildProvenanceBlock()` expands an anchor into a bounded same-file dialogue window and associates nearby thoughts/tools. This is local evidence-window reconstruction, not multi-event chain retrieval.
- `graphCandidates()` is an entity graph path. The `relations` table exists in schema, but current code does not provide a complete, maintained event-edge lifecycle.
- `buildSessionIndex()` gives a small owner-only recent episode/decision summary; it is not a ranked event-chain retriever.

## Safe definition of an event-chain edge

Only accept one of these relations:

1. Same exact session ID from a parsed `p4:` or `explicit:` source reference, with both endpoints independently anchored to non-tombstoned raw rows in the same cwd.
2. An explicit, validated relation edge whose lifecycle and scope are maintained transactionally.
3. A same-episode relation with a stable episode identifier and independently verified source anchors.

Do not infer a chain solely from semantic similarity, shared common words, same sequence number, short session filename, or timestamp proximity.

## Candidate admission gates

Apply all gates before a candidate can enter ranking:

1. Seed memory and candidate are both active.
2. Exact same `scope_type/scope_id`; no owner-to-contact/group widening.
3. Current-time or explicit as-of validity is satisfied. For as-of queries, rows with unknown validity go to the separate `uncertain` output and never become normal candidates.
4. The seed anchor and candidate anchor both resolve through `findAnchorRow()` under the same cwd.
5. Both anchors have `tombstone=0`; missing or revoked anchors fail closed.
6. Same exact session ID, or an explicit validated edge. Do not use the short session filename as identity.
7. A bounded temporal span and event count apply. A long session must not become one unbounded story.
8. Candidates must have a topic/entity relation to the seed or an explicit edge; same-session membership alone is insufficient when the session contains unrelated topics.

## Ranking and output

- Keep event-chain expansion as a distinct recall arm; do not silently merge it into keyword, semantic, or entity-graph scores.
- Preserve each arm's rank and RRF contribution for evaluation.
- Order chain events by source timestamp, then source sequence, then raw ID.
- Every returned event must retain memory ID, source message ID, source timestamp, raw anchor ID, scope, and anchor resolution method.
- If any required anchor is missing, skip that event and record a structured skip reason; never fabricate surrounding context.
- Enforce a small event-count and character/token budget. The initial experiment should not change automatic injection budgets.

## Required isolated tests before implementation is accepted

- Same session, same scope, adjacent events: admitted and correctly time-ordered.
- Same session ID but different scope: rejected.
- Same sequence number in different sessions: never cross-link.
- Same short session filename in different cwd: never cross-link.
- Tombstoned seed: no chain.
- Tombstoned neighbor: neighbor excluded, even if semantic/entity similarity is high.
- Missing source anchor: candidate skipped with reason.
- Similar wording from a different session: not chained.
- Same session but unrelated topic: not chained without an explicit relation.
- Expired/future validity and as-of unknown validity.
- Duplicate anchors/windows: de-duplicated by stable raw anchor identity.
- RRF explanation identifies the event-chain arm and its rank contribution.

## Implementation order

1. Add a pure source-reference parser/chain selector with no database writes.
2. Add isolated SQLite fixtures proving all admission gates.
3. Integrate as a separate recall arm behind a disabled-by-default flag.
4. Add offline manually labelled evaluation and compare against the existing three arms.
5. Only after a measured improvement and zero scope/tombstone violations, consider enabling it for owner-only recall.
