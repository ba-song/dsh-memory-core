# Q149 Recovery Source Adapter Design

Status: design only; no runtime adapter is enabled or connected.

Date: 2026-11-24

## 1. Purpose

Define the read-only boundary between the Q149 recovery planner and existing source stores. The planner in `lib/recovery/plan.js` must receive evidence only after a host-trusted caller has been authorized to read it. This document does not grant new access and does not change existing tool permissions.

## 2. Trust chain

The recovery caller must not be allowed to self-assert any of the following: owner identity, source session, cwd, access decision, evidence independence, or consent.

The intended chain is:

1. **Host-observed invocation**: obtain the actual execution session from the host execution context, as current tools do through `exec.agent.session` / `exec.session`.
2. **Live-session validation**: require a session previously observed by the host-side live-session registry; match both session ID and cwd exactly. A request body, source locator, or remembered session ID is not sufficient.
3. **Owner/scope derivation**: derive owner status from the existing local owner configuration and `isOwnerCwd` / `sessionOf` logic. Derive scope using `scopeForSession`; never accept model-supplied scope fields.
4. **Purpose authorization**: for this first recovery iteration, permit only the current owner-private session's authorized read scope. A different Conversation or session is not implicitly authorized. Cross-Conversation access requires a future host-originated, purpose-bound, target-bound, short-lived, revocable consent artifact.
5. **Source adapter**: each adapter receives the validated internal authorization context, not a caller-created object. It independently enforces source-specific path/scope constraints.
6. **Evidence normalization**: adapters issue opaque evidence IDs and derive lineage/copy relationships from actual source metadata. The model cannot provide `independenceKey`, `copiedFrom`, or `access` as authoritative values.
7. **Planner**: pass normalized evidence to the pure planner. Its outcome remains a proposal, never a write.

If any trust step is missing, fail closed and return no source body.

## 3. RawArchive adapter

### Existing implementation facts

- `lib/archive/tools.js` exports `searchArchive(db, { question, limit, cwd, queryEmbed, withContext, persona })`.
- Keyword search filters `raw_meta.tombstone=0` and applies exact cwd equality when a non-empty cwd is supplied.
- Semantic search joins vector IDs back to non-tombstoned raw rows. The current semantic branch does not apply the same cwd predicate in its final `raw_meta` lookup; do not use that branch for recovery until a scoped implementation is added and tested.
- `lib/scope.js` defines raw access as owner `all`, external contact `own`, and group/unknown `none`. `rawAllowsCwd` performs the scope-level cwd check.
- The current ordinary archive search helper is a retrieval utility, not a cross-Conversation authorization service.

### Adapter contract

Input is an internal, host-created authorization context containing:
- exact live session ID and cwd;
- derived owner/scope object;
- explicit purpose `memory_recovery`;
- optional target session/Conversation grant, only if a future consent system verifies it.

The adapter must:
- reject missing/expired live-session evidence;
- require owner-level access for owner-private recovery in v1;
- constrain every SQL branch (keyword, vector, context window, and follow-up row reads) to the authorized cwd/session scope;
- apply tombstone filtering at every row fetch, including context windows;
- never use an empty cwd as a shortcut to unrestricted owner reads unless the validated owner scope explicitly authorizes that access;
- return only the minimum excerpt and metadata needed for comparison;
- label source access as allowed only after the adapter itself has completed all checks.

### Important current gap

`searchArchive`'s keyword branch filters cwd, but the semantic vector branch resolves `raw_meta` by ID without a cwd constraint. The `hitWindow` context expansion also follows file/cwd based on the hit row and should be reviewed for same-scope enforcement. A recovery adapter must not wrap these helpers and assume the whole path is scoped. Prefer a dedicated scoped query implementation or first harden and test the shared helper without widening ordinary callers.

## 4. Diary discovery adapter

### Existing implementation facts

- `lib/diary/store.js` currently exports `saveDiary` only.
- Diary files are stored under `<dataDir>/diary/YYYY-MM-DD/HHMMSS-seq.md`.
- The writer generates a frontmatter ID/date/time/sequence/author/schema and writes atomically.
- There is no supported list/read API, no diary index, and no diary authorization layer in this module.

### Proposed read-only contract

The future adapter should accept a trusted internal data root, a bounded date range, and a bounded result limit. It should not accept an arbitrary caller path.

Before reading:
- resolve the configured data root once at plugin startup;
- reject a symlinked diary root and symlinked date/file entries (use `lstat`, not only `stat`);
- construct paths only from validated `YYYY-MM-DD` directory names and fixed filename grammar;
- verify each resolved file remains under the canonical diary root;
- accept only regular files, enforce a per-file and total byte budget, and cap file count;
- parse only the known frontmatter schema; malformed or unknown schema becomes inaccessible/diagnostic, not silently coerced;
- open files read-only and never repair, normalize, rewrite, or update timestamps;
- do not follow symlinks, path traversal, or arbitrary frontmatter references;
- preserve the original body and timestamp; do not treat `author: self` as proof of owner identity without trusted root/session context.

