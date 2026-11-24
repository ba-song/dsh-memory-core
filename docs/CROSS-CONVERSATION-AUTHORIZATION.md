# Cross-Conversation Handoff Authorization (Design)

Status: design-only; not wired into runtime. The current fail-closed behavior remains in force.

## Why this boundary exists

A trusted live session proves that the host observed a session ID and working directory. It does **not** prove that the owner authorized data from that conversation to be disclosed to another conversation. Session trust and disclosure consent are separate facts and must never be conflated.

The current P0-1 handoff may include only recent messages explicitly supplied by the current conversation. Owner-wide pins, projects, decisions, todos, raw archives, and other conversation history remain unavailable to cross-conversation handoff unless a separate authorization check succeeds.

## Required identities

An authorization decision must bind all of the following:

- `ownerId`: stable, locally resolved owner identity; never model supplied.
- `sourceSessionId` and `sourceCwd`: exact host-observed source session identity.
- `targetSessionId` and `targetCwd`: exact host-observed destination session identity.
- `purpose`: a fixed, enumerated purpose (initially only `handoff`).
- `fields`: explicit allowlist of data classes; no wildcard or implicit expansion.
- `issuedAt`, `expiresAt`, and a unique authorization ID.
- `consentEvidence`: opaque reference to a host-originated owner consent event; never a model-generated statement or free-form boolean.

A path or session ID supplied only in tool arguments is not evidence of identity. Both sessions must independently match the live-session registry at the time of authorization and again immediately before disclosure.

## Consent and lifecycle

1. The host must expose a deliberate owner-controlled consent action that identifies the exact source and target conversations and previews the data classes to be shared.
2. The consent action must produce an unforgeable host-side event/reference. The model cannot mint, edit, broaden, or replay it.
3. The authorization is bound to one source, one target, one purpose, and an exact field allowlist.
4. Authorization should be short-lived (recommended default: 5 minutes), one-use, and revocable. A target session change, cwd change, owner change, expiry, or host restart invalidates it.
5. A later request for more fields or a different target requires fresh consent. No silent scope upgrade.
6. If the host cannot provide a trustworthy consent event, the feature remains disabled. Do not substitute a prompt instruction, model confirmation, matching cwd, or possession of a session ID.

## Initial data-class policy

| Data class | Initial cross-conversation policy | Reason |
|---|---|---|
| Current conversation recent turns | Only the current conversation's supplied turns | Existing P0-1 behavior |
| Stable facts / owner profile | Deny by default; future explicit allowlist only | Can contain sensitive or stale claims |
| Pins / projects / decisions / todos | Deny by default; explicit per-class consent required | May reveal unrelated work |
| Raw archive / verbatim quotes | Deny by default; separate narrower consent required | Highest disclosure and context-leak risk |
| Group / third-party conversation data | Always deny in this feature | Owner consent alone cannot authorize other participants' data |
| Emotion / relationship / private diary | Always deny in the initial version | Intimate context; requires a separate product decision |

The allowlist is a maximum ceiling, not a requirement to include every permitted item. Each candidate item must also pass its own provenance, scope, status, and sensitivity checks.

## Provenance requirements

Every shareable memory item must carry or resolve to:

- stable item ID and data class;
- source conversation/session identity;
- source timestamp (or an explicit unknown marker);
- provenance kind (direct user statement, user emotion, shared experience, derived pattern, or model inference);
- confidence and uncertainty markers where applicable;
- current status (active, faded, archived, soft-deleted, or permanently deleted).

Unknown provenance is not shareable. Model inference must never be rendered as a user-confirmed fact. Soft-deleted, archived, blocked, or expired records are not eligible for handoff unless a future, separately approved recovery flow says otherwise.

## Decision procedure (fail closed)

Before producing any cross-conversation content:

1. Resolve owner identity from local trusted configuration.
2. Verify source and target sessions against host-observed live sessions, including exact IDs and cwd.
3. Resolve a valid host-originated consent event and verify owner, source, target, purpose, expiry, revocation, and one-use state.
4. Intersect requested fields with the exact consent allowlist; reject unknown fields.
5. Fetch only records in the authorized source scope and permitted data classes.
6. Filter every record by provenance, status, and third-party restrictions.
7. Emit only the minimum necessary content.
8. Record an audit event with authorization ID, source/target IDs, purpose, allowed/denied data classes, item IDs/counts, and reason. Do not copy message bodies or raw memory text into the audit log.
9. Consume the authorization atomically. Any failure returns an empty result.

No partial fallback to owner-wide data is permitted after a failed check.

## Audit events

Record at least: `authorization_issued`, `authorization_denied`, `handoff_completed`, `authorization_expired`, `authorization_revoked`, and `authorization_consumed`.

Audit records should be append-only where practical, bounded/rotated, and contain identifiers and decision metadata rather than personal content. Failures to write an audit event must prevent disclosure.

## Implementation gate

Do not wire this design into `lib/index.js`, restore cross-Conversation pins/projects/decisions/todos, or enable `publicBrief` until all of these exist and are tested:

- a documented host-side owner consent API with authenticated event provenance;
- atomic, one-use authorization consumption and revocation;
- exact source/target session binding and revalidation;
- item-level provenance and sensitivity filtering;
- audit persistence with fail-closed behavior;
- tests for forged consent, replay, expiry, revocation, session substitution, cwd changes, scope expansion, third-party data, and audit failure.

Until then, the existing P0-1 restrictions are intentional security behavior, not missing functionality to work around.
