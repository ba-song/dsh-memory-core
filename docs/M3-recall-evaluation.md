# M3 Recall Evaluation and Human Annotation

Status: evaluation infrastructure added; the annotation template is intentionally unlabelled. No Recall@K result is valid until memory IDs and evidence are manually annotated against a pinned read-only snapshot.

## Dataset files

- `scripts/m3-eval-annotations.schema.json`: JSON Schema for annotation records.
- Positive labels are rejected unless the evaluated code commit, read-only DB snapshot SHA-256, embedding model identity, and run parameters are pinned. Every positive label also needs a provenance anchor.
- `scripts/m3-eval-annotations.template.json`: template containing the current 15 queries. All `relevant` arrays are empty intentionally.
- `scripts/m3-eval-queries.json`: legacy query list. Its `expectedContains` strings are heuristic hints, not human relevance ground truth.

## Annotation policy

Each dataset also records the exact code commit, database snapshot SHA-256, embedding model identity, and retrieval/injection run parameters. Each query records:

- stable query ID and exact query text;
- scope level and cwd used for the run;
- optional as-of time;
- relevant memory IDs with graded relevance 0–3;
- source evidence for each labelled memory (source message ID, timestamp, or raw ID);
- forbidden memory IDs that must not be returned in that scope;
- annotator and notes.

Suggested grades:

- 3: directly answers the query / exact required fact or decision.
- 2: materially relevant supporting episode or context.
- 1: weakly relevant, useful only as secondary context.
- 0: explicitly judged irrelevant.

An empty `relevant` array means unlabelled. A non-empty array containing only grade-0 records means the query was judged to have no relevant memory among the reviewed candidates; it must not be confused with an unlabelled query.

Do not infer memory IDs from query wording. Verify each label against the memory row and original provenance. Keep unresolved queries unlabelled.

## Metrics

`lib/recall/eval-metrics.js` provides:

- Recall@1/3/5 and Precision@1/3/5;
- MRR;
- graded nDCG@5;
- evidence coverage among retrieved relevant memories;
- forbidden returned ID count;
- RRF per-arm rank and contribution explanation;
- top-K Jaccard and exact-order stability comparison.

Macro recall/MRR/nDCG only include judged queries with at least one positive relevant memory. Precision includes explicitly judged negative-only queries as zero. Unlabelled queries are excluded from relevance metrics. Forbidden IDs are counted even for unlabelled queries when the annotation supplies them.

The legacy `expectedContains` report is nested under `legacyStringHeuristic` and must not be reported as formal Recall@K or Precision@K.

## Reproducibility and safety

Pin the dataset version, annotation policy version, code commit, database snapshot hash, embedding model/version, and run parameters. Use a separate consistent database snapshot opened with `readOnly: true`; keep `trackAccess: false`. Do not run recall evaluation against the production DB. Do not run consolidation, decay, vector recomputation, or any mutating maintenance routine as part of evaluation.

The evaluator accepts `--annotations PATH` to select a pinned annotation dataset and `--event-chain` to emit evidence-gated event-chain candidates as a separate diagnostic. The annotated scope level must agree with the scope derived from cwd; optional contactId/groupId labels are checked against the derived identifiers. The embedding model path can be supplied with `DY_EMBED_MODEL` (default `/opt/qqai/models/bge-small-zh`). Event-chain diagnostics do not enter the ranked result list or automatic injection.

The current template contains zero relevance labels by design. Until manually labelled, formal Recall@K, Precision@K, MRR, and nDCG must remain null.