The adapter must be called only after the host authorization chain above. Knowing the diary path or filename is not authorization.

## 5. Evidence identity and independence

The adapter, not the model, constructs:
- opaque evidence ID;
- source kind (`raw_archive`, `diary`, or other explicitly supported source);
- source locator internal to the adapter;
- source timestamp and author/speaker metadata;
- exact excerpt and quote-verification result;
- access decision and reason;
- lineage ID based on original source identity;
- copied-from relation for derived summaries or duplicated exports.

A diary entry and a raw utterance are not automatically independent: if one was generated from the other, the adapter must link their lineage. If the relationship cannot be established, mark independence unknown rather than inventing a distinct lineage. A planner's `multiple_asserted_lineages` remains only as trustworthy as this adapter output.

## 6. Privacy and retention

- Tombstoned archive rows remain inaccessible even if an index/vector copy survives.
- Expired archive sources are not reconstructed from copied summaries and represented as original quotes.
- Diary contents are private by default; no group, external-contact, or unrelated Conversation can discover them.
- Recovery logs contain IDs, source kinds, access outcomes, and operation metadata only; never diary bodies, raw quotes, or full claims.
- No third-party or group-chat content is included in owner recovery v1 unless a separate explicit policy and consent path is designed.

## 7. Test matrix before implementation

### RawArchive
- owner-private session can read only the authorized owner scope;
- external session can read only its own cwd when existing scope allows it;
- group and unknown scopes return no raw evidence;
- semantic vector hits cannot escape cwd;
- context expansion cannot escape cwd/file scope;
- tombstoned rows and vector orphans are excluded;
- missing or stale live session is denied;
- a source locator from another Conversation does not grant access.

### Diary
- valid date/file grammar only;
- traversal, absolute path, symlink root, symlink date dir, and symlink file rejected;
- non-regular files rejected;
- malformed frontmatter rejected or returned as non-readable diagnostics;
- file count, file size, and total bytes bounded;
- no writes, renames, deletes, or timestamp changes;
- only validated owner authorization can invoke discovery.

### Evidence
- copied summary shares original lineage;
- independently authored diary and raw source count as separate only when provenance supports it;
- unknown lineage is not upgraded to independent;
- source timestamps and excerpts remain unchanged;
- planner receives only adapter-approved evidence.

## 8. Implementation gate

Do not implement a read adapter until the host's live-session evidence and owner authorization can be passed into it without accepting caller-supplied trust fields. The RawArchive semantic-scope gap must be fixed before semantic recovery search is allowed. Diary discovery must remain a separate module and read-only. No runtime registration, cross-Conversation access, data migration, memory write, or production deployment is authorized by this design.


## 9. Implementation status update (2026-11-24)

A dedicated read-only RawArchive adapter now exists in `lib/recovery/raw-archive.js`; it does not wrap or call the ordinary `searchArchive` helper.

- It derives the live session from the host execution context and requires an exact match in the host-observed session registry.
- It derives owner access from the injected host-side `isOwnerCwd` check and `scopeForSession`; caller-supplied cwd, scope, access, and lineage fields are ignored.
- Both keyword candidates and semantic-vector candidates are filtered by exact authorized cwd and non-tombstoned rows before source text is read. The final row fetch repeats cwd, tombstone, and role predicates.
- It returns bounded excerpts only; it does not perform context-window expansion.
- Session archive files named `s-<short-session-id>.md` are grouped into one asserted evidence lineage across date directories. The short session token is a locator-derived grouping key, not host authentication; the planner continues to label independence as asserted by the upstream adapter, not independently verified.
- Focused tests cover unobserved-session denial, exact owner-cwd scoping, semantic candidates from another cwd, tombstone exclusion, and ignoring caller-supplied scope overrides.

This closes the specific semantic-vector cwd escape in the **new recovery adapter**. It does not claim that the ordinary `lib/archive/tools.js` `searchArchive` helper has been hardened for every caller, and it does not add context expansion.

Still not implemented:
- no diary discovery/read adapter;
- no runtime registration or end-to-end host authorization wiring;
- no cross-Conversation consent flow;
- no memory-row provenance lookup or automatic claim-to-evidence relation classifier;
- no recovery write/apply operation.

The adapter remains read-only and is not a production recovery feature. Its focused tests are included in the full Node test workflow; the latest tested branch head at this update is recorded separately in the PR/Actions history.
