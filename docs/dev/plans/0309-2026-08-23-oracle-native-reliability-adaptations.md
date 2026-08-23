# Oracle-Native Reliability Adaptations | 0309-2026-08-23

State: CLOSED
Lane: P02
Operational state: ACCEPTED / INTEGRATED / PROVIDER-FREE
Branch: feat/plan0309-oracle-adaptations
Target: main
Integration: merge
Revision: 2 | 2026-08-23

## Stable Objective

Adapt the concrete, architecture-neutral reliability lessons identified from
Oracle snapshot `083bba7e` into AuraCall's current architecture. Oracle is a
non-authoritative research source, not a synchronization target. Preserve
AuraCall's multi-provider, managed-browser, browser-service, and operator-safety
contracts while closing only gaps proved against current source.

## Current State

- Validated feature checkpoint `b412b0bc` merged into `main` through
  `9c3486ad`. All ten acceptance criteria are accepted. Oracle remains a
  research reference and no upstream synchronization occurred.
- Plan 0308 closed the repository true-up and established that Oracle and
  AuraCall now serve different purposes.
- Fresh inspection found 517 Oracle-only commits, including 447 non-merge
  patches. `git cherry` found no patch-equivalent Oracle commits, so direct
  cherry-picking is not the default integration method.
- Current AuraCall source confirms eight bounded candidate areas:
  - duration parsing skips junk between otherwise valid duration tokens;
  - the OpenRouter model catalog cache grows without a size bound;
  - same-slug session allocation checks before creating and is not atomic;
  - session artifacts do not explicitly enforce owner-only permissions;
  - Answer Now placeholder detection can reject substantial legitimate text;
  - explicit browser headless selection is discarded by CLI resolution;
  - resolver-derived WSL loopback nameservers are not normalized;
  - unavailable ChatGPT thinking tiers are not represented distinctly.
- Two additional Oracle security/policy ideas require architecture-specific
  adjudication before code: cookie-sync opt-in and MCP output symlink
  containment.
- Execution starts from clean `main == origin/main` at
  `03cae56cc39b8f80a14a0e9d7e7be23564f38e32`. No installed runtime,
  browser, provider, tenant, or external service effect is required.

## Planning Metadata

- Parent: Plan 0308 Oracle reference review and the operator instruction to
  plan and execute the resulting true-up.
- Critical-path owner: `/root`.
- Branch/worktree: `feat/plan0309-oracle-adaptations` in the primary AuraCall
  worktree.
- Target/integration: `main` through a validated merge after the feature branch
  is pushed and catalog custody is reconciled.
- Expected source write set:
  - `packages/browser-service/src/utils.ts`;
  - `src/oracle/modelResolver.ts`;
  - `src/sessionManager.ts`;
  - `src/browser/actions/assistantResponse.ts`;
  - `src/cli/browserConfig.ts` and its browser-default/config seams;
  - `packages/browser-service/src/chromeLifecycle.ts` or a focused WSL helper;
  - `src/browser/actions/thinkingTime.ts`.
- Expected test write set: corresponding focused tests under `tests/`.
- Expected documentation write set: this plan, roadmap, runbook, dev journal,
  fixes log, active-lane catalog, and user-facing docs only where operator
  semantics change.
- Parallelizable low-conflict tracks: parser/cache, session storage, response
  extraction, and WSL routing. This execution remains serialized because the
  current agent is the sole worker and integration evidence is easier to audit
  as coherent commits.
- Critical path: plan/custody -> small correctness packet -> session hardening
  -> browser semantics -> policy/security adjudication -> broad validation ->
  integration and closeout.

## Required Work

### Phase 0 | Publish Plan And Custody

1. Commit and push this planning checkpoint on the named feature branch.
2. Register its exact checkpoint in `docs/dev/active-lanes.yaml` on the
   canonical default branch and pass the catalog-only audit.
3. Use CodeGraph before each non-trivial source packet and inspect pending sync
   after edits.

### Phase 1 | Small Correctness Adaptations

1. Reject duration strings containing unmatched prefixes, suffixes, or gaps
   while retaining documented numeric and compound formats. Add regression
   cases for `abc5s`, `10junk5s`, and `1h!30m`.
2. Bound the OpenRouter catalog cache, expire stale entries, and avoid retaining
   an unbounded population of API-key-indexed entries. Add deterministic cache
   eviction tests without network calls.

### Phase 2 | Session Storage Hardening

1. Replace same-slug check-then-create allocation with atomic directory
   reservation and retry only an exact `EEXIST` collision.
2. Enforce owner-only modes for AuraCall-created session directories and files,
   including existing safe non-symlink entries where portable.
3. Preserve compatibility with existing sessions and platforms. Never follow a
   symlink merely to repair permissions.
4. Prove parallel same-slug creation yields unique intact sessions and prove
   directory/file permissions on POSIX.

### Phase 3 | Browser Semantics

1. Bound Answer Now placeholder recognition to exact known short chrome text;
   preserve the invariant that AuraCall never clicks Answer Now.
2. Honor an explicit headless request while retaining safe defaults. If the
   current architecture has an attach-running surface, reject an incompatible
   combination; otherwise record that portion as not applicable rather than
   inventing a new mode.
3. Normalize resolver-derived WSL `127.x` nameservers to `127.0.0.1` without
   rewriting explicit operator overrides.
4. Represent disabled/unavailable thinking tiers distinctly. Strict explicit
   selections fail closed; non-strict behavior may preserve the current tier
   only with an actionable notice.

### Phase 4 | Architecture-Specific Security Adjudication

1. Trace every MCP-controlled local output path. If AuraCall exposes a writable
   path surface equivalent to Oracle's, add realpath-aware containment and
   dangling-symlink rejection; otherwise record `not-applicable` with evidence.
