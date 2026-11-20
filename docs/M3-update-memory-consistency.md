# M3 updateMemory: Derived-index Consistency and Safe Revision Design

Status: design and review note. No production database or memory was changed by this document.

## Current behavior observed in source

`updateMemory()` currently:

- checks patch-column allowlist and optional expectedRevision CAS;
- stores the previous `memories` row in `memory_revisions`;
- increments revision and updated_at in a transaction;
- synchronizes the two FTS indexes when text changes.

A text change does not currently synchronize or invalidate:

- `vectors`;
- `memory_entities`;
- `relations`;
- `quote` and source-provenance suitability.

The function is not currently exposed as a normal owner-facing tool path in `lib/index.js`; avoid designing around hypothetical UI callers.

## Failure modes

- A stale vector can semantically retrieve the memory using its old meaning.
- Entity links can continue to place the memory in graph results for old topics.
- Relations can retain old semantic associations.
- The old quote may no longer support the revised memory text.
- A revision snapshot preserves the old memory row, but does not by itself restore vector/entity/relation state.

## Safe target behavior for a future implementation

A text-changing revision should be one transaction for the primary row and synchronous derived indexes:

1. Verify owner authorization and expectedRevision CAS.
2. Require an explicit human invalidation/revision reason.
3. Save the complete prior memory row as a revision before mutation.
4. Update the primary memory and FTS.
5. Remove the old vector in the same transaction. Do not leave a stale vector queryable.
6. Rebuild entity links from the new text in the same transaction, with mention counts adjusted exactly once.
7. Invalidate relations owned by this memory; only rebuild relations when there is a validated relation extractor and evidence.
8. Clear the old quote or require a newly validated quote. Preserve the old quote in the revision snapshot.
9. Mark provenance review required. Until an owner validates the revised claim against its source anchor, do not inject it as a verified fact.
10. Commit. Re-embed after commit; if embedding fails, leave the memory keyword-only and record a retryable pending state. Never restore the stale vector.
11. Return a structured report of invalidated/rebuilt indexes and pending work.

## Rollback

A rollback must be a new revision, not a revision-number rewind:

- Read a selected historical snapshot.
- Re-check current expectedRevision.
- Create a new revision whose content is restored from the historical snapshot.
- Revalidate that its source anchor is still available and not tombstoned.
- Rebuild FTS/entities, invalidate vector, and re-embed.
- Keep a complete audit record of actor, reason, time, source revision, and current revision.
- If the source was revoked, restoration of the old quote/provenance must fail closed.

## Open decisions (do not guess)

- Whether text edits may proceed with a missing source anchor.
- Whether a changed claim must provide a new quote or can retain only the raw source anchor.
- Whether edited memories enter a `needs_review` status or a separate provenance-review queue.
- Whether vector re-embedding is synchronous or asynchronous and how pending state is represented.
- How relations are rebuilt, given that the current relation table does not have a complete maintained writer path.

Until these are decided and tested, do not use `updateMemory()` to edit real production memories. The local M3-REF-06 isolated test should report actual stale-index behavior and transaction rollback evidence before any code change is accepted.
