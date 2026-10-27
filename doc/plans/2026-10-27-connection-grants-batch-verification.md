# Connection-grants batch verification

Date: 2026-10-27. Implements the
[selected design](2026-10-27-connection-grants-capability-batch.md).

## Change and authority boundary

`connectionManagementService.describeAgentInstallCapabilities` prepares a direct
saved connection once, checks its retained installation targets once, and checks
each additional candidate in order. It uses the same private target evaluator as
ordinary authorization. The grants GET replaces only its editable-agent loop.

The optimized shape is board actors, non-AI saved connections, canonical candidate
IDs, and no contextual or proposed-resource selectors. Delegated agents and
complex resources finish the first already prepared evaluation and then use the
ordinary evaluator. Preparation is not restarted. Configure/use capabilities,
grant identity filtering, audience disclosure, writes, and human continuations
retain their existing authority paths.

Reuse lasts one descriptive call. It is not an atomic snapshot: a retained
permission or target removed mid-call can leave a stale displayed choice. The
next description and actual authorization must read fresh authority. No context,
mutation authority, or reusable cache escapes the batch.

## Reproduction and measurements

Pinned baseline: `f6bc653f7f745adaafa26393852fb2f5a99256a4`.
Treatment service SHA-256:
`498dcfc2fea3395326b7b480e6c49845ccfb6c3b7fcce8a7391b9cca3336a5da`.
The benchmark loads the actual baseline service from Git, verifies that its other
runtime dependencies and lockfile match, and compares it with the new production
batch. Every positional capability, reason, and operation must match.

```sh
node --import ./server/node_modules/tsx/dist/esm/index.mjs \
  scripts/benchmark-connection-install-capabilities.ts \
  --baseline-ref=f6bc653f7f745adaafa26393852fb2f5a99256a4
```

The fixture is a Cloud board member who is not the creator, with a target-scoped
grant covering the synthetic roster. Company installs retain the whole roster;
partial installs retain one quarter, with at least one retained agent. Each arm
has two warmups and five measured samples in alternating order. Counts below are
per invocation. Full positional equality passed in every iteration. Individual
SQL shapes are unchanged; the benchmark saves statement counts, parameters, rows,
and treatment `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` outside timed samples.

| Agents / installation | Old median ms (range) | Batch median ms (range) | SQL calls old → batch | Target lookups old → batch |
| --- | ---: | ---: | ---: | ---: |
| 1 / company | 4.61 (4.16–5.10) | 4.32 (4.04–4.87) | 8 → 8 | 1 → 1 |
| 1 / partial | 3.77 (3.52–4.04) | 3.90 (3.52–5.69) | 7 → 7 | 1 → 1 |
| 8 / company | 166.72 (165.09–184.14) | 20.76 (19.63–22.51) | 344 → 43 | 64 → 8 |
| 8 / partial | 60.91 (59.06–63.27) | 19.60 (19.44–20.64) | 126 → 42 | 22 → 8 |
| 32 / company | 5,069.40 (2,616.72–5,721.04) | 252.01 (87.59–348.05) | 5,216 → 163 | 1,024 → 32 |
| 32 / partial | 1,303.39 (1,085.51–1,658.48) | 145.72 (121.78–279.80) | 1,464 → 162 | 280 → 32 |
| 100 / company | 24,812.41 (24,617.83–27,483.21) | 243.34 (235.48–259.41) | 50,300 → 503 | 10,000 → 100 |
| 100 / partial | 6,513.97 (6,453.69–6,714.11) | 243.04 (236.11–320.57) | 13,075 → 502 | 2,575 → 100 |

At 100 agents, returned Drizzle rows fell from 60,200 to 602 for company installs
and from 15,475 to 526 for partial installs. The one-agent controls are neutral,
including a small overlapping timing regression for the partial case. The
32-agent timings have substantial spread; preserve that range rather than
extrapolating a latency curve from the medians.

The host could not start native PostgreSQL because SysV semaphore allocation
failed, including an unsandboxed low-resource initdb attempt. Local proof used
the existing test constructor seam with a scratch Docker provider: PostgreSQL
18.6 Debian/aarch64 Linux, Node 26.4.0, loopback-only networking, tmpfs storage,
and no simulated database delay. Each provider instance removed only its own
container. Existing database creation, migrations, clients, service code and
cleanup remained in use. The normal embedded package targets Darwin PostgreSQL
18.1; minor version, platform, networking, and compute differ. Defaults included
128 MiB shared buffers, 4 MiB work memory, and JIT enabled.

## Correctness evidence and limits

- Focused real-policy regressions cover scoped grants without installs, retained
  missing/denied targets, mixed and duplicate candidates, 403 versus reached
  409/500 faults, earlier denial masking an unreachable fault, forced mutation
  mode, fresh calls and reauthorization, actor/company isolation,
  deliberate within-call staleness, and ordinary fallback preparation counts.
- Real PostgreSQL differential coverage includes company and partial installs,
  empty/duplicate candidates, foreign targets, uppercase UUID comparisons,
  profile/proposed-provider fallback, and an injected SQL division-by-zero fault
  that must escape only when reached.
- The assembled grants GET compares complete old-loop and batch responses across
  creator, manager, member, viewer, inactive, and administrator fixtures. It
  verifies personal identity filtering, audience disclosure, ordered editable
  IDs, and an actual allowed install PUT followed by revocation, fresh denied
  capabilities, and a denied PUT with saved installs unchanged.
- Independent review compared the pinned and extracted ordinary evaluator in
  18 context/query/lock-order cases and 18 complete batch cases. Additional
  checks covered delegated fallback, recursive profiles/gateways/AI pools, run
  capture reuse, a succeeded-run continuation, and fresh revocation. This
  supplemental proof uses synthetic database transport, not real lock contention.

Initial test failures were incorrect fixture expectations: inactive access hides
the resource with 404, database roster order is not insertion order, and the
existing final install mutation gate requires an unscoped agent-configuration
grant. These were corrected in tests. Complete old/new GET equality passed before
these extra assertions. No product behavior was changed to satisfy them.

The bound is retained-plus-candidate target evaluations, not total CPU, SQL rows,
or endpoint latency. Scoped grant arrays and company hierarchy reads can still
grow inside each policy decision. Recursive and delegated fallback retain their
existing costs. The benchmark measures the descriptive service component;
hosted request attribution and production latency improvement remain unverified.

The final focused run passed all 113 tests: 30 batch regressions and all 83
connection-management integration cases, using disposable Docker PostgreSQL.
The required workspace typecheck and build passed using pinned pnpm 9.15.4.
The standard full Vitest workflow was attempted, then stopped after native
database fixtures failed to initialize. A separately isolated failing native
runner case reproduced the same PostgreSQL startup failure. This is not a full
local test pass; the critical connection suites use the disposable Docker
provider described above, and the complete CI suite remains a separate gate.
Final test/CI outcomes are recorded in the pull request; this document does not
substitute for a final-head check or deployed acceptance.