2. Trace cookie bootstrap/sync ownership across AuraCall runtime profiles,
   browser profiles, source browser profiles, and managed browser profiles.
   Change defaults only if current AuraCall behavior can rotate or invalidate a
   source session; otherwise retain current semantics and record the reason.

### Phase 5 | Validation And Integration

1. Run focused tests after each packet, then affected provider-free suites,
   typecheck, touched-file zero-warning lint, build, planning audits, CodeGraph
   status, diff hygiene, and the proportional broad provider-free gate.
2. Commit coherent validated slices and push at material checkpoints.
3. Update durable fixes, user-facing behavior docs where needed, and the plan's
   current state with exact evidence.
4. Integrate only after the branch is clean, remote-equal, catalog-reconciled,
   and all accepted criteria are proved. Re-fetch and prove final
   `main == origin/main`.

## Non-Goals

- No synchronization, merge, rebase, or bulk cherry-pick from Oracle.
- No dependency-major, package-distribution, public-release, or Oracle product
  workflow adoption.
- No browser launch, prompt submission, provider call, installed-runtime
  update, API restart, tenant mutation, or live acceptance.
- No weakening of account binding, managed browser ownership, CAPTCHA stops,
  tool-approval rules, or the Answer Now prohibition.
- No speculative rewrite of browser-service or session storage beyond the
  accepted gaps.

## Acceptance Criteria

- `OA-R1`: invalid duration token gaps return the caller's fallback while all
  established valid formats remain green.
- `OA-R2`: the OpenRouter catalog cache has deterministic TTL and maximum-size
  enforcement with provider-free tests.
- `OA-R3`: concurrent same-slug initialization atomically reserves unique
  session directories without overwriting metadata.
- `OA-R4`: AuraCall-created session directories/files are owner-only on POSIX,
  compatibility behavior is tested, and symlinks are not followed for mode
  repair.
- `OA-R5`: substantial assistant text containing “Answer now” is retained,
  exact placeholders are ignored, and tool-approval tests continue to prove no
  Answer Now click.
- `OA-R6`: explicit headless behavior is deterministic and documented;
  defaults remain safe, and the absent attach-running surface is recorded as
  not applicable.
- `OA-R7`: resolver-derived WSL loopback addresses use the local route while
  explicit overrides and non-loopback resolver hosts retain their meaning.
- `OA-R8`: unavailable thinking tiers produce an exact typed outcome and strict
  selection cannot silently proceed with the wrong tier.
- `OA-R9`: MCP output and cookie-sync candidates each have a source-backed
  `implemented`, `already-present`, `not-applicable`, or `deferred` disposition.
- `OA-R10`: focused, affected, and broad provider-free validation plus
  typecheck, lint, build, planning, CodeGraph, Git, and origin parity evidence
  pass at the integrated commit.

## Bounds And Stops

- Maximum implementation attempts per packet: 2 before local reframe.
- Maximum broad review/discovery passes: 1; later verification is closed-world
  against accepted criteria and critical regressions.
- Maximum consecutive hardening-only checkpoints: 2 before moving to the next
  acceptance-bearing packet.
- Checkpoint at each coherent commit and before integration.
- Stop a browser-specific packet on ambiguous provider semantics, but continue
  independent parser, cache, session, or policy-audit work.
- Any need for live/provider effects, installed-runtime changes, public release,
  destructive cleanup, or a materially wider output/cookie policy requires a
  separately explicit authority check.

## Current Execution Record

- State transition: `ready -> active -> phase-1-accepted -> phase-2-accepted ->
  phase-3-accepted -> integration-ready -> accepted-integrated`.
- Acceptance state: `OA-R1` through `OA-R10` accepted.
- Progress classification: `objective_complete` through validated AuraCall-
  native adaptations and source-backed non-applicability decisions.
- Evidence: Phase 1 focused `25/25`; Phase 2 RED reproduced duplicate IDs and
  permissive existing/new modes, then GREEN passed focused/affected `69/69`.
  Phase 3 focused/affected `85/85`, typecheck, touched-file zero-warning Biome
  lint, and diff hygiene pass. The attach-running clause is not applicable:
  AuraCall has local-launch and separate remote-Chrome paths, but no current
  attach-running option in browser config resolution.
- Phase 4 source trace is recorded in
  `docs/dev/notes/2026-08-23-plan0309-security-policy-adjudication.md`. Oracle's
  MCP output containment is not applicable because no AuraCall MCP-controlled
  path reaches a write sink. Cookie copying is implemented as opt-in because a
  copied provider token can rotate in the managed browser and invalidate the
  source session even though AuraCall never writes the source cookie database.
  Phase 4 focused/affected validation passes `202/202`, typecheck, scoped
  zero-warning Biome lint, current CodeGraph at 910 files / 17,163 nodes /
  58,817 edges, and diff hygiene.
- Phase 5 broad validation used an isolated AuraCall home. The first pass
  produced 2,993 passes / 65 skips and three failures: two affected doctor
  fixtures that assumed the old implicit cookie default, plus one Grok timing
  failure under suite load. After making the fixtures explicit, the closed-
  world rerun passes `26/26`; no Grok source repair was required. Production
  build and full lint pass; the repository-wide warning count remains the
  existing 208 while every touched source/test file is warning-free. Process
  census preserved baseline DevTools ports and found no test-home process.
- Integration evidence: feature checkpoint `b412b0bc1becbe4ac64a24be680583873cd063fb`
  merged without conflict through
  `9c3486ad1a7095ce88bd8492a1bcb5b9b2772523`; P02 custody is integrated.
- Next action: no Plan 0309 execution remains. Future Oracle review stays
  topic-qualified and opens a new bounded plan only for a proved AuraCall gap.
