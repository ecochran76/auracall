# RUNBOOK

## Turn 185 | 2026-05-30

- Active plan:
  `docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md`
- Goal: execute and close Plan 0084.
- Result:
  - bounded default completion summary hydration so `/status` computes exact
    account-mirror completion metrics without hydrating every historical
    materialization record.
  - added completion summary `limits.recent` and `omitted.recent` metadata.
  - added stale runner compaction with a retention rule of the newest `100`
    stale runner records and active-runner preservation.
  - installed and restarted the user runtime service on port `18095`.
  - closed Plan 0084 and returned the roadmap to ready-for-next-plan posture.
- Installed evidence:
  - baseline default `/status`: `457378` bytes, `10.379518s`, runner topology
    `1761` total / `1760` stale.
  - after restart default `/status`: `461530` bytes, `7.214479s`, runner
    topology `101` total / `100` stale, live follow `healthy` with `6` active
    completions, and `accountMirrorCompletions.omitted.recent: 2690`.
  - after restart heavy status:
    `/status?recovery=true&sourceKind=all&tenantExecutionLimits=usage`
    returned `542060` bytes in `11.560811s`.
  - `runnerTopology=full` returned all `101` retained runner rows; direct
    unauthenticated `/v1/account-mirrors/completions?limit=1` returned `401`,
    while CLI `auracall api mirror-completions --port 18095 --limit 1 --json`
    returned one completion row.
- Verification:
  - `pnpm vitest run tests/runtime.runnersControl.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 -t "keeps live-follow completion metrics aligned"`
  - `pnpm run typecheck`
  - `pnpm run build`
  - `pnpm run lint` exited `0` with existing warning-level debt (`200`
    warnings).
  - `pnpm run plans:audit -- --keep 84`
  - `git diff --check`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`

## Turn 184 | 2026-05-30

- Active plan:
  `docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md`
- Goal: open the first detailed plan from the live-follow/materialization
  health audit.
- Result:
  - opened Plan 0084 for API readback memory pressure and stale-runner
    compaction.
  - scoped the plan around bounded default `/status` and status-consumer
    readback, stale runner retention, explicit forensic full-read modes, and
    installed-runtime proof on port `18095`.
  - kept artifact materialization recovery, provider browser automation,
    Search/archive, API Access, launch, broad retry, and additional console
    controls out of scope.
  - wired Plan 0084 into `ROADMAP.md` as the active reliability slice.
- Verification:
  - `pnpm run plans:audit -- --keep 84`
  - `git diff --check`

## Turn 183 | 2026-05-29

- Active plan:
  `docs/dev/plans/0083-2026-05-29-runs-safe-controls.md`
- Goal: execute and close Plan 0083.
- Result:
  - added `/status.controlReadiness` as the read-only contract for safe Runs
    controls, including availability, blocked reason, route/method, payload,
    expected readback, confirmation copy, provider-browser effect flags, and
    persistent-write flags.
  - exposed the first greenfield `/console?view=runs` controls for
    live-follow pause/resume/cancel, background drain pause/resume, and
    local-runner eligible targeted drain.
  - kept launch, broad retry, provider-specific browser automation, and legacy
    frontend changes out of scope.
  - closed Plan 0083 and moved `ROADMAP.md` back to a ready-for-next-plan
    state.
- Verification:
  - `env -u OPENAI_API_KEY pnpm vitest run tests/http.responsesServer.test.ts -t "control readiness|controls account mirror completions|pauses and resumes background drain"`
  - `pnpm run console:build`
  - `pnpm run typecheck`
  - `pnpm run build`
  - desktop and 375px mobile browser checks for `/console?view=runs`
  - installed local route check for
    `http://127.0.0.1:18095/console?view=runs`
  - `pnpm run plans:audit -- --keep 83`
  - `git diff --check`

## Turn 182 | 2026-05-29

- Active plan:
  `docs/dev/plans/0083-2026-05-29-runs-safe-controls.md`
- Goal: write the next bounded implementation plan after Plan 0082.
- Result:
  - opened Plan 0083 for state-gated safe controls in the greenfield
    `/console?view=runs` workbench.
  - scoped the first control family to live-follow pause/resume/cancel,
    background drain pause/resume, and one local-runner-owned targeted-drain
    path if backend readback proves eligibility.
  - kept launch, broad retry, provider browser automation, and legacy frontend
    changes out of scope.
  - updated `ROADMAP.md` Current Execution Board and `P02 Now/Soon` so the
    active lane is no longer stale Plan 0082 text.
- Verification:
  - `pnpm run plans:audit -- --keep 83`
  - `git diff --check`

## Turn 181 | 2026-05-29

- Active plan:
  `docs/dev/plans/0082-2026-05-29-transcribe-audio-app-intelligence-integration.md`
- Goal: execute and close Plan 0082.
- Result:
  - added effective registry-backed `teams` to
    `GET /v1/config/agent-choices`.
  - fixed `AgentTeamConfigService.choices()` to project from the effective
    registry catalog, not only file-backed config.
  - implemented the `transcribe-audio` AuraCall choices consumer and redacted
    readiness projection.
  - first-pass prepare/enqueue now prefers `AURACALL_AGENT_ID` and records
    `auracall_readiness`; `/api/intelligence/config` exposes the same
    readiness for the review console.
  - rebuilt and installed the user AuraCall runtime, restarted
    `auracall-api.service`, restored the transcript dispatch-pool registry
    team, and proved scoped readback sees three ready members.
  - live provider submit/materialize was skipped because the
    `transcribe-audio` first-pass queue is empty.
- Verification:
  - `env -u OPENAI_API_KEY pnpm vitest run tests/config/agentConfigService.test.ts tests/http.responsesServer.test.ts -t "choices|agent tenant and binding choices|writes agents and teams to the registry"`
  - `env -u OPENAI_API_KEY pnpm run typecheck`
  - `env -u OPENAI_API_KEY pnpm run build`
  - `git diff --check`

## Turn 180 | 2026-05-29

- Active plan:
  `docs/dev/plans/0082-2026-05-29-transcribe-audio-app-intelligence-integration.md`
- Goal: open the next bounded downstream `transcribe-audio` App Intelligence
  integration plan from the current roadmap authority.
- Result:
  - opened Plan 0082 for the AuraCall-to-transcribe-audio integration lane.
  - scoped AuraCall as the source of truth for agent, tenant, binding, model
    selector, project binding, and dispatch-pool choices.
  - kept transcript payloads, readout schemas, App Intelligence ledgers,
    materialization, and quality gates in `transcribe-audio`.
  - preserved dry-run, preview, approval-token, and no-unattended-write
    boundaries.
  - updated `ROADMAP.md` so the Current Execution Board and `P02 Now` point at
    Plan 0082 as the active lane.
- Verification:
  - `pnpm run plans:audit -- --keep 82`
  - `git diff --check`

## Turn 179 | 2026-05-29

- Active plan:
  `docs/dev/plans/0081-2026-05-29-roadmap-priority-reconciliation.md`
- Goal: execute and close the roadmap priority reconciliation plan.
- Result:
  - reconciled the Current Execution Board and `P02 Now` around the same
    post-Plan-0081 state.
  - rewrote the product UX milestone ladder so Agents, Providers, Projects,
    Overview/Health, and read-only Runs are recorded as completed greenfield
    `/console` milestones.
  - clarified that launch, retry, cancel, resume, pause, drain, and other Runs
    mutation controls remain deferred to a later safe-controls plan.
  - kept the immediate next implementation lane pointed at downstream
    `transcribe-audio` App Intelligence integration.
  - closed Plan 0081 with implemented evidence.
- Verification:
  - `pnpm run plans:audit -- --keep 81`
  - `git diff --check`

## Turn 178 | 2026-05-29

- Active plan:
  `docs/dev/plans/0081-2026-05-29-roadmap-priority-reconciliation.md`
- Goal: write a bounded plan for the roadmap review findings.
- Result:
  - opened Plan 0081 for roadmap priority reconciliation after Plans 0077
    through 0080 closed the first greenfield `/console` sequence.
  - wired Plan 0081 into `ROADMAP.md` as the active planning lane.
  - added a current-priority snapshot that keeps the next implementation lane
    pointed at downstream `transcribe-audio` App Intelligence integration.
  - kept the scope documentation-only: no frontend, runtime, provider, API, or
    browser behavior changes.
- Verification:
  - `pnpm run plans:audit -- --keep 81`
  - `git diff --check`

## Turn 177 | 2026-05-29

- Active plan:
  `docs/dev/plans/0080-2026-05-29-runs-workbench-console.md`
- Goal: implement the greenfield console Runs workbench plan.
- Result:
  - implemented `/console?view=runs` as a read-only Runs workbench in the
    greenfield console.
  - the page loads recovery-enabled `/status`, recent runtime runs, runtime and
    team inspection, generic run status when available, and live-follow
    completion operations.
  - the workbench shows active, waiting, attention, completed, and cancelled
    work in a filtered table with a selected-row inspector for timeline,
    output, related records, queue context, and recovery posture.
  - kept launch/retry/cancel/resume/drain controls out of this slice until
    their state gates and safety contracts are proven in a later bounded plan.
  - reinforced that `/dashboard`, `/agents`, `/config`, and `/ops/browser`
    remain frozen legacy/diagnostic surfaces.
  - closed Plan 0080 with implemented evidence.
- Verification:
  - `pnpm run console:build`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console"`
  - `pnpm run typecheck`
  - `pnpm run build`
  - `agent-browser` desktop and 375px mobile render checks for
    `/console?view=runs` with no horizontal overflow, raw technical details
    hidden by default, and no browser console errors.
  - `pnpm run install:user-runtime-service`
  - installed local `/console?view=runs` served the new console asset, and
    external `https://auracall.ecochran.dyndns.org/console?view=runs`
    preserved the route through Authelia.
  - `git diff --check`

## Turn 176 | 2026-05-29

- Active plan:
  `docs/dev/plans/0079-2026-05-29-overview-health-console.md`
- Goal: complete the greenfield console Overview and Health command center.
- Result:
  - opened Plan 0079 for the next product-console milestone after Agents and
    Providers/Projects.
  - implemented `/console` as the Overview default and added
    `/console?view=overview`.
  - Overview summarizes `/status`, agent choices, and agent readback into
    service, agent, provider, live-follow, background-work, runner, and
    attention-queue signals.
  - raw status and route/id details remain hidden behind technical disclosure
    or Diagnostics links.
- Verification:
  - `pnpm run console:build`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console"`
  - `pnpm run typecheck`
  - `pnpm run plans:audit -- --keep 79`
  - `git diff --check`
  - `agent-browser` desktop and 375px mobile render checks for
    `/console?view=overview` with no horizontal overflow, raw technical details
    hidden by default, and no browser console errors.
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - installed local `/console?view=overview` served the new console asset, and
    external `https://auracall.ecochran.dyndns.org/console?view=overview`
    preserved the route through Authelia.

## Turn 175 | 2026-05-28

- Active plan:
  `docs/dev/plans/0077-2026-05-28-agents-configuration-ux.md`
- Goal: correct same-email ChatGPT Business vs Personal tenant selection in
  the greenfield Agents settings.
- Result:
  - agent-choice tenant keys now reuse canonical configured service-account ids
    instead of email-only keys.
  - ChatGPT account qualifiers such as plan, structure, and organization id are
    carried into Provider account labels.
  - Browser binding remains a browser/execution binding selector only after a
    Provider account is selected.
- Verification:
  - `pnpm vitest run tests/config/agentConfigService.test.ts --maxWorkers 1 --testNamePattern "same-email|choices"`
  - `pnpm run console:build`
  - `pnpm run typecheck`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "agent tenant|greenfield console"`
  - `git diff --check`

## Turn 174 | 2026-05-28

- Active plan:
  `docs/dev/plans/0077-2026-05-28-agents-configuration-ux.md`
- Goal: correct the greenfield Agents settings tenant/browser-binding UX after
  Plan 0078 closeout.
- Result:
  - changed `ux/console` so Provider account is the primary selector.
  - Browser binding is read-only and auto-selected when a provider account has
    exactly one valid binding.
  - Browser binding is selectable only when that provider account has multiple
    valid bindings, and invalid/not-ready bindings are not selectable.
- Verification:
  - `pnpm run console:build`
  - `agent-browser` rendered-form checks for one-binding and multi-binding
    provider accounts.

## Turn 173 | 2026-05-28

- Active plan:
  `docs/dev/plans/0078-2026-05-28-provider-project-console-ux.md`
- Goal: complete the next greenfield console UX plan after Plan 0077 without
  changing the retired frontend.
- Result:
  - opened Plan 0078 for Providers and Projects workflows in `/console`.
  - scoped provider-account readiness, browser-binding health,
    project/default binding inventory, and linked agent setup issues as the
    next product-console slice.
  - implemented `/console?view=providers` and `/console?view=projects` in
    `ux/console`, derived from existing `agent-choices` readback and linked
    agent validation.
  - added route-state navigation, search, readiness filters, compact metrics,
    selected-row inspectors, linked-agent handoff back to Agents, and hidden
    technical detail disclosure.
  - kept `/dashboard`, `/agents`, `/config`, and `/ops/browser` frozen as
    legacy/diagnostic pages.
  - closed Plan 0078 with implemented evidence.
- Verification:
  - `pnpm run console:build`
  - `pnpm run typecheck`
  - `pnpm run build`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console|agent tenant"`
  - `agent-browser` render checks for Providers and Projects at desktop and
    375px mobile widths, with no page-level horizontal overflow and raw row
    details hidden by default
  - `agent-browser` linked-agent click from Providers to selected Agents route
  - `pnpm run plans:audit -- --keep 78`
  - `git diff --check`

## Turn 172 | 2026-05-28

- Active plan:
  `docs/dev/plans/0077-2026-05-28-agents-configuration-ux.md`
- Goal: write the first greenfield frontend replacement plan and make clear
  that the existing frontend is unusable, frozen, and headed for retirement.
- Result:
  - opened Plan 0077 for a greenfield Agents configuration UX.
  - scoped the first replacement workflow around a separate product console
    surface, backed by existing `agent-choices` and config entity APIs.
  - explicitly prohibited extending, restyling, or refactoring existing
    frontend pages such as `/dashboard`, `/agents`, `/config`, and
    `/ops/browser` as part of this plan.
  - updated the UX guide, roadmap, Plan 0067, fixes log, and dev journal so the
    existing frontend is legacy/diagnostic only and future product UX starts
    over.
  - implemented `ux/console`, served it at `/console`, and closed Plan 0077
    after browser verification.
- Verification:
  - `pnpm run build`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console|dashboard alias|status reports local and external service discovery|configured route paths|agent tenant|configures AuraCall agents"`
  - Puppeteer/Chrome render check against
    `http://127.0.0.1:18111/console?view=agents` at `1440x1000` and `375x900`
    with no horizontal overflow and no console errors
  - `pnpm run plans:audit -- --keep 77`
  - `git diff --check`

## Turn 171 | 2026-05-28

- Active plan:
  `docs/dev/plans/0067-2026-05-16-react-operator-ux-redesign.md`
- Goal: establish a durable UX specification guide before restarting the
  AuraCall frontend and config experience.
- Result:
  - added
    `docs/dev/aura-call-ux-specification-guide.md` as the product UX standard
    for `/dashboard`, future configuration workflows, and replacements for the
    inline HTML operator pages.
  - defined task-oriented information architecture, page templates, config UX
    workflows, component patterns, visual design, motion, language,
    accessibility, performance, and diagnostics boundaries.
  - wired the guide into `ROADMAP.md` and Plan 0067 so future frontend slices
    are reviewed against this standard.
- Verification:
  - `pnpm run plans:audit -- --keep 75`
  - `git diff --check`

## Turn 170 | 2026-05-28

- Active plan:
  `docs/dev/plans/0076-2026-05-28-agent-tenant-binding-semantics.md`
- Goal: plan and execute the agent tenant/binding semantics migration for
  AuraCall-backed downstream app intelligence profiles.
- Result:
  - opened Plan 0076 to separate agent tenant identity from runtime-profile
    execution binding.
  - updated `ROADMAP.md` so the next active slice is tenant/binding/project
    binding readback in the effective agent catalog.
  - implemented compatibility-safe catalog projection: `AgentConfigSchema`
    accepts optional `tenantKey`, `bindingId`, and `projectBinding`, while
    `projectConfigModel()` derives agent `tenantKey`, `bindingKey`, default
    `bindingId`, and structured `projectBinding` from the existing
    runtime-profile/service config when needed.
  - added regression coverage for explicit tenant/binding fields and inherited
    service identity/project binding.
  - added read-only agent choices via `AgentTeamConfigService.choices()` and
    `GET /v1/config/agent-choices`, covering services, tenant identities,
    execution bindings, model selectors, provider model ids, extras, project
    bindings, effective agents, and per-agent validation.
  - promoted `/agents` into a bounded agent configuration surface with
    load/save/duplicate/archive controls backed by the existing config entity
    APIs and refreshed choices/diagnostics after mutations.
  - closed Plan 0076.
- Verification:
  - `pnpm vitest run tests/config/agentRegistryStore.test.ts tests/schema/resolver.test.ts --maxWorkers 1 --testNamePattern "agent|tenant|binding|project"`
  - `pnpm vitest run tests/config/agentConfigService.test.ts --maxWorkers 1 --testNamePattern "choices|tenants|bindings|projects|agents"`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "agent tenant|agent choices|registry-backed agents|operator dashboard"`
  - `pnpm run plans:audit -- --keep 75`
  - `pnpm run typecheck`
  - `git diff --check`

## Turn 169 | 2026-05-27

- Active plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: complete and close Plan 0063 after verifying the remaining
  provider-detail scope.
- Result:
  - verified the remaining provider-detail claims were already implemented:
    ChatGPT Library/account-file inventory, Grok account-file/media derivation,
    and Gemini conversation detail inventory.
  - confirmed installed port `18095` still preserves active count parity across
    completion metrics, active completion rows, and live-follow target rollup.
  - identified the current live `attention-needed` status as provider/account
    state, not a count/readback regression: `chatgpt/wsl-chrome-2` is in
    failure-backoff after a metadata collector timeout, while two Grok rows are
    unconfigured/missing expected identity.
  - marked Plan 0063 `CLOSED` and updated `ROADMAP.md` so future
    provider-detail breadth requires a new bounded plan.
- Verification:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts --maxWorkers 1 --testNamePattern "ChatGPT library|Grok account-file|Gemini conversation detail|media manifests"`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1 --testNamePattern "Library|listAccountFiles|account files"`
  - `curl --max-time 8 -fsS http://127.0.0.1:18095/status`

## Turn 168 | 2026-05-27

- Active plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: implement the Plan 0063 service-mode live-follow count-parity slice
  and revise the plan around the remaining provider-detail work.
- Result:
  - fixed completion status metrics so they use uncapped completion lists
    instead of the first display page.
  - normalized smoke fixture active-state filters so `idle_waiting` is active
    alongside `queued`, `running`, and `paused`.
  - added a status regression fixture with 52 completed operations plus one
    running and one idle-waiting completion, proving metrics, active rows, and
    live-follow target counts stay aligned.
  - reinstalled the user runtime/service and proved port `18095` readback:
    `metrics.active=6`, active list length `6`, `idle_waiting=5`,
    `running=1`, `liveFollow.activeCompletions=6`, target active count `6`,
    and severity `healthy`.
  - revised Plan 0063 so the count-parity slice is complete and the next
    implementation slice is one bounded provider-specific detail surface.
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "live-follow completion metrics|account mirror completion operations" --maxWorkers 1`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/mcp.apiStatus.test.ts tests/mcp.apiOpsBrowserStatus.test.ts --maxWorkers 1`
  - `pnpm run smoke:live-follow-health`
  - `pnpm run typecheck`
  - `pnpm run plans:audit -- --keep 75`
  - `pnpm run install:user-runtime-service`
  - `curl --max-time 8 -fsS http://127.0.0.1:18095/status`
  - `/home/ecochran76/.local/bin/auracall api status --port 18095 --timeout-ms 30000 --expect-live-follow-severity healthy --expect-completion-active 6 --json`
  - `/home/ecochran76/.local/bin/auracall api ops-browser-status --port 18095 --timeout-ms 30000 --expect-live-follow-severity healthy --expect-completion-active 6 --json`
  - MCP `api_status` handler readback against port `18095`

## Turn 167 | 2026-05-27

- Active plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: audit completed Plan 0063 work and revise the open plan around the
  actual remaining service-mode live-follow slice.
- Result:
  - audited repo evidence for account-mirror services, API/CLI/MCP tools,
    fixture smokes, dashboard surfaces, provider collectors, and installed
    runtime status.
  - confirmed the local managed API service was active on port `18095` and
    `/status.liveFollow.severity` reported `healthy`.
  - recorded current status evidence: ten target rows, six enabled targets,
    six active targets, three running targets, zero target attention, and
    scheduler posture `waiting` due foreground work.
  - identified the next bounded gap: live-follow target/count semantics
    disagree with completion metrics, so Plan 0063 now focuses the next slice
    on status/count parity before adding provider scraping breadth.
  - revised Plan 0063 with completed/partial/moved-out audit sections and a
    2026-05-27 next implementation slice.
  - updated `ROADMAP.md` `Now` to point at that revised Plan 0063 slice.
- Verification:
  - repo/account-mirror implementation inventory
  - `systemctl --user status auracall-api.service --no-pager --lines=20`
  - `curl --max-time 8 -fsS http://127.0.0.1:18095/status`
  - `pnpm run plans:audit -- --keep 75`
  - `git diff --check`

## Turn 166 | 2026-05-27

- Active plan:
  `docs/dev/plans/0075-2026-05-27-roadmap-governance-hygiene.md`
- Goal: execute the roadmap governance cleanup and close Plan 0075.
- Result:
  - replaced old-checkout absolute roadmap link targets with repo-relative
    targets.
  - normalized plans 0064 through 0069 to canonical `State:` headers.
  - reconciled stale plan state by closing historical Plan 0014 and moving
    parked response-shape Plan 0020 to `PLANNED`.
  - refreshed `ROADMAP.md` `Now` to resume the Plan 0063 lazy account mirror
    service-mode lane from current runtime evidence instead of stale
    browser-profile proof wording.
  - hardened `scripts/audit-plan-library.ts` so missing/legacy/invalid plan
    state headers and stale old-checkout absolute paths fail `plans:audit`.
- Verification:
  - `pnpm run plans:audit -- --keep 75`
  - `pnpm run typecheck`
  - `rg 'workspace[.]local/oracle' ROADMAP.md docs/dev/plans`
  - plan-state inventory over `docs/dev/plans/*.md`
  - ROADMAP `docs/dev/...` link-resolution check
  - `git diff --check`

## Turn 165 | 2026-05-27

- Active plan:
  `docs/dev/plans/0075-2026-05-27-roadmap-governance-hygiene.md`
- Goal: convert the roadmap audit findings into a bounded cleanup plan.
- Result:
  - opened Plan 0075 for roadmap governance hygiene.
  - scoped stale absolute link cleanup, canonical `State:` header
    normalization, active/parked plan reconciliation, `Now` section refresh,
    and deterministic plan-audit hardening.
  - wired Plan 0075 into `ROADMAP.md` as the immediate next action.
- Verification:
  - planning-only slice
  - `pnpm run plans:audit -- --keep 75`
  - `git diff --check`

## Turn 164 | 2026-05-26

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: verify the campaign-owned checksum proof and clean up stale roadmap
  wording after Plans 0073 and 0074 closed.
- Result:
  - confirmed campaign
    `acctmirror_reconciliation_87fbb97c-88ce-4294-92b2-a471df9c9279`
    remains readable from the installed service on port `18095`.
  - campaign status is `completed_with_skips` with materialization metrics:
    `jobs=2`, `terminalJobs=2`, `conversations=2`, `materialized=2`,
    `archiveItems=2`, and `checksummedAssets=2`.
  - proof targets remain distinct runtime-profile/bound-identity pairs:
    `chatgpt:wsl-chrome-4` / `ecochran76@gmail.com` and
    `chatgpt:wsl-chrome-3` / `eric.cochran@soylei.com`.
  - updated the roadmap so Plan 0071 no longer advertises an open checksum
    closeout gap, and so Plan 0073 is marked closed after the terminal
    materialization/checksum proof.
- Verification:
  - `/home/ecochran76/.local/bin/auracall api mirror-reconciliation-status acctmirror_reconciliation_87fbb97c-88ce-4294-92b2-a471df9c9279 --port 18095 --json`
  - `curl -fsS http://127.0.0.1:18095/status`

## Turn 163 | 2026-05-26

- Active plan:
  `docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md`
- Goal: close Plan 0073 after the Plan 0074 guard/no-renavigation proof cleared
  the final Gemini blocker.
- Result:
  - verified installed completion
    `acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc` on the
    restored long-lived service at port `18095`.
  - completion status hydrates materialization job
    `hmj_112116b41db94ec5b9c3bb7c867e35e9` as terminal
    `materializationOutcome`.
  - materialization attempted ten conversations, materialized seven assets,
    skipped one, failed zero, and exposed seven checksums plus six manifest
    paths.
  - metadata evidence separates observed/retained/merged counts and reports
    `assetInventory.state = deferred` because no conversation detail surface was
    scanned during the metadata pass.
  - Plan 0073 is closed.
- Verification:
  - `/home/ecochran76/.local/bin/auracall api mirror-completion-status acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc --port 18095 --json`
  - `/home/ecochran76/.local/bin/auracall api history-materialization-status hmj_112116b41db94ec5b9c3bb7c867e35e9 --port 18095 --json`
  - `sha256sum` over the seven materialized local asset paths listed in Plan
    0073
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 -t "account mirror|proof server|scheduler diagnostics|history materialization|provider guard"`

## Turn 162 | 2026-05-26

- Active plan:
  `docs/dev/plans/0074-2026-05-26-gemini-no-renavigation-guard.md`
- Goal: close Plan 0074 with the live scoped Gemini mutation proof after
  provider-guard clearance.
- Result:
  - confirmed the dedicated `auracall-gemini-pro` /
    `gemini-stealthcdp/gemini` managed browser profile was no longer on
    `google.com/sorry`; `/json/list` showed Gemini at
    `https://gemini.google.com/gem/career-guide`.
  - identity smoke passed for Gemini with expected and actual identity
    `ecochran76@gmail.com`.
  - stopped the older shared `auracall-api.service` after it reacquired the
    Gemini browser lock, then restarted an isolated scoped proof server on
    port `18173` with global live follow suppressed and zero adopted active
    completions.
  - bounded proof completion
    `acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc` completed one
    `full_sweep` pass with provider guard clear and request
    `acctmirror_2cc0a2cd-1351-4d9e-9aa3-d9667a86065b`.
  - scheduler diagnostics for that completion reported browser mutations:
    `total=47`, `target-open-or-reuse=13`, `navigate=10`, no `reload`, and
    `duplicateSameRouteAttempts.total=0`.
  - Plan 0074 is closed; the completion handed off Plan 0073 materialization
    job `hmj_112116b41db94ec5b9c3bb7c867e35e9`, which later succeeded with
    seven materialized assets from ten conversations and zero failures.
  - restored the shared `auracall-api.service`; `127.0.0.1:18095/status`
    returned `ok: true` with account-mirror proof scope disabled.
- Verification:
  - `/home/ecochran76/.local/bin/auracall --profile auracall-gemini-pro profile identity-smoke --target gemini --include-negative --json`
  - `/home/ecochran76/.local/bin/auracall --profile auracall-gemini-pro api serve --port 18173 --account-mirror-proof-provider gemini --account-mirror-proof-runtime-profile auracall-gemini-pro`
  - `/home/ecochran76/.local/bin/auracall api mirror-complete --port 18173 --provider gemini --runtime-profile auracall-gemini-pro --max-passes 1 --sweep-mode full_sweep --materialization-policy full_missing_assets --materialization-asset-kind all --json`
  - `/home/ecochran76/.local/bin/auracall api mirror-completion-status acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc --port 18173 --json`
  - `/home/ecochran76/.local/bin/auracall api scheduler-diagnostics --port 18173 --provider gemini --runtime-profile auracall-gemini-pro --completion-id acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc --json`
  - `/home/ecochran76/.local/bin/auracall api history-materialization-status hmj_112116b41db94ec5b9c3bb7c867e35e9 --port 18095 --json`
  - `curl -fsS http://127.0.0.1:18095/status`

## Turn 161 | 2026-05-26

- Active plan:
  `docs/dev/plans/0074-2026-05-26-gemini-no-renavigation-guard.md`
- Goal: implement the deterministic Plan 0074 Gemini no-renavigation and
  guard-first hardening slice.
- Result:
  - browser-service can now reuse existing same-origin or compatible-host
    targets without navigating them, and Gemini attach uses that no-navigation
    path.
  - ready read-only `/gems/view` and `/gems/edit/<projectId>` surfaces now
    skip duplicate same-route navigation; post-write Gem verification paths
    keep explicit force-navigation/fresh-read behavior.
  - account-mirror refresh runs a non-mutating Gemini target census before
    collector work and records provider guard state for `google.com/sorry`,
    account chooser/sign-in, CAPTCHA/reCAPTCHA, and other human-verification
    classes.
  - Gemini rail clicks and direct conversation fallback now have separate
    browser mutation sources; scheduler diagnostics report mutation counts by
    kind/source plus duplicate same-route navigation attempts.
- Verification:
  - `pnpm vitest run tests/browser-service/chromeTargetReuse.test.ts tests/browser/geminiAdapter.test.ts tests/accountMirror/refreshService.test.ts tests/cli/apiSchedulerDiagnosticsCommand.test.ts`
  - `pnpm run typecheck`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `/home/ecochran76/.local/bin/auracall --version`
  - `pnpm run plans:audit -- --keep 74`
  - `git diff --check`
- Remaining:
  - live scoped Gemini proof and installed runtime proof still require manual
    clearance of the current Gemini managed-profile provider guard.

## Turn 160 | 2026-05-26

- Active plan:
  `docs/dev/plans/0074-2026-05-26-gemini-no-renavigation-guard.md`
- Goal: apply the Plan 0074 review findings before implementation begins.
- Result:
  - tightened Plan 0074 so the guard-first target census must be read-only and
    non-mutating before refresh/proof/reconciliation collector work starts.
  - scoped `/gems/view` and `/gems/edit/<projectId>` same-route skips to ready
    read-only paths while preserving explicit fresh-navigation or fresh-read
    verification for mutating Gem operations.
  - expanded provider guard acceptance beyond `google.com/sorry` to cover
    account chooser/sign-in and CAPTCHA/reCAPTCHA classes.
  - mirrored the clarified implementation contract into `ROADMAP.md`, the dev
    journal, and the fixes log.
- Verification:
  - docs-only planning review amendment
  - `pnpm run plans:audit -- --keep 74`
  - `git diff --check`

## Turn 159 | 2026-05-26

- Active plan:
  `docs/dev/plans/0074-2026-05-26-gemini-no-renavigation-guard.md`
- Goal: convert the Gemini anti-bot/renavigation audit into a bounded
  policy-respecting plan before any more live Gemini automation.
- Result:
  - opened Plan 0074 as the protective P01 sub-slice for Gemini
    no-renavigation, guard-first target census, rail-first routine discovery,
    detail-inventory prioritization, and mutation proof readback.
  - wired Plan 0074 into `ROADMAP.md`, this runbook, Plan 0073, the dev
    journal, and the fixes log.
  - did not run Gemini browser automation because the latest verified state was
    still the provider hard-stop path on `google.com/sorry`.
- Verification:
  - docs-only planning slice
  - `pnpm run plans:audit -- --keep 74`
  - `git diff --check`

## Turn 158 | 2026-05-26

- Active plan:
  `docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md`
- Goal: continue Plan 0073 completion by rechecking whether the Gemini managed
  profile is clear enough for the required installed proof.
- Result:
  - rechecked `auracall-gemini-pro` / `gemini-stealthcdp/gemini` on display
    `:0.0`.
  - `browser-tools tabs` again reported all nine Gemini tabs redirected to
    `google.com/sorry` unusual-traffic interstitials.
  - no identity smoke, scoped proof server, or bounded materialization proof was
    started because this is still the provider hard-stop state.
  - this is the third consecutive Plan 0073 goal turn with the same
    manual-clear blocker, so the active goal was marked blocked rather than
    left as if automation could make further progress.
- Verification:
  - `DISPLAY=:0.0 pnpm tsx scripts/browser-tools.ts --auracall-profile auracall-gemini-pro --browser-target gemini tabs`
- Blocker:
  - An operator must manually clear the Google unusual-traffic page in the
    dedicated managed Gemini profile. After that, resume Plan 0073 by running
    identity smoke, the isolated proof server, and the bounded
    materialization/checksum proof.

## Turn 157 | 2026-05-26

- Active plan:
  `docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md`
- Goal: continue Plan 0073 completion by rerunning the remaining Gemini live
  proof only if the managed browser profile is clear.
- Result:
  - rechecked the dedicated `auracall-gemini-pro` / `gemini-stealthcdp/gemini`
    managed browser profile on display `:0.0`.
  - `browser-tools tabs` still showed all nine Gemini tabs redirected to
    `https://www.google.com/sorry/index?...`.
  - one concurrent `browser-tools doctor` probe was refused by the browser
    operation dispatcher while the tabs probe owned the exclusive probe lock;
    the completed tabs probe was sufficient to identify the hard-stop state.
  - no identity smoke, scoped proof server, or bounded proof was started because
    Gemini `google.com/sorry` is a manual-clear hard stop.
- Verification:
  - `DISPLAY=:0.0 pnpm tsx scripts/browser-tools.ts --auracall-profile auracall-gemini-pro --browser-target gemini tabs`
- Blocker:
  - Plan 0073 still needs the installed Gemini terminal proof after an operator
    manually clears the Google unusual-traffic interstitial in the dedicated
    managed browser profile.

## Turn 156 | 2026-05-26

- Active plan:
  `docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md`
- Goal: implement Plan 0073 scoped proof/evidence/readback controls and run the
  installed Gemini proof.
- Result:
  - implemented scoped account-mirror proof mode for `api serve`, including
    startup suppression for completion resume, configured live-follow
    reconciliation, scheduler execution, and background drain.
  - tightened proof mode so an isolated proof server starts with zero adopted
    persisted completions and scopes `/status.liveFollow` to the requested
    provider/runtime target while leaving the shared durable completion store
    untouched.
  - added observed/retained/merged metadata count evidence,
    detail-scanned-this-pass evidence, `assetInventory.state` readback, and
    terminal materialization outcome hydration for completion status, CLI, MCP,
    `/status`, and the operator dashboard.
  - fixed Gemini root conversation discovery to use `/app` instead of staying
    on `/gems/view` after project/Gem reads.
  - installed the patched user runtime and started an isolated Gemini proof
    server on port `18173`; `/status.accountMirrorProofScope` reported
    `globalLiveFollowSuppressed: true`, zero completions, and one scoped
    `gemini/auracall-gemini-pro` target.
  - bounded Gemini proof
    `acctmirror_completion_3f704a1b-1521-4de8-b3ab-aa3962bd7bd8` stopped before
    scraping with `account_mirror_identity_mismatch` because Gemini identity
    detection returned null.
  - `browser-tools doctor` then showed every Gemini managed-profile tab on
    `google.com/sorry`, so live Gemini automation stopped per hard-stop policy.
- Verification:
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts`
  - `pnpm run typecheck`
  - `pnpm exec biome lint src/accountMirror/completionService.ts tests/cli/apiStatusCommand.test.ts`
  - `pnpm exec biome lint src/http/responsesServer.ts src/accountMirror/completionService.ts tests/cli/apiStatusCommand.test.ts`
  - `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/completionService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/browser/geminiAdapter.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/cli/apiStatusCommand.test.ts`
  - `pnpm vitest run tests/mcp.accountMirrorStatus.test.ts tests/mcp.accountMirrorCatalog.test.ts tests/mcp.accountMirrorReconciliation.test.ts tests/mcp.accountMirrorCompletion.test.ts`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "account mirror completion|startup|proof server|read-only account mirror status"`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "scopes proof server startup"`
  - `pnpm run ux:build`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 73`
  - `git diff --check`
  - `pnpm run install:user-runtime`
- Blocker:
  - Plan 0073 remains open until the operator manually clears the Gemini
    `google.com/sorry` unusual-traffic page in the dedicated
    `gemini-stealthcdp/gemini` managed browser profile, then reruns the same
    bounded proof to terminal materialization/checksum evidence.

## Turn 155 | 2026-05-25

- Active plan:
  `docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md`
- Goal: open the full plan for the post-Gemini-smoke live-follow gap.
- Result:
  - opened Plan 0073 for scoped proof controls, observed-versus-retained
    account-mirror evidence, Gemini conversation discovery reliability, detail
    inventory semantics, terminal materialization readback, and operator
    surface wording.
  - recorded the live proof that Gemini materialization works under the
    corrected `auracall-gemini-pro` binding:
    `acctmirror_completion_aa103492-0111-4d28-8fc1-cec2b350fe29` discovered
    the target tenant, handed off
    `hmj_0d7f222208fd4e6eb97fdd1f43c2828e`, and materialized four assets from
    five conversations.
  - recorded the remaining defect precisely: the completion pass still reported
    zero artifacts/files/media because metadata inventory did not scan current
    conversation detail surfaces, while the follow-on materializer found real
    assets from cached/routeable conversation candidates.
  - wired Plan 0073 into `ROADMAP.md` and recorded the durable lesson in
    `docs/dev-fixes-log.md`.
- Verification:
  - docs-only planning slice
  - `pnpm run plans:audit -- --keep 73`
  - `git diff --check`

## Turn 154 | 2026-05-25

- Active plan:
  `docs/dev/plans/0072-2026-05-25-tenant-binding-boundary-tightening.md`
- Goal: complete the tenant/binding boundary so a tenant can move browser
  bindings without cache ownership confusion.
- Result:
  - Plan 0072 is closed.
  - account-mirror status, catalog, reconciliation, CLI, MCP, `/status`, and
    dashboard readback now expose tenant identity via `tenantKey` separately
    from browser/runtime execution binding via `bindingKey`.
  - cache/catalog reads remain keyed by provider plus bound identity; old
    runtime/browser status/backoff records remain operational binding history.
  - `config doctor` warns when duplicate enabled live-follow bindings target
    the same tenant across AuraCall runtime profiles.
  - operator move answer is now documented as: edit user-scoped binding,
    seed/login managed browser profile if needed, run identity smoke, no DB
    migration.
- Verification:
  - targeted account-mirror/config/MCP/CLI tests
  - `pnpm run typecheck`
  - targeted Biome lint on touched TS/JS test surfaces
  - `pnpm run plans:audit -- --keep 72`
  - `pnpm run check`
  - `git diff --check`

## Turn 153 | 2026-05-25

- Active plan:
  `docs/dev/plans/0072-2026-05-25-tenant-binding-boundary-tightening.md`
- Goal: plan the boundary tightening needed so tenant identity is not confused
  with AuraCall runtime/browser profile bindings.
- Result:
  - opened Plan 0072 for the invariant that tenant cache identity is provider
    plus bound identity, while AuraCall runtime profile, browser profile,
    managed browser profile, and launch evidence are execution binding and
    provenance.
  - recorded move semantics: changing a tenant's browser binding should be a
    user-scoped config edit plus managed-browser login/identity smoke, not an
    account-mirror cache or DB migration.
  - added a Plan 0071 closed-plan note clarifying that its campaign target key
    describes execution binding, not mirror cache ownership.
  - wired the follow-up boundary plan into the roadmap.
- Verification:
  - `pnpm run plans:audit -- --keep 72`
  - `git diff --check`
  - docs-only planning slice; follow-up implementation validation is listed in
    Plan 0072 acceptance criteria.

## Turn 152 | 2026-05-24

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: close Plan 0071 with live multi-target artifact/hash proof and fix the
  gaps exposed by the Gemini/ChatGPT campaign run.
- Result:
  - bounded operator reconciliation now bypasses routine minimum-interval waits
    while preserving identity, provider-guard, hard-stop, failure-backoff, and
    browser-lock boundaries.
  - bounded reconciliation children clear stale persisted `nextAttemptAt` on
    resume and re-evaluate provider state immediately.
  - campaign status remains active while selected materialization jobs are
    active, and materialized asset evidence is enriched from archive items so
    checksum rows carry provider conversation ids.
  - Gemini static `/app/download` rows are filtered from rail/catalog
    materialization selection; a real Gemini conversation was selected next,
    but the current managed profile landed on a Google account chooser, so
    Gemini retries stopped per browser-work policy.
  - installed campaign
    `acctmirror_reconciliation_87fbb97c-88ce-4294-92b2-a471df9c9279`
    reported `jobs=2`, `terminalJobs=2`, `conversations=2`,
    `materialized=2`, `archiveItems=2`, and `checksummedAssets=2`.
  - live checksum proof:
    `chatgpt:wsl-chrome-4` conversation
    `68e6442e-e7d4-832e-b4f6-6db6cd5a7c3f` produced checksum
    `329d9d0fef7a3215b8ff78eac8360584cf2d042ad45f1ca0d360186baac8184b`;
    `chatgpt:wsl-chrome-3` conversation
    `6a0fa901-77d0-83ea-80e0-fbaaa4eca529` produced checksum
    `7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767`.
  - `chatgpt:wsl-chrome-2` failed independently with a metadata collector
    timeout; the campaign closed `completed_with_skips` while retaining the
    successful materialized assets.
- Verification:
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts --maxWorkers 1 --testNamePattern "job timeout|exceeds the job timeout|missing assets over refresh-only|static app routes"`
  - `pnpm vitest run tests/accountMirror/politePolicy.test.ts --maxWorkers 1 --testNamePattern "operator reconciliation|ChatGPT failure backoff|explicit-refresh"`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts --maxWorkers 1 --testNamePattern "stale persisted minimum interval|rechecks persisted cooldowns|bounded completion"`
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts --maxWorkers 1 --testNamePattern "active materialization|hydrates active|dry-run classifies"`
  - `pnpm run typecheck`
  - `pnpm run build`
  - `pnpm tsx scripts/install-user-runtime.ts --skip-build`
  - `pnpm tsx scripts/install-user-api-service.ts`
  - authenticated installed reconciliation/materialization readbacks against
    `127.0.0.1:18095`.

## Turn 151 | 2026-05-24

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: add campaign claim/upgrade semantics plus materialization evidence
  hydration, then verify the installed runtime honestly.
- Result:
  - active completions that do not match campaign policy are now upgraded in
    place to bounded full-sweep materialization; live-follow startup will not
    create a duplicate while that bounded child is active.
  - campaign readback now hydrates history-materialization job results into
    aggregate materialization counts, per-target asset checksum evidence, and
    terminal routeability metrics.
  - CLI summaries and the React Health campaign detail view now show
    materialized/checksum counts.
  - installed Gemini/default proof completed a claimed full-sweep child and
    queued `hmj_09f57e2164b04a5da2fdd5bb5b7d43cf`; the job ended `skipped`
    with terminal evidence for bogus conversation id `download`, so Plan 0071
    remains open for successful multi-tenant asset checksums.
  - after restart, replacement-child reattach no longer retains stale
    materialization rows from the older child.
- Verification:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/liveFollowReconciler.test.ts tests/accountMirror/reconciliationCampaignService.test.ts tests/http.accountMirrorReconciliation.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorReconciliation.test.ts`
  - `pnpm run typecheck`
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts tests/cli/apiMirrorCompletionCommand.test.ts`
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`
  - `pnpm tsx scripts/install-user-runtime.ts --skip-build`
  - `pnpm tsx scripts/install-user-api-service.ts`
  - authenticated installed `/status`, completion, materialization, and
    reconciliation readbacks against `127.0.0.1:18095`.

## Turn 150 | 2026-05-24

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: validate the final campaign surface against the installed runtime and
  record the remaining Plan 0071 gap honestly.
- Result:
  - added regression coverage for campaign readback reattaching a replacement
    active completion when an older attached child fails.
  - reinstalled the user-scoped runtime and `auracall-api.service` from the
    current build.
  - installed dry-run campaign
    `acctmirror_reconciliation_144abd13-3842-47c2-b33f-16f8b1ee5bfa`
    enumerated 10 configured targets without browser work: six already active
    and four unconfigured.
  - installed execution campaign
    `acctmirror_reconciliation_d10f53c4-7683-45c0-89ea-57983b150deb`
    selected five already-active targets and attached existing child
    completions instead of duplicating target work.
  - Plan 0071 remains open because the current tenant state had every enabled
    target already occupied by live-follow completions; the campaign still
    needs a policy-upgrade/claim path or an eligible target to prove
    campaign-owned full-sweep materialization and aggregate artifact/hash
    reporting.
- Verification:
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts`
  - `pnpm run typecheck`
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts tests/http.accountMirrorReconciliation.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorReconciliation.test.ts`
  - `pnpm run ux:build`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`
  - `pnpm tsx scripts/install-user-runtime.ts --skip-build`
  - `pnpm tsx scripts/install-user-api-service.ts`
  - authenticated installed `/status` route smoke on `127.0.0.1:18095`
    reported reconciliation routes and healthy live-follow state.
  - installed CLI dry-run, execution, and status readback smokes against
    `127.0.0.1:18095`.

## Turn 149 | 2026-05-24

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: turn conservative one-pass execution into resumable campaign
  advancement and expose it in the operator console.
- Result:
  - campaign targets deferred by provider, browser-profile, or active-target
    budgets now retain `deferred` execution state instead of being discarded as
    skipped work.
  - `run_next_pass` / `run-next-pass` control starts the next eligible deferred
    target when child completion capacity has freed; startup and campaign
    read/list hydration also advance active campaigns without duplicating
    existing child completions.
  - HTTP, CLI, and MCP accept the advancement control, and the React Health
    dashboard now includes reconciliation campaign launcher/list/detail rows
    with child completion/materialization links and pause/resume/cancel/next
    controls.
- Verification:
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts tests/http.accountMirrorReconciliation.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorReconciliation.test.ts`
  - `pnpm run typecheck`

## Turn 148 | 2026-05-24

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: extend the reconciliation campaign surface from dry-run planning into
  bounded child-operation execution and restart readback.
- Result:
  - `dryRun: false` / `auracall api mirror-reconcile-all --no-dry-run` now
    starts selected eligible targets as one-pass full-sweep account-mirror
    completion children.
  - campaign execution attaches already-active completions for matching
    provider/runtime-profile targets instead of duplicating them.
  - campaign target rows now carry execution state, child completion id,
    materialization handoff id/status, pass count, remaining detail surfaces,
    and next eligible wake fields.
  - campaign status readback hydrates child completion state from the shared
    completion service after service restart; cancel/pause/resume controls are
    propagated to attached child completions.
  - execution selection enforces conservative one-active-target-per-provider
    and one-active-target-per-browser-profile budgets in the current pass.
- Verification:
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts tests/http.accountMirrorReconciliation.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorReconciliation.test.ts`
  - `pnpm run typecheck`

## Turn 147 | 2026-05-24

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: implement the first Plan 0071 slice for multi-tenant reconciliation
  campaign planning without provider browser work.
- Result:
  - added a durable account-mirror reconciliation campaign store under the
    account-mirror cache state.
  - added the shared dry-run campaign service that reads configured
    account-mirror status plus active completions, classifies targets, applies
    target selection budgets, and records full-sweep materialization policy.
  - exposed dry-run campaign create/list/status/control through HTTP, CLI, and
    MCP:
    `POST /v1/account-mirrors/reconciliations`,
    `auracall api mirror-reconcile-all --dry-run`, and
    `account_mirror_reconciliation_create`.
  - preserved the Plan 0071 boundary: dry-run reconciliation reads
    config/status/cache/completion state only and does not start child
    completions or acquire provider browser locks.
- Verification:
  - `pnpm vitest run tests/accountMirror/reconciliationCampaignService.test.ts tests/http.accountMirrorReconciliation.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorReconciliation.test.ts`
  - `pnpm run typecheck`

## Turn 146 | 2026-05-24

- Active plan:
  `docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md`
- Goal: define the next bounded plan for full multi-tenant reconciliation after
  the single-target materialization/reconciliation mechanics closed in Plans
  0069 and 0070.
- Result:
  - opened Plan 0071 for a durable reconciliation campaign layer across all
    configured account-bearing provider/runtime-profile targets.
  - scoped the campaign around cache/status/config-only target discovery,
    target eligibility classification, provider/browser-profile concurrency
    budgets, child completion/materialization attachment, restart recovery, and
    aggregate API/CLI/MCP/operator-UI status.
  - preserved the existing boundary that cache/catalog/search reads stay
    cache-only; browser work starts only from explicit campaign execution,
    live-follow completion jobs, or one-target reconciliation/materialization
    jobs.
- Verification:
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`

## Turn 145 | 2026-05-24

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: prove the remaining Gemini terminal route-miss budget behavior and
  close Plan 0070.
- Result:
  - selected `conversationIds` reconciliation now honors operator request order
    before catalog order, while still using cached catalog metadata when the
    selected id is present.
  - terminal Gemini route misses still do not consume `maxItems`, so a bounded
    selected batch can record deleted/unavailable evidence and continue to the
    next routeable selected conversation.
  - live proof job `hmj_77fc426644154a2f936926f3bc6d34c8` used
    `auracall-gemini-pro`, `boundIdentityKey=ecochran76@gmail.com`,
    `conversationIds=7f0070deadbeef42,10b7e2a15e2dd77c`, `maxItems=1`,
    `refreshSnapshot=true`, and `assetKinds=media`.
  - the proof recorded `7f0070deadbeef42` as
    `not_found_or_unavailable` after Gemini landed on bare `/app`, wrote
    cache-only `terminal_unavailable` freshness for that conversation id, and
    still materialized `gemini-artifact:10b7e2a15e2dd77c:1:0` with checksum
    `5df1e3626b11b5016e38710e711152e663e10333c591eb4b4db383b3540704c0`.
  - Plan 0070 is closed.
- Verification:
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts --maxWorkers 1 --testNamePattern "selected conversation id order|selected conversation id batches|terminal Gemini route misses"`
  - `pnpm exec biome lint src/runtime/historyMaterializationService.ts tests/runtime.historyMaterializationService.test.ts`
  - live `history-materialization-create` and `history-materialization-status`
    against isolated server `127.0.0.1:18083`
  - cache readback:
    `/v1/account-mirrors/catalog/items/7f0070deadbeef42?provider=gemini&runtimeProfile=auracall-gemini-pro&kind=conversations`
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/cli/apiHistoryMaterializationCommand.test.ts tests/mcp.historyMaterialization.test.ts tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "history materialization|account mirror materializations|materialization"`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/catalogService.test.ts tests/accountMirror/conversationFreshness.test.ts tests/runtime.searchProjectionService.test.ts --maxWorkers 1 --testNamePattern "full-sweep|steady-follow|materialization cursor|recent_missing_assets|conversation freshness|projects per-conversation asset counts|materialization completeness|remote-only assets|reads cached mirror manifests"`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`

## Turn 144 | 2026-05-24

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: remove the remaining direct-conversation target from Gemini rail
  enumeration.
- Result:
  - Gemini `listConversations()` now uses the shared rail-target resolver, so a
    configured `/app/<conversationId>` URL is normalized to `/app` for rail
    browsing.
  - direct Gemini conversation routes remain available for explicit
    routeability validation and fallback when a rail row cannot be opened.
  - Plan 0070 remains open: persisted `auracall-gemini-pro` full-sweep
    materialization evidence is present, but the current job index does not yet
    contain a same-profile full-sweep terminal Gemini route-miss proof.
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts --maxWorkers 1`
  - `pnpm exec biome lint src/browser/providers/geminiAdapter.ts tests/browser/geminiAdapter.test.ts README.md RUNBOOK.md docs/dev/dev-journal.md docs/dev-fixes-log.md docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`
  - `pnpm run check`

## Turn 143 | 2026-05-24

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: make Plan 0070 steady-follow reconciliation use freshness evidence
  instead of rank-only or asset-count-only candidate selection.
- Result:
  - automatic `reconcile=true` history-materialization jobs now skip
    fresh/complete conversation rows unless forced, so bounded target budgets
    are not spent repeatedly on already materialized assets.
  - `refreshSnapshot` reconciliation can select stale, partial, or
    missing-assets conversation rows even when stale cached asset counts are
    zero; this covers provider cases where changed detail/manifest evidence is
    stronger than rail-rank movement.
  - terminal/unavailable or guarded row evidence is skipped by automatic bulk
    reconciliation unless the operator explicitly forces the job.
- Verification:
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts --maxWorkers 1 --testNamePattern "freshness evidence|manifest asset evidence|terminal Gemini route misses"`
  - `pnpm exec biome lint src/runtime/historyMaterializationService.ts tests/runtime.historyMaterializationService.test.ts`

## Turn 142 | 2026-05-24

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: tighten Gemini no-refresh rail semantics so asset helpers do not bypass
  the shared rail-first context reader.
- Result:
  - lower-level Gemini conversation-file download and artifact materialization
    helpers now call `readGeminiConversationContextWithClient(...)` directly,
    preserving the rail-row click path before any direct route fallback.
  - this removes the remaining eager direct `/app/<conversationId>` navigation
    from those asset helpers while preserving explicit route validation and
    fallback behavior for conversations that are not discoverable in the rail.
  - controlled operator mutation appended image-generation prompt marker
    `AC-PLAN0070-STEADY-1779587303869` to existing Gemini conversation
    `1ab8bb794846c491`.
  - bounded steady-follow completion
    `acctmirror_completion_d8e9306a-2a71-46df-ae47-d09e84b29e13` completed
    and queued materialization job `hmj_d8ead771d10e4a08a462c928ab13e29f`.
  - the materialization job succeeded and materialized the new existing-thread
    artifact `gemini-artifact:1ab8bb794846c491:2:0` with checksum
    `b54ac02a55be8790328ec1d17f89bb5bd2b83470f81447a36a6faec4f60a8501`;
    `/v1/archive` and `/v1/search` both expose an asset route for it.
  - the same proof did not close the "modified conversations move to the top"
    assumption for Gemini: refreshed catalog evidence still showed
    `1ab8bb794846c491` at `indexRank=14`, so Plan 0070 remains open.
  - the proof exposed a freshness projection bug where row-level
    `assetCompleteness: complete` was ignored when provider manifests looked
    remote-only; freshness derivation now honors that materialization evidence.
  - post-patch current-checkout catalog readback for `1ab8bb794846c491`
    reports `state=fresh`, `assetCompleteness=complete`, and
    `assetCounts={known:1, local:1, missingLocal:0}`.
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/accountMirror/conversationFreshness.test.ts tests/accountMirror/catalogService.test.ts --maxWorkers 1 --testNamePattern "materialization completeness|remote-only assets|projects per-conversation asset counts"`
  - `pnpm exec biome lint src/browser/providers/geminiAdapter.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec biome lint src/accountMirror/conversationFreshness.ts tests/accountMirror/conversationFreshness.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`
  - `pnpm tsx -e ...` first failed before provider work because top-level
    await is not supported in the CJS one-off runner.
  - `pnpm tsx -e ...` second failed before provider work because the one-off
    runner hit a CJS `tokentally` package export issue.
  - `pnpm tsx --input-type=module -e ...` submitted the controlled Gemini
    prompt to `1ab8bb794846c491`.
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-complete --port 18083 --provider gemini --runtime-profile auracall-gemini-pro --max-passes 1 --sweep-mode steady_follow --materialization-policy recent_missing_assets --materialization-asset-kind all --materialization-max-items 4 --materialization-refresh-snapshot --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-completion-status acctmirror_completion_d8e9306a-2a71-46df-ae47-d09e84b29e13 --port 18083 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api history-materialization-status hmj_d8ead771d10e4a08a462c928ab13e29f --port 18083 --json`
  - `curl -sS --max-time 20 'http://127.0.0.1:18083/v1/account-mirrors/catalog/items/1ab8bb794846c491?provider=gemini&runtimeProfile=auracall-gemini-pro&kind=conversations'`
  - `curl -sS --max-time 60 'http://127.0.0.1:18083/v1/account-mirrors/catalog/items/1ab8bb794846c491?provider=gemini&runtimeProfile=auracall-gemini-pro&kind=conversations' | jq '.item.conversationFreshness'`
  - `curl -sS --max-time 20 'http://127.0.0.1:18083/v1/search?q=Generated%20image%201&provider=gemini&limit=20'`
  - `curl -sS --max-time 20 'http://127.0.0.1:18083/v1/archive?provider=gemini&limit=20'`

## Turn 141 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: extend Gemini no-refresh rail semantics from list reads into
  conversation context and artifact materialization reads.
- Result:
  - Gemini rail-backed context, conversation-file downloads, and artifact
    materialization now connect through the app/rail surface instead of using a
    direct `/app/<conversationId>` URL as the initial browser target.
  - when the requested conversation is not already active, the adapter opens
    the left-rail row in-page and waits for the matching `/app/<id>` route;
    direct route navigation remains only a fallback when the rail row cannot be
    found/opened or for explicit route validation.
  - live proof server materialized two Gemini image conversations through
    `refreshSnapshot` jobs:
    `hmj_e98eeb402d764ec9b4ed90ce5bc5d06b` for already-loaded
    `10b7e2a15e2dd77c`, and `hmj_1959cca2de1c40c8b55b2776fb23f906` for
    non-active rail conversation `1ab8bb794846c491`.
  - scheduler diagnostics after both jobs reported browser mutation sources
    limited to `provider:gemini:connect-tab`, with `reloads=0` and
    `navigations=0`.
  - Plan 0070 remains open; the modified-existing-conversation live
    steady-follow proof is still the decisive acceptance gap.
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts --maxWorkers 1`
  - `pnpm exec biome lint src/browser/providers/geminiAdapter.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api history-materialization-create --port 18083 --provider gemini --runtime-profile auracall-gemini-pro --conversation-id 10b7e2a15e2dd77c --provider-conversation-url https://gemini.google.com/app/10b7e2a15e2dd77c --asset-kind media --max-items 1 --refresh-snapshot --force --timeout-ms 20000 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api history-materialization-status hmj_e98eeb402d764ec9b4ed90ce5bc5d06b --port 18083 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api history-materialization-create --port 18083 --provider gemini --runtime-profile auracall-gemini-pro --conversation-id 1ab8bb794846c491 --provider-conversation-url https://gemini.google.com/app/1ab8bb794846c491 --asset-kind media --max-items 1 --refresh-snapshot --force --timeout-ms 20000 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api history-materialization-status hmj_1959cca2de1c40c8b55b2776fb23f906 --port 18083 --json`
  - `curl -sS --max-time 20 'http://127.0.0.1:18083/v1/account-mirrors/scheduler/diagnostics?provider=gemini&runtimeProfile=auracall-gemini-pro'`

## Turn 140 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: make steady-follow artifact handoff use manifest evidence, not only
  cached row count fields.
- Result:
  - account-mirror catalog/search conversation rows now project
    `cachedArtifactCount`, `cachedFileCount`, and `cachedMediaCount` from
    artifact/file/media manifests bound to the provider conversation id.
  - history reconciliation target selection now uses those manifest bindings
    when deciding which cached conversations are materializable, so a refreshed
    Gemini manifest can enqueue asset recovery even if the older cached
    transcript row has zero/stale count fields.
  - this is backend proof only; the live modified-existing-conversation dogfood
    remains the strongest open Plan 0070 acceptance proof.
- Verification:
  - `pnpm vitest run tests/accountMirror/catalogService.test.ts tests/runtime.historyMaterializationService.test.ts --maxWorkers 1 --testNamePattern "projects per-conversation asset counts|selects reconciliation targets from manifest asset evidence|runs bounded reconciliation from materializable account mirror conversation rows|runs selected conversation id batches"`
  - `pnpm vitest run tests/accountMirror/catalogService.test.ts tests/runtime.historyMaterializationService.test.ts --maxWorkers 1 --testTimeout 20000`
  - `pnpm exec biome lint src/accountMirror/catalogService.ts src/runtime/historyMaterializationService.ts tests/accountMirror/catalogService.test.ts tests/runtime.historyMaterializationService.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`

## Turn 139 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: prove Gemini rail/history reads no longer refresh the browser and make
  the proof loop practical.
- Result:
  - Gemini explicit account-mirror refreshes now wait 2 minutes plus at most 1
    minute jitter; refresh failures back off from 2 minutes to a 10 minute cap.
    Routine cadence and provider hard-stop/manual-clear behavior remain
    unchanged.
  - BrowserService target matching now treats `https://gemini.google.com/app/<id>`
    as compatible with configured root `/app`, so diagnostics and provider
    reuse agree on the active Gemini conversation tab.
  - Scheduler diagnostics now includes a read-only in-process browser mutation
    audit for the selected provider/runtime profile; it does not attach to CDP.
  - Gemini conversation-surface reuse now skips same-route `Page.navigate(...)`
    for root `/app`, `/app/<id>`, and exact Gem/project conversation surfaces.
  - Live proof `acctmirror_completion_04ce6c2d-f9ba-4e40-b83b-8d341714ef81`
    completed one bounded `gemini/auracall-gemini-pro` steady-follow pass with
    no provider guard, metadata counts `projects=12`, `conversations=68`, and
    mirror completeness still `in_progress` with 76 remaining detail surfaces.
  - Clean scheduler diagnostics for that run reported `browserMutations.total =
    32`, sources limited to `provider:gemini:connect-tab`,
    `provider:gemini:navigate-gems-view-page`, and
    `provider:gemini:navigate-edit-page`, with zero
    `provider:gemini:navigate-conversation-surface` records and zero reloads.
    The remaining slow browser movement is Gem edit/project detail probing, not
    rail conversation browsing.
  - stopped the repo-local proof server; only installed `127.0.0.1:18095`
    remained listening.
- Verification:
  - `pnpm vitest run tests/accountMirror/politePolicy.test.ts tests/accountMirror/cachePersistence.test.ts tests/browser/browserService.test.ts tests/browser/geminiAdapter.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/apiSchedulerDiagnosticsCommand.test.ts tests/mcp.accountMirrorSchedulerDiagnostics.test.ts --maxWorkers 1 --testNamePattern "scheduler diagnostics"`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome lint src/accountMirror/politePolicy.ts tests/accountMirror/politePolicy.test.ts tests/accountMirror/cachePersistence.test.ts src/browser/service/browserService.ts tests/browser/browserService.test.ts src/browser/providers/geminiAdapter.ts tests/browser/geminiAdapter.test.ts src/http/responsesServer.ts src/cli/apiSchedulerDiagnosticsCommand.ts tests/cli/apiSchedulerDiagnosticsCommand.test.ts`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-complete --port 18083 --provider gemini --runtime-profile auracall-gemini-pro --max-passes 1 --sweep-mode steady_follow --materialization-policy recent_missing_assets --materialization-asset-kind all --materialization-max-items 2 --json`
  - `curl -s 'http://127.0.0.1:18083/v1/account-mirrors/scheduler/diagnostics?provider=gemini&runtimeProfile=auracall-gemini-pro&completionId=acctmirror_completion_04ce6c2d-f9ba-4e40-b83b-8d341714ef81'`
  - `ss -ltnp | rg ':(18083|18095)\b'`

## Turn 138 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: remove unnecessary Gemini browser navigation from root rail
  conversation browsing.
- Result:
  - Gemini target selection now treats an existing `https://gemini.google.com/app/<conversationId>`
    tab as compatible with root `https://gemini.google.com/app` rail reads.
  - `navigateToGeminiConversationSurface()` now has an in-place fast path: when
    the current tab is already on a reusable Gemini `/app` conversation surface,
    it returns without calling `Page.navigate(...)`.
  - Gemini `listConversations()` opens the main rail in place before history
    hydration/scraping, so scrolling through rail conversations does not depend
    on a browser refresh.
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 137 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: make the Gemini proof retry loop practical without weakening provider
  guard hard stops.
- Result:
  - Gemini account-mirror politeness keeps the 18 hour routine cadence and 24
    hour hard-stop cooldown, but explicit refreshes now use a 10 minute
    minimum interval with at most 5 minutes of jitter.
  - Gemini refresh failure backoff now escalates through 5, 10, 20, and 30
    minute delays instead of starting at 2 hours and capping at 24 hours.
  - persisted failure-backoff hydration for the steady-follow timeout now
    resolves to `2026-05-23T22:30:49.738Z`, so the blocked proof window has
    elapsed and the next bounded live retry can run when the operator resumes.
  - the bounded live retry
    `acctmirror_completion_e779a4e1-e6d7-4912-b4bb-445e30a7c028` completed one
    `gemini/auracall-gemini-pro` steady-follow pass with no provider guard,
    detected identity `ecochran76@gmail.com`, metadata counts `projects=12`,
    `conversations=68`, and mirror completeness `in_progress` with 76 detail
    surfaces remaining.
  - the completion queued history-materialization job
    `hmj_873fd5d4ad154e94ae9517923d7de0dc`, which succeeded and materialized
    two Gemini image artifacts from conversations `10b7e2a15e2dd77c` and
    `1ab8bb794846c491`.
  - the materialized artifact SHA-256s were
    `5df1e3626b11b5016e38710e711152e663e10333c591eb4b4db383b3540704c0` and
    `80fcaeb067bcafd5d083a05a30beba58350e30869a6557fcbf84106e8037836b`.
  - stopped the repo-local proof server; only installed `127.0.0.1:18095`
    remained listening.
- Verification:
  - `pnpm vitest run tests/accountMirror/politePolicy.test.ts tests/accountMirror/cachePersistence.test.ts --maxWorkers 1 --testNamePattern "failure-backoff|polite policy|slower Gemini defaults|politeness backoff"`
  - `pnpm vitest run tests/accountMirror/politePolicy.test.ts tests/accountMirror/cachePersistence.test.ts tests/accountMirror/statusRegistry.test.ts --maxWorkers 1 --testNamePattern "failure-backoff|polite policy|slower Gemini defaults|politeness backoff|configured live-follow|identity-gated|provider guard cooldown"`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-complete --port 18083 --provider gemini --runtime-profile auracall-gemini-pro --max-passes 1 --sweep-mode steady_follow --materialization-policy recent_missing_assets --materialization-asset-kind all --materialization-max-items 2 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-completion-status acctmirror_completion_e779a4e1-e6d7-4912-b4bb-445e30a7c028 --port 18083 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api history-materialization-status hmj_873fd5d4ad154e94ae9517923d7de0dc --port 18083 --json`
  - `ss -ltnp | rg ':(18083|18095)\b'`

## Turn 136 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: close the politeness persistence gap found after the Gemini
  steady-follow timeout proof.
- Result:
  - account-mirror refresh failures now write durable target status state under
    the account-mirror cache with an atomic sidecar write, separate from the
    last successful mirror snapshot.
  - status hydration merges recent target failure state with successful snapshot
    metadata and restores `failure-backoff` after API/proof-server restart.
  - newer successful snapshots supersede older persisted failure state so
    recovered targets do not remain delayed.
  - refresh success writes cleared target state with `consecutiveFailureCount =
    0`, while refresh failure writes `lastFailureAtMs`,
    `lastCompletedAtMs`, dispatcher evidence, and incremented
    `consecutiveFailureCount`.
- Verification target:
  - `pnpm vitest run tests/accountMirror/cachePersistence.test.ts tests/accountMirror/refreshService.test.ts --maxWorkers 1 --testNamePattern "failure state|politeness backoff|metadata collector|stores canonical|provider guard"`
  - superseded by Turn 137: Gemini proof backoff was tuned down to make the
    next steady-follow retry practical.

## Turn 135 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: dogfood the Gemini steady-follow path after the full-sweep artifact
  proof and keep the follow-up inside provider cooldown rules.
- Result:
  - started an isolated API proof server on `127.0.0.1:18083` from the
    worktree with background drain, account-mirror scheduler cadence, startup
    completion resume, and configured live-follow reconciliation disabled.
  - ran one bounded `gemini/auracall-gemini-pro` steady-follow completion:
    `acctmirror_completion_c27fd23b-08a8-4c79-889d-1542f9398a3c`.
  - the completion waited through explicit-refresh cooldown, then failed before
    refresh handoff with `Account mirror metadata collector timed out for
    gemini/auracall-gemini-pro`.
  - bounded `browser-tools doctor` inspection found the managed Gemini app at
    `https://gemini.google.com/app`, ready and visible, with no blocking state.
  - Gemini steady-follow completions now pass a 300s collector timeout; Gemini
    full sweeps keep 900s and non-Gemini steady follow keeps the ordinary
    refresh request shape.
  - stopped the proof server; only installed `127.0.0.1:18095` remained
    listening.
- Verification target:
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-complete --port 18083 --provider gemini --runtime-profile auracall-gemini-pro --max-passes 1 --sweep-mode steady_follow --materialization-policy recent_missing_assets --materialization-asset-kind all --materialization-max-items 2 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-completion-status acctmirror_completion_c27fd23b-08a8-4c79-889d-1542f9398a3c --port 18083 --json`
  - `pnpm tsx scripts/browser-tools.ts doctor --port 45011 --url-contains gemini --json`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts --maxWorkers 1 --testNamePattern "Gemini|steady-follow|full-sweep"`
  - next live proof waits for the failure-backoff gate rather than bypassing
    provider politeness.

## Turn 134 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: prove the Plan 0070 Gemini full-sweep backfill path after the
  failure-backoff gate opened.
- Result:
  - started a repo-local API proof server on `127.0.0.1:18083` from the
    worktree with background drain, account-mirror scheduler cadence, startup
    completion resume, and configured live-follow reconciliation disabled.
  - ran exactly one bounded `gemini/auracall-gemini-pro` full-sweep completion:
    `acctmirror_completion_d6ee42c8-898f-424b-9a31-7387603db294`.
  - the refresh completed successfully with no provider guard, detected
    identity `ecochran76@gmail.com`, persisted
    `materializationCursor.jobId = hmj_96c6d998be8948be8c8910076a374890`, and
    left mirror completeness `in_progress` with 76 detail surfaces remaining.
  - the history-materialization job succeeded and materialized two Gemini image
    artifacts from two conversations:
    `10b7e2a15e2dd77c` and `1ab8bb794846c491`.
  - archive/cache readback proved bound identity, provider conversation id,
    `fileAvailable=true`, and SHA-256 checksums
    `bbe2354aaceff8181f4964064b33dabfa4b91a01a18d111361ae6fb112d6387c`
    and
    `238987c388e126345879f09cba98eb6271d3a9d25570ddb9ff0c340f20e44537`.
- Verification target:
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-complete --port 18083 --provider gemini --runtime-profile auracall-gemini-pro --max-passes 1 --sweep-mode full_sweep --materialization-policy full_missing_assets --materialization-asset-kind all --materialization-max-items 2 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api mirror-completion-status acctmirror_completion_d6ee42c8-898f-424b-9a31-7387603db294 --port 18083 --json`
  - `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api history-materialization-status hmj_96c6d998be8948be8c8910076a374890 --port 18083 --json`
  - `sha256sum` on the two materialized PNG files
  - archive readback through `GET /v1/archive?provider=gemini&limit=10`
  - stopped the proof server; only installed `127.0.0.1:18095` remained
    listening.

## Turn 133 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: keep Plan 0070 operator reconciliation evidence aligned with cached
  row state before the next Gemini full-sweep retry.
- Result:
  - `refreshSnapshot` reconciliation now records refreshed detail/manifest
    timestamps, routeability state, and observed counts on the cached
    account-mirror conversation row.
  - materialization success now records manifest/materialized evidence on the
    same row, and terminal routeability failures such as Gemini bare `/app`
    write terminal per-row evidence before skipping that target's asset phase.
  - direct provider conversation id reconciliation can upsert a minimal
    conversation row under the bound identity when provider routeability/detail
    evidence exists but the row was not already in the mirror list.
  - provider human-verification hard stops during history materialization now
    fail as `provider_guard_required` with HTTP 409 semantics instead of a
    generic internal error.
  - the live Gemini full-sweep proof remains gated by the failure-backoff wake
    at `2026-05-23T19:13:20Z`.
- Verification target:
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts tests/mcp.historyMaterialization.test.ts --maxWorkers 1 --testNamePattern "provider human-verification|history materialization"`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/liveFollowReconciler.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/cachePersistence.test.ts tests/accountMirror/catalogService.test.ts tests/accountMirror/conversationFreshness.test.ts tests/schema/resolver.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorCompletion.test.ts tests/http.responsesServer.test.ts tests/browser/geminiAdapter.test.ts tests/runtime.historyArchiveItems.test.ts tests/runtime.historyMaterializationService.test.ts tests/mcp.historyMaterialization.test.ts --maxWorkers 1 --testNamePattern "sweep|steady-follow|full-sweep|attachment cursor|persisted attachment cursor|conversation order|starts nonblocking|project conversations|project histories|prior full-sweep cursor|metadata state|route failures|walks bounded project histories|live-follow|live follow|account mirror completion|completions|preserve live-follow|derives identity|read-only account mirror dashboard page|cached mirror manifests|canonical mirror data|conversation freshness|Gemini browser adapter|hydrates conversation history|Gemini full-sweep|history materialization archive items|updates cached conversation rows|upserts direct provider conversation evidence|refreshes a provider conversation snapshot|terminal snapshot refresh evidence|selected conversation id batches|Gemini route misses|provider human-verification|history materialization"`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`

## Turn 132 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: make Gemini full-sweep project-history discovery progressively bounded
  instead of relying only on a wider timeout.
- Result:
  - project/Gem history reads now accept a cursor and `maxProjectReads` cap.
  - account-mirror collection persists `metadataEvidence.projectConversations`
    and resumes that cursor only for `full_sweep`; steady follow ignores prior
    project-history cursors so it starts at the current top again.
  - this keeps a Gemini pass from spending every project/Gem history read in
    one collector run while still progressing through later projects across
    full-sweep passes.
- Verification target:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/statusRegistry.test.ts --maxWorkers 1 --testNamePattern "project conversations|project histories|prior full-sweep cursor|uses prior attachment cursor|metadata evidence"`
  - `pnpm exec biome lint src/accountMirror/chatgptMetadataCollector.ts src/accountMirror/statusRegistry.ts tests/accountMirror/chatgptMetadataCollector.test.ts`
  - `pnpm run check`

## Turn 131 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: remove the next live Gemini full-sweep proof blocker after project/Gem
  history hydration.
- Result:
  - bounded Gemini full-sweep proof
    `acctmirror_completion_3e96e801-29e3-4360-8028-f2b8961c196e` ran after the
    explicit-refresh cooldown and failed with
    `Account mirror metadata collector timed out for gemini/auracall-gemini-pro`
    before writing a refresh pass or materialization cursor.
  - `browser-tools tabs|doctor` on DevTools port `45011` showed the managed
    Gemini page at `https://gemini.google.com/app`, ready and visible, with no
    `google.com/sorry`, CAPTCHA, or reCAPTCHA blocking state.
  - Gemini full-sweep completions now use a 900s collector timeout; non-Gemini
    full sweeps keep the 300s envelope.
- Verification target:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts --maxWorkers 1 --testNamePattern "full-sweep|Gemini full-sweep|steady-follow"`
  - `pnpm exec biome lint src/accountMirror/completionService.ts tests/accountMirror/completionService.test.ts`
  - live retry after `auracall-gemini-pro` failure-backoff eligibility at
    `2026-05-23T19:13:05.623Z`

## Turn 130 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: make Gemini project/Gem conversation reads hydrate bounded history
  before the live full-sweep proof.
- Result:
  - Gemini `listConversations(projectId, { includeHistory: true })` now runs
    bounded history hydration, not just global `/app` history reads.
  - the hydrator falls back to the document body when the global
    `all-conversations` container is absent, which lets project/Gem pages scroll
    and expose more `/app/<conversationId>` links.
  - the live Gemini full-sweep proof is still gated by the explicit-refresh
    cooldown recorded in Turn 126.
- Verification target:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts --maxWorkers 1`
  - `pnpm exec biome lint src/browser/providers/geminiAdapter.ts tests/browser/geminiAdapter.test.ts`

## Turn 129 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: persist row-level index freshness evidence for cached account-mirror
  conversations before the next live Gemini proof.
- Result:
  - snapshot writes now annotate each cached conversation row with index
    observed time, source surface, recency rank, and a stable index-row
    fingerprint.
  - catalog/search freshness remains cache-only and can project source/rank
    evidence from the row instead of inferring everything from the target
    snapshot.
  - conversation cache merge preserves the newest index metadata when global
    and project-scoped rows share the same conversation id.
  - the live Gemini full-sweep proof is still gated by the explicit-refresh
    cooldown recorded in Turn 126.
- Verification target:
  - `pnpm vitest run tests/accountMirror/cachePersistence.test.ts tests/accountMirror/catalogService.test.ts tests/accountMirror/conversationFreshness.test.ts --maxWorkers 1`
  - `pnpm exec biome lint src/accountMirror/cachePersistence.ts src/browser/providers/domain.ts tests/accountMirror/cachePersistence.test.ts tests/accountMirror/catalogService.test.ts`

## Turn 128 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: keep bounded Gemini project-history discovery from spending the whole
  reserved row budget on the first Gem.
- Result:
  - added a shared bounded project-conversation reader that distributes the
    remaining project-history row budget across remaining Gems/projects before
    deepening one history.
  - aggregate truncation now records that a specific project history had more
    rows without aborting the scan of later projects, and that truncation is
    preserved in mirror-completeness evidence.
  - the live Gemini full-sweep proof is still gated by the explicit-refresh
    cooldown recorded in Turn 126.
- Verification target:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts --maxWorkers 1 --testNamePattern "project conversations|project histories|route failures|walks bounded project histories"`
  - `pnpm exec biome lint src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts`

## Turn 127 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: make Gemini live-follow discovery cover both left-rail and Gem/project
  conversation histories.
- Result:
  - account-mirror metadata collection now fans out project conversation reads
    for Gemini as well as ChatGPT
  - project-history discovery reserves a bounded share of the conversation-row
    budget so a large left rail cannot starve project histories
  - individual Gemini project conversation route failures are recorded as
    tolerated DOM drift evidence and do not fail the whole account sweep
- Verification target:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts --maxWorkers 1 --testNamePattern "project conversations|project histories|route failures|attachment cursor"`
  - `pnpm exec biome lint src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts`

## Turn 126 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: keep bounded Gemini full-sweep completion from timing out before a
  paced project/history/detail pass can finish.
- Result:
  - full-sweep completion refreshes now pass an explicit 300s collector timeout
    into account-mirror refresh
  - steady-follow completion refreshes keep the existing refresh request shape
  - first Gemini `auracall-gemini-pro` proof attempt failed at the old
    collector timeout before writing a refresh pass or materialization cursor
  - post-fix retry
    `acctmirror_completion_026c4262-3300-49a5-8521-1d715ff34d0a` reached
    `idle_waiting` on explicit-refresh cooldown until
    `2026-05-23T17:07:50.624Z` and was cancelled before provider work
- Verification target:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts --maxWorkers 1 --testNamePattern "full-sweep"`
  - `pnpm run check`

## Turn 125 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: make steady-follow refreshes recency-first while preserving full-sweep
  deep cursor resume.
- Result:
  - account-mirror completion refreshes now pass their `sweepMode` into the
    refresh service and metadata collector
  - steady-follow collection ignores the previous attachment cursor so each
    routine pass rechecks the current rail/project conversation top
  - full-sweep collection still resumes the persisted deep attachment cursor
    for backfill
  - live provider proof for Gemini full-sweep and modified-conversation
    steady-follow remains open Plan 0070 work
- Verification target:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts --maxWorkers 1 --testNamePattern "sweep|steady-follow|attachment cursor"`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 124 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: add explicit operator row actions for reconciling stale cached
  conversations without changing cache-only reads.
- Result:
  - React Search conversation rows now expose a reconcile action that queues
    `POST /v1/account-mirrors/materializations` with `catalogKind:
    "conversations"`, `assetKinds: ["all"]`, and `refreshSnapshot: true`
  - cache-only `/account-mirror` catalog conversation rows expose the same
    reconciliation action and report the queued durable job id
  - static dashboard contract and the headless Search UX smoke now verify the
    row-level reconciliation path without provider/browser work
  - Gemini full-sweep dogfood and steady recency-follow behavior remain open
    Plan 0070 work
- Verification target:
  - `pnpm run smoke:operator-search-ux`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "dashboard control wiring|read-only account mirror dashboard page"`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 123 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: add the backend full-sweep live-follow policy path for partially
  hydrated histories.
- Result:
  - account-mirror completions now accept `sweepMode` and materialization
    policy fields through HTTP, CLI, and MCP start surfaces
  - `sweepMode: full_sweep` defaults to snapshot refresh plus
    `full_missing_assets`, then records queued history-materialization jobs in
    `materializationCursor` after successful refresh passes
  - configured service `liveFollow` blocks can pass the same policy fields
    during startup reconciliation; omitted fields preserve metadata-only
    steady follow
  - Gemini full-sweep dogfood, steady recency follow, and frontend row
    reconciliation remain open Plan 0070 work
- Verification target:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/liveFollowReconciler.test.ts tests/accountMirror/statusRegistry.test.ts tests/schema/resolver.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorCompletion.test.ts tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "full-sweep|live-follow|live follow|account mirror completion|completions|preserve live-follow|derives identity"`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 122 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: implement the explicit operator reconciliation job phase for existing
  cached conversations.
- Result:
  - `POST /v1/account-mirrors/materializations` now accepts
    `refreshSnapshot` and selected `conversationIds`
  - history materialization jobs persist `phases.snapshotRefresh` and
    `snapshotRefreshes` before running the existing artifact/file/media phase
  - terminal snapshot failures such as Gemini bare `/app` route fallback skip
    materialization for that target and preserve provider evidence
  - full live-follow sweep, steady recency follow, and frontend row affordances
    remain open Plan 0070 work
- Verification target:
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 121 | 2026-05-23

- Active plan:
  `docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md`
- Goal: plan how existing cached conversations stay current when live provider
  conversations continue changing after AuraCall has mirrored them once.
- Result:
  - opened Plan 0070 for conversation freshness, full live-follow sweeps,
    steady recency-follow, and explicit operator reconciliation
  - kept cache/search/catalog reads cache-only and routed browser work through
    live-follow completion jobs or explicit reconciliation/materialization jobs
  - defined freshness evidence for index observation, detail refresh,
    manifest refresh, materialization, routeability, fingerprints, and
    terminal unavailable states
  - defined the current Gemini partial-history case as a full-sweep backfill
    problem, while normal operation uses recency-ordered project/left-rail
    walks because modified conversations move to the top
  - wired the plan from `ROADMAP.md`
- Verification target:
  - `pnpm run plans:audit -- --keep 70`
  - `git diff --check`

## Turn 120 | 2026-05-10

- Active plan:
  `docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md`
- Goal: complete the ChatGPT Pro Extended selector repair after the SoyLei
  smoke still returned empty content.
- Result:
  - cancelled stale SoyLei API runs that were holding active runner leases
  - fixed the ChatGPT thinking-time browser expression so visible
    Standard/Extended pills are accepted before menu probing
  - removed a TypeScript-only annotation from the injected expression
  - installed and restarted the user API runtime on `127.0.0.1:18095`
  - live SoyLei `agent:pro-extended-chatgpt-soylei` smoke passed with
    `soylei pro extended selector ok`
- Verification target:
  - `pnpm vitest run tests/browser/thinkingTime.test.ts`
  - `pnpm tsc --noEmit --pretty false`
  - `pnpm run build`
  - installed runtime smoke via `/v1/chat/completions`

## Turn 119 | 2026-05-10

- Active plan:
  `docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md`
- Goal: fix ChatGPT Pro/Thinking depth selection after the SoyLei
  `agent:pro-extended-chatgpt-soylei` readout smoke failed on the missing
  Thinking-time menu.
- Result:
  - updated `ensureThinkingTime(...)` to accept already-selected
    Standard/Extended composer pills
  - added a Configure-dialog fallback for ChatGPT's current prompt-workbench
    model/depth UI when Standard/Extended are not in the first opened menu
  - installed and restarted the user API runtime on `127.0.0.1:18095`
  - a live readout retry was started, but was interrupted after a stuck browser
    modal was observed; do not count it as a pass
- Verification target:
  - `pnpm vitest run tests/browser/thinkingTime.test.ts tests/browser/modelSelection.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome lint src/browser/actions/thinkingTime.ts tests/browser/thinkingTime.test.ts --max-diagnostics 40`

## Turn 118 | 2026-05-10

- Active plan:
  `docs/dev/plans/0065-2026-05-10-db-backed-agent-registry.md`
- Goal: implement the DB-backed agent registry read-model foundation without
  changing API/MCP write behavior.
- Result:
  - added `src/config/agentRegistryStore.ts` with SQLite schema initialization,
    agent/team persistence, enablement flags, revisions, and JSON fallback
  - added `src/config/agentRegistryCatalog.ts` to merge config and registry
    agents/teams with source metadata and config-wins conflict reporting
  - added focused tests for registry persistence, disabled-record filtering, and
    effective catalog merging
- Verification target:
  - `pnpm vitest run tests/config/agentRegistryStore.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome lint src/config/agentRegistryStore.ts src/config/agentRegistryCatalog.ts tests/config/agentRegistryStore.test.ts`

## Turn 117 | 2026-05-10

- Active plan:
  `docs/dev/plans/0065-2026-05-10-db-backed-agent-registry.md`
- Goal: define the migration from config-file-backed agents to a user-scoped
  registry suitable for many operational agents.
- Result:
  - added Plan 0065 for a DB-backed agent/team registry under `~/.auracall`
  - kept `~/.auracall/config.json` as bootstrap/source config for runtime
    profiles, browser bindings, API settings, and optional pinned/core agents
  - defined compatibility behavior for existing `/v1/config/agents`,
    `/v1/config/teams`, MCP config tools, and `/v1/models`
  - identified the first implementation slice as read-model foundation before
    changing write behavior
- Verification target:
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `git diff --check`

## Turn 116 | 2026-05-10

- Active plan:
  `docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md`
- Goal: store local API credentials in user-scoped runtime state other agents
  can load.
- Result:
  - installed `auracall-api.service` loads `~/.auracall/api.env`
  - `pnpm run install:user-api-service` creates the dotenv file with a random
    bearer key, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `AURACALL_MODEL` if it
    is missing
  - HTTP auth accepts `AURACALL_API_KEY` environment keys in addition to
    config-defined `api.auth.keys[]`
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "API key|service environment" --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run install:user-runtime-service`

## Turn 115 | 2026-05-10

- Active plan:
  `docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md`
- Goal: expose the first OpenAI-style chat completions compatibility route for
  configured AuraCall agents.
- Result:
  - added non-streaming `POST /v1/chat/completions`
  - chat messages map into the existing `/v1/responses` execution path, including
    `model: "agent:<agent_id>"` and scoped API-key checks
  - chat completions drain the created run synchronously before returning, even
    when background response drain is enabled
  - `stream: true` returns an explicit unsupported-request error
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "chat completions|development-only posture" --maxWorkers 1`
  - `pnpm exec biome lint src/http/responsesServer.ts`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 114 | 2026-05-10

- Active plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: make Gemini live-follow calmer after a cleared `google.com/sorry`
  bot gate.
- Result:
  - Gemini mirror defaults now use 18 hour routine spacing, 45 minute
    explicit-refresh spacing, 90 minute jitter, six browser interactions per
    minute, four page-read batches, 80 conversation rows, and 24 artifact rows
    per cycle
  - service `liveFollow` config may override the same politeness fields per
    provider/runtime account
  - the metadata collector paces browser read calls between identity, project,
    conversation, and artifact/file inventory reads
- Verification target:
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm vitest run tests/accountMirror/politePolicy.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts --maxWorkers 1`

## Turn 113 | 2026-05-10

- Active plan:
  `docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`
- Goal: make Browser Ops clear about whether `about:blank` is a process launch
  argument or an actual open DevTools page target.
- Result:
  - added `GET /v1/browser/processes`
  - Browser Ops now has a Browser Processes panel with process PID, DevTools
    endpoint, launch `about:blank` flag, open blank page count, page count, and
    visible target titles/URLs
  - CLI/MCP dashboard contract checks include the new browser-process panel
- Verification target:
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard|serves read-only browser process diagnostics|serves a cache-only account mirror preview session page" --maxWorkers 1`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts --maxWorkers 1`

## Turn 70 | 2026-04-27

- Active plan:
  `docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md`
- Goal: add the first ChatGPT browser image generation path without repeating
  the Gemini/Grok post-submit re-navigation failure mode.
- Result:
  - added ChatGPT `completionMode = prompt_submitted` support to the existing
    browser runner so media runs return after trusted submit and retain the
    submitted tab target
  - added the ChatGPT browser media executor for image generation, active-tab
    artifact polling, and generated-image materialization through the existing
    artifact fetch path
  - expanded the CLI/API schema to accept `provider = chatgpt` for durable
    media-generation image requests
- Verification target:
  - `pnpm vitest run tests/mediaGenerationChatgptBrowserExecutor.test.ts tests/mediaBrowserExecutor.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 71 | 2026-04-27

- Active plan:
  `docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md`
- Goal: run the installed-runtime ChatGPT image smoke.
- Result:
  - fixed media record temp-file collisions exposed by async ChatGPT progress
    writes
  - fixed nested browser dispatch self-deadlock when ChatGPT media generation
    calls `runBrowserMode` while the media executor already owns the
    browser-operation lock
  - installed-runtime retry reached ChatGPT managed-profile auth wait but did
    not submit the image prompt because the default managed ChatGPT browser
    profile was not signed in
- Verification target:
  - `pnpm vitest run tests/mediaGeneration.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/mediaGenerationChatgptBrowserExecutor.test.ts tests/mediaGeneration.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run build`
  - `git diff --check`

## Turn 69 | 2026-04-27

- Active plan:
  `docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md`
- Goal: start the ChatGPT image-generation slice and audit ChatGPT readback for
  impatient post-submit navigation.
- Result:
  - opened Plan 0062 and wired it into the roadmap
  - confirmed ChatGPT generated-image artifact extraction is green for mature
    conversations, while first-class media generation remains unimplemented
  - changed ChatGPT payload readback and blocking-surface recovery so
    `preserveActiveTab` skips conversation reload/reopen recovery
  - added a targeted regression for the no-reload payload readback path
- Verification target:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/navigationPolicy.test.ts --maxWorkers 1`
  - `pnpm run plans:audit -- --keep 62`
  - `git diff --check`

## Turn 68 | 2026-04-25

- Active plan:
  `docs/dev/plans/0058-2026-04-25-browser-response-queued-dispatch.md`
- Goal: opt normal managed browser response/chat execution into queued
  browser-service dispatch.
- Result:
  - changed `acquireBrowserExecutionOperation(...)` to use
    `BrowserOperationDispatcher.acquireQueued(...)`
  - preserved the existing `browser-execution` operation kind and dispatcher key
  - added queue/acquire and timeout/busy tests
  - left login/setup/human-verification flows fail-fast
- Verification target:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 58`
  - `git diff --check`

## Turn 67 | 2026-04-25

- Active plan:
  `docs/dev/plans/0057-2026-04-25-browser-media-queued-dispatch.md`
- Goal: opt the first async browser product path into queued browser-service
  dispatch.
- Result:
  - wrapped Gemini/Grok browser media execution in
    `BrowserOperationDispatcher.acquireQueued(...)`
  - added media timeline events `browser_operation_queued` and
    `browser_operation_acquired`
  - kept Gemini API transport and human/login flows outside queued dispatch
  - used raw DevTools operation keys for explicit Grok video readback probes
- Verification target:
  - `pnpm vitest run tests/mediaBrowserExecutor.test.ts tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 57`
  - `git diff --check`

## Turn 66 | 2026-04-25

- Active plan:
  `docs/dev/plans/0056-2026-04-25-browser-operation-queued-dispatch.md`
- Goal: continue the browser-service control-plane lane by adding an opt-in
  queued dispatch primitive for future service/API/MCP browser callers.
- Result:
  - added `BrowserOperationDispatcher.acquireQueued(...)`
  - preserved existing fail-fast `acquire(...)` behavior for hard-stop flows
  - covered queued in-memory and file-backed acquisition plus timeout/busy
    readback
- Verification target:
  - `pnpm vitest run tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 56`
  - `git diff --check`

## Turn 65 | 2026-04-25

- Active plan:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: continue browser-first capability work after provider API media access
  was parked.
- Result:
  - added no-live browser-discovery adapter coverage for Gemini tool drawer
    labels, ChatGPT apps/skills/research labels, and Grok Imagine entrypoint
    discovery options
  - closed Plan 0050 for capability discovery/reporting across CLI/API/MCP and
    browser-backed feature-signature mapping
  - left provider-backed invocation beyond media generation for a future
    bounded per-capability plan
- Verification target:
  - `pnpm vitest run tests/workbenchBrowserDiscovery.test.ts tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 64 | 2026-04-25

- Active plan:
  `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
- Goal: record the operator decision to sideline provider API access for now.
- Result:
  - skipped the proposed live Gemini API image smoke
  - kept explicit Gemini `transport = api` support as implemented, but parked
    provider API media access for current dogfooding
  - restored browser-first media/workbench behavior as the active priority in
    roadmap and operator docs
- Verification target:
  - `pnpm run plans:audit -- --keep 55`
  - `git diff --check`

## Turn 63 | 2026-04-25

- Active plan:
  `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
- Goal: audit the current Gemini API image contract and either implement or
  defer Gemini API image execution for durable media-generation runs.
- Result:
  - added a Gemini API media executor for `provider = gemini`,
    `mediaType = image`, and explicit `transport = api`
  - used the Google GenAI SDK `models.generateImages` path with default Imagen
    model `imagen-4.0-generate-001`, `GEMINI_API_KEY`, count/aspect/size
    options, inline-byte artifact caching, and focused failure codes
  - kept browser Gemini media and legacy `--generate-image <file>` behavior
    unchanged
  - closed Plan 0055
- Verification target:
  - `pnpm vitest run tests/mediaGenerationGeminiApiExecutor.test.ts tests/cli.mediaGenerationCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 55`
  - `git diff --check`

## Turn 62 | 2026-04-25

- Active plan:
  `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
- Goal: make the legacy Gemini `--generate-image <file>` decision explicit
  before changing behavior.
- Result:
  - kept `--generate-image <file>` as a documented compatibility shortcut for
    direct one-file Gemini browser image saves
  - documented `auracall media generate` as the preferred durable
    image/music/video path because it preserves media ids, status polling,
    timeline evidence, and cached artifacts
  - left Gemini API image execution as the remaining Plan 0055 follow-up
- Verification target:
  - `pnpm run plans:audit -- --keep 55`
  - `git diff --check`

## Turn 61 | 2026-04-25

- Active plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Goal: audit Plan 0049's remaining unchecked items and either close it or
  split true follow-up into a bounded compatibility plan.
- Result:
  - closed Plan 0049 for the shared durable media-generation resource across
    CLI, local API, MCP, status, and browser-backed Gemini/Grok provider paths
  - opened
    `docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md`
    for legacy Gemini `--generate-image` migration and Gemini API image
    execution
  - updated roadmap wiring so provider media core and compatibility/API
    follow-up are separate planning authorities
- Verification target:
  - `pnpm run plans:audit -- --keep 49 --keep 55`
  - `git diff --check`

## Turn 60 | 2026-04-25

- Active plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Goal: add no-live parser-level regression coverage for the actual
  `auracall media generate` Commander path.
- Result:
  - moved media command registration into `src/cli/mediaGenerationCommand.ts`
    so tests can exercise the real command tree with injected seams
  - added a Commander parse test for provider/type/prompt/count/aspect-ratio,
    `--no-wait`, and `--json`
  - kept browser/provider execution mocked out, so the test cannot open a
    browser or spend media-generation quota
- Verification:
  - `pnpm vitest run tests/cli.mediaGenerationCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 49`
  - `git diff --check`

## Turn 59 | 2026-04-25

- Active plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Goal: start the next media-parity slice by adding a CLI create path on the
  shared durable media-generation contract.
- Result:
  - added `auracall media generate` for `gemini|grok` and
    `image|music|video`
  - wired CLI creation through the same durable media-generation service used
    by API/MCP, with `source = cli`, browser transport default, and `--no-wait`
    async creation for run-status polling
  - kept legacy Gemini `--generate-image` as a compatibility side path until a
    later explicit migration slice
  - updated README, testing docs, Plan 0049, dev journal, and fixes log
- Verification:
  - `pnpm vitest run tests/cli.mediaGenerationCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm tsx bin/auracall.ts media generate --help`
  - `pnpm run plans:audit -- --keep 49`
  - `git diff --check`

## Turn 58 | 2026-04-25

- Active plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: review the completed Grok Imagine browser-first work and decide
  whether Plan 0054 should close or produce another bounded follow-up.
- Result:
  - closed Plan 0054 after image/video discovery, guarded submit, submitted-tab
    status sensing, materialization, compact status diagnostics, live proofs,
    and provider-adapter regression coverage were all recorded
  - updated the roadmap so the next Grok step is no longer stale browser
    discovery work
  - left xAI API execution and Grok edit/reference workflows deferred for a
    future bounded plan
- Verification target:
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 57 | 2026-04-24

- Active plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: implement the first browser-first Grok Imagine discovery slice without
  submitting a generation request.
- Result:
  - added static Grok Imagine image/video workbench capability entries
  - added read-only Grok browser feature-signature probing for Imagine
    visibility, labels, routes, modes, account gating, and blocked/failure
    evidence
  - mapped Grok Imagine feature signatures into
    `grok.media.imagine_image` and `grok.media.imagine_video`
  - wired CLI/API capability discovery so `provider=grok` can use the same
    browser-backed discovery path as Gemini and ChatGPT
  - live read-only managed-browser probe observed `/imagine` and reported
    `grok.media.imagine_image` as `account_gated`; video remained static
    `unknown`
- Verification:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm tsx bin/auracall.ts capabilities --target grok --static --json`
  - `pnpm tsx bin/auracall.ts capabilities --target grok --json`
  - `pnpm run check`

## Turn 56 | 2026-04-24

- Active plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: research Grok Imagine before implementation because the interface is
  provider-specific and has separate image/video execution shapes.
- Result:
  - xAI API image generation uses `grok-imagine-image` through
    `/v1/images/generations`
  - image generation can return URL or base64 data and supports `n`,
    `aspect_ratio`, and `resolution`
  - xAI API video generation uses `grok-imagine-video` through
    `/v1/videos/generations`, returns a `request_id`, and requires polling
    `/v1/videos/{request_id}`
  - video URLs are temporary and must be downloaded promptly
  - xAI API access is separate from Grok.com/X/mobile subscription state
- Decision:
  - user corrected priority to browser-first Grok Imagine
  - implement managed-browser Imagine discovery before provider invocation
  - defer xAI API image/video execution, image editing, video editing, and
    browser prompt submission to later bounded slices
- Verification target:
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 55 | 2026-04-23

- Active plan: `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: extend read-only workbench capability discovery to ChatGPT's volatile
  composer/workbench tool surface.
- Result:
  - ChatGPT feature signatures now project available capabilities for Web
    Search, Deep Research, Company Knowledge, visible apps/connectors, and
    visible skills
  - static ChatGPT apps, Company Knowledge, and skills remain conservative
    `account_gated` entries until discovery proves current-account visibility
  - API/MCP/CLI capability reports reuse the existing read-only capability
    contract and do not invoke or enable provider tools
- Verification:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts --maxWorkers 1`
  - `pnpm tsx bin/auracall.ts capabilities --target chatgpt --static --json`
  - `pnpm tsx bin/auracall.ts capabilities --target gemini --static --json`

## Turn 54 | 2026-04-23

- Active plan: `docs/dev/plans/0038-2026-04-21-service-runner-roadmap-checkpoint.md`
- Goal: complete the service/runner integration-hygiene action that Plan 0038
  selected before any new implementation lane.
- Result:
  - worktree was clean before the pass
  - broad HTTP/MCP/runtime/CLI runner-control validation passed
  - no fresh service/runner ownership or readback mismatch was reproduced
  - service/runner architecture expansion remains paused until a concrete
    product requirement or reproduced mismatch justifies a new bounded plan
- Verification:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts tests/runtime.configuredExecutor.test.ts tests/runtime.schedulerAuthority.test.ts tests/runtime.runnersControl.test.ts tests/runtime.dispatcher.test.ts tests/runtime.control.test.ts tests/runtime.inspection.test.ts tests/runtime.api.test.ts tests/runtime.responsesService.test.ts tests/mcp.runStatus.test.ts tests/mcp.runtimeInspect.test.ts tests/mcp/teamRun.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/cli.runStatusCommand.test.ts tests/cli/runtimeInspectionCommand.test.ts tests/cli/teamRunCommand.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/mcp/teamRun.test.ts tests/teams.runtimeBridge.test.ts tests/runtime.runner.test.ts tests/runtime.lease.test.ts tests/runtime.store.test.ts tests/runtime.runnersStore.test.ts tests/teams.service.test.ts tests/teams.store.test.ts tests/teams.schema.test.ts --maxWorkers 1`

## Turn 53 | 2026-04-23

- Active browser reliability exception:
  `docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`
- Reason:
  - reproduced Gemini browser-media runs proved the earlier dispatcher work was
    necessary but not sufficient
  - managed-profile mutation authority is still split across browser-service
    helpers, provider adapters, and legacy browser flows
- Codebase audit inventory recorded in Plan 0053:
  - direct `Page.navigate(...)` call sites: `7`
  - direct `Page.reload(...)` call sites: `5`
  - explicit `location.assign(...)` call sites: `1`
  - explicit `location.href =` / `window.location` mutation call sites: `6`
  - `openOrReuseChromeTarget(...)` call sites: `9`
  - `navigateAndSettle(...)` call sites: `13`
- Next checkpoint:
  - route managed-profile navigation/reload/target-reuse mutation intent
    through one browser-service-owned control plane with mutation audit
    records before doing more provider-local browser hardening

## Turn 1 | 2026-04-14

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Adjacent canonical plan: `docs/dev/plans/0002-2026-04-14-task-run-spec.md`
- Adjacent canonical plan: `docs/dev/plans/0003-2026-04-14-team-run-data-model.md`
- Adjacent canonical plan: `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
- Adjacent canonical plan: `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Adjacent canonical plan: `docs/dev/plans/0006-2026-04-14-team-config-boundary.md`
- Adjacent canonical plan: `docs/dev/plans/0007-2026-04-14-config-model-refactor.md`
- Adjacent canonical plan: `docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md`
- Adjacent canonical plan: `docs/dev/plans/0009-2026-04-14-agent-config-boundary.md`
- Adjacent canonical plan: `docs/dev/plans/0010-2026-04-14-service-volatility-chatgpt.md`
- Adjacent canonical plan: `docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md`
- Adjacent canonical plan: `docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md`
- Adjacent canonical plan: `docs/dev/plans/0013-2026-04-14-gemini-completion.md`
- Adjacent canonical plan: `docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md`
- Goal: migrate active planning authority into canonical `docs/dev/plans/`
  artifacts without changing runtime behavior.

## Turn 2 | 2026-04-14

- Read `AGENTS.md` before touching behavior.
- Keep `docs/dev/dev-journal.md` and `docs/dev-fixes-log.md` updated when a
  repair lands or when a new failure mode becomes clear.
- For generic DOM drift, consult:
  - `docs/dev/browser-service-upgrade-backlog.md`
  - `docs/dev/browser-service-tools.md`
  - `docs/dev/browser-automation-playbook.md`
- For broader package-boundary follow-ons after the ChatGPT cycle, review
  `docs/dev/browser-service-lessons-review-2026-03-30.md`.

## Turn 3 | 2026-04-14

Prioritize diagnostics adoption on these Grok surfaces:

- account `/files` delete row actions
- project `Sources -> Personal files` list/upload/delete/save flows

Keep trigger/button scoring provider-local unless the same scoring shape repeats
on another real surface/provider.

## Turn 4 | 2026-04-14

Run on a normal Node 22 + pnpm dev box:

```sh
pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1
pnpm run check
```

Recommended live Grok follow-up commands:

```sh
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files list <projectId> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files add <projectId> <file> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files remove <projectId> <file> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files remove <fileId> --target grok
```

## Turn 5 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: keep the public runtime inspection contract aligned across CLI, HTTP,
  tests, and governing docs without widening execution semantics.
- Completed:
  - widened `auracall api inspect-run` and `GET /v1/runtime-runs/inspect` to
    accept exactly one of:
    - `runId`
    - `runtimeRunId`
    - `teamRunId`
    - `taskRunSpecId`
  - preserved `runnerId` as the optional affinity-evaluation input
  - added focused CLI and HTTP coverage for the new lookup aliases plus
    invalid-request shape checks
  - synchronized `README.md`, `docs/testing.md`, `ROADMAP.md`, and the active
    execution plan with the same lookup-key contract
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`
  - `pnpm plans:audit`

## Turn 6 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: tighten runtime inspection readback so alias-based queries remain
  operator-visible without widening execution semantics.
- Completed:
  - added alias provenance to runtime inspection payloads:
    - `resolvedBy`
    - `queryId`
    - existing resolved `queryRunId`
  - kept the runtime inspection surface read-only and did not add public write
    behavior
  - synchronized CLI formatting plus HTTP/CLI tests and operator docs with the
    same bounded response contract
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`

## Turn 7 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: keep runtime inspection alias resolution auditable when one alias can
  map to multiple persisted runtime runs.
- Completed:
  - added bounded alias match summary to runtime inspection payloads:
    - `matchingRuntimeRunCount`
    - `matchingRuntimeRunIds`
  - kept the route read-only and bounded to the latest resolved runtime run
    plus a compact candidate summary
  - synchronized CLI formatting, focused HTTP/CLI tests, and operator docs
    with the same bounded match-summary contract
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`

## Turn 8 | 2026-04-15

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Adjacent plan:
  `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: reassess the roadmap after the configured account-affinity checkpoint
  instead of continuing implementation by inertia.
- Decision:
  - durable state/account mirroring is now an active single-runner checkpoint,
    not merely planned future signal
  - configured account-affinity is complete enough across runner metadata,
    runtime inspection, local claim, targeted-drain diagnostics, tests, and
    operator docs
  - public team execution writes and multi-runner/background-worker service mode
    remain paused
- Next checkpoint:
  - run one bounded local `api serve` operator smoke for `/status`,
    local-claim summary, and `GET /v1/runtime-runs/inspect` account-affinity
    readback before choosing another implementation lane
- Verification target:
  - `pnpm run plans:audit`
  - `pnpm run check`

## Turn 9 | 2026-04-15

- Active plan: `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: run the bounded local `api serve` operator smoke requested by the
  durable account-affinity checkpoint.
- Completed:
  - started `auracall api serve` against an isolated temporary
    `AURACALL_HOME_DIR` with configured ChatGPT service identity
  - paused background drain before seeding a runnable direct run, so the smoke
    did not call live browser/API providers
  - confirmed `/status` exposed:
    - active persisted local runner
    - paused background drain
    - compact direct-run `localClaimSummary`
    - `selectedRunIds = ["smoke_runtime_account_affinity_1"]`
  - confirmed `GET /v1/runtime-runs/inspect` with the server runner returned:
    - `claimState = claimable`
    - `requiredServiceAccountId = service-account:chatgpt:operator@example.com`
    - runner `serviceAccountIds` containing the same id
  - confirmed the same inspection route with an intentionally missing-account
    runner returned:
    - `claimState = blocked-affinity`
    - `reason = runner runner:smoke-missing-account does not expose service account service-account:chatgpt:operator@example.com`
  - stopped the isolated server after the smoke.
- Decision:
  - the durable-state/account-affinity sub-lane is green at the current
    single-runner checkpoint
  - pause this sub-lane and choose the next roadmap lane explicitly before more
    service-mode implementation
- Verification target:
  - `pnpm run check`
  - `git diff --check`

## Turn 10 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Adjacent plans:
  - `docs/dev/plans/0001-2026-04-14-execution.md`
  - `docs/dev/plans/0003-2026-04-14-team-run-data-model.md`
  - `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
  - `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: memorialize the service-health, passive-monitoring, and
  reproducibility design boundary before starting another implementation lane.
- Decision:
  - build a durable team-run review ledger before broad passive provider-state
    monitoring
  - keep provider chat caches as supplemental evidence, not the canonical
    orchestration record
  - attach future provider states such as `thinking`, `response-incoming`, and
    hard-stop classifications to ledger observations instead of letting DOM
    state define the execution model
- Next implementation checkpoint:
  - Slice 1 is contract and projection-only review ledger from existing
    persisted runtime/team records
  - keep public team execution writes paused
  - keep multi-runner/background-worker expansion paused
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 11 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 1 without adding public team execution writes or a new
  operator surface.
- Completed:
  - added `src/teams/reviewLedger.ts`
  - added `tests/teams.reviewLedger.test.ts`
  - projected a read-only ledger from existing runtime bundles
  - preserved deterministic serial step order, handoffs, artifacts,
    prompt/input snapshots, output snapshots, failures, and provenance
  - preserved provider conversation refs from existing `browserRun` output
    metadata when available
  - represented missing provider refs as `null`
- Deferred:
  - public read-only endpoint or CLI review command
  - provider reference enrichment beyond existing `browserRun` metadata
  - passive hard-stop observations
- Verification:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 12 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 2 as a bounded read-only operator surface.
- Completed:
  - added `reviewTeamRunLedger(...)` payload resolution with the same one-key
    lookup posture as team inspection
  - added `auracall teams review`
  - supported exactly one of:
    - `--task-run-spec-id`
    - `--team-run-id`
    - `--runtime-run-id`
  - preserved alias provenance, bounded matching runtime-run ids, task-run spec
    summary, and the projected ledger
  - kept the surface read-only
- Deferred:
  - HTTP review endpoint
  - provider reference enrichment beyond existing `browserRun` metadata
  - passive provider-state observations
- Verification:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 13 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 3 provider reference enrichment without adding
  provider scraping or inferred cache paths.
- Completed:
  - enriched stored browser-run metadata from configured team execution with:
    - provider/service
    - conversation id and tab URL
    - configured URL and project id
    - runtime profile id and browser profile id
    - agent id and selected model
    - explicit cache path status
  - projected those fields through `TeamRunProviderConversationRef`
  - kept cache path `null` unless stored metadata already carries a concrete
    provider cache path
- Deferred:
  - resolving exact provider cache identity/path during stored-step execution
  - passive provider-state observations
- Verification:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 14 | 2026-04-15

- Active plan: `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
- Goal: implement Slice 4 minimal passive hard-stop observations without
  adding live DOM polling or broad chat-state detection.
- Completed:
  - projected durable failure-derived ledger observations for:
    - provider error
    - login required
    - captcha/human-verification
    - awaiting human action
  - attached observations to steps with source, timestamp, confidence, and
    evidence reference
  - updated `auracall teams review` text output to list observations
- Deferred:
  - rich passive `thinking` and `response-incoming` detection
  - live/manual provider smokes for observation generation
- Verification:
  - `pnpm vitest run tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 15 | 2026-04-15

- Active plan: `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
- Goal: complete the roadmap reassessment after the review-ledger checkpoint
  and choose one bounded next implementation lane.
- Completed:
  - closed the completed review-ledger checkpoint plan:
    - `docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md`
  - opened the next bounded plan:
    - `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
  - selected adapter-owned passive provider observations as the next lane
    instead of:
    - resuming durable-state/account-mirroring work
    - resolving exact provider cache identity/path first
  - set the first slice to a stored passive-observation seam plus ChatGPT
    execution-path capture for:
    - `thinking`
    - `response-incoming`
    - `response-complete`
- Verification:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 16 | 2026-04-15

- Active plan: `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
- Goal: implement Slice 1 with one stored passive-observation seam plus
  ChatGPT execution-path capture.
- Completed:
  - extended ChatGPT browser execution to return stored passive observations
    for:
    - `thinking`
    - `response-incoming`
    - `response-complete`
  - persisted those observations into configured stored-step
    `browserRun.passiveObservations`
  - projected stored passive observations through the review ledger and
    `auracall teams review`
- Deferred:
  - Gemini parity on the same stored seam
  - Grok parity and cross-provider evidence normalization
- Verification:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/teams.reviewLedger.test.ts tests/cli/teamRunCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## Turn 17 | 2026-04-16

- Active plan: `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
- Goal: validate the live ChatGPT passive-state sequence on the managed WSL
  Chrome path and refine the ChatGPT `thinking` evidence seam to match real
  UI behavior.
- Completed:
  - proved the managed ChatGPT WSL launch inherits `DISPLAY=:0.0` even when
    the parent shell has `DISPLAY` unset
  - captured direct instant-mode and thinking-mode ChatGPT DOM traces on the
    managed profile:
    - `/tmp/chatgpt-direct-instant-dom-trace.jsonl`
    - `/tmp/chatgpt-direct-thinking-dom-trace.jsonl`
  - confirmed the current reliable thinking signal is the placeholder
    assistant turn text `ChatGPT said:Thinking`
  - refined the ChatGPT thinking-status seam so the passive monitor checks the
    last assistant turn for that placeholder before falling back to generic
    status nodes
  - normalized that placeholder to the stable thinking label `Thinking`
  - synchronized the active passive-observations plan, roadmap, README, and
    testing docs with the live evidence boundary
- Deferred:
  - Gemini parity on the same stored observation seam
  - Grok parity and cross-provider evidence normalization
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/thinking.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 18 | 2026-04-16

- Active plan: `docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md`
- Goal: add the first bounded read-only API/CLI contract for mid-turn live
  provider `serviceState` probing without widening `/status`, then wire
  provider-owned live probes on that seam one service at a time.
- Completed:
  - closed the passive provider-observation provider-parity plan:
    - `docs/dev/plans/0016-2026-04-15-passive-provider-observations.md`
  - opened the next bounded plan:
    - `docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md`
  - extended runtime inspection with an opt-in `serviceState` payload
  - wired explicit request surfaces for the new seam:
    - `auracall api inspect-run --probe service-state`
    - `GET /v1/runtime-runs/inspect?...&probe=service-state`
  - kept actual live provider probing injectable so the generic inspection
    layer only reports:
    - `probeStatus = observed`
    - `probeStatus = unavailable`
  - wired the default `api serve` ChatGPT-backed probe:
    - resolves the running step AuraCall runtime profile before probing
    - probes only ChatGPT-managed browser sessions on the matching runtime
      profile
    - returns honest `null` when the step runtime profile does not resolve
      back to the same AuraCall runtime profile
  - added focused helper coverage for ChatGPT placeholder-turn `thinking`,
    assistant-visible `response-incoming`, and auth-surface
    `login-required`
  - wired the default `api serve` Gemini-backed probe for browser-backed
    runtime profiles:
    - resolves the running step AuraCall runtime profile before probing
    - refuses non-browser Gemini runtime profiles
    - reports provider-owned Gemini states from live page evidence
  - added focused helper coverage for Gemini browser `thinking`,
    `response-incoming`, `response-complete`, and `login-required`
- Deferred:
  - signed-in Gemini live proof on the managed browser path
  - Grok live service-state probe on the same inspection seam
- Verification:
  - `pnpm vitest run tests/browser/liveServiceState.test.ts tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`
  - live `api serve` ChatGPT proof:
    - started `auracall api serve --port 8092` with ambient `DISPLAY` unset
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = default`
      - `auracall.service = chatgpt`
      - model `gpt-5.2-thinking`
    - mid-turn runtime inspection on
      `resp_6a82023f7cc1458aa57411654f982eaf` returned:
      - `probeStatus = observed`
      - `service = chatgpt`
      - `state = unknown`
      - `evidenceRef = chatgpt-live-probe-no-signal`
      - `confidence = low`
  - stronger managed-profile follow-up proof:
    - started `auracall api serve --port 8093`
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = wsl-chrome-2`
      - `auracall.service = chatgpt`
      - `runId = resp_a212f22157344324bb8d8d52adbfeb8f`
    - mid-turn runtime inspection first returned:
      - `probeStatus = observed`
      - `state = thinking`
      - `evidenceRef = chatgpt-placeholder-turn`
      - `confidence = high`
    - bounded live DOM inspection on the same managed tab showed:
      - `stopVisible = true`
      - `lastAssistantText = ChatGPT said:Pro thinking`
      - no meaningful `[role="status"]` / `aria-live` signal
    - later mid-turn runtime inspection on the same run returned:
      - `probeStatus = observed`
      - `state = response-incoming`
      - `evidenceRef = chatgpt-streaming-visible`
      - `confidence = high`
    - terminal inspection then correctly returned:
      - `probeStatus = unavailable`
      - reason `runtime run ... is not actively running`
  - live blocker uncovered and fixed in the same slice:
    - `serveResponsesHttp` had not been wiring the configured stored-step
      executor by default
    - after fixing that wrapper, `/v1/responses` ran on the real configured
      browser-backed path instead of completing as an empty no-op
  - Gemini executor-owned follow-up proof:
    - started `auracall api serve --port 8096`
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = auracall-gemini-pro`
      - `auracall.service = gemini`
      - `runId = resp_5f985759ab394ebdaffce387a5cc8602`
    - repeated mid-turn runtime inspection returned:
      - `probeStatus = observed`
      - `state = thinking`
      - `evidenceRef = gemini-web-request-started`
      - `confidence = medium`
    - terminal inspection still returned:
      - `probeStatus = unavailable`
      - reason `runtime run ... is not actively running`
    - that specific run later failed after the active proof window, which
      confirms the Gemini improvement is the active-state seam rather than a
      guarantee of successful completion
  - Grok executor-owned live proof:
    - started `auracall api serve --port 8097`
    - created one direct browser-backed response with:
      - `auracall.runtimeProfile = auracall-grok-auto`
      - `auracall.service = grok`
      - `runId = resp_668e19a0ea5946d3aea8cdcbf683c127`
    - repeated mid-turn runtime inspection returned:
      - `probeStatus = observed`
      - `state = thinking`
      - `evidenceRef = grok-prompt-submitted`
      - `confidence = medium`
    - later readback showed:
      - `runStatus = succeeded`
      - terminal `serviceState.probeStatus = unavailable`
    - this closes the provider-breadth checkpoint for the current
      `serviceState` seam
  - roadmap reassessment:
    - closed
      `docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md`
      as the completed provider-breadth checkpoint
    - opened
      `docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md`
      as the active quality lane
    - next work is explicitly quality-focused:
      - richer Gemini mid-turn states where stable provider evidence exists
      - richer Grok mid-turn states where stable provider evidence exists
    - `/status` remains out of scope and no generic runtime-owned DOM polling
      is authorized
  - Gemini quality follow-up:
    - started `auracall api serve --port 8098`
    - bounded live quality probe on
      `resp_b0b118b56afe409794b0f13cb2f006b0` returned only:
      - active `thinking` via `gemini-web-request-started`
      - then terminal `unavailable` after failure
    - bounded managed-profile DOM inspection on the same lane showed the page
      still on the idle/home surface with no stable answer-bearing history
      signal
    - conclusion:
      - do not manufacture richer Gemini states from generic heuristics on
        this machine/profile
      - keep Gemini executor-owned `thinking` as the honest active fallback
      - move the next quality slice to Grok
  - Grok quality follow-up:
    - started `auracall api serve --port 8099`
    - tightened Grok inspection precedence so provider-owned visible answer
      state can override transient executor-owned `thinking` when present
    - bounded live quality probe on
      `resp_ca285e207960420caa370da67d3180aa` still showed:
      - active `thinking` via `grok-prompt-submitted`
      - then terminal `unavailable` after successful completion
      - no stable provider-owned `response-incoming` during the active polling
        window
    - conclusion:
      - keep Grok executor-owned `thinking` as the honest active fallback on
        this machine/profile
      - keep the stricter precedence change so provider-owned visible answer
        state can win if a future live run exposes it
  - lane closeout:
    - closed
      `docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md`
      after bounded negative evidence for both Gemini and Grok
    - next step is roadmap reassessment before any further live-state
      expansion
  - reassessment result:
    - no new bounded `serviceState` follow-up plan was opened
    - keep the current run-scoped `serviceState` seam in maintenance mode
    - only resume expansion if a future live proof exposes a new
      provider-owned evidence seam

## Turn 19 | 2026-04-17

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Adjacent plan:
  `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- Goal: reassess whether the durable-state/account-affinity checkpoint should
  remain an active bounded plan.
- Decision:
  - the shipped single-runner/account-affinity checkpoint is complete enough
    to close as a bounded plan
  - no new durable-state/account-mirroring implementation slice is opened in
    this turn
  - keep the lane in maintenance mode until a broader durable-ownership seam
    is selected explicitly
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 20 | 2026-04-20

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- Goal: prune the roadmap execution board after the 360 review so product work
  has one primary active lane instead of many competing `OPEN` plans.
- Decision:
  - primary active implementation lane is service/runner orchestration beyond
    the current single-host bounded local-runner bridge
  - `0002`, `0003`, `0004`, `0006`, and `0009` remain active supporting
    authorities only where they preserve that lane's team/task/agent semantics
  - config, browser, volatility, and reattach tracks are maintenance-only
    unless a concrete mismatch is reproduced
  - Gemini remains a provider-expansion side track, not the primary sequencing
    authority
  - response-shape normalization and service-state probing stay parked unless
    a new public routing/readback mismatch or provider-owned evidence seam is
    demonstrated
- Scope:
  - docs-only roadmap and plan-authority pruning
  - no runtime or operator behavior changes
- Verification target:
  - `pnpm run plans:audit`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `git diff --check`

## Turn 21 | 2026-04-20

- Active plan: `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
- Goal: land the smallest service/runner ownership increment after roadmap
  pruning without widening public team execution writes or multi-runner scope.
- Change:
  - `ExecutionServiceHost` now owns local runner lifecycle writes:
    - register existing-or-new local runner
    - heartbeat the local runner
    - mark the local runner stale on shutdown
  - `api serve` still owns timers, HTTP status projection, and server shutdown
    ordering, but delegates runner lifecycle mutations to the service host.
- Scope:
  - no public endpoint changes
  - no provider/browser behavior changes
  - no multi-runner expansion
- Verification target:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts`
  - `pnpm vitest run tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 22 | 2026-04-20

- Active plan: `docs/dev/plans/0004-2026-04-14-team-service-execution.md`
- Goal: continue the service/runner ownership lane by auditing background
  drain scheduling and extracting only the runtime-owned part.
- Decision:
  - keep background-drain timers, pause/resume state, and `/status`
    projection in `api serve`
  - move serial drain queue ownership into `ExecutionServiceHost`
  - do not create a public endpoint or widen team execution writes
- Change:
  - added `ExecutionServiceHost.drainRunsUntilIdleQueued(...)`
  - added `ExecutionServiceHost.waitForDrainQueue()`
  - rewired `api serve` to delegate queued drain execution to the service host
- Verification target:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 23 | 2026-04-20

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- New checkpoint plan:
  `docs/dev/plans/0019-2026-04-20-public-team-execution-write-surface.md`
- Goal: select the next bounded checkpoint after completing the immediate
  `api serve` service-host ownership extraction/reassessment.
- Decision:
  - stop extracting more from `api serve` by default because remaining state is
    transport/listener scoped
  - open a public team execution write preflight plan
  - candidate first write endpoint is `POST /v1/team-runs`
  - the first implementation should reuse the existing
    `TaskRunSpec -> TeamRun -> TeamRuntimeBridge` chain
  - MCP write parity and multi-runner/background-worker expansion stay
    deferred
- Scope:
  - docs-only checkpoint selection
  - no runtime or operator behavior changes

## Turn 24 | 2026-04-20

- Active plan: `docs/dev/plans/0019-2026-04-20-public-team-execution-write-surface.md`
- Goal: land the first bounded public HTTP team execution write surface.
- Completed:
  - added `POST /v1/team-runs`
  - shared the bounded task-run-spec builder and team execution payload between
    CLI and HTTP
  - routed HTTP creation through the existing
    `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> ExecutionServiceHost`
    chain
  - returned `object = "team_run"` with generated `taskRunSpec`,
    deterministic execution ids/status, and links for team inspection, runtime
    inspection, and `/v1/responses/{runtimeRunId}` readback
  - kept arbitrary prebuilt `taskRunSpec` JSON, MCP write parity,
    multi-runner scheduling, and parallel team execution deferred
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run plans:audit`
  - `git diff --check`
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 25 | 2026-04-21

- Active plan: `docs/dev/plans/0001-2026-04-14-execution.md`
- New browser reliability plan:
  `docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md`
- Goal: record the roadmap/plan decision after default tenant account-health
  checks exposed a managed-profile CDP ownership problem.
- Evidence:
  - default Grok, ChatGPT, and Gemini login checks all eventually confirmed
    when run one provider at a time
  - earlier overlapping auth-mode launches reused fixed DevTools port
    `127.0.0.1:9222`
  - live doctor/probe evidence could mix tabs and account state across
    providers unless the operator manually serialized the checks
  - a separate `wsl-chrome-2/chatgpt` session also remained live, proving
    profile boundary evidence must stay explicit
- Decision:
  - open a bounded browser-service dispatcher slice instead of widening the
    runtime service/runner lane
  - first target is one operation owner per managed browser profile/service
  - login/manual-verification, browser execution, doctor, features, setup, and
    managed-profile `browser-tools` calls should acquire that operation owner
  - busy/blocked outcomes should be structured and operator-actionable
  - shared read paths remain deferred until a specific path proves it does not
    focus, select, navigate, or mutate page state
- Scope:
  - docs/roadmap/plan update only in this turn
  - no runtime or operator behavior changes yet
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 26 | 2026-04-21

- Closed browser reliability plan:
  `docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md`
- New browser reliability plan:
  `docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`
- Goal: reassess Plan 0021 after implementation and serial live smoke, then
  open only the next bounded browser-service reliability slice.
- Evidence:
  - dispatcher implementation and focused tests cover login, setup, doctor,
    features, browser execution, and managed-profile `browser-tools`
  - serial live smoke proved default Grok, ChatGPT, and Gemini managed browser
    profile separation on auto-assigned ports without shared `9222`
    contamination
  - default ChatGPT stayed distinct from the live `wsl-chrome-2/chatgpt`
    session on port `45013`
  - Grok and ChatGPT doctor commands still exited nonzero because selector
    diagnosis expected conversation-output selectors on home/new-chat surfaces
- Decision:
  - close Plan 0021 as dispatcher-proofed
  - open Plan 0022 for Grok/ChatGPT selector-diagnosis hardening
  - keep the follow-up narrow: account/profile health vs
    conversation-output readiness, not prompt sending or broader provider
    automation
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 27 | 2026-04-21

- Closed browser reliability plan:
  `docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md`
- Goal: implement the narrow Grok/ChatGPT selector-diagnosis fix opened after
  the dispatcher smoke.
- Change:
  - `src/inspector/doctor.ts` now classifies selected provider surfaces as
    `conversation` or `non-conversation`
  - non-conversation surfaces defer prompt-dependent `sendButton` checks and
    conversation-output checks (`assistantBubble`, `assistantRole`,
    `copyButton`)
  - diagnosis reports now include `surface` metadata and
    `failedRequiredChecks`
  - ChatGPT and Grok home/new-chat surfaces can pass doctor when account,
    composer, model/menu, file, and attachment evidence are present
  - conversation surfaces still require prompt/conversation-output selectors
- Live proof:
  - Grok default managed browser profile on port `45040` selected
    `https://grok.com/`, saw no blocking state, identified the expected Grok
    account, and returned selector `allPassed: true`
  - ChatGPT default managed browser profile on port `45065` selected
    `https://chatgpt.com/`, saw no blocking state, identified
    `ecochran76@gmail.com`, and returned selector `allPassed: true`
  - smoke Chrome roots were killed and two dead browser-state entries were
    pruned; `wsl-chrome-2/chatgpt` on port `45013` remained live
- Verification target:
  - `pnpm vitest run tests/inspector/doctor.test.ts tests/browser/profileDoctor.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 28 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0023-2026-04-21-mcp-team-run-write-parity.md`
- Goal: land the bounded MCP team-run write parity slice after the HTTP
  `/v1/team-runs` contract stabilized.
- Change:
  - `auracall-mcp` now registers `team_run`
  - the tool accepts the same bounded team-run create shape as HTTP:
    `teamId`, `objective`, optional prompt shaping fields, output contract,
    max turns, and bounded local-action policy
  - MCP-created runs use the existing configured team-run executor and the
    existing `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun` path
  - team/task schemas now accept `trigger = "mcp"`
  - MCP-created task specs are stamped with `requestedBy.kind = "mcp"` and
    `auracall-mcp team_run` context
  - build output now copies `configs/` into `dist/configs/` so the built MCP
    server can import configured executor/provider registry code
- Verification target:
  - `pnpm vitest run tests/mcp/teamRun.test.ts tests/cli/teamRunCommand.test.ts tests/teams.schema.test.ts tests/mcp.schema.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 29 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0024-2026-04-21-taskrunspec-public-contract-reconciliation.md`
- Goal: reassess the roadmap after HTTP and MCP team-run write parity and
  select the next bounded checkpoint.
- Decision:
  - do not widen into multi-runner/background-worker work yet
  - use the live flattened `TaskRunSpec` schema as the first public full-spec
    compatibility target
  - defer sectioned public envelopes until a versioned compatibility layer is
    justified
  - keep compact HTTP and MCP team-run create requests unchanged
  - next implementation slice should accept a prebuilt `taskRunSpec` only after
    `TaskRunSpecSchema` validation and conflict checks
- Scope:
  - roadmap/plan reassessment only
  - no runtime or operator behavior changes
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 30 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0025-2026-04-21-prebuilt-taskrunspec-acceptance.md`
- Goal: implement public prebuilt `taskRunSpec` acceptance against the live
  flattened schema selected in Plan 0024.
- Change:
  - HTTP `POST /v1/team-runs` now accepts either compact assignment fields or
    a prebuilt flattened `taskRunSpec`
  - MCP `team_run` now accepts the same prebuilt flattened `taskRunSpec`
  - prebuilt specs validate through `TaskRunSpecSchema`
  - top-level `teamId` may accompany a prebuilt spec only when it matches
    `taskRunSpec.teamId`
  - compact assignment fields cannot be mixed with `taskRunSpec`
  - prebuilt specs preserve assignment fields, ids, policies, trigger, and
    requested-by provenance through the existing
    `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun` chain
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp/teamRun.test.ts tests/cli/teamRunCommand.test.ts tests/teams.schema.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 31 | 2026-04-21

- Closed service/runner reassessment plan:
  `docs/dev/plans/0026-2026-04-21-service-runner-topology-reassessment.md`
- Goal: choose the next bounded checkpoint after compact and prebuilt public
  team-run writes landed on HTTP and MCP.
- Decision:
  - do not jump directly into multi-runner/background-worker execution
  - the current `ExecutionServiceHost` remains deliberately runner-scoped
  - existing claim-candidate ordering is read/evaluation support, not fleet
    scheduler authority
  - next implementation should add a read-only runner topology/readiness seam
    owned by `ExecutionServiceHost`
  - `/status` may project bounded local-server topology/readiness state, but
    `api serve` should still execute only through its configured local runner
  - keep reassignment loops, worker pools, and parallel execution deferred
- Scope:
  - roadmap/plan reassessment only
  - no runtime or operator behavior changes
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 32 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0027-2026-04-21-runner-topology-readiness-status.md`
- Goal: implement the read-only runner topology/readiness checkpoint selected
  by Plan 0026.
- Change:
  - added `ExecutionServiceHost.summarizeRunnerTopology()`
  - added `/status.runnerTopology`
  - topology readback reports the local execution owner, runner freshness,
    runner capability summaries, and aggregate active/stale/fresh/expired
    counts
  - topology readback is read-only and does not select claims, acquire leases,
    execute steps, or reassign work to another runner
- Verification target:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 33 | 2026-04-21

- Closed service/runner preflight plan:
  `docs/dev/plans/0028-2026-04-21-scheduler-authority-preflight.md`
- Goal: define scheduler authority before adding any background worker loop,
  reassignment mutation, or multi-runner execution behavior.
- Decision:
  - topology visibility is not assignment authority
  - claim-candidate ordering is not assignment authority
  - `api serve` remains a local runner, not a fleet scheduler
  - fresh active leases owned by active fresh runners block reassignment
  - expired stale/missing lease owners may be classified as potentially
    reassignable only by an explicit future scheduler-authority decision
  - browser-backed assignment must respect browser-service dispatcher
    exclusivity
  - parallelism still requires explicit orchestration semantics and remains
    out of scope
- Next implementation target:
  - read-only scheduler-authority evaluator
  - no persistence, scheduler mutation, worker loop, or automatic reassignment
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 34 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0029-2026-04-21-read-only-scheduler-authority-evaluator.md`
- Goal: implement the read-only scheduler-authority evaluator selected by
  Plan 0028 without adding assignment mutation, reassignment, a worker loop, or
  a public HTTP surface.
- Change:
  - added `src/runtime/schedulerAuthority.ts`
  - added `evaluateStoredExecutionRunSchedulerAuthority(...)`
  - evaluator consumes queue projection, active lease state, persisted runner
    records, deterministic claim candidates, configured affinity, and optional
    local runner identity
  - evaluator returns one deterministic decision, reason, candidate evidence,
    selected runner evidence, active lease posture, future mutation label, and
    `mutationAllowed: false`
- Verification target:
  - `pnpm vitest run tests/runtime.schedulerAuthority.test.ts tests/runtime.claims.test.ts tests/runtime.inspection.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm exec biome lint src/runtime/schedulerAuthority.ts tests/runtime.schedulerAuthority.test.ts --max-diagnostics 80`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 35 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0030-2026-04-21-runtime-inspection-scheduler-authority.md`
- Goal: expose the Plan 0029 scheduler-authority evaluator through existing
  runtime inspection without adding scheduler mutation, worker loops,
  reassignment, lease acquisition, or a new route.
- Change:
  - added `authority=scheduler` to `GET /v1/runtime-runs/inspect`
  - added optional `inspection.schedulerAuthority`
  - runtime inspection passes the queried `runnerId` as local scheduler
    context when provided, otherwise the server-local runner id when available
  - user-facing endpoint/testing docs now describe the opt-in and read-only
    posture
- Verification target:
  - `pnpm vitest run tests/runtime.schedulerAuthority.test.ts tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 36 | 2026-04-21

- Closed service/runner plan:
  `docs/dev/plans/0031-2026-04-21-cli-runtime-inspection-scheduler-authority.md`
- Goal: expose existing read-only scheduler-authority evidence through the
  operator CLI before designing any mutation.
- Change:
  - added `--authority scheduler` to `auracall api inspect-run`
  - passed `includeSchedulerAuthority` into runtime inspection
  - formatter now renders a compact `Scheduler authority` section with
    decision, reason, mutation posture, selected/local runner, future mutation,
    candidate count, and active lease posture
  - JSON output remains the full underlying payload
- Verification target:
  - `pnpm vitest run tests/cli/runtimeInspectionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm exec biome lint src/cli/runtimeInspectionCommand.ts tests/cli/runtimeInspectionCommand.test.ts bin/auracall.ts --max-diagnostics 40`
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 37 | 2026-04-21

- Closed service/runner design plan:
  `docs/dev/plans/0032-2026-04-21-scheduler-mutation-design.md`
- Goal: define the first scheduler-mutation shape before adding assignment or
  reassignment behavior.
- Decision:
  - first mutation target is explicit single-run operator control:
    `schedulerControl.action = "claim-local-run"`
  - implementation should live under `ExecutionServiceHost`; HTTP should only
    map `POST /status` payload/result
  - mutation must be gated by the read-only scheduler-authority evaluator
  - v1 may claim or reassign only to the server-local runner
  - fresh active leases, still-active expired owners, non-local selected
    runners, capability mismatches, and not-ready/human-blocked runs must
    reject
  - browser-backed claims still execute through the normal stored-step
    executor and browser-service dispatcher path
- Verification target:
  - `pnpm run plans:audit`
  - `git diff --check`

## Turn 38 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0033-2026-04-21-scheduler-local-claim-control.md`
- Goal: implement the first bounded scheduler mutation without adding fleet
  scheduling.
- Changes:
  - `ExecutionServiceHost` now supports
    `schedulerControl.action = "claim-local-run"`
  - existing `POST /status` maps `schedulerControl` payloads/results
  - local claim acquires a lease only when scheduler authority selects the
    server-local runner
  - expired stale/missing-owner leases may be reassigned only to the
    server-local runner
  - successful mutation emits a bounded scheduler-control runtime event
  - revision-check conflicts return `status = "conflict"` without mutation
- Validation so far:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts --testNamePattern "scheduler"`
  - `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "scheduler-authorized local run through POST /status|scheduler authority"`
- Closeout target:
  - focused scheduler/runtime/http suites without filters
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 33`
  - `git diff --check`

## Turn 39 | 2026-04-21

- Goal: broaden closeout validation after Plan 0033.
- Findings:
  - scheduler/runtime/http focused suites were already green
  - full `pnpm test` initially exposed deterministic non-scheduler failures in
    stale browser Pro alias expectations, dry-run cookie-copy copy, Windows
    Chrome lifecycle ownership test isolation, mocked llmService file-cache
    write-spacing, and cache-only Gemini CLI target resolution
- Fixes:
  - aligned the stale browser Pro alias test with the current stable ChatGPT
    Pro browser label
  - aligned dry-run cookie-copy expectation with current source-profile copy
    wording
  - isolated the Windows Chrome ownership test from real managed profile state
  - disabled live provider guard delays in mocked file-cache unit tests
  - kept cache-only CLI context/export paths from resolving live browser
    targets
- Validation:
  - `pnpm test`
  - `pnpm run check`
- Remaining closeout:
  - `pnpm run plans:audit -- --keep 33`
  - `git diff --check`

## Turn 40 | 2026-04-21

- Closed checkpoint:
  `docs/dev/plans/0034-2026-04-21-scheduler-roadmap-checkpoint.md`
- Goal: decide the next scheduler slice after `claim-local-run`.
- Decision:
  - keep `claim-local-run` as explicit single-run operator control
  - do not add fleet scheduling, background worker loops, non-local assignment,
    or release-and-reclaim follow-through
  - next implementation should let targeted drain execute a run whose active
    lease is already owned by the same server-local runner
  - preserve the existing `ExecutionServiceHost -> stored-step executor ->
    browser-service dispatcher` ownership path
- Verification target:
  - `pnpm run plans:audit -- --keep 34`
  - `git diff --check`

## Turn 41 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0035-2026-04-21-local-owned-active-lease-drain.md`
- Goal: add the explicit execution follow-through for a scheduler-claimed local
  run without adding a scheduler loop.
- Change:
  - `executeStoredExecutionRunOnce(...)` can now reuse an existing active lease
    when the lease is still present and owned by the requested execution owner
  - existing-lease execution heartbeats that lease before step execution and
    releases the same lease on completion/failure/cancellation
  - `ExecutionServiceHost` targeted drain now executes runnable work when the
    active lease owner is the configured server-local runner
  - foreign active leases still skip
- Verification so far:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts --testNamePattern "scheduler-claimed|foreign active lease|scheduler" --maxWorkers 1`
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/runtime.runner.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser-service/portSelection.test.ts --maxWorkers 1`
  - `pnpm test`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 35`
  - `git diff --check`

## Turn 42 | 2026-04-21

- Closed checkpoint:
  `docs/dev/plans/0036-2026-04-21-scheduler-phase-closeout.md`
- Goal: decide whether to add a compound claim-and-drain scheduler control
  after Plan 0035 made targeted drain consume local-owned active leases.
- Decision:
  - do not add `claim-and-drain-local-run` now
  - keep the explicit operator flow:
    inspect scheduler authority, `claim-local-run`, then targeted `drain-run`
    when immediate execution is desired
  - treat the scheduler local-control phase as closed unless a concrete
    operator workflow shows the two-step control is too noisy or error-prone
  - keep fleet scheduling, background worker loops, non-local assignment,
    parallel execution, and browser dispatcher bypass deferred
- Verification target:
  - `pnpm run plans:audit -- --keep 36`
  - `git diff --check`

## Turn 43 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0037-2026-04-21-team-run-background-drain-parity.md`
- Goal: return to the non-scheduler service/runner lane and remove the
  remaining synchronous team-run execution coupling from HTTP background-drain
  mode.
- Change:
  - `TeamRuntimeBridge` now supports `drainAfterCreate = false`
  - default bridge behavior remains synchronous for CLI/MCP and existing tests
  - `api serve` constructs the team runtime without draining when background
    drain is enabled
  - HTTP `POST /v1/team-runs` then schedules the existing server-owned
    background drain, matching direct `/v1/responses`
  - background-drain disabled mode keeps the existing synchronous one-request
    behavior
- Verification so far:
  - `pnpm vitest run tests/teams.runtimeBridge.test.ts --testNamePattern "without draining" --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "team-run create before execution|bounded team run over HTTP" --maxWorkers 1`
  - `pnpm run check`
- Closeout target:
  - broader HTTP/team-runtime tests
  - `pnpm run plans:audit -- --keep 37`
  - `git diff --check`

## Turn 44 | 2026-04-21

- Closed roadmap checkpoint:
  `docs/dev/plans/0038-2026-04-21-service-runner-roadmap-checkpoint.md`
- Goal: decide whether to open another service/runner implementation slice
  after scheduler local-control closeout and HTTP team-run background-drain
  parity.
- Decision:
  - do not open another service/runner architecture implementation slice now
  - no fresh route-neutral runtime mutation was found still owned directly by
    HTTP
  - keep HTTP responsible for listener lifecycle, request parsing,
    background-drain timer state, pause/resume control mapping, and response
    projection
  - keep route-neutral runner lifecycle, queued drain, recovery, operator
    controls, scheduler-local claim, and targeted drain under
    `ExecutionServiceHost`
  - pause multi-runner execution, background worker pools, non-local
    assignment, parallel team execution, and compound scheduler controls
- Verification target:
  - `pnpm run plans:audit -- --keep 38`
  - `git diff --check`
- Next action: integration hygiene over the accumulated dirty worktree before
  selecting the next implementation lane.

## Turn 45 | 2026-04-21

- Goal: run the integration-hygiene pass selected by Plan 0038.
- Worktree inventory:
  - current branch is `main`
  - dirty state spans policy/closeout docs, browser-service dispatcher and
    selector diagnosis, MCP/team-run writes, public `TaskRunSpec`
    compatibility, scheduler/service-host ownership, HTTP team-run
    background-drain parity, and roadmap/runbook hygiene
  - review should not treat the entire dirty worktree as one logical change
- Validation:
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 38`
  - `git diff --check`
- Recommended review/commit sequence:
  - closeout policy/docs contract
  - browser-service operation dispatcher and selector diagnosis
  - MCP/team-run write parity and public `TaskRunSpec` acceptance
  - runner topology, scheduler authority, local claim, and local-owned drain
  - HTTP team-run background-drain parity
  - roadmap/runbook/journal/fixes-log reconciliation

## Turn 46 | 2026-04-21

- Closed implementation plan:
  `docs/dev/plans/0039-2026-04-21-raw-devtools-dispatcher-fencing.md`
- Goal: remove the normal raw DevTools port bypass from browser-service dev
  tooling.
- Change:
  - operation dispatcher keys now support raw DevTools endpoints such as
    `devtools:127.0.0.1:45013`
  - browser operation records preserve optional `rawDevTools` endpoint metadata
  - `browser-tools --port <port>` now acquires a port-scoped dispatcher lock
    before resolving or connecting to the endpoint
  - AuraCall-managed browser-tools commands still prefer the managed browser
    profile dispatcher key when profile/target context is available
- Remaining follow-up:
  - legacy direct-CDP verification scripts under `scripts/` remain
    unsafe/debug-only until routed through browser-service tooling or fenced
    behind an explicit guard
- Verification target:
  - `pnpm vitest run tests/browser-service/operationDispatcher.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 39`
  - `git diff --check`

## Turn 47 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0040-2026-04-22-direct-cdp-script-guard.md`
- Goal: fence legacy direct-CDP development scripts while preserving explicit
  escape hatches for debugging.
- Change:
  - added `scripts/raw-devtools-guard.ts`
  - guarded all TypeScript scripts that directly import
    `chrome-remote-interface` or call `puppeteer.connect(...)`
  - scripts now require either `--allow-raw-cdp` or
    `AURACALL_ALLOW_RAW_CDP=1` before making raw CDP connections
  - the flag is consumed before positional argument parsing so existing script
    arguments remain stable
- Verification target:
  - `pnpm vitest run tests/scripts/rawDevtoolsGuard.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 40`
  - `git diff --check`

## Turn 48 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0041-2026-04-22-browser-service-script-family.md`
- Goal: group browser-service-related scripts without breaking historical root
  script paths.
- Change:
  - added `scripts/browser-service/` wrapper copies for generic browser tools,
    launch/test helpers, and Grok/browser verification helpers
  - retained all existing `scripts/<name>.ts` entrypoints for compatibility
  - documented that provider-dependent Grok helpers stay outside
    `packages/browser-service` because they import AuraCall app/provider code
  - added wrapper-shape tests to keep the copied family as thin routing, not
    duplicated implementation
- Verification target:
  - `pnpm vitest run tests/scripts/browserServiceWrappers.test.ts tests/scripts/rawDevtoolsGuard.test.ts`
  - `pnpm run check`
  - wrapper raw-CDP refusal smoke:
    `pnpm tsx scripts/browser-service/test-remote-chrome.ts 127.0.0.1 1`
  - `pnpm run plans:audit -- --keep 41`
  - `git diff --check`

## Turn 49 | 2026-04-22

- Closed reconciliation plan:
  `docs/dev/plans/0042-2026-04-22-open-execution-plan-reconciliation.md`
- Goal: align the open execution authorities after scheduler local-control,
  service/runner ownership, and browser-service maintenance checkpoints all
  closed.
- Change:
  - updated `0004` so it no longer names scheduler-control implementation as
    the next action after Plans 0033-0036 already shipped that phase
  - updated `0001` and ROADMAP to keep service/runner architecture expansion
    paused unless a reproduced ownership/readback mismatch or new product
    requirement justifies reopening it
  - recorded the browser-service maintenance exception as closed through
    Plans 0039-0041
- Verification target:
  - `pnpm run plans:audit -- --keep 42`
  - `git diff --check`

## Turn 50 | 2026-04-22

- Closed integration fix:
  `docs/dev/plans/0043-2026-04-22-browser-service-wrapper-build-compatibility.md`
- Goal: finish the integration/review pass selected by Plan 0042.
- Finding:
  - `pnpm run check` passed, but `pnpm run test:mcp` failed in its build step
    because wrapper scripts imported root scripts with explicit `.ts`
    extensions
  - base `tsconfig.json` permits those imports for no-emit typecheck, while
    `tsconfig.build.json` does not permit them for emitted builds
- Change:
  - changed `scripts/browser-service/*.ts` wrappers to extensionless dynamic
    imports
  - updated wrapper-shape tests to require extensionless imports
- Verification target:
  - `pnpm vitest run tests/scripts/browserServiceWrappers.test.ts tests/scripts/rawDevtoolsGuard.test.ts`
  - `pnpm tsx scripts/browser-service/test-remote-chrome.ts 127.0.0.1 1`
  - `pnpm tsx scripts/browser-service/browser-tools.ts --help`
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit -- --keep 43`
  - `git diff --check`

## Turn 51 | 2026-04-22

- Policy update:
  `docs/dev/policies/0013-commit-and-push-cadence.md`
- Goal: make commit/push cadence operational after the local stack grew large.
- Change:
  - commit validated slices by default, including docs-only policy/roadmap
    slices
  - push after green integration checkpoints, before changing lanes, before
    handoff, and before ending a session with more than a small local-only stack
  - treat local `main` being more than 10 commits ahead or carrying unpushed
    validated work from a prior day as a handoff risk
  - default posture: end-of-slice commit, end-of-turn push for shared-ready
    commits, and exact blocker notes when push cannot happen
- Verification target:
  - `pnpm run plans:audit -- --keep 43`
  - `git diff --check`

## Turn 52 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0044-2026-04-22-team-run-cli-resolver-shadow-fix.md`
- Goal: fix repo-dogfood regression where `auracall teams run` returned a
  planned runtime run without draining the browser-backed Grok step.
- Finding:
  - Commander supplied default `browserModelStrategy = select`
  - transitional CLI service-alias mirroring created a partial target
    `runtimeProfiles.default`
  - target `runtimeProfiles` shadowed bridge `profiles`, so local-runner
    capability projection did not see `auracall-grok-auto`
- Change:
  - transitional CLI service aliases now write into `runtimeProfiles` only for
    target-shaped configs and into `profiles` for bridge-shaped configs
  - added resolver coverage for bridge-shaped configs with Commander-style
    browser defaults
- Verification target:
  - `pnpm vitest run tests/schema/resolver.test.ts tests/cli/teamRunCommand.test.ts`
  - narrow Grok CLI dogfood run
  - `pnpm run test:live:team:baseline`
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit -- --keep 44`
  - `git diff --check`

## Turn 53 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0045-2026-04-22-repo-dogfood-user-runtime-install.md`
- Goal: do one more bounded repo dogfood pass, then add a user-scoped runtime
  install path independent of the checkout.
- Dogfood result:
  - config/profile/session operator reads passed
  - Grok and ChatGPT browser doctors passed with signed-in identities and
    selector checks
  - Gemini local doctor passed with signed-in managed-profile state and no
    active Gemini DevTools session
  - local API server status exposed the active local runner and background
    drain
  - HTTP team-run create/readback completed with
    `AURACALL_HTTP_DOGFOOD_OK`
- Change:
  - added `pnpm run install:user-runtime`
  - added `scripts/install-user-runtime.ts`
  - added `docs/user-scoped-runtime.md`
  - linked the repo dogfood install command from `README.md`
- Verification target:
  - repo dogfood commands listed in Plan 0045
  - dry-run installer smoke
  - real user-scoped install smoke
  - installed `~/.local/bin/auracall --version`
  - installed `~/.local/bin/auracall config show --team auracall-solo --json`
  - `pnpm run check`
  - `pnpm test`
  - `pnpm run test:mcp`
  - `pnpm run plans:audit -- --keep 45`
  - `git diff --check`

## Turn 54 | 2026-04-22

- Closed dogfood plan:
  `docs/dev/plans/0046-2026-04-22-installed-runtime-dogfood.md`
- Goal: prove the user-scoped installed runtime works from a neutral working
  directory and is suitable for daily operator use.
- Result:
  - installed config/profile/status reads passed from
    `/tmp/auracall-installed-dogfood`
  - installed Grok doctor passed on the default managed browser profile
  - installed ChatGPT `wsl-chrome-2` doctor attached to the active managed
    browser profile
  - installed ChatGPT team run returned `AURACALL_INSTALLED_CHATGPT_OK`
  - installed Gemini doctor stayed passive and confirmed signed-in managed
    profile state
  - installed `api serve --port 8099` returned `/status.ok = true` and stopped
    cleanly
- Follow-up:
  - `/status` is useful but too noisy after accumulated stale runner records;
    keep that as a bounded operator-readability improvement, not a blocker for
    installed-runtime dogfooding.
- Verification target:
  - installed runtime commands listed in Plan 0046
  - `pnpm run plans:audit -- --keep 46`
  - `git diff --check`

## Turn 55 | 2026-04-22

- Closed implementation plan:
  `docs/dev/plans/0047-2026-04-22-status-runner-topology-compaction.md`
- Goal: keep installed-runtime `/status` readable after long-lived dogfood
  environments accumulate stale runner records.
- Change:
  - plain `/status` now lists only the local execution owner plus fresh/active
    runners under `runnerTopology.runners`
  - `runnerTopology.metrics` still counts all stored runners and now reports
    displayed/omitted runner counts
  - `GET /status?runnerTopology=full` preserves the full stored runner list for
    forensic debugging
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/runtime.serviceHost.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 47`
  - `git diff --check`
  - installed runtime `/status` and `/status?runnerTopology=full` smoke on
    port 8099

## Turn 56 | 2026-04-22

- Closed drift checkpoint:
  `docs/dev/plans/0048-2026-04-22-grok-model-drift-checkpoint.md`
- Opened implementation plan:
  `docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md`
- Trigger:
  - installed-runtime parallel Gemini/Grok API image dogfood did not produce
    images
  - Gemini returned a text-only refusal through the current API path
  - Grok used stale 4.1 canonicalization instead of current Grok 4.20
- Change:
  - added current `grok-4.20` known model key mapped to
    `grok-4.20-reasoning`
  - kept explicit `grok-4.1` as a legacy key
  - changed plain Grok aliases and setup/wizard defaults to current Grok
  - documented that Grok Imagine and full CLI/API/MCP media generation still
    need the shared media-generation contract in Plan 0049
- Verification target:
  - targeted Grok/options/browser setup/OpenRouter/multimodel tests
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 49`
  - `git diff --check`

## Turn 57 | 2026-04-23

- Opened planning slice:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Trigger:
  - Gemini and ChatGPT expose fast-changing chat-workbench capabilities that
    do not fit the narrow media-generation contract.
  - Gemini and ChatGPT both expose Deep Research-style tools.
  - ChatGPT exposes apps/connectors broadly and skills on business-plan
    accounts.
  - Gemini exposes media tools such as image/music/video through the tool
    drawer.
- Decision:
  - keep `media_generation` as the simple first-class resource for common
    image/music/video requests
  - add a separate provider-neutral workbench capability model for discovery,
    availability, account gating, and eventual invocation
  - do discovery/readback before broad invocation, because provider toolsets
    are account-tier, region, UI, and rollout dependent
- Verification target:
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 58 | 2026-04-23

- Continued implementation plan:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: make service discovery/reporting a regular API/MCP workflow for
  volatile provider workbench tools.
- Change:
  - added shared workbench capability types/schema/catalog/service
  - added local API route `GET /v1/workbench-capabilities`
  - added MCP tool `workbench_capabilities`
  - static catalog includes Gemini media/research and ChatGPT search/canvas,
    Deep Research, apps, and skills with conservative availability
  - live browser/provider discovery remains a later slice
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/mcp.schema.test.ts`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 59 | 2026-04-23

- Continued implementation plan:
  `docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md`
- Goal: add live read-only Gemini capability reporting without introducing a
  second Gemini DOM scraper.
- Change:
  - added Gemini feature-signature to workbench-capability mapping
  - added static Gemini Canvas capability
  - wired configured `api serve` discovery so
    `GET /v1/workbench-capabilities?provider=gemini` can merge live managed
    browser evidence
  - kept unfiltered reports static/cheap to avoid launching every provider
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/mcp.schema.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 50`
  - `git diff --check`

## Turn 60 | 2026-04-23

- Opened and closed maintenance plan:
  `docs/dev/plans/0051-2026-04-23-runtime-browser-diagnostics.md`
- Trigger:
  - live provider status debugging needs the selected target, DOM state, and
    screenshot while a chat is executing, without raw CDP escape hatches or
    page churn
- Change:
  - added opt-in runtime browser diagnostics to HTTP, CLI, and MCP runtime
    inspection
  - diagnostics are active-run only and report target URL/title/id, document
    readiness, visible control counts, provider evidence, and stored PNG path
- Verification target:
  - `pnpm vitest run tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts tests/mcp.runtimeInspect.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 51`
  - `git diff --check`

## Turn 61 | 2026-04-23

- Opened and closed maintenance plan:
  `docs/dev/plans/0052-2026-04-23-status-browser-diagnostics-parity.md`
- Trigger:
  - dogfood showed direct Gemini response runs can complete through the
    cookie/web-client path before runtime diagnostics can observe a managed
    browser workbench
  - Gemini browser media generation is the long-lived tab path with recorded
    `tabTargetId`, so diagnostics belong on status polling too
- Change:
  - added `diagnostics=browser-state` to generic run status and
    media-generation status
  - added matching MCP input support for `run_status` and
    `media_generation_status`
  - media diagnostics prefer the provider `tabTargetId` from metadata or
    prompt-submission timeline details
- Verification target:
  - `pnpm vitest run tests/mediaBrowserDiagnostics.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.runStatus.test.ts tests/mcp.schema.test.ts`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 52`
  - guarded live Gemini browser media diagnostics smoke:
    - `medgen_4bf95e87bb594929aa51578ca7a2564a` proved
      `status?diagnostics=browser-state` can reach the Gemini browser family
    - the first snapshot occurred before prompt submission and the media job
      later failed with `media_generation_failed`, so the implementation now
      requires a recorded `tabTargetId` before reporting observed media
      browser diagnostics
  - `git diff --check`

## Turn 62 | 2026-04-23

- Closed implementation plan:
  `docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md`
- Goal: finish the browser mutation control-plane boundary after Gemini media
  dogfood showed root-route fallback needed attribution.
- Change:
  - browser-service mutation helpers now provide the product-code control
    points for navigation, reload, target open/reuse, and location fallback
  - provider and legacy product paths route through those helpers or carry
    mutation audit context
  - browser diagnostics can report recent mutation history
  - static enforcement rejects direct product browser mutations outside
    approved browser-service control points
  - raw mutating CDP scripts remain available only through the explicit
    `--allow-raw-cdp` / `AURACALL_ALLOW_RAW_CDP=1` guard and
    `RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST`
- Verification target:
  - `pnpm vitest run tests/browser/browserMutationControlPlane.test.ts tests/scripts/rawDevtoolsGuard.test.ts tests/scripts/browserServiceWrappers.test.ts`
  - broader targeted browser-control tests
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 53`
  - `git diff --check`

## Turn 63 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: give operators direct browser evidence for Grok Imagine gating during
  workbench capability discovery, without raw CDP access or prompt submission.
- Change:
  - added `diagnostics=browser-state` / `--diagnostics browser-state` to
    workbench capability reports
  - wired the diagnostics option through CLI, local API, MCP, and the shared
    workbench capability service
  - reused browser-service diagnostics storage and screenshot capture
  - added Grok Imagine provider evidence to browser diagnostics using the
    read-only Grok feature probe
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts tests/browser/grokAdapter.test.ts`
  - live read-only dogfood:
    - `pnpm tsx bin/auracall.ts capabilities --target grok --diagnostics browser-state --json`
    - selected the current managed Grok project-chat tab, captured target
      URL/title plus a stored PNG screenshot, and kept Imagine capabilities
      conservative `unknown`
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 64 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: add a read-only Grok Imagine entrypoint inspection path before any
  invocation work.
- Change:
  - added `entrypoint=grok-imagine` / `--entrypoint grok-imagine` to workbench
    capability requests
  - routed explicit Grok Imagine discovery through `https://grok.com/imagine`
    using existing browser-service target open/reuse control-plane attribution
  - preserved the explicit entrypoint tab long enough for browser diagnostics
  - split generic document diagnostics from provider-specific evidence so a
    provider probe failure cannot erase target/document state
  - fixed the Grok feature probe syntax regression and added a parse guard test
- Verification target:
  - `pnpm vitest run tests/workbenchCapabilities.test.ts tests/http.workbenchCapabilities.test.ts tests/mcp.workbenchCapabilities.test.ts tests/cli/workbenchCapabilitiesCommand.test.ts tests/browser/grokAdapter.test.ts tests/mcp.schema.test.ts`
  - live read-only dogfood:
    - `pnpm tsx bin/auracall.ts capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
    - observed `https://grok.com/imagine`, `Imagine - Grok`, image/video
      mode evidence, account-gated image/video capability reports, and a
      stored PNG screenshot
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 65 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: add provider-owned read-only Grok Imagine run-state/readback evidence
  before any prompt-submission work.
- Change:
  - extended the Grok feature probe with conservative `run_state` classification
  - captured visible pending indicators, terminal image/video DOM media,
    media URLs, and download/save/open/share/copy controls
  - preserved normalized evidence in Grok workbench capability metadata for
    CLI/API/MCP consumers
  - kept discovery read-only with no prompt submission or generation-control
    clicks
- Verification target:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/workbenchCapabilities.test.ts --maxWorkers 1`
  - live read-only dogfood:
    - `pnpm tsx bin/auracall.ts capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
    - observed `run_state = account_gated`, `pending = false`,
      `terminal_image = false`, and `terminal_video = false`; public gallery
      media stayed page evidence instead of terminal generated output
  - `pnpm run check`
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 66 | 2026-04-24

- Continued implementation plan:
  `docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md`
- Goal: wire the first guarded Grok browser image invocation path without
  allowing account-gated prompt submission.
- Change:
  - added Grok browser media executor support for image generation behind
    `grok.media.imagine_image`
  - media service now preflights Grok browser image requests through the
    explicit `/imagine` entrypoint with browser-state diagnostics
  - account-gated/unavailable Grok Imagine stops with
    `media_capability_unavailable` before the executor is invoked
  - available-account path pins the `/imagine` tab, emits prompt/run-state
    timeline events, polls provider run state, and materializes terminal remote
    image media
  - Grok video remains gated as not implemented
- Verification target:
  - `pnpm vitest run tests/mediaGeneration.test.ts tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGenerationGeminiBrowserExecutor.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/mediaGeneration.test.ts tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGenerationGeminiBrowserExecutor.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.schema.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/browserMutationControlPlane.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - local API gated live request:
    - `pnpm tsx bin/auracall.ts api serve --port 18081`
    - `curl -s http://127.0.0.1:18081/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"grok","mediaType":"image","transport":"browser","prompt":"Generate an image of an asphalt secret agent"}'`
    - returned `medgen_8744a7d69a314433bc7d7e67615391e9` with
      `media_capability_unavailable`, `availability = account_gated`, and no
      `prompt_submitted` timeline event
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 54`
  - `git diff --check`

## Turn 67 | 2026-04-25

- Continued implementation plan:
  `docs/dev/plans/0059-2026-04-25-browser-operation-queue-observability.md`
- Goal: make browser-operation queue/readiness visible through the same
  browser-state diagnostics operators already use for runtime/run status.
- Change:
  - added a bounded browser-operation queue observation log for response
    browser execution
  - recorded `queued`, `acquired`, and `busy-timeout` observations from the
    queued acquisition path
  - projected recent queue observations into browser-state diagnostics next to
    browser mutation history
  - rendered queue event count and latest queue event in CLI runtime
    inspection output
- Verification target:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/cli/runtimeInspectionCommand.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 59`
  - `git diff --check`

## Turn 68 | 2026-04-25

- Continued implementation plan:
  `docs/dev/plans/0060-2026-04-25-browser-operation-queue-status-proof.md`
- Goal: prove browser-operation queue diagnostics survive generic API and MCP
  run-status surfaces without live provider churn.
- Change:
  - added local API coverage for
    `/v1/runs/{run_id}/status?diagnostics=browser-state` preserving a latest
    queued browser-operation event
  - added MCP `run_status` coverage for the same diagnostics shape
  - made the MCP response-run browser diagnostics probe injectable for
    controlled tests while preserving the default live probe behavior
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp.runStatus.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 60`
  - `git diff --check`

## Turn 69 | 2026-04-25

- Continued implementation plan:
  `docs/dev/plans/0061-2026-04-25-grok-imagine-materialization-hardening.md`
- Goal: close the browser-service control-plane detour and return the active
  execution board to Grok Imagine materialization hardening.
- Change:
  - opened Plan 0061 as the bounded follow-up for Grok Imagine multi-image
    visible-tile materialization, default count `8`, preview-vs-full-quality
    download comparison evidence, and installed-runtime dogfood
  - updated `ROADMAP.md` so Plan 0061 is the selected active provider slice
    after the profile, fixed-port, queued-dispatch, and status-diagnostics
    browser-service proofs
  - kept xAI API media execution and Grok edit/reference workflows deferred to
    later bounded plans
- Verification target:
  - `pnpm run plans:audit -- --keep 61`
  - `git diff --check`

## Turn 70 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: return from lint-warning cleanup to lazy live follow and tighten the
  cooperative yield contract between routine mirrors and real browser work.
- Change:
  - queue observations now include the queued request owner as well as the
    active blocker
  - response browser execution, media generation, and mirror refresh requests
    write comparable queue-observation records
  - account-mirror collectors yield when response/media browser work queues
    behind an active lazy mirror, but do not yield only because another routine
    mirror refresh is queued
- Verification target:
  - `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/schedulerService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/mediaBrowserExecutor.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm vitest run tests/cli/runtimeInspectionCommand.test.ts tests/http.responsesServer.test.ts tests/mcp.runStatus.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `git diff --check`

## Turn 71 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: make lazy-live cooperative-yield evidence directly discoverable by
  operators without parsing the full `/status` payload.
- Change:
  - added `yieldCause` to yielded attachment continuation cursors
  - added compact scheduler-history projection with latest yield, queued work
    cause, resume cursor, and remaining detail surfaces
  - exposed the projection at
    `GET /v1/account-mirrors/scheduler/history`
  - projected latest yield summary through `auracall api status` helpers and
    MCP `api_status`
- Verification target:
  - `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/schedulerService.test.ts tests/accountMirror/schedulerLedger.test.ts tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm run typecheck`
  - `pnpm run lint`

## Turn 72 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: dogfood the compact lazy-yield readback through a local API runtime
  without provider/browser churn.
- Change:
  - added `scripts/smoke-account-mirror-scheduler-history.ts`
  - added `pnpm run smoke:scheduler-history`
  - documented the smoke in `docs/testing.md`, `docs/mcp.md`, and Plan 0063
- Proof:
  - `pnpm run smoke:scheduler-history`
  - output included:
    - `latestYield.owner=media-generation:chatgpt:image`
    - `latestYield.remaining=4`
    - `latestYield.nextConversationIndex=3`
- Verification target:
  - `pnpm run smoke:scheduler-history`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run install:user-runtime`
  - installed `auracall api mirror-complete --help`
  - installed `auracall api mirror-completion-status --help`
  - `git diff --check`

## Turn 73 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: dogfood one low-churn live lazy-follow pass against the bound default
  ChatGPT profile, then verify scheduler history and operator status reflect
  the completed pass.
- Proof:
  - dry-run preflight on port `18091` showed default ChatGPT
    `eligible`, `in_progress`, and 68 remaining detail surfaces
  - execute-enabled `api serve` on port `18092` plus one `run-once` completed
    from `2026-05-01T00:34:10.644Z` to `2026-05-01T00:37:19.705Z`
  - refresh completed for `chatgpt/default`, detected identity
    `ecochran76@gmail.com`, detected account level `Business`
  - metadata counts after the pass were projects `5`, conversations `74`,
    artifacts `39`, files `24`, media `0`
  - attachment inventory advanced to `nextConversationIndex: 7`, scanned 6
    conversations, and left 67 remaining detail surfaces
  - scheduler history reported `refresh-completed`, `yielded: false`,
    `backpressureReason: none`, and `latestYield: null`
  - `auracall api status --port 18092` reported scheduler `idle`,
    posture `healthy`, and latest lazy mirror action `refresh-completed`
  - browser-operation locks were empty before and after the pass
- Verification target:
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 81 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: make live-follow health directly assertable by operators and MCP
  callers.
- Change:
  - added derived `liveFollow.severity` with values `healthy`,
    `backpressured`, `paused`, and `attention-needed`
  - `auracall api status` now includes `severity=<value>` in the
    `Live follow health:` line and supports
    `--expect-live-follow-severity`
  - MCP `api_status` exposes `liveFollow.severity` and supports
    `expectedLiveFollowSeverity`
  - the no-browser completion-control smoke now asserts `paused` severity
    after pause and `attention-needed` severity after cancel
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - installed `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-account-mirror-completion-control.js`
  - installed `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-account-mirror-completion-control.js`

## Turn 82 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: bring the CLI/MCP live-follow severity signal into `/ops/browser`.
- Change:
  - added dashboard-side live-follow health derivation from `/status`
  - rendered `Live Follow Severity` in the Server panel
  - included `health.severity` in the Mirror Live Follow JSON projection
  - recorded a follow-up to centralize the derivation in shared status code
- Verification target:
  - `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "browser operator dashboard"`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`

## Turn 83 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: centralize live-follow health derivation for CLI, MCP, HTTP, and
  dashboard surfaces.
- Change:
  - added shared live-follow health helper
  - moved CLI status health-line construction to the shared helper
  - added `/status.liveFollow` to the HTTP status payload
  - changed `/ops/browser` to consume `status.liveFollow` instead of duplicating
    severity logic in client-side JavaScript
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/http.responsesServer.test.ts --testNamePattern "api status|browser operator dashboard|completion operations|status with recovery"`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 84 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add deterministic parity coverage for shared live-follow health.
- Change:
  - added `scripts/smoke-live-follow-health-parity.ts`
  - added `pnpm run smoke:live-follow-health`
  - the smoke compares HTTP `/status.liveFollow`, CLI status, MCP
    `api_status`, and `/ops/browser` from one fixture-backed local API server
  - the fixture includes both yielded scheduler history and a paused
    live-follow completion, with no provider or browser dispatcher access
- Verification target:
  - `pnpm run smoke:live-follow-health`
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 85 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add deterministic restart coverage for hydrated live-follow completion
  status.
- Change:
  - added `scripts/smoke-account-mirror-completion-hydration.ts`
  - added `pnpm run smoke:completion-hydration`
  - the smoke seeds a paused live-follow completion into a temp cache, starts
    the API twice over the same cache, and verifies `/status`, CLI status, and
    MCP `api_status` after restart
  - the fixture uses no provider or browser dispatcher access
- Verification target:
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 86 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: put live-follow completion controls on the regular status preflight
  path.
- Change:
  - added `accountMirrorCompletion` pause/resume/cancel support to
    `POST /status`
  - changed `/ops/browser` Mirror Live Follow controls to post to `/status`
  - updated `pnpm run smoke:completion-control` to prove status-path pause,
    CLI resume, MCP cancel, and status readback without provider/browser work
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 87 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add deterministic `/ops/browser` completion-control coverage.
- Change:
  - added `scripts/smoke-ops-browser-completion-control.ts`
  - added `pnpm run smoke:ops-browser-control`
  - the smoke verifies dashboard button wiring and the `POST /status`
    `accountMirrorCompletion` control path against a fixture completion service
  - the fixture uses no provider or browser dispatcher access
- Verification target:
  - `pnpm run smoke:ops-browser-control`
  - `pnpm run smoke:completion-control`
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 88 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add installed-runtime `/ops/browser` dashboard/status contract
  expectation support.
- Change:
  - added `auracall api ops-browser-status`
  - the command reads `/ops/browser`, verifies Mirror Live Follow control
    wiring uses `POST /status` with `accountMirrorCompletion`, reads linked
    `/status`, and applies live-follow/completion-count expectations
  - the browser-ops deterministic smoke now exercises that helper against its
    fixture server
- Verification target:
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm run smoke:ops-browser-control`
  - `pnpm run smoke:completion-control`
  - `pnpm run smoke:completion-hydration`
  - `pnpm run smoke:live-follow-health`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 89 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add MCP parity for `/ops/browser` dashboard/status contract
  expectation support.
- Change:
  - added MCP `api_ops_browser_status`
  - the tool shares the CLI helper path for `/ops/browser` dashboard contract
    assertions and linked `/status` live-follow/completion-count expectations
  - the browser-ops deterministic smoke now exercises API, CLI, and MCP
    dashboard/status contract paths against its fixture server
- Verification target:
  - `pnpm vitest run tests/mcp.apiOpsBrowserStatus.test.ts tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiStatus.test.ts tests/mcp.schema.test.ts`
  - `pnpm run smoke:ops-browser-control`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`

## Turn 90 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: add installed-runtime MCP protocol smoke coverage for
  `api_ops_browser_status`.
- Change:
  - added `scripts/smoke-ops-browser-mcp.ts`
  - added `pnpm run smoke:mcp-ops-browser`
  - the smoke starts an injected local API fixture, pauses live follow through
    `/status`, connects to installed `auracall-mcp`, verifies tool discovery,
    and calls `api_ops_browser_status`
  - release `operator-smoke` now runs both MCP status smokes
- Verification target:
  - `pnpm run smoke:mcp-ops-browser`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - installed `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-ops-browser-mcp.js`

## Turn 79 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Change:
  - added completion count expectation support to `auracall api status`
  - added matching MCP `api_status` inputs for active, paused, cancelled, and
    failed completion counts
  - extended the no-browser completion-control smoke to assert paused and
    cancelled counts through the compact status path
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`

## Turn 80 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Change:
  - added a structured `liveFollow` summary to API status CLI/MCP projections
  - `auracall api status` now prints one `Live follow health:` line combining
    scheduler posture, state, completion counts, backpressure, and latest yield
    evidence
  - MCP `api_status` includes the same live-follow health line in text output
    and structured content
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`

## Turn 78 | 2026-05-01

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Change:
  - added compact completion-control posture to `auracall api status`
  - MCP `api_status` now returns the same completion metrics, active
    operations, and recent controlled operations
  - the no-browser completion-control smoke checks the compact status
    projection in addition to HTTP/CLI/MCP controls
- Verification target:
  - `pnpm run smoke:completion-control`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 74 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: expose full compact lazy mirror scheduler history through regular
  operator surfaces, not only raw HTTP or the latest `api status` summary.
- Change:
  - added shared `readApiSchedulerHistoryForCli`
  - added `auracall api scheduler-history --port <port> [--limit <count>]`
  - added MCP `account_mirror_scheduler_history`
  - extended `pnpm run smoke:scheduler-history` to verify the new CLI helper
    and MCP tool alongside the existing HTTP route and `api_status` summary
- Verification target:
  - `pnpm vitest run tests/cli/apiSchedulerHistoryCommand.test.ts tests/mcp.accountMirrorSchedulerHistory.test.ts --maxWorkers 1 --testTimeout 15000`
  - `pnpm run smoke:scheduler-history`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 75 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: dogfood the new scheduler-history operator surfaces from the
  user-scoped installed runtime.
- Proof:
  - `pnpm run install:user-runtime` refreshed `~/.auracall/user-runtime` and
    wrappers under `~/.local/bin`
  - installed `~/.local/bin/auracall --version` reported `0.1.1`
  - installed `auracall api scheduler-history --help` exposed the new command
  - installed `api serve` on port `18093` loaded the persisted scheduler
    history with scheduler posture `scheduled`
  - installed `auracall api scheduler-history --port 18093 --limit 5` returned
    five entries, `latestYield: null`, and top entry
    `refresh-completed chatgpt/default backpressure=none yielded=false`
  - installed MCP `account_mirror_scheduler_history` returned the same top
    entry and remaining detail surfaces `67`
  - no browser-operation locks were present after shutdown
- Change:
  - added the scheduler-history route to the API startup endpoint banner after
    installed dogfood showed the route worked but was not listed there
- Verification target:
  - targeted CLI/MCP/API tests
  - `pnpm run smoke:scheduler-history`
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 76 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: resume the bound default ChatGPT lazy mirror from its saved attachment
  cursor until completeness reached zero remaining detail surfaces.
- Proof:
  - installed `api serve` ran on port `18094` with execute mode enabled and
    explicit refreshes used `queueTimeoutMs: 0`
  - starting state was `in_progress`, `nextConversationIndex: 13`, and 63
    remaining detail surfaces after the first explicit pass in this turn
  - cooldown-respecting explicit passes advanced the cursor through
    conversation indexes `19`, `25`, `31`, `37`, `43`, `45`, `51`, and finally
    `0`
  - final status at `2026-05-01T03:03:47.851Z` reported
    `mirrorCompleteness.state: complete`, zero remaining detail surfaces, and
    identity `ecochran76@gmail.com` on `Business`
  - final high-limit catalog metrics were projects `5`, conversations `76`,
    artifacts `374`, files `24`, media `0`
  - no browser-operation locks remained after shutdown
- Live observation:
  - the explicit-refresh cooldown and six-detail-read cap worked as intended
  - artifact-heavy conversations can exhaust the artifact row budget before
    all six detail reads complete; pass 7 scanned only two conversations but
    still added 80 artifacts
- Verification target:
  - final `GET /v1/account-mirrors/status?provider=chatgpt&runtimeProfile=default&explicitRefresh=true`
  - final `GET /v1/account-mirrors/catalog?provider=chatgpt&runtimeProfile=default&kind=all&limit=500`
  - `find ~/.auracall/browser-operations -maxdepth 1 -type f -name '*.json'`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 77 | 2026-04-30

- Continued implementation plan:
  `docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md`
- Goal: correct the default ChatGPT mirror assumptions after live dogfood
  showed the account has more than the bounded visible rail snapshot.
- Change:
  - ChatGPT `listConversations(..., { includeHistory, historyLimit })` now
    passes options into the provider scraper instead of ignoring them
  - the provider politely scrolls the ChatGPT left rail until the requested
    history limit is reached or the rail stops loading older rows
  - added nonblocking account-mirror completion operations:
    `POST /v1/account-mirrors/completions`,
    `GET /v1/account-mirrors/completions`,
    `GET /v1/account-mirrors/completions/{id}`,
    `auracall api mirror-complete`, and
    `auracall api mirror-completions`,
    `auracall api mirror-completion-status`
  - added MCP `account_mirror_completion_start` and
    `account_mirror_completion_list` and
    `account_mirror_completion_status`
  - live dogfood showed the first completion expanded ChatGPT conversations
    from 76 to 291; completion now forces one verification refresh and waits
    through polite cooldown windows before continuing later passes
  - installed cooldown smoke showed a subsequent completion stayed `running`,
    reported `nextAttemptAt: 2026-05-01T03:55:21.121Z`, preserved 290
    remaining detail surfaces, and left no browser-operation lock while
    waiting
  - default completion mode is now unbounded `live_follow`; `--max-passes`
    remains available only as a debug cap
  - live-follow completion reports `phase = backfill_history|steady_follow`
    and stays running after backfill completes so steady follow can crawl for
    new content on the polite cadence
  - completion records are persisted under the account-mirror cache and
    hydrated on API/MCP startup; a restarted service keeps the operation id,
    phase, `nextAttemptAt`, latest refresh/error, and resumes active jobs
    without refreshing before an existing cooldown expires
  - completion list readback is cache/service-state only and must not launch a
    browser, acquire the dispatcher, or touch provider pages
  - `/status.accountMirrorCompletions` now reports completion metrics plus
    active/recent operations, and `/ops/browser` renders the same "Mirror Live
    Follow" posture for local operators
  - added live-follow completion controls:
    `POST /v1/account-mirrors/completions/{id}` with
    `{"action":"pause|resume|cancel"}`,
    `auracall api mirror-completion-control <id> pause|resume|cancel`, MCP
    `account_mirror_completion_control`, and matching `/ops/browser` buttons
  - added `pnpm run smoke:completion-control`, a no-browser local API smoke
    that verifies HTTP pause, CLI resume, MCP cancel, and `/status` metrics
    against an injected completion service
- Verification target:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/accountMirror/completionService.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run lint`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `git diff --check`

## Turn 91 | 2026-05-01

- Goal: make lazy-live-follow dogfood start with one compact operator preflight.
- Change:
  - added `pnpm run preflight:lazy-live-follow`
  - wired `./scripts/release.sh operator-smoke` through the preflight
  - documented the rollup in release, MCP, testing, and plan surfaces
- Verification target:
  - `pnpm run preflight:lazy-live-follow`
  - `pnpm exec tsc --noEmit`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 63`
  - `pnpm run lint`
  - `git diff --check`
  - `./scripts/release.sh operator-smoke`

## Turn 92 | 2026-05-01

- Goal: live dogfood default ChatGPT lazy live follow from the installed
  runtime.
- Result:
  - installed API ran on `127.0.0.1:18095`
  - default ChatGPT binding confirmed `ecochran76@gmail.com`, Business
  - completion `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5`
    started and surfaced through API, MCP status tools, and `/ops/browser`
  - refresh request `acctmirror_3650f309-f05c-4b84-b994-a323b87fcbaf` used
    dispatcher operation `7f496bd1-9df5-47dc-926a-249a955aa510`
  - cache advanced to 292 conversations, 393 artifacts, and 285 remaining
    detail surfaces
  - completion was paused cleanly
- Follow-up fixed in repo:
  - completion accounting now records a pass result even when pause happens
    while the refresh is in flight

## Turn 93 | 2026-05-01

- Goal: remove the installed CLI parser trap for completion-list filters.
- Change:
  - enabled positional option scoping at the root CLI command
  - added CLI-entrypoint coverage for
    `api mirror-completions --status active` and `--status=paused`
- Verification:
  - focused CLI parser/root alias tests passed
  - `pnpm exec tsc --noEmit`
  - `pnpm run smoke:completion-control`
  - docs/plan/lint gates passed
  - user runtime reinstalled
  - installed parse check now reaches fetch instead of failing with
    `too many arguments for 'mirror-completions'`

## Turn 94 | 2026-05-01

- Goal: verify patched lazy-live-follow pass accounting from the installed
  runtime on the existing default ChatGPT completion.
- Result:
  - installed API ran on `127.0.0.1:18095`
  - resumed completion
    `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5`
  - refresh request `acctmirror_715a135d-8a8d-4339-9c2a-c4b75fd7e36f`
    completed through dispatcher operation
    `57890d99-5d28-4be9-b7da-f103b2965bdc`
  - completion accounting now persists `passCount: 1`, `lastRefresh`, phase
    `backfill_history`, and completeness with 279 remaining detail surfaces
  - cache advanced to 292 conversations, 416 artifacts, 24 files, and
    Business identity `ecochran76@gmail.com`
  - completion was paused cleanly at `nextAttemptAt`
    `2026-05-01T23:30:47.156Z`
  - API status, `/ops/browser`, MCP `api_status`, and MCP
    `api_ops_browser_status` all reported live-follow severity `paused` with
    one active paused completion

## Turn 95 | 2026-05-01

- Goal: prove live-follow completion cadence does not need an operator resume
  after each cooldown.
- Change:
  - added focused completion-service coverage for the service-owned cadence
    loop
  - the test starts unbounded `live_follow`, receives a polite cooldown,
    resolves the scheduled sleep, verifies the next refresh runs
    automatically, and confirms the operation schedules the following
    `nextAttemptAt` without another control call
- Verification:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts`

## Turn 96 | 2026-05-01

- Goal: prove the same service-owned lazy-live-follow cadence in the installed
  runtime against the real default ChatGPT cache.
- Result:
  - installed API ran on `127.0.0.1:18095`
  - resumed completion
    `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5`
  - first resumed refresh
    `acctmirror_c3173aa3-0164-41e3-b577-d07bdbcdc75b` completed through
    dispatcher operation `1ff34c95-3de8-4df6-9481-872afebd97df`, advancing
    the operation to `passCount: 2`
  - the operation stayed `running` and, without another control call, woke at
    `nextAttemptAt` `2026-05-02T00:47:01.989Z`
  - second refresh
    `acctmirror_e84dd5df-2fca-4271-bff9-dea4b33ef9c2` started at
    `2026-05-02T00:47:01.998Z`, completed at
    `2026-05-02T00:50:28.152Z`, and used dispatcher operation
    `24d85542-01fc-437e-99cb-98c7ed6aafba`
  - completion readback showed `passCount: 3`, `nextAttemptAt`
    `2026-05-02T01:02:22.458Z`, 292 conversations, 416 artifacts, 24 files,
    and 267 remaining detail surfaces
  - completion was paused cleanly; API status and `/ops/browser` both reported
    live-follow severity `paused` with one active paused completion

## Turn 97 | 2026-05-01

- Goal: dogfood ChatGPT DOM-drift detection after the model selector moved
  into the prompt workbench.
- Finding:
  - live `auracall capabilities --target chatgpt --json` detected apps, Deep
    Research, web search, and Company Knowledge, but did not report model
    selector evidence
  - live `browser-tools` DOM inspection found the prompt-workbench model pill
    as `button.__composer-pill` with label `Instant`; a separate response
    action still uses `aria-label="Switch model"`, so selector order matters
- Change:
  - added `button.__composer-pill` and `button[aria-label="Switch model"]`
    fallbacks to ChatGPT model-button selectors
  - extended the ChatGPT feature signature and workbench capability mapper to
    report `chatgpt.model.selector`
- Verification:
  - source live probe now reports `chatgpt.model.selector` as `available` with
    `label: Instant`, `location: prompt_workbench`, and
    `selector: button.__composer-pill`

## Turn 98 | 2026-05-02

- Goal: close the desired-vs-actual live-follow operator visibility gap.
- Change:
  - added `desired` and `actual` rollups under `/status.liveFollow.targets`
  - rendered the same signal through CLI `api status`, MCP `api_status`, and
    `/ops/browser`
  - kept the existing flat target counts for compatibility
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "reports effective live-follow wake separately from routine mirror eligibility|serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts`
  - `pnpm typecheck`

## Turn 99 | 2026-05-02

- Goal: make `/ops/browser` per-account live-follow state scan-friendly.
- Change:
  - added a compact live-follow target account table above the raw JSON block
  - table columns include target, desired state, actual status, phase, passes,
    next wake, and cache counts
  - extended CLI/MCP ops-browser contract checks to require the table
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 100 | 2026-05-02

- Goal: let dashboard operators control active live-follow rows without
  copying ids from JSON.
- Change:
  - added `activeCompletionId` to each `/status.liveFollow.targets.accounts[]`
    entry when an operation is active or recent
  - added `Use ID` table controls that fill `mirrorCompletionId`
  - extended CLI/MCP ops-browser contract checks and smoke coverage for the
    completion-id fill control
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "reports effective live-follow wake separately from routine mirror eligibility|serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 101 | 2026-05-02

- Goal: make active live-follow table rows directly actionable.
- Change:
  - replaced the single target-table control cell with `Use ID`,
    `Pause`, `Resume`, and `Cancel` row buttons
  - row buttons call the existing `/status` `accountMirrorCompletion`
    control path directly
  - extended CLI/MCP ops-browser contract checks and smoke coverage for
    direct row actions
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 102 | 2026-05-02

- Goal: make `/ops/browser` live-follow controls visibly acknowledge operator
  actions.
- Change:
  - added `mirrorControlNotice` as an `aria-live` feedback area for completion
    controls
  - `Use ID` now reports selection, and pause/resume/cancel report in-flight,
    success, or failure status outside the raw JSON panel
  - extended CLI/MCP ops-browser contract checks and smoke coverage for the
    feedback notice
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 103 | 2026-05-02

- Goal: make `/ops/browser` live-follow row controls match completion state.
- Change:
  - added state-aware action selection for target table rows
  - queued/running/refreshing rows render `Pause` and `Cancel`
  - paused rows render `Resume` and `Cancel`
  - extended CLI/MCP ops-browser contract checks and smoke coverage for
    state-aware row controls
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 104 | 2026-05-02

- Goal: make active live-follow operations inspectable without reading JSON.
- Change:
  - added `mirrorActiveCompletionTable` below the target table
  - active rows show completion id, target, status, phase, pass count, next
    wake, and the same state-aware controls
  - extended CLI/MCP ops-browser contract checks and smoke coverage for the
    active completion operations table
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 105 | 2026-05-02

- Goal: add direct detail inspection to `/ops/browser` active live-follow
  operations.
- Change:
  - added an `Inspect` action to active completion rows
  - the dashboard reads `GET /v1/account-mirrors/completions/{id}` and renders
    the selected operation in the existing completion detail panel
  - extended CLI/MCP ops-browser contract checks and smoke coverage for the
    inspect path
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 112 | 2026-05-10

- Goal: distinguish live-follow waiting from active refresh work and stop
  retained service-launch blank tabs.
- Change:
  - live-follow completions now use `idle_waiting` while sleeping until the
    next eligible attempt
  - active/runnable filters still include `idle_waiting`
  - API, MCP, CLI, and docs expose the new status
  - BrowserService-managed launches pass `blankTabLimit: 0` to close the
    initial `about:blank` after a real service target is selected
- Verification:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/browser-service/browserServiceCore.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/accountMirror/completionService.test.ts tests/browser-service/browserServiceCore.test.ts tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/mcp.apiOpsBrowserStatus.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome lint src/accountMirror/completionService.ts src/accountMirror/completionStore.ts src/http/responsesServer.ts src/mcp/tools/accountMirrorCompletion.ts src/cli/apiStatusCommand.ts packages/browser-service/src/service/browserService.ts tests/accountMirror/completionService.test.ts tests/browser-service/browserServiceCore.test.ts tests/cli/apiStatusCommand.test.ts docs/mcp.md docs/testing.md`

## Turn 111 | 2026-05-10

- Goal: expose agent/team configuration through API and MCP for agent-managed
  control-plane setup.
- Change:
  - added a writable agent/team config service backed by the user config file
  - added local API routes under `/v1/config/agents` and `/v1/config/teams`
  - added MCP tools for config list/upsert/delete operations
  - updated plan, roadmap, and endpoint docs
- Verification:
  - `pnpm vitest run tests/config/agentConfigService.test.ts tests/mcp.configEntities.test.ts tests/http.responsesServer.test.ts -t "configures AuraCall agents" --maxWorkers 1`
  - `pnpm vitest run tests/config/agentConfigService.test.ts tests/mcp.configEntities.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm exec biome lint src/config/agentConfigService.ts src/http/responsesServer.ts src/mcp/server.ts src/mcp/tools/configEntities.ts tests/config/agentConfigService.test.ts tests/mcp.configEntities.test.ts tests/http.responsesServer.test.ts --max-diagnostics 40`
    reported only existing `tests/http.responsesServer.test.ts` non-null
    assertion warning debt
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 64`
  - `git diff --check`

## Turn 106 | 2026-05-03

- Goal: make pasted live-follow completion ids inspectable from the manual
  control strip.
- Change:
  - added `Inspect` next to the completion-id input
  - the input-bound inspect action reuses the same persisted completion detail
    endpoint as active table rows
  - extended CLI/MCP ops-browser contract checks and smoke coverage for the
    input-bound inspect action
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 107 | 2026-05-03

- Goal: make `/ops/browser` easier to open from status checks.
- Change:
  - added `dashboardUrl` to `auracall api ops-browser-status` readback
  - MCP `api_ops_browser_status` now returns the same structured URL and
    includes it in the text response
  - extended ops-browser smokes to prove the URL points to the fixture
    dashboard without browser/provider work
- Verification:
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 108 | 2026-05-03

- Goal: put actionable live-follow items first in `/ops/browser`.
- Change:
  - added `mirrorAttentionQueue` above the full target and active-completion
    tables
  - attention rows include targets or completions in paused, blocked, failed,
    cancelled, missing-identity, or attention-needed states
  - extended CLI/MCP ops-browser contract checks and smoke coverage for the
    attention queue
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard"`
  - `pnpm vitest run tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm typecheck`

## Turn 109 | 2026-05-10

- Goal: start the configured-agent API lane and remove hard dependency on
  drifting provider model version names.
- Change:
  - added `model: "agent:<agent_id>"` shorthand for `/v1/responses`
  - extended agent config with service, raw model, semantic model selector,
    project/conversation ids, knowledge refs, and pre/post prompt fields
  - configured browser execution now honors agent raw model and project id
  - wired
    `docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md`
    into the roadmap and endpoint/config docs
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/runtime.api.test.ts tests/runtime.configuredExecutor.test.ts --maxWorkers 1`
  - `pnpm run typecheck`

## Turn 110 | 2026-05-10

- Goal: make ChatGPT agent semantic model selectors execution-ready.
- Change:
  - added ChatGPT selector resolution for auto, instant, thinking
    standard/extended, and Pro standard/extended
  - configured browser execution maps selector intent to `desiredModel` and
    `thinkingTime`
  - browser-run readback records `modelSelector` and resolved `thinkingTime`
  - docs now mark Grok/Gemini selector execution as remaining follow-through
- Verification:
  - `pnpm vitest run tests/config/modelSelector.test.ts tests/runtime.configuredExecutor.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 111 | 2026-05-10

- Goal: make OpenAI-compatible client discovery show configured AuraCall agents
  and semantic selector readiness.
- Change:
  - `/v1/models` now includes static provider models, semantic selector entries,
    and configured agents as `agent:<agent_id>` model ids
  - ChatGPT selectors are marked execution-ready; Gemini/Grok selectors are
    listed as planned until provider adapters resolve them
  - README and plan 0064 now document the `/v1/models` discovery contract
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "model" --maxWorkers 1`
  - `pnpm vitest run tests/config/modelSelector.test.ts tests/runtime.configuredExecutor.test.ts -t "semantic|selector|model" --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 112 | 2026-05-10

- Goal: add the first API-key policy for local OpenAI-compatible clients.
- Change:
  - `api.auth.required=true` now requires bearer-key auth for `/v1/*` routes
  - `/status` stays open and reports `auth.required`, key count, and whether
    any key has execution scopes
  - `/v1/responses` rejects scoped keys that try to use unauthorized agents,
    teams, services, or runtime profiles
  - README and plan 0064 now document the API key config and request headers
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "API key|model" --maxWorkers 1`
  - `pnpm vitest run tests/config.test.ts -t "api auth|API auth" --maxWorkers 1`
  - `pnpm exec tsc --noEmit --pretty false`

## Turn 113 | 2026-05-10

- Goal: prioritize API/service work over routine lazy live follow.
- Change:
  - scheduler passes now report `foreground-work` backpressure before starting
    a live-follow refresh when foreground AuraCall requests or drains are
    pending/running
  - API chat, Responses, team-run, and media-generation routes mark their
    execution window as foreground pressure
  - stored response browser operations now label dispatcher owners as
    `response-run:<runId>:<agentId>` for queue/status attribution
  - plan 0063 records the foreground-gated live-follow contract
- Verification:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/accountMirror/schedulerService.test.ts tests/browser/browserModeExports.test.ts tests/cli/apiStatusCommand.test.ts`
  - `pnpm tsc --noEmit`
  - `pnpm lint` (passes with existing warnings)
  - `git diff --check`

## Turn 114 | 2026-05-10

- Goal: make foreground-work live-follow waits obvious to operators.
- Change:
  - `/status.accountMirrorScheduler.foregroundWork` now reports active API
    request count, pending drain reservations, scheduled drain state, and
    background drain state
  - scheduler operator posture now uses `waiting` for
    `foreground-work` instead of reporting an unhealthy backpressure posture
  - CLI/MCP status summaries and `/ops/browser` expose the foreground-work
    readout
  - README, MCP docs, and plan 0063 document the waiting posture contract
- Verification:
  - `pnpm vitest run tests/cli/apiStatusCommand.test.ts tests/mcp.apiStatus.test.ts tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts`
  - `pnpm tsc --noEmit`

## Turn 115 | 2026-05-11

- Goal: wire the DB-backed agent registry into expanded agent-management read
  surfaces.
- Change:
  - `/v1/config/agents` and `/v1/config/teams` now return the effective
    config plus registry catalog with source/revision metadata
  - `/v1/models` includes enabled registry-backed agents as `agent:<agent_id>`
    model ids with source/revision metadata
  - MCP `config_entities_list` returns the same effective catalog metadata and
    config-wins duplicate conflicts
  - compatibility writes still update the user config file; registry-default
    writes remain the next migration slice
- Verification:
  - `pnpm vitest run tests/config/agentConfigService.test.ts tests/config/agentRegistryStore.test.ts tests/mcp.configEntities.test.ts tests/http.responsesServer.test.ts -t "configures AuraCall agents|registry-backed agents|effective config and registry|agent registry|mcp config" --maxWorkers 1`
  - `pnpm tsc --noEmit`

## Turn 116 | 2026-05-11

- Goal: make expanded agent-management writes use the user-scoped registry.
- Change:
  - API/MCP agent and team upserts now write registry records by default when a
    registry store is active
  - API/MCP deletes disable registry records instead of rewriting the config
    file
  - config-defined overlay ids are pinned and return `mutationTarget="blocked"`
    with a `blockedReason`
  - mutation responses report `mutationTarget` and include source/revision
    metadata through the effective catalog projection
- Verification:
  - `pnpm vitest run tests/config/agentConfigService.test.ts tests/config/agentRegistryStore.test.ts tests/mcp.configEntities.test.ts tests/http.responsesServer.test.ts -t "configures AuraCall agents|registry-backed agents|registry-backed agents through MCP|writes agents and teams to the registry|blocks registry mutations|agent registry|mcp config" --maxWorkers 1`
  - `pnpm tsc --noEmit`

## Turn 117 | 2026-05-11

- Goal: make runtime execution consume the effective config plus registry
  catalog.
- Change:
  - added an effective config projection that materializes enabled registry
    agents/teams with config overlays winning duplicate ids
  - stored-step execution can now resolve agent routing from an async effective
    config provider
  - API serve, MCP response execution, MCP team-runs, CLI team-runs, and HTTP
    team-runs now pass effective config into runtime/bridge resolution
  - registry-created agents are no longer just discoverable and writable; they
    are executable through the normal stored-step path
- Verification:
  - `pnpm vitest run tests/config/agentConfigService.test.ts tests/runtime.configuredExecutor.test.ts tests/cli/teamRunCommand.test.ts tests/mcp/teamRun.test.ts tests/mcp.configEntities.test.ts tests/http.responsesServer.test.ts -t "effective|registry-backed|registry agent|configured team run|team run" --maxWorkers 1`
  - `pnpm vitest run tests/mcp/teamRun.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/cli/teamRunCommand.test.ts tests/runtime.configuredExecutor.test.ts tests/config/agentConfigService.test.ts --maxWorkers 1`
  - `pnpm tsc --noEmit`

## Turn 118 | 2026-05-11

- Goal: make API-key authorization and privileged local key issuance understand
  registry-backed agents and teams.
- Change:
  - API execution-scope checks now use the effective config plus registry
    catalog
  - agent calls can infer service/runtime-profile scopes from registry-backed
    agent metadata
  - team-scoped API keys can call member agents, and `/v1/team-runs` now
    enforces team scopes before creating work
  - added MCP `api_key_issue` to append agent/team-scoped keys to
    `~/.auracall/api.env` for local privileged operators
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp.apiKeys.test.ts -t "API key|registry-backed agents through effective catalog scopes|api key tools" --maxWorkers 1`
  - `pnpm tsc --noEmit`

## Turn 119 | 2026-05-11

- Goal: expose non-secret diagnostics for registry-backed agents and scoped API
  keys.
- Change:
  - added agent registry diagnostics to the config service, including effective
    agent/team counts, config-vs-registry conflicts, disabled registry records,
    config doctor issues, and API-key scope reachability
  - added `GET /v1/config/agent-diagnostics` so operators can inspect the
    running API process's loaded key ids without exposing secrets
  - added MCP `api_key_diagnostics` to inspect `~/.auracall/api.env` before or
    after service restart without returning key material
  - updated README, MCP docs, OpenAI endpoint docs, runtime docs, and plan 0065
- Verification:
  - `pnpm vitest run tests/config/agentConfigService.test.ts tests/mcp.apiKeys.test.ts tests/http.responsesServer.test.ts -t "diagnoses|agent registry and loaded API-key diagnostics|API key|registry-backed agents through effective catalog scopes" --maxWorkers 1`
  - `pnpm tsc --noEmit`

## Turn 120 | 2026-05-11

- Goal: expose the agent registry/API-key diagnostics report through the CLI.
- Change:
  - added `auracall config agent-diagnostics`
  - added a shared env-file diagnostics reader so CLI and MCP parse
    `~/.auracall/api.env` consistently without returning secrets
  - added a compact human formatter plus `--json`, `--strict`, `--path`, and
    `--env-path` options
  - updated README, configuration docs, user-runtime docs, and plan 0065
- Verification:
  - `pnpm vitest run tests/cli/agentDiagnosticsCommand.test.ts tests/mcp.apiKeys.test.ts tests/config/agentConfigService.test.ts --maxWorkers 1`
  - `pnpm tsc --noEmit`

## Turn 121 | 2026-05-11

- Goal: surface registry/API-key diagnostics on the Agents / Teams dashboard.
- Change:
  - added a read-only Agent Diagnostics panel to `/agents`
  - the panel fetches `/v1/config/agent-diagnostics` and renders effective
    agent/team/key counts, warnings, conflicts, disabled registry records,
    scoped key reachability, and issue rows without secret values
  - the panel auto-loads when the Agents / Teams route is active and can be
    refreshed manually
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard|agent registry and loaded API-key diagnostics" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/http/responsesServer.ts --max-diagnostics 40`

## Turn 122 | 2026-05-11

- Goal: add reviewable export/import snapshots for registry-backed agents and
  teams.
- Change:
  - added versioned `auracall_agent_registry_snapshot` export/import support to
    the config service
  - added `auracall config agent-export` and `auracall config agent-import`
  - added MCP `config_snapshot_export` and `config_snapshot_import`
  - imports write the user-scoped registry and report config-defined overlay ids
    as blocked
  - updated README, configuration docs, MCP docs, and plan 0065
- Verification:
  - `pnpm vitest run tests/config/agentConfigService.test.ts tests/cli/agentSnapshotCommand.test.ts tests/mcp.configEntities.test.ts --maxWorkers 1`
  - `pnpm tsc --noEmit`

## Turn 123 | 2026-05-12

- Goal: expose the agent/team snapshot contract through the local HTTP API.
- Change:
  - added operator-only `POST /v1/config/snapshots/export` and
    `POST /v1/config/snapshots/import`
  - added request validation for selected/all exports and dry-run imports
  - advertised the snapshot routes in `/status`
  - updated endpoint/config docs and plan 0065
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "agent registry and loaded API-key diagnostics|agent registry snapshots|reports development-only posture" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/http/responsesServer.ts --max-diagnostics 40`

## Turn 124 | 2026-05-12

- Goal: make snapshot export/import usable from the Agents / Teams dashboard.
- Change:
  - added selected/all snapshot download controls
  - added JSON file import with separate dry-run and apply buttons
  - surfaced snapshot operation results in the dashboard status area
  - updated README and configuration docs
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard|agent registry snapshots" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/http/responsesServer.ts --max-diagnostics 80`

## Turn 125 | 2026-05-12

- Goal: expose privileged API-key issuance through the operator HTTP API.
- Change:
  - extracted MCP API-key issuance into a reusable config service
  - added operator-only `POST /v1/config/api-keys/issue`
  - kept scoped execution keys blocked from issuing additional keys
  - updated API and user-runtime docs
- Verification:
  - `pnpm vitest run tests/mcp.apiKeys.test.ts tests/http.responsesServer.test.ts -t "api key|API key|reports development-only posture" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/config/apiKeyIssuer.ts src/mcp/tools/apiKeys.ts src/http/responsesServer.ts --max-diagnostics 80`

## Turn 126 | 2026-05-12

- Goal: make privileged API-key issuance usable from the Agents / Teams
  dashboard.
- Change:
  - added dashboard controls for agent/team scoped key issuance
  - surfaced the one-time issue response and restart reminder in the page
  - documented the dashboard issue flow
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "serves a read-only browser operator dashboard|issues scoped API keys|reports development-only posture" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/http/responsesServer.ts --max-diagnostics 80`
  - attempted temp-env HTTP smoke with `pnpm tsx -e`; blocked before reaching
    AuraCall by a local `tsx -e` CJS/module-resolution issue

## Turn 127 | 2026-05-12

- Goal: add a durable temp-env smoke for operator API-key issuance.
- Change:
  - added `scripts/smoke-api-key-issue.ts`
  - added `pnpm run smoke:api-key-issue`
  - documented that the smoke uses a short-lived local API fixture and does not
    mutate real `~/.auracall/api.env`
- Verification:
  - `pnpm run smoke:api-key-issue`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint scripts/smoke-api-key-issue.ts --max-diagnostics 80`

## Turn 128 | 2026-05-12

- Goal: prove issued temp API keys work through an OpenAI-compatible client.
- Change:
  - added `scripts/smoke-api-key-openai-client.ts`
  - added `pnpm run smoke:api-key-openai-client`
  - the smoke issues a temp scoped key, reloads a fixture API with that env,
    and calls `/v1/chat/completions` through the OpenAI SDK
- Verification:
  - `pnpm run smoke:api-key-openai-client`
  - `pnpm run smoke:api-key-issue`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint scripts/smoke-api-key-openai-client.ts --max-diagnostics 80`

## Turn 129 | 2026-05-12

- Goal: wire operator API-key smokes into the release/operator preflight gate.
- Change:
  - added `smoke:api-key-issue` and `smoke:api-key-openai-client` to
    `preflight:lazy-live-follow`
  - documented the expanded operator preflight in release, testing, and MCP docs
- Verification:
  - `pnpm run smoke:api-key-issue && pnpm run smoke:api-key-openai-client`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint scripts/preflight-lazy-live-follow.ts --max-diagnostics 80`

## Turn 130 | 2026-05-12

- Goal: restart and harden the lazy-live-follow preflight smoke sequence after
  crash recovery.
- Change:
  - added missing MCP output-schema fields for `api_status.completions.metrics`
    and `account_mirror_status.entries[].limits`
  - allowed the installed MCP status smoke to accept the documented healthy
    `waiting` posture when foreground/live-follow work is present
  - made the installed MCP status smoke clean up spawned API servers with a
    bounded termination fallback
- Verification:
  - `pnpm run preflight:lazy-live-follow`
  - `pnpm run smoke:mcp-api-status`
  - `pnpm run smoke:mcp-provider-guard`
  - `pnpm vitest run tests/mcp.apiStatus.test.ts tests/mcp.accountMirrorStatus.test.ts tests/mcp.accountMirrorProviderGuard.test.ts --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint scripts/smoke-api-status-mcp.ts src/mcp/tools/apiStatus.ts src/mcp/tools/accountMirrorStatus.ts tests/mcp.apiStatus.test.ts --max-diagnostics 80`

## Turn 131 | 2026-05-12

- Goal: unblock project-bound grading agents from passing student packet files
  through API/MCP response runs.
- Change:
  - mapped direct `/v1/responses` attachments into stored step artifacts so the
    configured browser executor can upload local files
  - added `attachments` to MCP `response_create`
  - documented the current grading workflow boundary and the pending
    project-ensure/batch-enqueue surfaces
- Verification:
  - `pnpm vitest run tests/runtime.responsesService.test.ts -t "attachments" --maxWorkers 1`
  - `pnpm vitest run tests/mcp.responseCreate.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "direct response attachments" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/runtime/responsesService.ts src/mcp/tools/responseCreate.ts tests/runtime.responsesService.test.ts tests/mcp.responseCreate.test.ts tests/http.responsesServer.test.ts --max-diagnostics 80`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/runtime.responsesService.test.ts` and
    `tests/http.responsesServer.test.ts`

## Turn 132 | 2026-05-12

- Goal: add the first project-bound agent setup surface for the ChE grading
  workflow.
- Change:
  - added a project ensure service that finds or creates provider projects by
    normalized exact name
  - added MCP `project_ensure`
  - added operator-only HTTP `POST /v1/projects/ensure`
  - optional `agentId` binding writes a registry-backed agent with the resolved
    `projectId`/`projectName`
  - documented project ensure in API/MCP docs
- Verification:
  - `pnpm vitest run tests/projects.projectEnsureService.test.ts tests/mcp.projectEnsure.test.ts tests/mcp.server.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "provider projects|development posture|status endpoint" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/projects/projectEnsureService.ts src/mcp/tools/projectEnsure.ts src/mcp/server.ts src/http/responsesServer.ts tests/projects.projectEnsureService.test.ts tests/mcp.projectEnsure.test.ts tests/mcp.server.test.ts tests/http.responsesServer.test.ts --max-diagnostics 80`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/http.responsesServer.test.ts`

## Turn 133 | 2026-05-12

- Goal: add the first nonblocking batch enqueue/control surface for
  project-bound grading workflows.
- Change:
  - added durable response batch records under the runtime store
  - added MCP `response_batch_create` and `response_batch_status`
  - added HTTP `POST /v1/response-batches` and
    `GET /v1/response-batches/{batch_id}`
  - child jobs are ordinary response runs and remain inspectable through
    `run_status`
  - persisted batch limit hints for `maxConcurrentRuns` and
    `maxBrowserInteractionsPerMinute`; hard per-batch scheduler enforcement is
    still delegated to the existing global drain/browser dispatcher path
  - documented the API/MCP batch polling contract
- Verification:
  - `pnpm vitest run tests/runtime.responseBatchService.test.ts tests/mcp.responseBatch.test.ts tests/mcp.server.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "response batches|development posture" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/runtime/responseBatchService.ts src/mcp/tools/responseBatch.ts src/mcp/server.ts src/http/responsesServer.ts tests/runtime.responseBatchService.test.ts tests/mcp.responseBatch.test.ts tests/mcp.server.test.ts tests/http.responsesServer.test.ts --max-diagnostics 30`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/http.responsesServer.test.ts`

## Turn 134 | 2026-05-12

- Goal: make response batch limits actionable in the shared drain path.
- Change:
  - added a service-host execution gate that runs before lease acquisition
  - copied batch limits onto each child response run
  - added a response-batch gate for `maxConcurrentRuns` and
    `maxBrowserInteractionsPerMinute`
  - wired HTTP background/targeted drains through the batch gate
  - documented that batch-gated child runs remain queued for later drain passes
- Verification:
  - `pnpm vitest run tests/runtime.responseBatchService.test.ts tests/runtime.serviceHost.test.ts tests/mcp.responseBatch.test.ts tests/mcp.server.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "response batches|development posture" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint src/runtime/responseBatchService.ts src/runtime/serviceHost.ts src/http/responsesServer.ts tests/runtime.responseBatchService.test.ts tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts --max-diagnostics 50`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/http.responsesServer.test.ts` and `tests/runtime.serviceHost.test.ts`

## Turn 135 | 2026-05-12

- Goal: add a deterministic ChE 4470 grading-batch workflow smoke.
- Change:
  - added `scripts/smoke-che447-grading-batch.ts`
  - added `pnpm run smoke:che447-grading-batch`
  - wired the smoke into `preflight:lazy-live-follow`
  - smoke verifies operator `POST /v1/projects/ensure`, project-bound agent
    creation, scoped-key batch enqueue, attachment-bearing child response jobs,
    batch polling, and child response readback
  - fixed `/v1/response-batches` to normalize `agent:<id>` model strings before
    authorization and enqueue
- Verification:
  - `pnpm run smoke:che447-grading-batch`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "response batches|development posture" --maxWorkers 1`
  - `pnpm tsc --noEmit`
  - `pnpm exec biome lint scripts/smoke-che447-grading-batch.ts scripts/preflight-lazy-live-follow.ts src/http/responsesServer.ts tests/http.responsesServer.test.ts --max-diagnostics 50`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/http.responsesServer.test.ts`
  - `git diff --check`
  - `pnpm run preflight:lazy-live-follow`

## Turn 136 | 2026-05-12

- Goal: generalize the ChE grading smoke into a reusable agent workflow
  contract and seed agent-facing skills.
- Change:
  - added `docs/agent-workflows.md`
  - added repo-local skills:
    - `skills/auracall-api-workflow/SKILL.md`
    - `skills/auracall-agent-setup/SKILL.md`
  - updated README, OpenAI endpoint docs, MCP docs, testing docs, and active
    agent/API plans so response batches, project ensure, scoped keys, and
    polling are documented as a generic AuraCall workflow pattern
- Verification:
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `git diff --check`

## Turn 137 | 2026-05-12

- Goal: make scoped API-key handoff executable for downstream AuraCall client
  agents.
- Change:
  - added optional `clientEnvPath` to privileged HTTP/MCP API-key issuance
  - key issuance now writes a separate sourceable client env file with
    `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `AURACALL_MODEL`,
    `AURACALL_STATUS_URL`, and `AURACALL_BATCH_URL`
  - structured API/MCP `clientEnv` readback uses camelCase while the file keeps
    real env-var names
  - updated the API-key smokes, API/MCP tests, docs, and skills
- Verification:
  - `pnpm vitest run tests/mcp.apiKeys.test.ts tests/http.responsesServer.test.ts -t "API key|api key" --maxWorkers 1`
  - `pnpm run smoke:api-key-issue`
  - `pnpm run smoke:api-key-openai-client`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/config/apiKeyIssuer.ts src/mcp/tools/apiKeys.ts src/http/responsesServer.ts tests/mcp.apiKeys.test.ts tests/http.responsesServer.test.ts scripts/smoke-api-key-issue.ts scripts/smoke-api-key-openai-client.ts --max-diagnostics 60`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/http.responsesServer.test.ts`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `git diff --check`

## Turn 138 | 2026-05-12

- Goal: prove the full scoped client handoff workflow end to end.
- Change:
  - added `scripts/smoke-scoped-client-handoff-workflow.ts`
  - added `pnpm run smoke:scoped-client-handoff`
  - wired the smoke into `preflight:lazy-live-follow`
  - smoke verifies project ensure, scoped API-key issuance, simulated API
    reload from the issued service env, generated client env handoff,
    `/v1/models` discovery, one direct `/v1/responses` call, and one
    attachment-bearing `/v1/response-batches` enqueue/readback
  - updated API workflow docs, OpenAI endpoint docs, testing docs, and the
    repo-local AuraCall API workflow skill
- Verification:
  - `pnpm run smoke:scoped-client-handoff`
  - `pnpm run smoke:api-key-issue`
  - `pnpm run smoke:api-key-openai-client`
  - `pnpm run smoke:che447-grading-batch`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint scripts/smoke-scoped-client-handoff-workflow.ts scripts/preflight-lazy-live-follow.ts package.json docs/agent-workflows.md docs/openai-endpoints.md docs/testing.md skills/auracall-api-workflow/SKILL.md --max-diagnostics 60`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `git diff --check`
  - `pnpm run preflight:lazy-live-follow`

## Turn 141 | 2026-05-12

- Goal: give downstream apps a tiny env-only AuraCall API smoke.
- Change:
  - added `scripts/smoke-scoped-client-env.ts`
  - added `pnpm run smoke:scoped-client-env -- <client.env>`
  - exported the env smoke helper and reused it from
    `smoke:scoped-client-handoff`
  - updated workflow, endpoint, testing, active-plan, and repo-local API skill
    docs so downstream agents know to validate the generated scoped env before
    a larger batch
- Verification:
  - `pnpm exec tsc --noEmit`
  - `pnpm run smoke:scoped-client-handoff`
  - `pnpm exec biome lint scripts/smoke-scoped-client-env.ts scripts/smoke-scoped-client-handoff-workflow.ts package.json docs/agent-workflows.md docs/openai-endpoints.md docs/testing.md skills/auracall-api-workflow/SKILL.md docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md RUNBOOK.md docs/dev/dev-journal.md --max-diagnostics 80`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `git diff --check`
  - `pnpm run preflight:lazy-live-follow`

## Turn 142 | 2026-05-12

- Goal: diagnose the transcribe-audio AuraCall legacy enrichment timeout and
  harden the exposed client/operator paths it touched.
- Change:
  - read
    `../transcribe-audio/docs/dev/notes/2026-05-12-auracall-legacy-enrichment-handoff.md`
  - confirmed the installed API was reachable but direct responses were stuck
    behind stale planned/runtime entries after client read timeouts
  - fixed `smoke:scoped-client-env` argument parsing for the normal
    `pnpm run smoke:scoped-client-env -- <client.env>` invocation
  - let operator `cancel-run` cancel planned runs that have not acquired a
    lease yet, so timed-out client requests can be cleared without first
    scheduler-claiming them
  - cleaned leaked `resp_batch_gate_*` fixture entries and timed-out local
    smoke/readout requests from the installed runtime queue through operator
    controls
- Verification:
  - `pnpm exec tsc --noEmit`
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/runtime.responseBatchService.test.ts -t "cancels a planned run|builds an execution gate" --maxWorkers 1`
  - `pnpm exec biome lint scripts/smoke-scoped-client-env.ts src/runtime/serviceHost.ts tests/runtime.serviceHost.test.ts tests/runtime.responseBatchService.test.ts --max-diagnostics 60`
    exited 0 with existing `noNonNullAssertion` warnings in
    `tests/runtime.serviceHost.test.ts`
  - `pnpm run smoke:scoped-client-handoff`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `pnpm run smoke:scoped-client-env -- /home/ecochran76/.auracall/api.env --prompt 'Reply exactly: auracall env smoke ok' --expect-output 'auracall env smoke ok' --timeout-ms 120000`
  - direct `/v1/chat/completions` smoke via `/home/ecochran76/.auracall/api.env`
    returned `auracall chat smoke ok`
  - `pnpm run preflight:lazy-live-follow`

## Turn 139 | 2026-05-12

- Goal: make the scoped client handoff a first-class setup package workflow.
- Change:
  - added `createAgentSetupPackageService`
  - added HTTP `POST /v1/agent-setup-packages`
  - added MCP `agent_setup_package_create`
  - wired the MCP service bundle and API service discovery/status routes
  - updated `smoke:scoped-client-handoff` to use the composed setup package
    route before validating `/v1/models`, direct response execution, and
    response-batch enqueue from only the generated client env
  - updated active API plan, endpoint docs, MCP docs, workflow docs, testing
    docs, and the privileged setup skill
- Verification:
  - `pnpm vitest run tests/projects.agentSetupPackageService.test.ts tests/mcp.agentSetupPackage.test.ts tests/mcp.server.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "agent setup packages|API key|projects through|development posture" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run smoke:scoped-client-handoff`
  - `pnpm vitest run tests/projects.agentSetupPackageService.test.ts tests/mcp.agentSetupPackage.test.ts tests/mcp.server.test.ts tests/http.responsesServer.test.ts -t "agent setup packages|API key|projects through|mcp agent_setup|mcp server service|agent setup package service" --maxWorkers 1`
  - `pnpm exec biome lint src/projects/agentSetupPackageService.ts src/mcp/tools/agentSetupPackage.ts src/mcp/server.ts src/http/responsesServer.ts tests/projects.agentSetupPackageService.test.ts tests/mcp.agentSetupPackage.test.ts tests/mcp.server.test.ts tests/http.responsesServer.test.ts scripts/smoke-scoped-client-handoff-workflow.ts --max-diagnostics 80`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/http.responsesServer.test.ts`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `pnpm run preflight:lazy-live-follow`

## Turn 140 | 2026-05-12

- Goal: add a non-secret setup handoff surface for downstream client agents.
- Change:
  - added redacted `AgentSetupHandoffResult`
  - added HTTP `POST /v1/agent-setup-handoffs`
  - added MCP `agent_setup_handoff_create`
  - updated `smoke:scoped-client-handoff` to use the redacted handoff route
    and assert the setup response does not carry secret-bearing fields
  - kept `POST /v1/agent-setup-packages` and MCP
    `agent_setup_package_create` for privileged operators that explicitly need
    the full one-time secret-bearing response
  - updated active API plan, endpoint docs, MCP docs, workflow docs, testing
    docs, and the privileged setup skill
- Verification:
  - `pnpm exec tsc --noEmit`
  - `pnpm vitest run tests/projects.agentSetupPackageService.test.ts tests/mcp.agentSetupPackage.test.ts tests/http.responsesServer.test.ts -t "agent setup|handoff|API key|development posture" --maxWorkers 1`
  - `pnpm run smoke:scoped-client-handoff` (rerun passed after one transient
    batch-read poll failure)
  - `pnpm exec biome lint src/projects/agentSetupPackageService.ts src/mcp/tools/agentSetupPackage.ts src/http/responsesServer.ts tests/projects.agentSetupPackageService.test.ts tests/mcp.agentSetupPackage.test.ts tests/http.responsesServer.test.ts scripts/smoke-scoped-client-handoff-workflow.ts docs/agent-workflows.md docs/openai-endpoints.md docs/mcp.md docs/testing.md skills/auracall-agent-setup/SKILL.md --max-diagnostics 80`
    exited cleanly; it reported unrelated existing non-null assertion warnings
    in `tests/http.responsesServer.test.ts`
  - `pnpm run docs:list`
  - `pnpm run plans:audit -- --keep 65`
  - `git diff --check`
  - `pnpm run preflight:lazy-live-follow`

## Turn 141 | 2026-05-12

- Goal: fix the failed transcribe-audio AuraCall readout path without
  truncating transcripts downstream.
- Change:
  - preserved OpenAI-compatible `response_format` on `/v1/chat/completions`
    requests and carried it into browser-backed execution metadata
  - included system instructions in the browser prompt path for direct API
    requests
  - added large-prompt browser transport: prompts over the inline budget are
    written under `~/.auracall/runtime/request-attachments/<run-id>/` and sent
    to the provider workbench as an uploaded request attachment
  - changed chat-completions failures to return HTTP 502
    `auracall_execution_error` instead of HTTP 200 with empty assistant
    content
  - added ChatGPT JSON-object completion validation so browser runs that are
    still rendering malformed JSON keep polling; if they never become
    parseable, AuraCall fails the run honestly
- Verification:
  - `pnpm run typecheck`
  - `pnpm test -- --run tests/runtime.configuredExecutor.test.ts -t "spills large API prompts"`
  - `pnpm test -- --run tests/http.responsesServer.test.ts -t "chat completions"`
  - `pnpm test -- --run tests/runtime.configuredExecutor.test.ts`
  - `pnpm test -- --run tests/runtime.configuredExecutor.test.ts tests/http.responsesServer.test.ts -t "large API prompts|chat completions"`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - live large-prompt `/v1/chat/completions` smoke through
    `agent:instant-chatgpt-soylei` returned
    `{"ok":true,"transport":"large-prompt"}` and wrote a 96 KB request
    attachment
  - full-transcript SBIR readout through `agent:instant-chatgpt-soylei`
    failed with a 502 because ChatGPT did not finish a parseable JSON object,
    proving the new failure mode is honest
  - full-transcript SBIR readout through `agent:pro-extended-chatgpt-soylei`
    succeeded and wrote the readout JSON/Markdown
- Note: a broad `tests/http.responsesServer.test.ts` run still hit unrelated
  existing startup-recovery timeouts and path-shape failures; focused tests for
  this slice passed.

## Turn 142 | 2026-05-13

- Goal: support Transcribe Audio as a burst client using a project-bound
  SoyLei Pro Extended transcripts agent.
- Change:
  - attempted `POST /v1/projects/ensure` for ChatGPT project `Transcripts`
    and agent `pro-extended-chatgpt-soylei-transcripts`
  - project ensure failed with `button-missing`, identifying a remaining
    ChatGPT project creation/binding selector drift
  - registered `pro-extended-chatgpt-soylei-transcripts` directly through
    `PUT /v1/config/agents/{id}` with `projectName=Transcripts`,
    `runtimeProfile=wsl-chrome-3`, `service=chatgpt`, and
    `modelSelector=chatgpt:pro-extended`
  - issued scoped client key `transcribe-audio-transcripts` to
    `/home/ecochran76/.local/state/transcribe-audio/auracall-transcripts.env`
  - restarted `auracall-api.service`
- Verification:
  - scoped client key can read `/v1/models` and the catalog includes
    `agent:pro-extended-chatgpt-soylei-transcripts`
  - Transcribe Audio dry-run built a response-batch manifest
  - Transcribe Audio live one-item enqueue completed
    `batch_0db1883c7905471c83d807411cfdee33` and child response
    `resp_1a4b0915303848a6ab68a48e286e563f`; materialization wrote
    `/home/ecochran76/.transcripts/legacy-artifacts/29/29ed3d64cca92a7cf5f5-2025-08-15 Dr Stefl Knee Replacement Consult.readout.json`
- Next:
  - repair ChatGPT project ensure selectors so `projectName=Transcripts` can
    be created/confirmed at the provider workbench instead of being only a
    registry intent.

## Turn 143 | 2026-05-13

- Goal: fix the ChatGPT project ensure `button-missing` failure and make the
  selector-drift evidence stronger.
- Change:
  - moved ChatGPT create-project confirm CTA vocabulary into
    `ui.labelSets.project_create_confirm_buttons`
  - changed the create confirm step to use scoped dialog roots,
    manifest-owned labels, ordered interaction strategies, and
    `withUiDiagnostics(...)`
  - added a safe scoped fallback for visible non-disabled submit/create buttons
    inside the confirmed create-project dialog
  - updated browser automation docs/backlog with the new CTA-drift pattern and
    the next self-healing direction: record successful discovered label aliases
    as observations, not automatic config mutations
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/services/registry.test.ts -t "create-project confirm|project settings commit|chatgpt ui labels" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/browser/providers/chatgptAdapter.ts tests/browser/chatgptAdapter.test.ts tests/services/registry.test.ts configs/auracall.services.json docs/dev/browser-service-upgrade-backlog.md docs/dev/browser-automation-playbook.md --max-diagnostics 80`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - live `POST /v1/projects/ensure` created ChatGPT project `Transcripts`:
    `g-p-6a04628762ac8191894b16cfaddfd126`
  - second live `POST /v1/projects/ensure` returned `status=found`, proving
    the setup is idempotent
  - `/v1/config/agents` now shows
    `agent:pro-extended-chatgpt-soylei-transcripts` bound to project id
    `g-p-6a04628762ac8191894b16cfaddfd126`

## Turn 144 | 2026-05-13

- Goal: make successful runtime selector recovery visible as operator evidence
  instead of silent provider-local self-healing.
- Change:
  - added `src/browser/domDriftObservations.ts` to append bounded DOM drift
    observations under `~/.auracall/runtime/dom-drift-observations.jsonl`
  - added `GET /v1/browser/dom-drift-observations` as a read-only operator
    API for service/surface/status/limit-filtered observations
  - wired ChatGPT project-create confirm fallback to record an observation
    when manifest labels miss but the scoped submit/create fallback succeeds
  - updated browser automation docs/backlog to keep observed aliases as
    evidence until an operator accepts a manifest update
- Verification:
  - `pnpm vitest run tests/browser/domDriftObservations.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "browser DOM drift observations|browser process diagnostics" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/browser/domDriftObservations.ts src/browser/providers/chatgptAdapter.ts src/http/responsesServer.ts tests/browser/domDriftObservations.test.ts tests/http.responsesServer.test.ts docs/dev/browser-automation-playbook.md docs/dev/browser-service-upgrade-backlog.md --max-diagnostics 80`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - live `GET /v1/browser/dom-drift-observations?service=chatgpt&limit=5`
    returned `200` with an empty observation list, proving the route is
    installed without mutating provider state
- Note: lint still reports existing non-null assertion warnings in
  `tests/http.responsesServer.test.ts` outside this slice.

## Turn 145 | 2026-05-13

- Goal: let operators promote reviewed DOM drift observations into runtime
  configuration without rewriting checked-in service manifests.
- Change:
  - added user-scoped service overrides at
    `~/.auracall/service-overrides.json`
  - added `resolveEffectiveServiceUiLabelSet(...)` and
    `upsertServiceUiLabelSetAlias(...)` for approved UI label aliases
  - made ChatGPT project-create confirm labels resolve dynamically from the
    bundled manifest plus user overrides
  - added `acceptDomDriftObservation(...)` and
    `POST /v1/browser/dom-drift-observations/{observation_id}/accept`
  - mapped the known ChatGPT project-create confirm observation to
    `ui.labelSets.project_create_confirm_buttons`
  - updated browser automation docs/backlog to keep this approval-gated and
    user-scoped
- Verification:
  - `pnpm vitest run tests/browser/domDriftObservations.test.ts tests/services/registry.test.ts -t "DOM drift observations|user-scoped ui label-set overrides|create-project confirm" --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "browser DOM drift observations|accepts browser DOM drift observations" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/services/registry.ts src/browser/domDriftObservations.ts src/browser/providers/chatgptAdapter.ts src/http/responsesServer.ts tests/browser/domDriftObservations.test.ts tests/services/registry.test.ts tests/http.responsesServer.test.ts --max-diagnostics 80`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - live direct-loopback `POST
    /v1/browser/dom-drift-observations/domdrift-missing/accept` returned `404`
    with `not_found_error`, proving the installed accept route is active
    without mutating provider state or service overrides
  - `git diff --check`
- Note: lint still reports existing non-null assertion warnings in
  `tests/http.responsesServer.test.ts` outside this slice.

## Turn 146 | 2026-05-13

- Goal: make lazy-follow/account-mirror crawls sense probable DOM drift while
  preserving their tolerant background behavior.
- Change:
  - wired account-mirror metadata collection read-failure paths into
    `recordDomDriftObservation(...)`
  - observations now cover tolerated failures for:
    - project list reads
    - conversation list reads
    - ChatGPT library/account file reads
    - Grok account file reads
    - project file reads
    - conversation file reads
    - conversation context/artifact reads
  - observations include provider, runtime profile, surface/action,
    fallback kind, and error message metadata
  - lazy-follow observations now opportunistically attach bounded page
    evidence from the active DevTools target: URL/title, readiness/visibility,
    visible element counts, visible labels, and up to three screenshots per
    process under `~/.auracall/diagnostics/dom-drift`
  - updated browser automation docs/backlog to make lazy-follow drift sensing
    part of the standard collector pattern
- Verification:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts -t "Grok account-files drift|project route failures|library inventory|conversation attachment" --maxWorkers 1`
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts -t "bounded page evidence|Grok account-files drift" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts --max-diagnostics 80`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - `git diff --check`

## Turn 147 | 2026-05-13

- Goal: close the lazy-follow drift gap where whole collector timeouts failed
  without leaving an operator-visible DOM drift record.
- Change:
  - `accountMirror.refreshService` now records `account-mirror-refresh /
    collect-metadata` DOM drift observations for non-identity, non-provider
    guard collector failures
  - collector timeout observations use `fallbackKind=collector-timeout` and
    include runtime profile, request id, dispatcher key, dispatcher operation
    id, and the original error message
  - timeout observations intentionally avoid extra browser probing because the
    collector owns the active DevTools client; sub-read failures remain the
    path that can attach live page evidence/screenshots
- Verification:
  - `pnpm vitest run tests/accountMirror/refreshService.test.ts -t "times out a stuck metadata collector" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/accountMirror/refreshService.ts tests/accountMirror/refreshService.test.ts --max-diagnostics 80`
  - `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts -t "times out a stuck metadata collector|bounded page evidence|Grok account-files drift" --maxWorkers 1`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - live direct-loopback `POST /v1/account-mirrors/refresh` for
    `grok/default` reproduced `Account mirror metadata collector timed out for
    grok/default.`
  - live direct-loopback `GET
    /v1/browser/dom-drift-observations?service=grok&surface=account-mirror-refresh&limit=3`
    returned `domdrift-15c2ec9a-d8d8-4b89-aa0f-4e4492bbe7b2` with
    `fallbackKind=collector-timeout`
  - `git diff --check`

## Turn 148 | 2026-05-13

- Goal: fix the Grok/default lazy-follow timeout rather than only reporting it.
- Change:
  - made project-conversation fanout provider-aware in the account-mirror
    collector
  - ChatGPT still reads project conversation lists because that is valuable for
    its project-bound workbench
  - Grok and Gemini skip project conversation fanout and rely on root/history
    and files/media surfaces so a low-rate background pass completes inside the
    collector timeout
  - updated browser automation docs/backlog with the provider-specific pacing
    rule
- Verification:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts -t "only fans out|bounded page evidence|Grok account-files drift" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts --max-diagnostics 80`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - live direct-loopback `POST /v1/account-mirrors/refresh` for
    `grok/default` completed in 63 seconds with 9 projects, 26 conversations,
    80 files, 22 media entries, and mirror completeness `complete`
  - live `/status` reports Grok/default `idle_waiting`, `minimum-interval`,
    metadata counts 9/26/0/80/22, and live-follow health `severity=healthy`
  - `git diff --check`

## Turn 149 | 2026-05-13

- Goal: prepare Gemini/default for the next eligible live-follow refresh after
  the same provider-fanout audit.
- Change:
  - Gemini root conversation reads now hydrate the left-rail conversation
    history with a bounded scroll pass when `includeHistory` is requested
  - hydration is capped by `historyLimit`, stops on stable row counts or a
    non-scrollable rail, and honors the caller abort signal
  - kept Gemini project-conversation fanout disabled for account-mirror
    background passes
  - updated browser automation docs/backlog with the Gemini history hydration
    rule
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts -t "Gemini browser adapter|only fans out" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/browser/providers/geminiAdapter.ts tests/browser/geminiAdapter.test.ts src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts --max-diagnostics 80`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - live direct-loopback `POST /v1/account-mirrors/refresh` for
    `gemini/default` was correctly rejected with `account_mirror_not_eligible`
    until `2026-05-13T14:32:30.716Z`
  - local wall time at that check was `2026-05-13T08:44:08-05:00`
  - live `/status` reports live-follow `severity=healthy`, Gemini/default
    `idle_waiting`, current metadata counts 12/57/0/0/0, and
    `mirrorCompleteness=in_progress` pending the next eligible pass

## Turn 150 | 2026-05-13

- Goal: re-center AuraCall on Transcribe Audio readiness, then return to the
  ChE 4470/5470 seminar grading setup path.
- Result:
  - Transcribe Audio scoped client readiness is live-proven.
  - `agent:pro-extended-chatgpt-soylei-transcripts` is advertised through the
    scoped key and bound to ChatGPT project `Transcripts` with provider project
    id `g-p-6a04628762ac8191894b16cfaddfd126`.
  - `pnpm run smoke:scoped-client-env --
    /home/ecochran76/.local/state/transcribe-audio/auracall-transcripts.env
    --prompt 'Reply exactly: auracall transcribe env ok' --expect-output
    'auracall transcribe env ok' --timeout-ms 180000` passed with response
    `resp_45008e83347940909bcdba697b91fa2c`.
  - The local deterministic ChE grading batch smoke passed, proving project
    ensure, scoped key execution, response batch enqueue, attachment-bearing
    child jobs, polling, and response readback without live provider quota use.
  - The live ChE setup handoff created ChatGPT project
    `ChE 4470/5470 Seminar Grading` with provider project id
    `g-p-6a0485902cc481918bb72066dd7164b9`.
  - The live ChE agent `pro-extended-chatgpt-soylei-che4470-seminar-grading`
    is now registry-backed and exposed as
    `agent:pro-extended-chatgpt-soylei-che4470-seminar-grading`.
  - The scoped ChE client env was written to
    `/home/ecochran76/.auracall/clients/che447-grading.env` and the installed
    API service was restarted.
- Verification:
  - `systemctl --user restart auracall-api.service`
  - scoped ChE key sees the ChE agent in `/v1/models`
  - scoped ChE key cannot call `agent:instant-chatgpt-soylei`; the API returns
    HTTP 403 `API key is not authorized for agent "instant-chatgpt-soylei".`
  - the first live ChE pro-extended scoped-env response
    `resp_deb3c8b4625e4ed9b19bb92809e0d83a` exceeded the 180 second smoke
    timeout and remained `in_progress`; it was cancelled through operator
    control with note `cancel timed-out CHE447 scoped-env smoke`
- Next:
  - Transcribe Audio can continue bounded batch work now.
  - Before full ChE packet smokes, diagnose why the project-bound ChE
    pro-extended execution did not complete inside the small-prompt smoke
    window. Start with the run/browser evidence for
    `resp_deb3c8b4625e4ed9b19bb92809e0d83a`, then retry one minimal prompt or
    one single-student packet after the blocker is understood.

## Turn 151 | 2026-05-13

- Goal: unblock the ChE 4470/5470 project-bound agent path after the first live
  scoped-env smoke stayed `in_progress`.
- Diagnosis:
  - cancelled response `resp_deb3c8b4625e4ed9b19bb92809e0d83a` had no persisted
    direct-run `service`, `runtimeProfileId`, or queue affinity even though
    authorization resolved the configured agent
  - direct OpenAI-compatible calls using only `model: agent:<id>` were not
    hydrating routing fields from the effective agent catalog before the run was
    persisted
- Change:
  - `/v1/responses`, `/v1/chat/completions`, and `/v1/response-batches` now
    hydrate missing service/runtime routing from the effective catalog when
    `model` resolves to a configured `agent:<agent_id>`
  - updated the agent workflow docs so clients know they do not need to repeat
    provider routing fields for configured agents
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "hydrates agent model requests|creates non-streaming chat completions|creates and reads response batches" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/http/responsesServer.ts tests/http.responsesServer.test.ts --max-diagnostics 80`
    reported only existing non-null assertion warning debt in
    `tests/http.responsesServer.test.ts`
  - `pnpm run build`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
  - scoped ChE key created `resp_503c13347c55416a99254f42ca0ed9a6`; immediate
    metadata showed `runtimeProfile=wsl-chrome-3`, `service=chatgpt`, and step
    `agentId=pro-extended-chatgpt-soylei-che4470-seminar-grading`
  - runtime inspection for that response showed queue affinity
    `requiredService=chatgpt`, `requiredRuntimeProfileId=wsl-chrome-3`, and
    `requiredServiceAccountId=service-account:chatgpt:eric.cochran@soylei.com`
  - the queued ChE smoke responses
    `resp_503c13347c55416a99254f42ca0ed9a6`,
    `resp_7afcad80822f4f3c96d17de84b84515a`, and
    `resp_02e785b86a8f412aa28f4a2bb62a9ad8` were cancelled after routing proof
    to avoid consuming later SoyLei Pro queue capacity
- Current state:
  - ChE agent routing and scoped-key authorization are fixed and installed
  - two Transcribe Audio SoyLei Pro transcript jobs are currently running on the
    shared `wsl-chrome-3` ChatGPT profile, so a live ChE completion proof should
    wait until the shared queue drains or a per-workflow priority policy is
    added

## Turn 152 | 2026-05-13

- Goal: run and watch a live ChE 4470/5470 scoped-env smoke rather than only
  checking metadata.
- Run:
  - submitted `pnpm run smoke:scoped-client-env --
    /home/ecochran76/.auracall/clients/che447-grading.env --prompt 'Reply
    exactly: che447 grading env ok' --expect-output 'che447 grading env ok'
    --timeout-ms 600000`
  - created response `resp_23612f1b2929469aa254b2de3fd46c59`
- Evidence:
  - routing was correct: `service=chatgpt`, `runtimeProfile=wsl-chrome-3`,
    agent
    `pro-extended-chatgpt-soylei-che4470-seminar-grading`, and service-account
    affinity `service-account:chatgpt:eric.cochran@soylei.com`
  - the browser operation initially queued behind stale lock
    `6897b8aa-c60c-47de-ae02-0f44e48eb5ef` from terminal failed transcript run
    `resp_9d59ac43f87f460081a187fa28c4bf49`
  - after removing that stale lock, the ChE run acquired browser operation
    `4ad5a184-ae75-4d3c-bc7e-a2342a8fc5a2`
  - the browser screenshot showed a stale ChatGPT `Create project` modal with
    project name `Copenhagen Trip` blocking the composer
  - after manually closing the modal, timed polling still showed no provider
    conversation ref, no output, and only heartbeat updates
  - the smoke wrapper also hit one transient readback error:
    `GET /v1/responses/{id}` returned HTTP 400 `Unexpected end of JSON input`,
    but immediate direct readback later returned HTTP 200 `in_progress`
- Cleanup:
  - cancelled `resp_23612f1b2929469aa254b2de3fd46c59` with operator note
    `cancel CHE447 smoke after watched run made no provider progress; blocked
    by stale browser lock and stuck create-project modal`
  - manually removed the remaining browser-operation lock for the cancelled ChE
    run
  - confirmed no browser-operation locks remain and the ChatGPT page no longer
    has a project modal open
- Next:
  - fix browser-operation lifecycle cleanup so terminal or operator-cancelled
    runs release same-process locks
  - add ChatGPT pre-submit modal detection/closure or fail-fast diagnostics
    before attempting project selection/composer submission
  - rerun the same scoped-env smoke after those two blockers are fixed

## Turn 153 | 2026-05-13

- Goal: trace the stale ChatGPT `Create project` modal origin seen after lazy
  live follow and harden the cleanup path.
- Finding:
  - recent account-mirror scheduler history did not prove lazy follow opened
    the modal; the strongest in-code opener is the ChatGPT project creation
    path used by project ensure / agent setup
  - `createProject()` opened the modal, then only closed the CDP client in
    `finally`, so any failure after modal open could leave the dialog in the
    human browser
  - the existing connect-time cleanup attempted close/Escape but ignored
    failure to actually remove the dialog, so later lazy-follow reads could
    inherit the stale modal and appear to be the source
  - the observed `Copenhagen Trip` project name was not present in AuraCall
    runtime/cache/log text, so the exact actor is not recoverable from current
    logs
- Change:
  - ChatGPT create-project modal state is now explicitly probed, including URL,
    title, project-name value, and visible close labels
  - lazy-follow read paths for projects, conversations, active artifacts, and
    account library files now fail fast if a stale create-project modal cannot
    be dismissed
  - `createProject()` now performs best-effort modal cleanup on failure before
    returning the original error
  - create-project confirmation now uses manifest-backed labels with diagnostic
    fallback and records DOM drift evidence when fallback succeeds
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint src/browser/providers/chatgptAdapter.ts
    tests/browser/chatgptAdapter.test.ts --max-diagnostics 80`
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user status auracall-api.service --no-pager` reported active
    service PID `1435291`
  - `/status` reported `browserOperations=null`
  - reran ChE scoped smoke:
    `pnpm run smoke:scoped-client-env --
    /home/ecochran76/.auracall/clients/che447-grading.env --prompt 'Reply
    exactly: che447 grading env ok' --expect-output 'che447 grading env ok'
    --timeout-ms 600000`
  - smoke passed with response `resp_37bb150ee1c34458a83e71332002e67d`,
    runtime profile `wsl-chrome-3`, provider conversation
    `https://chatgpt.com/c/6a04da02-5fec-83ea-b5c0-a20ccab52330`, and
    assistant text `che447 grading env ok`
  - post-smoke `/status` reported `browserOperations=null` and live-follow
    severity `healthy`
- Next:
  - continue with the ChE batch workflow now that the scoped project-bound
    agent can complete a live browser-backed request

## Turn 154 | 2026-05-13

- Goal: diagnose the failed transcribe-audio AuraCall batch
  `batch_bd9a400d785f4eeeaecf986621597091` without shrinking transcript input.
- Finding:
  - `resp_ad243a3df5bc4d61ac7934e144f4352b` falsely completed with
    `output=[]` because a browser-backed direct response was claimed by a
    runner without a configured stored-step browser executor
  - `resp_b35c7e03a57d4d11ad3d081d77277404` held a stale active lease from
    `2026-05-13T14:31:56.571Z`; service restart recovered and replayed it, but
    the replay failed because the ChatGPT DOM snapshot was not accepted as a
    parseable JSON object before timeout
  - `resp_9d59ac43f87f460081a187fa28c4bf49` failed on the old browser port
    path with `connect ETIMEDOUT 127.0.0.1:9222`
- Change:
  - browser-backed runs now fail if no configured stored-step executor is
    attached instead of returning the generic bounded-local-runner success
  - configured browser executor now fails empty assistant output instead of
    materializing a successful empty response
  - stale lease repair can reclaim an expired active-runner lease only when
    the active runner has demonstrably moved on to a later run
  - ChatGPT JSON-object completion now waits longer and accepts strict,
    fenced, or embedded parseable JSON object snapshots; timeout errors include
    best-snapshot diagnostics
- Verification:
  - `pnpm vitest run tests/runtime.repair.test.ts -t "conservatively"
    --maxWorkers 1`
  - `pnpm vitest run tests/runtime.serviceHost.test.ts -t "moved on|does not
    reclaim an expired lease|repairs only stale-heartbeat|suspiciously idle"
    --maxWorkers 1`
  - `pnpm vitest run tests/runtime.runner.test.ts -t "configured stored-step
    executor|bounded local runner" --maxWorkers 1`
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts -t "without
    assistant output|spills large API prompts|Grok browser-backed" --maxWorkers
    1`
  - `pnpm exec tsc --noEmit`
  - `pnpm exec biome lint ...` has no new errors; existing test non-null
    assertion warnings remain
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user is-active auracall-api.service` reported `active`
- Recovery:
  - created retry batch `batch_d6bebd5f5caf4de292e096b1c3396be8` for the three
    affected transcript requests with `maxConcurrentRuns=1` and
    `maxBrowserInteractionsPerMinute=4`
  - after retry start, AuraCall correctly removed the old failed response's
    stale active lease, but the first retry run exposed a remaining heartbeat
    gap: long browser executor work can leave the run lease heartbeat expired
    while the owning runner heartbeat remains active
- Next:
  - watch the retry batch through terminal state, then hand the new response
    ids back to transcribe-audio for materialization or queue reconciliation
  - harden long-running browser executor lease heartbeats so recovery status
    does not show active browser work as stale-heartbeat during legitimate
    long completions

## Turn 155 | 2026-05-13

- Goal: continue repair of transcribe-audio retry batch
  `batch_d6bebd5f5caf4de292e096b1c3396be8`.
- Change:
  - made active lease release idempotent when stale-lease recovery already
    expired the lease, preventing the old fatal `Execution lease ... is not
    active` crash path
  - added a deliberate operator escape hatch:
    `POST /status {"leaseRepair":{"action":"repair-stale-heartbeat","runId":
    "...","force":true}}` for expired stale-heartbeat leases that are still
    attributed to an active runner
  - records runner activity when the service host starts a local run, not only
    after it completes
  - API-backed configured browser steps now send browser execution logs to the
    managed API log instead of suppressing them
- Live recovery:
  - force-repaired stale leases on `resp_dc3501c9c2b4412db047ed54995f33bb` and
    `resp_7192460e581048eebb1f03d4e5f99e94`
  - `resp_dc3501c9c2b4412db047ed54995f33bb` reached ChatGPT and failed with a
    provider-materialization error, not a transport failure:
    `ChatGPT response did not complete as a parseable JSON object after
    waiting; best snapshot chars=22572`
  - `resp_7192460e581048eebb1f03d4e5f99e94` remains recoverable-stranded after
    force repair; `resp_9f793d5d494c4b8693507f1aeb2bfa8e` remains runnable
- Verification:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts -t
    "force-repairs|repairs an expired active-runner lease|repairs an expired
    active lease left" --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t
    "force-repairs expired stale-heartbeat|repairs only stale-heartbeat|rejects
    suspiciously idle" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime-service`
- Next:
  - fix ChatGPT JSON materialization so complete JSON-looking snapshots can be
    recovered or retried cleanly; do not shorten transcript payloads
  - add richer browser-stage lifecycle events around configured stored-step
    execution so pre-operation stalls show up in run status, not only in the API
    log

## Turn 156 | 2026-05-13

- Goal: finish runtime repair for transcribe-audio retry batch
  `batch_d6bebd5f5caf4de292e096b1c3396be8` without reducing transcript size.
- Change:
  - ChatGPT JSON-object materialization now waits up to 10 minutes, can click an
    exact visible `Continue generating` button up to three times, and extracts
    balanced embedded JSON objects from noisy DOM snapshots.
  - response batch concurrency now counts active execution leases, not stranded
    no-lease running steps, so one wedged run cannot consume the whole batch
    gate.
  - stale-heartbeat repair now treats an active runner with an expired run
    lease, no fresh run activity, and continued runner heartbeats as locally
    reclaimable after the grace window.
  - ChatGPT model and thinking-time selector CDP evaluations now have hard
    wall-clock timeouts so a stuck workbench interaction fails boundedly instead
    of holding the browser lane forever.
  - `/v1/responses` and `/v1/response-batches` now preserve top-level
    OpenAI-style `response_format` by carrying it into execution metadata, which
    is the browser executor's strict JSON signal.
- Live evidence:
  - `resp_9f793d5d494c4b8693507f1aeb2bfa8e` completed after the batch gate fix;
    the response contains a structured JSON transcript readout.
  - `resp_7192460e581048eebb1f03d4e5f99e94` was recovered from stranded state
    and its per-run lease heartbeat stayed fresh after reinstall; a later
    browser-stage stall exposed the need for bounded selector CDP timeouts.
  - `resp_dc3501c9c2b4412db047ed54995f33bb` remains the old pre-fix failure and
    should be retried as a new response rather than reused.
  - replacement `resp_e6cd7b524b9e48b1be3b8d939627ab4c` completed but produced
    non-parseable JSON-looking text because the ad hoc retry used top-level
    `response_format` before the API normalization fix was installed.
  - strict replacement `resp_8e63f04246144ac8aa542e1e3554fe3e` failed boundedly
    at model-selector timeout; the timeout prevented an indefinite browser lane
    hold, but the item still needs a clean retry after the profile/workbench is
    quiet.
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts -t "extracts
    parseable JSON|stale|managed browser launch" --maxWorkers 1`
  - `pnpm vitest run tests/browser/browserModeExports.test.ts -t "extracts
    parseable JSON" --maxWorkers 1`
  - `pnpm vitest run tests/runtime.responseBatchService.test.ts -t "execution
    gate" --maxWorkers 1`
  - `pnpm vitest run tests/runtime.repair.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/runtime.serviceHost.test.ts -t
    "stale-heartbeat|active-runner lease|force-repairs" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime-service`
- Next:
  - retry the remaining failed transcript as a fresh response after the ChatGPT
    workbench is quiet; preserve `metadata.response_format.type=json_object` or
    use the now-supported top-level `response_format`.
  - add browser-stage lifecycle events for selector/composer/submission phases
    so run status can say exactly where a browser-backed job is waiting.

## Turn 157 | 2026-05-14

- Goal: repair the transcribe-audio ChatGPT project binding and switch the
  readout boundary toward downloadable workspace artifacts instead of long
  inline JSON.
- Finding:
  - `/v1/models` advertised `agent:pro-extended-chatgpt-soylei-transcripts`
    with `projectId=g-p-6a04628762ac8191894b16cfaddfd126` and
    `projectName=Transcripts`, but recent browser runs still launched root
    `https://chatgpt.com/c/...` conversations.
  - The root-chat launch explains why the user did not see enrichment chats
    inside the SoyLei `Transcripts` project.
- Change:
  - ChatGPT configured execution now derives the launch URL from `projectId`
    using the provider project URL helper, so project-bound registry agents open
    `https://chatgpt.com/g/<project>/project` before submission.
  - Browser response execution can materialize declared output artifacts when
    `metadata.outputContract` names an artifact mode or file name, and it uses
    the service identity attached to the runtime/profile rather than the global
    default identity.
  - `/v1/responses/{id}` now appends shared artifact refs even when a browser
    step also stored OpenAI-style message output in structured state.
- Live evidence:
  - smoke response `resp_db52dcf73b7d44b0abbffd327bbeac5c` completed under
    `https://chatgpt.com/g/g-p-6a04628762ac8191894b16cfaddfd126-transcripts/c/6a0658da-c92c-83ea-a2a9-37ec1b9fc07f`.
  - The assistant replied `legacy_readout.json ready`, but artifact discovery
    recorded `discovered=0 materialized=0`; this classifies the remaining issue
    as either ChatGPT not surfacing a downloadable artifact for that prompt or
    AuraCall missing the current ChatGPT artifact UI shape, not a project
    binding failure.
- Verification:
  - `pnpm vitest run tests/runtime.configuredExecutor.test.ts -t
    "ChatGPT semantic agent|registry-backed|materializes declared browser
    response artifacts" --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
  - `pnpm run install:user-runtime-service`
- Next:
  - probe the same project conversation in a visible/browser-artifact readback
    path to determine whether ChatGPT actually generated a downloadable
    `legacy_readout.json` artifact.
  - once extraction is proven, update transcribe-audio to require the
    `legacy_readout.json` workspace artifact contract without falling back to
    long inline JSON as the primary response shape.

## Turn 158 | 2026-05-16

- Goal: place the ChE grading batch audit follow-ups into the correct roadmap
  lanes after clarifying AuraCall's product boundary.
- Change:
  - added Plan 0066,
    `docs/dev/plans/0066-2026-05-16-searchable-run-cache-and-artifact-archive.md`,
    for searchable archive promotion of AuraCall-created runs, uploads,
    generated artifacts, provider conversation ids, and caller-supplied
    validation evidence.
  - wired Plan 0066 into `ROADMAP.md` and `docs/dev/plan-index.md`.
  - added a boundary note to Plan 0063: live follow owns provider-account
    history, not the archive of AuraCall-created jobs.
  - added a Plan 0064 note: OpenAI-compatible requests and batches should write
    stable archive-ready metadata, while archive retrieval belongs to Plan
    0066.
  - updated `docs/agent-workflows.md` so domain/schema validation is explicitly
    caller-owned and AuraCall core stores the resulting evidence.
- Verification:
  - `git diff --check -- ROADMAP.md docs/dev/plan-index.md
    docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md
    docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md
    docs/dev/plans/0066-2026-05-16-searchable-run-cache-and-artifact-archive.md
    docs/agent-workflows.md docs/dev/dev-journal.md`
  - `pnpm run plans:audit`
- Next:
  - start Plan 0066 with a read-only archive inventory projection over existing
    response, batch, team-run, media, upload, artifact, and provider
    conversation metadata.

## Turn 159 | 2026-05-16

- Goal: implement the first Plan 0066 slice for read-only searchable archive
  inventory across CLI/API/MCP.
- Change:
  - added `createRunArchiveService(...)`, a read-only projection over existing
    runtime response/team-run records, response-batch records, media-generation
    records, uploaded input artifacts, generated artifacts, and provider
    conversation references.
  - added API routes `GET /v1/archive` and
    `GET /v1/archive/items/{archive_item_id}`.
  - added CLI commands `auracall api archive` and
    `auracall api archive-item`.
  - added MCP tools `run_archive_search` and `run_archive_item`.
  - updated OpenAI endpoint, MCP, agent-workflow, and Plan 0066 docs.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/http.runArchive.test.ts tests/mcp.runArchive.test.ts
    tests/cli/apiRunArchiveCommand.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
- Next:
  - add incremental write-through indexing and backfill so archive queries do
    not rescan runtime files on every request.

## Turn 160 | 2026-05-16

- Goal: promote the Plan 0066 archive projection into a durable indexed
  readback surface.
- Change:
  - added a user-scoped run archive index store under the AuraCall runtime tree.
  - changed archive search/detail to read the index and auto-build it on first
    use when missing.
  - added explicit backfill surfaces: `POST /v1/archive/backfill`,
    `auracall api archive-backfill`, and MCP `run_archive_backfill`.
  - enriched upload/generated-artifact archive items with `cacheKey`,
    `checksumSha256`, and `fileAvailable` when AuraCall can inspect the local
    file.
  - updated OpenAI endpoint, MCP, workflow, and Plan 0066 docs.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/http.runArchive.test.ts tests/mcp.runArchive.test.ts
    tests/cli/apiRunArchiveCommand.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
- Next:
  - wire response, batch, team-run, and media completion paths to update the
    index as records are written, so new records do not wait for first-read or
    operator backfill.

## Turn 161 | 2026-05-16

- Goal: wire Plan 0066 archive indexing into the service write paths.
- Change:
  - added a best-effort archive-index refresh helper with in-process
    coalescing.
  - response creation now refreshes the archive index after run creation and
    after drained execution.
  - response-batch creation refreshes the archive index after the batch record
    is persisted.
  - service-host run execution refreshes the archive index after a run is
    settled by the background/local runner.
  - media-generation settlement and resumed materialization refresh the archive
    index after the final media record is persisted.
  - added regression coverage proving response, batch, and media service paths
    update the index without explicit backfill.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/http.runArchive.test.ts tests/mcp.runArchive.test.ts
    tests/cli/apiRunArchiveCommand.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
- Next:
  - replace full-index refresh-on-write with item-level upserts before large
    archive volumes make full refresh too expensive.

## Turn 162 | 2026-05-16

- Goal: expose stable archive file retrieval URLs for cache/local file-bearing
  archive items.
- Change:
  - added `RunArchiveService.readAsset(...)` for resolving one archive item to
    a readable local file.
  - added `GET /v1/archive/items/{archive_item_id}/asset`, which streams the
    local file with content type, length, and content-disposition headers.
  - non-file archive items, missing local paths, and missing files return 404
    without browser or provider work.
  - updated OpenAI endpoint, workflow, and Plan 0066 docs.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/http.runArchive.test.ts tests/mcp.runArchive.test.ts
    tests/cli/apiRunArchiveCommand.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
- Next:
  - add caller-supplied evidence attachment records so workflow validators can
    store review/audit outputs beside AuraCall runs without domain logic in
    AuraCall core.

## Turn 163 | 2026-05-16

- Goal: let caller-owned validators and post-processors attach generic evidence
  to the searchable run archive.
- Change:
  - added a user-scoped archive evidence store under the run archive tree.
  - added `POST /v1/archive/evidence` for attaching validation, review, or
    post-processing evidence to response ids, batch ids, archive item ids, or
    provider conversation ids.
  - added `auracall api archive-evidence` with `--payload-json` and
    `--payload-file`.
  - added MCP `run_archive_attach_evidence`.
  - indexed attached records as `kind = "evidence"` so they are searchable
    with normal archive filters and text query.
  - updated OpenAI endpoint, MCP, workflow, and Plan 0066 docs.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/http.runArchive.test.ts tests/mcp.runArchive.test.ts
    tests/cli/apiRunArchiveCommand.test.ts --maxWorkers 1`
- Next:
  - move to item-level archive upserts before large archives make full refresh
    too expensive.

## Turn 164 | 2026-05-16

- Goal: replace routine full archive refreshes with item-level upserts.
- Change:
  - added `RunArchiveIndexStore.upsertItems(...)`.
  - added targeted archive service upserts for response, response-batch, and
    media-generation item families.
  - changed response creation, service-host settlement, response-batch
    creation, and media settlement/materialization to upsert only affected
    archive items.
  - serialized archive refresh tasks to avoid read/modify/write races between
    parallel completions.
  - kept first-use compatibility: if the index is missing, targeted upsert
    performs a backfill first so older records are not hidden by a partial
    index.
  - updated Plan 0066 and the durable fixes log.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/http.runArchive.test.ts tests/mcp.runArchive.test.ts
    tests/cli/apiRunArchiveCommand.test.ts --maxWorkers 1`
  - `pnpm exec tsc --noEmit`
- Next:
  - enrich upload/generated-artifact metadata with provider/service, bound
    identity, project id, and stronger dedupe keys.

## Turn 165 | 2026-05-16

- Goal: start the operator UX redesign without replacing the existing debug
  dashboard.
- Change:
  - added
    [docs/dev/plans/0067-2026-05-16-react-operator-ux-redesign.md](docs/dev/plans/0067-2026-05-16-react-operator-ux-redesign.md)
    for a React/Vite operator console.
  - added `ux/operator` as a separate read-only React shell with AuraCall title,
    centered nav, account/context menu, collapsible and resizable left/right
    panes, central viewport, and right inspector.
  - added `ux:dev` and `ux:build` scripts.
  - updated the roadmap and plan index to mark `/ops/browser` as the current
    proof/debug surface and the React app as the durable UX lane.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run plans:audit`
  - `git diff --check` for the touched UX and docs files
  - `pnpm exec biome check ux/operator` is not applicable yet because the
    current Biome config ignores the new UX tree
- Next:
  - wire typed API clients for service health, run status, archive search, and
    account mirror status before adding mutation controls.

## Turn 166 | 2026-05-16

- Goal: put the React operator UX on the stable AuraCall API port instead of a
  temporary Vite port.
- Change:
  - changed `/dashboard` to serve packaged React/Vite assets from
    `dist/operator-ux`.
  - kept `/ops/browser` as the Browser Ops debug/proof dashboard.
  - added `debugDashboardPath` to API service discovery and route reporting.
  - included `ux:build` in the normal package build so installed runtimes carry
    the operator assets.
  - updated `~/.auracall/config.json` to advertise
    `http://auracall.localhost/dashboard` and
    `https://auracall.ecochran.dyndns.org/dashboard`.
- Verification:
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - live route checks for `http://auracall.localhost/dashboard`,
    `/dashboard/assets/...`, `/ops/browser`, `/status`, and external Authelia
    redirect for `https://auracall.ecochran.dyndns.org/dashboard`
- Next:
  - wire the React Health page to the existing `/status` and route-discovery
    APIs before adding mutation controls.

## Turn 167 | 2026-05-17

- Goal: make the React operator Health page use live API status instead of
  placeholder copy.
- Change:
  - added a read-only `/status` polling hook to the operator UX.
  - changed `Health` to render API service, auth, route discovery,
    live-follow summary, runtime metadata, and per-account live-follow target
    rows.
  - changed the left context pane and right inspector to use the same live
    status payload when Health is active.
  - updated Plan 0067 to mark Health readback as the first real API-backed
    operator page.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run plans:audit`
  - `git diff --check` for the touched UX and docs files
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - live route checks for `http://auracall.localhost/dashboard`,
    `/dashboard/assets/...`, and `/status`
- Next:
  - add read-only run queue/status and archive-search views before exposing
    any dashboard mutation controls.

## Turn 168 | 2026-05-17

- Goal: make the React operator Runs page read live runtime posture without
  adding controls or browser-held API secrets.
- Change:
  - confirmed unauthenticated browser calls to `/v1/runtime-runs/recent`
    correctly return 401.
  - added a read-only Runs page backed by
    `/status?recovery=true&sourceKind=all`.
  - rendered recovery totals, reclaimable/stranded counts, local-claim metrics,
    runner-topology metrics, and bounded run-id lists.
  - wired the Runs left context pane and right inspector to the same live
    recovery payload.
  - updated Plan 0067 to record the operator-auth boundary for deep `/v1` run
    inspection.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run plans:audit`
  - `git diff --check` for the touched UX and docs files
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - live route checks for `http://auracall.localhost/dashboard`,
    `/dashboard/assets/...`, `/status?recovery=true&sourceKind=all`, and the
    expected 401 from unauthenticated `/v1/runtime-runs/recent`
- Next:
  - add a read-only archive/search page before dashboard mutation controls.

## Turn 169 | 2026-05-17

- Goal: add read-only archive search to the React operator UX without embedding
  API secrets.
- Change:
  - confirmed unauthenticated `/v1/archive` returns 401.
  - added a Search page that accepts an operator API key for the current
    browser session only.
  - wired read-only `/v1/archive` queries with filters for query text, kind,
    provider, status, and limit.
  - rendered archive metrics, result cards, protected detail links, protected
    asset links when files are available, and provider conversation links.
  - updated Plan 0067 and the durable fixes log to record the session-scoped
    key boundary.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc --noEmit --pretty false`
  - `pnpm run plans:audit`
  - `git diff --check` for the touched UX and docs files
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - live route checks for `http://auracall.localhost/dashboard`,
    `/dashboard/assets/...`, authenticated `/v1/archive`, and expected 401
    from unauthenticated `/v1/archive`
  - live API probe with the user-scoped operator key returned 5 archive items
    from 1,186 indexed records without printing the secret.
- Next:
  - move to chat-dialog conversation views or archive item inspection.

## Turn 170 | 2026-05-17

- Goal: make selected archive results inspectable from the React operator UX.
- Change:
  - added a protected `/v1/archive/items/{archive_item_id}` detail fetch for
    the selected Search result using only the session-scoped operator key.
  - added inspector status states for loading, loaded, and unavailable item
    detail.
  - expanded the selected archive JSON summary to include file, provider,
    ownership, link, and metadata-key fields.
  - changed inspector action chips to render all returned item links instead
    of a hardcoded subset.
  - updated the operator UX dogfood note with the installed-browser evidence.
- Verification:
  - `pnpm run ux:build`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://auracall.localhost/status`
  - `agent-browser` against `http://auracall.localhost/dashboard` with a
    throwaway Chrome profile.
  - authenticated Search for `first_pass_readout` rendered 25 results, selected
    one item, reported `Detail loaded`, and exposed `Response` and
    `Runtime Run` action chips.
- Next:
  - add item-specific asset/download preview, then return to chat-dialog
    conversation views.

## Turn 171 | 2026-05-17

- Goal: add protected asset fetch and preview to the React operator Search
  inspector.
- Change:
  - lifted the session-scoped archive API key to the app shell so the right
    inspector can fetch protected item assets without putting bearer keys in
    URLs.
  - added an asset preview card for selected file-backed archive items.
  - synthesized `/v1/archive/items/{archive_item_id}/asset` for file-available
    items when the archive payload omits an explicit asset link.
  - added object URL Open/Download actions and inline previews for small text,
    JSON, XML, CSV, Markdown, log, image, and PDF assets.
  - recorded an observed backend gap: generated-artifact archive IDs containing
    embedded `sandbox:/mnt/data/...` slash text currently return HTTP 400
    through item and asset routes, while upload archive IDs work.
- Verification:
  - `pnpm run ux:build`
  - copied the built `dist/operator-ux` assets into the installed user runtime
    because the shared dirty worktree currently blocks full `pnpm run build`
    with non-UX TypeScript errors.
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://auracall.localhost/status`
  - `agent-browser` against `http://auracall.localhost/dashboard` with a
    throwaway Chrome profile.
  - authenticated Search for `kind=upload` and query `rubric` rendered 25
    results, selected one file-backed item, fetched
    `che4470-seminar-rubric.json`, reported `application/json; charset=utf-8`
    and `6,785 bytes`, and displayed Open/Download actions plus an inline JSON
    preview.
- Next:
  - fix slash-containing archive item route handling, then return to
    chat-dialog conversation views.

## Turn 172 | 2026-05-17

- Goal: make archive item and asset routes safe for generated-artifact IDs that
  contain embedded slash text such as `sandbox:/mnt/data/...`.
- Change:
  - added a `/v1/archive/items/b64/{base64url_archive_item_id}` route form.
  - kept legacy percent-encoded archive item routes working.
  - changed archive metadata enrichment to attach explicit `links.asset` values
    for file-backed archive items.
  - changed the operator UX detail and asset helpers to synthesize the same
    `b64/` route form.
  - extended the HTTP archive test with a file-backed generated artifact whose
    ID contains `sandbox:/mnt/data/first_pass_readout.json`.
- Verification:
  - `pnpm exec vitest run tests/http.runArchive.test.ts`
  - `pnpm run ux:build`
  - `git diff --check` for the touched backend, UX, test, and docs files.
- Note:
  - full installed-runtime rebuild is still blocked by unrelated non-UX
    TypeScript errors in the shared dirty worktree; this slice is covered by
    the focused HTTP test and UX production build.
- Next:
  - return to chat-dialog conversation views in the operator UX.

## Turn 173 | 2026-05-17

- Goal: replace the static Chats placeholder with a read-only chat-dialog
  conversation view.
- Change:
  - added a Chats page backed by
    `/v1/account-mirrors/catalog?kind=conversations`.
  - reused the session-scoped operator key boundary from Search.
  - added provider/runtime/limit controls for mirrored conversation catalogs.
  - added selected conversation detail loading through
    `/v1/account-mirrors/catalog/items/{conversation_id}?kind=conversations`.
  - rendered cached messages as role-aligned chat bubbles.
  - surfaced provider links and related cached file/artifact/source counts.
  - updated the operator UX dogfood note with installed-browser evidence.
- Verification:
  - `pnpm run ux:build`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://auracall.localhost/status`
  - `agent-browser` against `http://auracall.localhost/dashboard` with a
    throwaway Chrome profile.
  - authenticated `chatgpt/default` conversation load rendered 25 rows, selected
    one conversation, rendered 5 transcript turns, and reported 2 user turns,
    3 assistant turns, 11 artifacts, and 9 sources.
- Next:
  - add transcript search/download and richer related-item previews for
    conversation detail.

## Turn 174 | 2026-05-17

- Goal: remove the operator API-key prompt from the dashboard and keep external
  API-client auth intact.
- Change:
  - added same-origin operator-dashboard superuser access for `/v1/*` browser
    requests.
  - kept plain unauthenticated `/v1/*` requests rejected when API auth is
    required.
  - removed the dashboard's API-key state, `sessionStorage` use, password
    fields, bearer headers, and key-required error states from Search, Chats,
    archive detail, and asset preview.
  - updated dashboard copy to describe same-origin operator access.
- Verification:
  - `pnpm exec vitest run tests/http.responsesServer.test.ts -t "configured API
    keys|agent registry and loaded API-key diagnostics"`
  - `pnpm run ux:build`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service`
  - `curl http://auracall.localhost/status` reported `ok=true`, API auth
    required, dashboard URL `http://auracall.localhost/dashboard`, and live
    follow `healthy`.
  - unauthenticated `curl http://auracall.localhost/v1/models` returned HTTP
    401; the same route with `Referer: http://auracall.localhost/dashboard`
    returned HTTP 200 and 63 models.
  - `agent-browser` verified Search and Chats no longer render API-key fields,
    Search can load archive results and fetch an asset, and Chats can load 25
    `chatgpt/default` conversations.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-no-key.png`
  - `/tmp/auracall-operator-ux-dogfood/chat-no-key.png`
- Next:
  - preserve external client bearer-key auth while adding explicit operator
    controls for API-key inspection, creation, and deletion.

## Turn 175 | 2026-05-17

- Goal: make operator API-key inspection, creation, and deletion available from
  the JSON API, MCP, and dashboard.
- Change:
  - added secret-free `GET /v1/config/api-keys` for user-scoped service env
    inspection.
  - added `DELETE /v1/config/api-keys/{key_id}` for removing a key from
    `~/.auracall/api.env`.
  - added the MCP `api_key_delete` tool.
  - made env-file rewrites omit deleted keys instead of preserving blank
    deleted variables.
  - added a Health-page API Keys section with a redacted key table, delete
    actions, and compact issue form.
  - kept issue/delete responses explicit that service restart is required for
    the running auth policy to reload env changes.
- Verification:
  - `pnpm exec vitest run tests/http.responsesServer.test.ts -t "issues scoped
    API keys|configured API keys|agent registry and loaded API-key diagnostics"`
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service`
  - `curl http://auracall.localhost/status` reported `ok=true`, API-key list
    and delete routes, and live follow `healthy`.
  - temp-env HTTP smoke issued, listed, and deleted `operator-ui-smoke` without
    leaking the secret in the list response.
  - `agent-browser` verified the Health page renders the API Keys table and
    issue form.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/api-keys-health.png`
- Next:
  - add a safer restart/reload workflow for key mutations so the dashboard can
    guide or trigger the required service restart explicitly.

## Turn 176 | 2026-05-17

- Goal: let the operator dashboard trigger the required API service restart
  after user-scoped API-key changes.
- Change:
  - added `POST /status` support for a `serviceControl.restart-api-service`
    action.
  - added `dryRun` and injectable restart scheduling so the endpoint can be
    tested without restarting the test process.
  - defaulted the live restart path to `systemctl --user restart
    auracall-api.service` after the HTTP response has already been sent.
  - added a compact Health-page `Restart API` control beside the API-key
    refresh button.
  - kept API-key issue/delete results explicit that restart is required before
    external clients rely on the changed key set.
- Verification:
  - `pnpm exec vitest run tests/http.responsesServer.test.ts -t "API service
    restart|issues scoped API keys|configured API keys"`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false`
  - `pnpm run ux:build`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service`
  - live `POST /status` dry-run smoke returned `scheduled=false` and the
    expected `systemctl --user restart auracall-api.service` command.
  - `curl http://auracall.localhost/status` recovered after a brief
    post-restart `Bad Gateway` and reported `ok=true`, live follow `healthy`,
    and 9 live-follow accounts.
  - `agent-browser` verified the installed dashboard renders the API Keys
    panel and `Restart API` control.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/api-keys-restart-button.png`
- Next:
  - continue UX hardening without expanding API-key prompts; same-origin
    operator dashboard access remains the superuser path.

## Turn 177 | 2026-05-17

- Goal: make live-follow target posture easier to read from the React Health
  page after a transient `attention-needed` status cleared.
- Change:
  - added enabled and unconfigured target counts to the Live Follow card.
  - added total/enabled/attention counts to the Live Follow Accounts table
    heading.
  - added a compact reason column for each target.
  - converted internal enum labels into readable chips such as `Idle Waiting`,
    `Min Interval`, and `Identity Missing`.
  - stopped displaying unconfigured blocked profiles as row-level `Attention`;
    those rows now show their actual block reason while enabled-target
    attention remains zero.
- Verification:
  - `curl http://auracall.localhost/status` reported live follow `healthy`, 5
    enabled targets, 4 unconfigured targets, and 0 attention targets.
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false`
  - `pnpm run install:user-runtime`
  - `agent-browser` verified the installed dashboard renders the live-follow
    counts and readable reason chips.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/live-follow-reasons-loaded.png`
- External links:
  - `http://auracall.localhost/dashboard`
  - `https://auracall.ecochran.dyndns.org/dashboard`
- Next:
  - consider adding filter chips for Enabled, Unconfigured, Attention, and
    Running before the table grows further.

## Turn 178 | 2026-05-17

- Goal: make the Health page live-follow accounts table filterable before the
  account count grows further.
- Change:
  - added compact `All`, `Enabled`, `Unconfigured`, `Attention`, and `Running`
    filter chips with live counts.
  - changed the table heading to show visible rows against total targets.
  - added an empty-state row for filters with no matching accounts.
  - kept `Attention` scoped to configured/enabled attention targets so
    unconfigured identity-missing profiles stay under `Unconfigured`.
- Verification:
  - `pnpm run ux:build`
  - `pnpm run install:user-runtime`
  - `agent-browser` verified `Unconfigured` filters to 4 rows and `Attention`
    filters to 0 rows with the empty-state message.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/live-follow-filter-unconfigured.png`
  - `/tmp/auracall-operator-ux-dogfood/live-follow-filter-empty-attention.png`
- External links:
  - `http://auracall.localhost/dashboard`
  - `https://auracall.ecochran.dyndns.org/dashboard`
- Next:
  - make the table denser with provider/profile chips or add row drill-down
    before adding more status panels.

## Turn 179 | 2026-05-18

- Goal: add a read-only live-follow account drill-down to the React Health
  page under Plan 0067.
- Change:
  - added selected live-follow account state and compact inspect controls in
    the live-follow accounts table.
  - joined the selected live-follow target with account-mirror status entries
    in the right inspector.
  - the inspector now exposes identity, account level, browser profile,
    provider guard state, next/last timing, active completion, content counts,
    mirror completeness, and same-origin status/catalog/completion route chips.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false`
  - `pnpm run install:user-runtime`
  - `curl http://auracall.localhost/status` reported `ok=true`, live follow
    `healthy`, 9 accounts, 5 enabled, and 0 attention.
  - `agent-browser` clicked `Inspect chatgpt wsl-chrome-3` on
    `http://auracall.localhost/dashboard` and verified the right inspector
    showed SoyLei expected/detected identity, account level `Pro`, guard
    `clear`, counts, and status/catalog/completion links.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/live-follow-account-inspector.png`
- External links:
  - `http://auracall.localhost/dashboard`
  - `https://auracall.ecochran.dyndns.org/dashboard`
- Next:
  - keep choosing UX slices from Plan 0067; route-addressable selected state or
    run/batch drill-down are the next reasonable read-only candidates.

## Turn 180 | 2026-05-18

- Goal: begin moving the React Health page from a stack of large diagnostic
  panels toward a denser operator console.
- Change:
  - replaced the four Health cards with one compact status strip.
  - collapsed API-key management behind a `Manage` control while leaving
    refresh and restart directly reachable.
  - removed explanatory top-of-page copy from Health, Runs, Search, and Chats.
  - tightened global top chrome, viewport spacing, tables, filter chips,
    archive/chat controls, and the right inspector.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build && pnpm run install:user-runtime`
  - `agent-browser` verified the installed dashboard at
    `http://auracall.localhost/dashboard`, selected `chatgpt / wsl-chrome-3`,
    and confirmed the Health inspector still populated correctly.
  - `agent-browser` verified a 390px viewport reports no document-level
    horizontal overflow.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/health-density-desktop-loaded.png`
  - `/tmp/auracall-operator-ux-dogfood/health-density-inspector.png`
  - `/tmp/auracall-operator-ux-dogfood/health-density-mobile.png`
- External links:
  - `http://auracall.localhost/dashboard`
  - `https://auracall.ecochran.dyndns.org/dashboard`
- Coordination:
  - non-UX dirty files from the parallel lane remain untouched:
    `src/config/model.ts` and `src/schema/types.ts`.
- Next:
  - continue density work on the Runs/Search surfaces or make Health selected
    state route-addressable.

## Turn 181 | 2026-05-18

- Goal: make the Health live-follow inspector route-addressable.
- Change:
  - the React operator shell now reads `?nav=health&provider=<provider>&runtime=<profile>`
    on load.
  - a direct Health URL preserves the selected provider/runtime while `/status`
    is still loading, then highlights the matching live-follow row and populates
    the inspector when account data arrives.
  - selecting a live-follow row updates the URL to the selected
    provider/runtime.
  - top navigation updates the `nav` query parameter, and browser `popstate`
    restores nav and selected live-follow account state.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build && pnpm run install:user-runtime`
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=health&provider=chatgpt&runtime=wsl-chrome-3`
    and verified the Health nav, selected row, and inspector populated for
    `eric.cochran@soylei.com`.
  - `agent-browser` selected `gemini / default` and verified the URL changed to
    `?nav=health&provider=gemini&runtime=default`.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/health-route-selected-loaded.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=health&provider=chatgpt&runtime=wsl-chrome-3`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=health&provider=chatgpt&runtime=wsl-chrome-3`
- Coordination:
  - left the parallel tenant-pool/API dirty files and docs untouched.
- Next:
  - continue density work on Runs/Search, or add route-addressable run/archive
    item selection using the same URL-state pattern.

## Turn 182 | 2026-05-18

- Goal: add compact provider service icons and make Search archive selection
  route-addressable for operator handoff links.
- Change:
  - added reusable provider badges for ChatGPT, Gemini, Grok, and unknown
    providers across Health, Search, and Chats surfaces.
  - Search now reads and writes
    `?nav=search&archiveItem=<base64url archive item id>`.
  - direct Search URLs initialize a placeholder archive item, fetch the stable
    `/v1/archive/items/b64/<id>` detail route, and populate the right
    inspector plus asset actions without running a new search.
  - Health selection clears archive item URL state, Search selection clears
    provider/runtime state, and other nav surfaces clear stale selection
    parameters.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search&archiveItem=cmVzcG9uc2U6cmVzcF8zYzU3ZDk5ZDJlNWU0NjAxOTcwMTQ5MzQ1ZGZhYjc0OQ`
    and verified the Search nav, selected archive id, detail-loaded state, and
    ChatGPT provider badge.
  - `agent-browser` opened `http://auracall.localhost/dashboard?nav=health`
    and verified Health rows render distinct ChatGPT, Gemini, and Grok provider
    badge classes.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-route-selected.png`
  - `/tmp/auracall-operator-ux-dogfood/provider-icons-health.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search&archiveItem=cmVzcG9uc2U6cmVzcF8zYzU3ZDk5ZDJlNWU0NjAxOTcwMTQ5MzQ1ZGZhYjc0OQ`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search&archiveItem=cmVzcG9uc2U6cmVzcF8zYzU3ZDk5ZDJlNWU0NjAxOTcwMTQ5MzQ1ZGZhYjc0OQ`
- Coordination:
  - left the parallel tenant-pool/API dirty files and docs untouched.
- Next:
  - implement a real Runs list/detail selection model, then apply the same URL
    state pattern to run ids.

## Turn 183 | 2026-05-18

- Goal: define the target Search workbench before implementing another
  incremental patch on the bulky current page.
- Decision:
  - the current Search form is a temporary archive proof, not the target
    operator UX.
  - Search should become a dense all-tenant workbench whose default view is all
    cached conversations across all configured providers and tenants, newest
    first, with live updates.
  - the main page surface should be a virtualized, infinitely scrollable table
    with adjustable/sortable/hideable columns and a compact command/facet bar,
    not a large form with provider/status string fields or a visible limit box.
  - provider, tenant, project, kind, status, agent/team, and artifact/file
    presence must be known-value facets. Unsupported free-text filter strings
    should not be accepted silently.
- Roadmap:
  - updated Plan 0067 with the Target Search Workbench design, wireframe, data
    model/API needs, route-state target, implementation roadmap, and acceptance
    criteria.
  - updated `ROADMAP.md` so the operator UX lane names the Search workbench as
    a dense all-tenant, live-updating table with facet filters and selected-row
    handoff URLs.
- Verification:
  - `git diff --check -- ROADMAP.md RUNBOOK.md docs/dev/plans/0067-2026-05-16-react-operator-ux-redesign.md`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Next:
  - implement the compact command/facet bar and the first virtualized
    all-tenant conversation table slice before adding archive/artifact rows.

## Turn 184 | 2026-05-18

- Goal: implement the first dense Search workbench slice from Plan 0067.
- Change:
  - replaced the bulky Search form with a compact command bar, live/pause and
    refresh actions, known-value kind/provider/status facet chips, and a dense
    scrollable all-tenant conversation table.
  - removed the visible limit field and provider/status free-text inputs from
    the operator Search page.
  - added sortable and resizable Search table columns with local preference
    persistence.
  - default Search ordering now uses newest-first conversation time where the
    catalog exposes a timestamp or where ChatGPT conversation ids contain a
    plausible timestamp prefix; undated Gemini/Grok rows remain visible but do
    not outrank dated rows.
  - added `?nav=search&row=<base64url catalog row id>` route state and right
    inspector restoration for selected catalog rows, while preserving legacy
    `archiveItem` compatibility.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://auracall.localhost/status | jq ...` returned
    `ok=true`, `liveFollow=healthy`, and `accounts=10`.
  - `agent-browser` opened `http://auracall.localhost/dashboard?nav=search`
    and verified 1,454 cached conversation rows, 80 rendered rows, no visible
    Limit field, no provider/status text inputs, active Time sorting, and a
    dated ChatGPT row first.
  - `agent-browser` selected a Search row and reloaded the direct URL; the row
    remained selected and the right inspector restored the catalog row.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-workbench-table-v5.png`
  - `/tmp/auracall-operator-ux-dogfood/search-workbench-selected-v2.png`
  - `/tmp/auracall-operator-ux-dogfood/search-workbench-direct-row-v2.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
  - `http://auracall.localhost/dashboard?nav=search&row=Y2F0YWxvZzpjb252ZXJzYXRpb25zOmNoYXRncHQ6d3NsLWNocm9tZS0zOjZhMGIxZWNmLWI0YTAtODNlYS05ZTkzLWEyNDQzNTU1ODRjNw`
- Limitations:
  - table virtualization is still a bounded render window, not true DOM
    virtualization.
  - provider/project/status facets are derived from loaded catalog rows.
  - artifact, upload, run, evidence, and semantic search rows still require a
    unified server-side Search projection.
- Next:
  - add a `/v1/search` projection with cursor pages, normalized facets, and
    merged conversation/archive/run/artifact rows; then wire the table to that
    endpoint.

## Turn 185 | 2026-05-18

- Goal: add the first server-side Search projection and wire the React Search
  workbench to it.
- Change:
  - added `GET /v1/search`, backed by a new read-only search projection service
    that merges account-mirror catalog rows with run-archive rows.
  - search rows now normalize source, source kind, display kind, provider,
    runtime profile, tenant, project, status, title, sort time, counts, links,
    and metadata.
  - the endpoint returns `object = "search_results"`, `rows`, `metrics`,
    `facets`, and opaque `nextCursor` values.
  - the React Search page now loads `/v1/search` pages instead of joining the
    account-mirror catalog in the browser; archive-backed rows can expose
    archive item links while mirror-backed rows retain catalog item links.
- Verification:
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm vitest run tests/runtime.searchProjectionService.test.ts tests/http.responsesServer.test.ts -t "search projection|unified search" --maxWorkers 1`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `/status` reported `ok=true`, `liveFollow=healthy`, `accounts=10`, and a
    populated `/v1/search` route.
  - `agent-browser` same-origin fetch to `/v1/search?limit=5` returned
    `object=search_results`, `rows=5`, `total=3894`, facet kinds for
    conversation/artifact/upload/run/project, and `nextCursor=true`.
  - `agent-browser` verified the Search table rendered `/v1/search` rows and
    direct `?nav=search&row=...` restoration selected a row after reload.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-v1-projection-loaded-v2.png`
  - `/tmp/auracall-operator-ux-dogfood/search-v1-projection-selected-v2.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - `/v1/search` uses simple substring query matching, not lexical ranking or
    semantic/vector ranking yet.
  - the React table still eagerly loads pages into client memory and uses a
    bounded render window, not true DOM virtualization.
- Next:
  - replace eager page loading with server-cursor incremental loading tied to
    table scroll, then add saved views and richer row actions.

## Turn 186 | 2026-05-18

- Goal: replace eager Search page hydration with cursor-driven incremental
  loading in the React operator UX.
- Change:
  - Search now fetches only the first 500-row `/v1/search` page at first paint.
  - scrolling near the bottom expands the bounded rendered row window and
    appends additional `/v1/search` cursor pages when the loaded page boundary
    is reached.
  - provider/status facets now prefer the server projection facets instead of
    only the currently rendered rows.
  - selected-row direct URLs can page forward until the selected row appears in
    the loaded cursor set.
  - client-side sort changes now reset the rendered window without re-fetching
    the server projection.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://127.0.0.1:18095/status` reported `ok=true` and the
    populated `/v1/search` route.
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search`; initial Search summary
    was `500 loaded / 3,899 matched / newest first / 80 rendered / more
    available`.
  - repeated table scrolling appended cursor pages; Search summary reached
    `1,500 loaded / 3,899 matched / newest first / 660 rendered / more
    available`.
  - selecting a Search row produced a stable
    `?nav=search&row=<base64url row id>` URL and reloading restored one
    selected row.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-cursor-initial-v2.png`
  - `/tmp/auracall-operator-ux-dogfood/search-cursor-scroll-v2.png`
  - `/tmp/auracall-operator-ux-dogfood/search-cursor-selected-reload-v2.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - the table still uses a bounded render window, not true DOM virtualization.
  - multi-provider and multi-status filtering remains client-side over loaded
    rows; single provider/status filters are passed through to `/v1/search`.
  - semantic/vector ranking and saved views remain open Search workbench items.
- Next:
  - add true table virtualization and richer row-specific actions, or move the
    same URL-state and dense-table treatment to Runs.

## Turn 187 | 2026-05-18

- Goal: make the Search workbench table truly virtualized while preserving
  cursor paging and selected-row handoff URLs.
- Change:
  - Search rows now render through a fixed 38px row-height virtual window with
    top/bottom spacers, so the scroll height represents the loaded result set
    while the DOM contains only viewport rows plus overscan.
  - bottom-scroll cursor loading is guarded by a synchronous single-flight ref
    so rapid scroll events cannot append the same cursor page twice.
  - live polling refreshes the first page without resetting scroll position;
    explicit filter, sort, and refresh actions still reset the table to the top.
  - direct `?nav=search&row=<base64url row id>` URLs now continue cursor paging
    after the first page loads, and when the selected row appears the virtual
    table scrolls it into view.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://127.0.0.1:18095/status` reported `ok=true` and the
    populated `/v1/search` route.
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search`; initial Search summary
    was `500 loaded / 3,900 matched / newest first / 31 DOM rows / more
    available`.
  - after scrolling to the loaded bottom, Search advanced to `1,000 loaded`
    while staying at roughly 26 DOM rows.
  - a selected row from a later loaded page produced a stable `row=` URL; after
    reload, Search paged forward to `1,500 loaded` and restored one selected
    row in the virtual table.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-virtual-initial-v1.png`
  - `/tmp/auracall-operator-ux-dogfood/search-virtual-midscroll-v1.png`
  - `/tmp/auracall-operator-ux-dogfood/search-virtual-cursor-v4.png`
  - `/tmp/auracall-operator-ux-dogfood/search-virtual-selected-reload-v3.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - pinned columns, column reorder/hide controls, and keyboard row navigation
    remain open Search table work.
  - semantic/vector ranking and saved views are still not implemented.
  - multi-provider and multi-status filters still apply client-side over loaded
    rows unless exactly one provider/status is selected.
- Next:
  - add keyboard row navigation and pinned first columns, then add row-specific
    quick actions.

## Turn 188 | 2026-05-18

- Goal: improve Search table ergonomics with pinned identity columns and
  keyboard row navigation.
- Change:
  - Time, Provider, and Tenant columns are now pinned while the Search table
    scrolls horizontally.
  - the Search result grid is focusable and handles ArrowUp/ArrowDown,
    PageUp/PageDown, Home, and End to move selected rows.
  - keyboard selection uses the same selected-row state, URL handoff, virtual
    scroll-to-selected behavior, and right-inspector detail loading as mouse
    selection.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://127.0.0.1:18095/status` reported `ok=true` and the
    populated `/v1/search` route.
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search` and verified the Search
    grid rendered `500 loaded / 3,900 matched / newest first / 31 DOM rows /
    more available`.
  - after setting horizontal scroll to `640`, the pinned Time, Provider, and
    Tenant cells stayed at the left edge while non-pinned cells scrolled
    underneath them.
  - focusing the grid and pressing ArrowDown selected row index `2` and updated
    the `row=` URL; PageDown moved selection to row index `9` and updated the
    URL again.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-pinned-columns-v1.png`
  - `/tmp/auracall-operator-ux-dogfood/search-keyboard-nav-v1.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - column reorder/hide controls remain open.
  - semantic/vector ranking, saved views, and row-specific quick actions remain
    open Search workbench items.
- Next:
  - add compact row quick actions for copy handoff link, inspect source, and
    provider/cached asset actions where available.

## Turn 189 | 2026-05-18

- Goal: add compact Search row quick actions without increasing table bulk.
- Change:
  - added an Actions column to the virtualized Search table.
  - visible rows now expose icon-only actions with hover labels for Inspect row,
    Copy handoff link, Open provider link, and Download cached asset when the
    search projection exposes those links.
  - switched Search rows from nested button rows to valid grid-row markup so
    row selection, keyboard navigation, and per-row action buttons can coexist.
  - cleaned table cell class generation to avoid empty class tokens.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `/status` returned `ok=true` after restart and advertised `/v1/search`.
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search` and verified 31 visible
    virtualized rows, 31 action cells, 74 compact action controls, 8 provider
    links, and 4 cached-asset links.
  - clicking Inspect row selected one row and produced a stable
    `?nav=search&row=...` URL.
  - clipboard readback was blocked by browser permission, but the Copy handoff
    link button executed without a frontend exception.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-row-actions-v2.png`
  - `/tmp/auracall-operator-ux-dogfood/search-row-actions-installed-v1.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - semantic/vector ranking, saved views, and reorderable/hideable columns are
    still open.
  - kind-specific artifact/run/evidence actions still need their own workflows
    beyond the generic inspect/link/open/download actions.
- Next:
  - continue Search ergonomics with saved views or column visibility/reorder
    controls, or move to richer artifact/run inspectors.

## Turn 190 | 2026-05-18

- Goal: add operator-controlled Search column visibility and ordering.
- Change:
  - extended persisted Search table preferences with `hidden` and `order`.
  - added a compact Columns popover to the Search command bar.
  - Time, Provider, and Tenant stay pinned and always visible; non-pinned
    columns can be hidden and moved left/right.
  - refactored Search row rendering to derive headers and cells from the same
    active column list so hiding/reordering cannot desynchronize the table.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search`, reset local Search table
    preferences, verified 31 virtualized rows and the default header order,
    opened Columns, hid `IDs`, moved `Status` left, and verified the table
    rendered 10 cells per row with persisted `hidden:["ids"]` and updated
    `order`.
  - `agent-browser errors` and console tail were empty after the interaction.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-columns-menu-v1.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - column preferences are local browser state, not named/shared saved views.
  - semantic/vector ranking and richer kind-specific artifact/run/evidence
    workflows remain open.
- Next:
  - implement saved Search views or improve the right-side inspectors for
    artifacts, runs, and evidence.

## Turn 191 | 2026-05-18

- Goal: add local saved Search views for common operator workbench states.
- Change:
  - added `auracall.operatorUx.searchViews.v1` browser-local storage for saved
    Search views.
  - saved views capture query text, kind/provider/status facets, table sort,
    column widths, hidden columns, and non-pinned column order.
  - added a compact Views popover for save, apply, and delete.
  - active view indication clears when filters, sort, or table layout are
    manually changed.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search`, reset local Search view
    and table preference stores, saved a `Transcript ChatGPT` view with query
    and provider facet state, applied the view back to the workbench, and
    verified delete behavior with a temporary `Delete Smoke` view.
  - `agent-browser errors` and console tail were empty after the interaction.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-saved-views-v1.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - saved views are local browser state only; shared/server-backed presets need
    an explicit API ownership model.
  - semantic/vector ranking and richer kind-specific artifact/run/evidence
    workflows remain open.
- Next:
  - improve Search result inspectors for artifacts/runs/evidence, or design the
    server-backed saved-view contract.

## Turn 192 | 2026-05-18

- Goal: improve the Search right-pane inspector for artifact/archive rows.
- Change:
  - added a compact Search inspector summary card before raw JSON.
  - the card surfaces title, status, provider, runtime, tenant, project,
    response, batch, agent, file, MIME, asset posture, and route chips.
  - Search rows whose fetched detail is a run archive item now reuse the archive
    asset preview path, so generated artifacts/uploads can show file and local
    asset availability in the right pane.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `agent-browser` opened
    `http://auracall.localhost/dashboard?nav=search`, selected an Artifact
    row, and verified the summary card updated after detail load from
    `MIME unknown` to `application/json` for `first_pass_readout.json`.
  - the same smoke verified the archive Asset panel rendered with
    `Available: no` for the unmaterialized sandbox artifact and no
    `Detail unavailable` state.
  - `agent-browser errors` and console tail were empty after the interaction.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-inspector-artifact-v1.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - run/evidence-specific inspectors remain generic.
  - missing generated artifacts are reported as not materialized; explicit
    materialization/retry controls are still open work.
- Next:
  - add run/evidence-specific inspector panels or design materialization
    controls for missing generated artifacts.

## Turn 193 | 2026-05-18

- Goal: add run/evidence-specific panels to the Search right-pane inspector.
- Change:
  - added a run inspector panel for response/archive-backed Search rows.
  - the panel surfaces source kind, response id, batch id/index, agent, team,
    runtime, step count, output count, requested outputs, prompt preview, and
    route chips for response/runtime-run/archive links.
  - added an evidence inspector panel keyed to the same archive/search metadata
    contract for producer, schema, evidence id, linked archive item, response,
    batch, conversation, runtime, summary, bounded JSON preview, and routes.
  - kept the panels compact and separate from the raw JSON preview.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `curl -fsS http://auracall.localhost/status | jq '{ok, port: .binding.port, dashboard: .routes.operatorBrowserDashboardUrl}'`
  - `agent-browser` opened `http://auracall.localhost/dashboard?nav=search`,
    filtered to Runs, selected a run row, and verified the served right-pane Run
    panel showed response, batch, agent, step/output, runtime, and route fields.
  - `agent-browser` confirmed `/v1/search?kind=evidence&limit=3` currently has
    `total=0`, so the evidence panel is implemented but could not be live-row
    dogfooded against current cache contents.
  - `agent-browser errors` and console tail were empty.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-inspector-run-v1.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - evidence rows are absent in the current cache, so evidence rendering awaits
    the next evidence-producing workflow for live validation.
  - deeper run timelines and missing-artifact materialization controls remain
    open.
- Next:
  - add materialization controls for missing generated artifacts, or expand the
    run inspector into a step/output timeline.

## Turn 194 | 2026-05-18

- Goal: make missing generated-artifact state actionable from the Search
  inspector without claiming materialization happened.
- Change:
  - the archive Asset panel now shows a missing-local-asset control block when
    a selected archive item has no readable asset route.
  - the block explains the missing state, including sandbox artifact references
    that were not locally cached.
  - added operator controls for archive index backfill and archive asset lookup
    using checksum/cache/provider artifact/artifact ids when available.
  - exposed route chips for provider URI, response, provider conversation, and
    asset lookup from the missing-asset panel.
- Verification:
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `agent-browser` opened `http://auracall.localhost/dashboard?nav=search`,
    filtered to Artifacts, selected an unmaterialized
    `first_pass_readout.json` sandbox artifact, and verified the missing-local
    asset controls rendered.
  - `agent-browser` clicked Lookup and verified the panel reported `0` matching
    local assets for the selected sandbox artifact.
  - `agent-browser` clicked Backfill and verified the panel reported
    `Archive refreshed: 1,372 indexed items`.
  - `agent-browser errors` was empty; the console tail only contained an
    unrelated `JQMIGRATE` log from the shared browser context.
  - `/status` returned `ok: true` on port `18095`.
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-missing-asset-controls-v1.png`
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Limitations:
  - this is a diagnostic/retry-control slice. It does not add a provider-backed
    materialize endpoint because that needs an explicit runtime contract to
    avoid reopening provider tabs from the dashboard without queue ownership.
- Next:
  - design and implement a queue-backed artifact materialization job endpoint
    that uses the same browser ownership, rate-limit, and identity gates as
    normal AuraCall work.

## Turn 195 | 2026-05-18

- Goal: add the first provider-backed materialization endpoint for missing
  generated artifacts.
- Change:
  - added `ArchiveMaterializationService` to convert generated-artifact archive
    records into provider conversation artifact download requests.
  - added `POST /v1/archive/items/{archive_item_id}/materialize`, surfaced it
    in `/status.routes`, and wired the route through foreground AuraCall work
    pressure so lazy live-follow yields while provider recovery runs.
  - successful recovery writes local path, MIME, SHA-256 checksum, file size,
    cache key, `fileAvailable`, and `/asset` route facts back into the archive
    index.
  - the Search asset inspector now shows a Materialize action beside Backfill
    and Lookup for missing assets, displays warning/success status, and swaps
    in the returned archive item so the local asset route becomes available
    without a page refresh.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts tests/runtime.archiveMaterializationService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "materializes a run archive item through the API surface|reports provider auth preflight failures as materialization conflicts|reports development-only posture through the status endpoint"`
  - `pnpm run ux:build`
  - `pnpm exec tsc -p tsconfig.build.json --pretty false --incremental false`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `/status` returned `ok: true`, port `18095`, and
    `runArchiveItemMaterializeTemplate`.
  - `agent-browser` opened `http://auracall.localhost/dashboard?nav=search`,
    selected an unmaterialized `first_pass_readout.json` artifact, and verified
    the Asset panel exposed `Materialize`, `Provider Chat`, and route chips.
  - `agent-browser errors` returned no browser errors.
  - live backfill through the same-origin dashboard path rebuilt `1,372`
    archive items and confirmed generated artifacts now carry
    `providerConversationId` / `providerConversationUrl` from the parent browser
    run.
  - live materialization reached the provider auth preflight and returned HTTP
    `409` with `provider_auth_conflict` because `wsl-chrome-3` is bound to
    ChatGPT identity `eric.cochran@soylei.com` but the ChatGPT web-app session
    currently reports `ecochran76@gmail.com`. This is not a Chrome/Google
    browser sign-in assertion.
- External links:
  - `http://auracall.localhost/dashboard?nav=search`
  - `https://auracall.ecochran.dyndns.org/dashboard?nav=search`
- Evidence:
  - `/tmp/auracall-operator-ux-dogfood/search-materialize-action-final-v1.png`
- Limitations:
  - this slice adds a foreground operator/API recovery path, not a persisted
    async materialization job with progress polling.
  - live provider materialization is currently blocked for the tested SoyLei
    artifact by ChatGPT web-app account drift inside `wsl-chrome-3`; the
    endpoint now reports that as an operator-actionable conflict instead of a
    generic server error. The Chrome/Google browser sign-in may be different
    and is not the identity being evaluated here.
- Next:
  - restore/switch the ChatGPT web-app session inside `wsl-chrome-3` to
    `eric.cochran@soylei.com`, then retry the same materialization route. After
    that, design the durable async job/progress wrapper if live recovery takes
    longer than an operator HTTP request should.

## Turn 196 | 2026-05-19

- Goal: add the durable async materialization job wrapper for missing
  generated-artifact recovery without changing the existing foreground route.
- Change:
  - added `ArchiveMaterializationJobService` with a user-scoped persisted job
    store under the run archive tree.
  - added `POST /v1/archive/materializations` to queue provider-backed archive
    materialization and `GET /v1/archive/materializations/{job_id}` to poll the
    job.
  - active jobs for the same archive item are de-duplicated, job execution is
    serialized in-process, provider/auth failures are persisted as terminal job
    errors, and queued/running jobs left by a previous API/MCP process are
    marked failed on startup instead of remaining indefinitely active.
  - added CLI parity with `auracall api archive-materialization-create` and
    `auracall api archive-materialization-status`.
  - added MCP parity with `run_archive_materialization_create` and
    `run_archive_materialization_job`.
  - kept `POST /v1/archive/items/{archive_item_id}/materialize` as the
    foreground compatibility route.
- Verification:
  - `pnpm vitest run tests/runtime.archiveMaterializationJobService.test.ts tests/cli/apiRunArchiveCommand.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "run archive materialization" --maxWorkers 1`
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - `/status` returned `ok: true` with `runArchiveMaterializationsCreate` and
    `runArchiveMaterializationTemplate`.
  - live `POST /v1/archive/materializations` with a deliberately missing
    archive id returned a queued job, and subsequent
    `GET /v1/archive/materializations/{job_id}` returned terminal `failed`
    with `not_found_error` without launching provider browser work.
- Notes:
  - an initial broad `tests/http.responsesServer.test.ts` run was stopped after
    it entered unrelated browser-heavy cases; the targeted HTTP materialization
    route test passed after narrowing.
- Next:
  - wire operator dashboard polling/control affordances for async
    materialization jobs before using the async path as the primary private
    transcript recovery path.

## Turn 197 | 2026-05-19

- Goal: add the backend polling foundation for async archive materialization
  jobs without touching operator UX files.
- Change:
  - added `ArchiveMaterializationJobService.listJobs(...)` with status,
    archive item id, and limit filters.
  - added `GET /v1/archive/materializations` for job list polling, while
    preserving `POST /v1/archive/materializations` and
    `GET /v1/archive/materializations/{job_id}`.
  - added CLI parity with `auracall api archive-materialization-jobs`.
  - added MCP parity with `run_archive_materialization_jobs`.
  - updated the roadmap, Plan 0066, OpenAI endpoint docs, dev journal, and
    durable fixes log.
- Verification:
  - `pnpm vitest run tests/runtime.archiveMaterializationJobService.test.ts tests/cli/apiRunArchiveCommand.test.ts tests/http.responsesServer.test.ts -t "archive materialization" --maxWorkers 1`
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - `/status` returned `ok: true` with `runArchiveMaterializationsCreate`,
    `runArchiveMaterializationsList`, and `runArchiveMaterializationTemplate`.
  - live `GET /v1/archive/materializations?status=terminal&limit=5` returned
    `object = "run_archive_materialization_jobs"`, one terminal failed smoke
    job from the prior missing-id probe, and `active = 0`.
- Next:
  - hand the list endpoint to the UX session for dashboard polling/control
    wiring, or add a backend cancel action if operators need explicit
    cancellation before UX integration.

## Turn 198 | 2026-05-19

- Goal: add explicit backend cancellation semantics for async archive
  materialization jobs before UX control wiring.
- Change:
  - added terminal `cancelled` status for archive materialization jobs.
  - added `ArchiveMaterializationJobService.cancelJob(...)`.
  - added `POST /v1/archive/materializations/{job_id}` with
    `{"action":"cancel"}` for queued-job cancellation.
  - added CLI parity with `auracall api archive-materialization-cancel`.
  - added MCP parity with `run_archive_materialization_cancel`.
  - kept running jobs non-abortable: cancellation after provider work starts
    returns conflict instead of claiming to stop live browser work.
  - updated the roadmap, Plan 0066, OpenAI endpoint docs, dev journal, and
    durable fixes log.
- Verification:
  - `pnpm vitest run tests/runtime.archiveMaterializationJobService.test.ts tests/cli/apiRunArchiveCommand.test.ts tests/http.responsesServer.test.ts -t "archive materialization" --maxWorkers 1`
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - `/status` returned `ok: true` with
    `runArchiveMaterializationTemplate = "/v1/archive/materializations/{job_id}"`.
  - live cancel-route smoke created a missing-id materialization job and then
    posted `{"action":"cancel"}` to the job route. The job had already failed
    before the cancel request reached the service, so the route returned HTTP
    `409 conflict_error` with the documented "only queued jobs can be
    cancelled" message. Unit coverage proves the queued cancellation path
    itself without launching provider browser work.
- Next:
  - hand the cancel/list/status endpoints to the UX session; add cooperative
    cancellation to provider materializers only if running-job abort becomes a
    required operator workflow.

## Turn 200 | 2026-05-19

- Goal: lock down the cancellation behavior for queued jobs that wait behind
  another materialization in the serialized runner.
- Change:
  - added regression coverage proving a cancelled queued job is re-read from
    persisted state before provider work starts after an earlier running job
    completes.
  - kept production semantics unchanged: queued cancellation is honored before
    provider work; running jobs remain conflict-only until materializers accept
    cooperative cancellation.
- Verification:
  - `pnpm vitest run tests/runtime.archiveMaterializationJobService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/runtime.archiveMaterializationJobService.test.ts tests/cli/apiRunArchiveCommand.test.ts tests/http.responsesServer.test.ts -t "archive materialization" --maxWorkers 1`
  - `pnpm run build`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
- Next:
  - hand the locked cancellation/list/status contract to the UX session.

## Turn 202 | 2026-05-20

- Goal: wire the operator Search Asset panel to the async archive
  materialization job contract.
- Change:
  - changed missing-asset materialization from a foreground-only control to
    async job creation through `POST /v1/archive/materializations`.
  - added latest-job lookup by archive item id, active queued/running polling,
    compact job status display, job list/detail route chips, and queued-job
    cancellation.
  - changed Search row detail selection to prefer archive item detail over
    catalog detail when both routes are available, so artifact rows render the
    Asset panel.
  - kept the foreground materialize route visible as an explicit handoff/debug
    route instead of making it the primary operator action.
  - updated the roadmap and durable fixes log.
- Verification:
  - `pnpm run ux:build`
  - `git diff --check`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - `curl -fsSI 'http://127.0.0.1:18095/dashboard?nav=search'` returned
    `HTTP/1.1 200 OK`.
  - `/status` advertised `runArchiveMaterializationsCreate`,
    `runArchiveMaterializationsList`, and `runArchiveMaterializationTemplate`.
  - `pnpm tsx bin/auracall.ts api archive-materialization-jobs --port 18095
    --status terminal --limit 1 --json` returned
    `object = "run_archive_materialization_jobs"` and `active = 0`.
  - `agent-browser` opened the installed Search dashboard, selected the
    Artifacts filter, and inspected an artifact row. The live row only exposed
    catalog detail, not an archive item route, so the Asset panel render path
    was build-validated but not live-clicked against a generated-artifact
    archive row in this runtime state.
- Next:
  - keep the next slice on deeper run-lineage or semantic/vector ranking unless
    live artifact materialization exposes a provider-specific failure.

## Turn 204 | 2026-05-20

- Goal: make run lineage scannable in the Search inspector without widening the
  API surface.
- Change:
  - added a compact lineage strip to the existing run-specific inspector.
  - uses existing row/archive metadata for source, response or batch, owner,
    AuraCall runtime profile/state, and output/step counts.
  - keeps the strip responsive in the mobile selected-inspector overlay.
  - updated the roadmap and durable fixes log.
- Verification:
  - `pnpm run ux:build`
  - `git diff --check`
  - `pnpm run install:user-runtime` installed the updated operator bundle.
  - `systemctl --user restart auracall-api.service` completed and
    `systemctl --user is-active auracall-api.service` returned `active`.
  - `curl -fsSI 'http://127.0.0.1:18095/dashboard?nav=search'` returned
    `HTTP/1.1 200 OK`.
  - `/status` returned `ok = true`, version `0.1.1`, and 66 routes.
  - `agent-browser` opened the installed Search dashboard, inspected the first
    Run row, and confirmed `.run-lineage-timeline` rendered Source, Response,
    Agent, Runtime, and Outputs from the live row.
- Next:
  - continue the Search roadmap with semantic/vector ranking or
    shared/server-backed view presets.

## Turn 206 | 2026-05-20

- Goal: close the OpenClaw/company-bot handoff for ChatGPT browser
  `--write-output --wait` lifecycle hangs after output materialization.
- Change:
  - ChatGPT browser cleanup no longer treats browser-operation dispatcher lock
    release as a keep-browser signal.
  - explicit keep-browser and preserve-on-error still leave the managed browser
    profile open for operator recovery.
  - the background conversation URL hint poll is cancelled before the final
    post-response URL refresh so no long timer remains after answer capture.
  - kept AuraCall-launched Chrome child processes are detached from the CLI
    event loop so `keepBrowser: true` does not block process exit.
  - successful inline browser `--wait` CLI runs now explicitly exit after the
    session log stream is flushed, preventing non-critical browser/CDP handles
    from holding completed one-shot commands open.
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts
    tests/cli/sessionRunner.test.ts`
  - `git diff --check`
  - `pnpm exec tsc --noEmit --pretty false` still reports unrelated existing
    test fixture typing drift outside this slice, but no touched-file error.
  - Initial installed-runtime live smoke with `pro-extended-chatgpt-soylei`
    reproduced the handoff: `rc=124`, answer captured, output file written,
    then the CLI remained alive under the outer timeout.
  - Second installed-runtime live smoke reproduced the same post-save timeout
    with `/tmp/auracall-write-output-lifecycle-smoke-2.md`.
  - A third diagnostic smoke was terminated before answer materialization after
    process inspection showed it had not reached the post-save state.
  - Final installed-runtime live smoke passed: direct ChatGPT browser
    `--write-output --wait` returned `rc=0`, saved
    `/tmp/auracall-write-output-lifecycle-smoke-4.md`, and the file contained
    only `AURACALL WRITE OUTPUT LIFECYCLE SMOKE FOUR`.
- Next:
  - rerun company-bot's non-posting AuraCall backup wrapper to verify it
    reports `auracall/ordinary_success/rc=0` instead of materialized recovery.

## Turn 209 | 2026-05-20

- Goal: tighten backend cache freshness for uploaded and generated files before
  more Search UX work depends on the archive asset panel.
- Change:
  - archive reads now refresh indexed file-bearing rows from local filesystem
    evidence before returning list/detail/asset-lookup data.
  - refreshed upload and generated-artifact rows persist changed
    `fileAvailable`, file size, checksum, cache key, and asset-route fields
    back into the user-scoped archive index.
  - detail and asset reads now use the same refreshed indexed item path instead
    of bypassing refresh through direct index lookup.
  - this remains browser-free: it only checks local paths already recorded in
    the archive and does not materialize missing provider assets.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/runtime.archiveMaterializationService.test.ts
    tests/runtime.searchProjectionService.test.ts --maxWorkers 1`
  - `git diff --check`
  - `pnpm run build`
  - `pnpm exec tsc --noEmit --pretty false` still reports existing unrelated
    test fixture typing drift in HTTP/materialization/search tests.
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - `/status` returned `ok: true` on port `18095`.
  - `auracall api archive-backfill --port 18095 --json` rebuilt the live
    archive index to 1425 items: 148 uploads, 319 generated artifacts, and 338
    provider conversations.
  - live `/v1/search?kind=artifact&limit=5` returned run-archive artifact rows
    first; rows with readable local files exposed `fileAvailable: true` and an
    archive asset route.
- Next:
  - add provider-specific materializer improvements only for artifact rows that
    have provider conversation context but still lack local files after the
    async recovery job runs.

## Turn 211 | 2026-05-20

- Goal: improve backend generated-artifact recovery for ChatGPT sandbox
  downloads that have provider conversation context but no local asset.
- Change:
  - archive materialization now parses sparse ChatGPT archive artifact ids of
    the form `<message_id>:download:sandbox:/...` into provider artifacts with
    the sandbox URI and message id.
  - ChatGPT download materialization can tag visible `a[href]` downloads as
    well as `button.behavior-btn` controls while preserving existing behavior
    button index matching.
  - before reopening provider browser work, generated-artifact materialization
    searches the archive for a readable sibling asset with the same provider
    conversation and sandbox URI/file evidence; matching missing rows are
    linked to that local asset and reindexed.
- Verification:
  - `pnpm vitest run tests/runtime.archiveMaterializationService.test.ts
    --maxWorkers 1`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts
    tests/runtime.archiveMaterializationService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts
    tests/runtime.archiveMaterializationService.test.ts
    tests/runtime.archiveMaterializationJobService.test.ts
    tests/runtime.archiveService.test.ts --maxWorkers 1`
  - `git diff --check`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - first live async materialization job
    `ramj_20f8d133bac6463cb6d81250c65c532e` reached ChatGPT but skipped with
    no local file, proving normalization alone was not enough.
  - direct `conversations artifacts fetch` for the same ChatGPT conversation
    returned `rc=0`, found two sandbox artifacts, and materialized one file via
    `captured-anchor-fetch`.
  - after adding duplicate-asset reuse, live job
    `ramj_10b0d4a33b2e47a0b7c2c16726f740df` succeeded without another
    provider fetch and linked the missing sibling row to the existing local
    asset with `method = existing-archive-asset`.
  - `auracall api archive-item` confirmed the formerly missing row now has
    `fileAvailable = true`, an asset route, and `sourceArchiveItemId` pointing
    to the materialized sibling row.
- Next:
  - remaining provider-specific work should focus on generated-artifact rows
    with no matching materialized sibling asset.

## Turn 212 | 2026-05-20

- Goal: repair generated-artifact archive rows when provider recovery already
  wrote the local file but the archive index stayed stale.
- Change:
  - archive materialization now checks the exact item-specific materialized
    archive directory before sibling reuse or provider/browser recovery.
  - archive list/detail/asset-lookup refresh now discovers files in that same
    directory and persists missing `localPath`, MIME type, checksum, cache key,
    file size, file availability, and asset route back into the user-scoped
    archive index.
  - the repair is browser-free and only uses local filesystem evidence under
    `~/.auracall/runtime/archive/materialized/`.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/runtime.archiveMaterializationService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts
    tests/runtime.archiveMaterializationService.test.ts
    tests/runtime.archiveMaterializationJobService.test.ts
    tests/runtime.archiveService.test.ts --maxWorkers 1`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - live materialization job `ramj_20c01dc5563044ecbee81c46b0c68e40`
    succeeded with `method = existing-materialized-directory`, set
    `fileAvailable = true`, and wrote SHA-256/cache-key metadata without
    opening provider recovery.
  - live archive read with
    `auracall api archive --timeout-ms 30000 --kind generated_artifact --limit 1
    --json` refreshed the index: missing generated artifacts dropped from 140
    to 127 and item-directory-recoverable rows dropped from 13 to 0.
- Next:
  - remaining misses are no longer stale local-directory rows: 70 Gemini
    generated-artifact placeholders lack provider conversation/local file
    evidence, and 57 ChatGPT rows still need real provider/browser recovery.

## Turn 213 | 2026-05-20

- Goal: reuse provider conversation-attachment cache files for stale ChatGPT
  sandbox archive rows.
- Change:
  - added a shared cache lookup that scans
    `~/.auracall/cache/providers/<provider>/<identity>/conversation-attachments/<conversation-id>/artifact-fetch-manifest.json`.
  - archive refresh and explicit materialization now link generated-artifact
    rows to a materialized conversation-attachment file when provider,
    conversation, project, URI/file evidence, and local file existence match.
  - kept ChatGPT DOM download targeting strict; this fixes stale
    user-message/assistant-message duplicate rows by reusing the cached file
    after a provider fetch has already downloaded it.
- Verification:
  - `pnpm vitest run tests/runtime.archiveService.test.ts
    tests/runtime.archiveMaterializationService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts
    tests/runtime.archiveMaterializationService.test.ts
    tests/runtime.archiveMaterializationJobService.test.ts
    tests/runtime.archiveService.test.ts --maxWorkers 1`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `systemctl --user restart auracall-api.service`
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - live `conversations artifacts fetch` for
    `6a0bc67c-605c-83ea-a021-d9dd5b7a18ba` materialized one cached
    `first_pass_readout.json`, though the wrapper exited via outer timeout
    after printing the result.
  - passive DOM inspection confirmed one visible assistant-turn download
    button and two stale sparse archive rows for the same file.
  - a live archive read then linked both stale rows to the cached file with
    `method = cached-conversation-attachment`.
  - live generated-artifact missing count dropped from 127 to 74; ChatGPT
    missing dropped from 57 to 4.
- Next:
  - remaining ChatGPT misses are three old `legacy_readout.json` sandbox rows
    without cached fetch manifests, plus one schema/test image placeholder with
    no provider conversation.

## Turn 214 | 2026-05-22

- Active plan:
  `docs/dev/plans/0069-2026-05-22-history-backed-artifact-materialization.md`
- Goal: audit the backend tool gap for using mirrored provider history to
  recover downloadable artifacts instead of only reading historical text.
- Result:
  - confirmed account mirror is currently a cache-only history/catalog surface.
  - confirmed provider/`LLMService` materialization primitives exist for known
    historical conversations.
  - confirmed the missing backend surface is a durable history-backed
    materialization job lane that accepts account-mirror catalog items or
    provider conversation ids and writes downloaded assets into the existing
    identity-scoped cache/archive.
  - wired the new plan into `ROADMAP.md` and recorded the detailed current
    audit in `docs/dev/dev-journal.md` Turn 241.
- Verification target:
  - `auracall api search --port 18095 --kind artifact --asset-availability unavailable --limit 20 --json`
  - source audit of account mirror, provider adapters, `LLMService`, archive
    materialization, HTTP, CLI, and MCP surfaces.

## Turn 215 | 2026-05-23

- Active plan:
  `docs/dev/plans/0069-2026-05-22-history-backed-artifact-materialization.md`
- Goal: close the bounded history-backed materialization lane after provider
  follow-through and live Gemini proof.
- Result:
  - closed Plan 0069 after API/CLI/MCP history materialization surfaces,
    cache-only catalog guarantees, ChatGPT live recovery, Gemini live
    duplicate-title skip evidence, and Grok unsupported evidence were recorded.
  - live Gemini mirror completion
    `acctmirror_completion_1458d838-cfb1-46b6-b32a-195b29e2d262` completed one
    bounded pass with provider guard clear and `media = 0`.
  - post-refresh media reconciliation job
    `hmj_e4e23eab843e4aba87ca9e3c78540238` skipped both tested Gemini media
    rows because five cached conversations shared the exact title and no unique
    cached media or usable timestamp evidence existed.
- Verification target:
  - `pnpm run plans:audit -- --keep 69`
  - targeted Plan 0069 unit/integration tests and static gates recorded in
    `docs/dev/dev-journal.md` Turns 242-261.
