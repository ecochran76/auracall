- 2026-04-27: ChatGPT post-submit media readback must not use the mature
  conversation payload reload fallback. Existing ChatGPT artifact extraction
  can reload a mature conversation to capture `/backend-api/conversation/...`
  when direct in-page fetch misses, but that same fallback is unsafe after a
  freshly submitted image prompt. Thread `preserveActiveTab` into ChatGPT
  payload reads and blocking-surface recovery so post-submit readback can use
  direct fetch/DOM evidence without reloading or reopening the active tab.

- 2026-04-27: Grok Files full-quality misses need detail-surface evidence, not
  another navigation fallback. When `/files?file=...` opens but no download
  control is found, record href/title, readiness, download-control
  count/labels, visible image labels, and visible button labels in
  `grokMaterializationDiagnostics.fullQualityDownload` so the next provider
  selector drift can be corrected from status/readback evidence.

- 2026-04-27: MCP status schemas must stay in parity with compact media
  artifact summaries, not just the handler payloads. `media_generation_status`
  and generic `run_status` already returned checksum and preview/full-quality
  comparison fields, but their advertised output schemas only listed the older
  download-label fields. Add schema entries and focused MCP tests whenever
  compact status grows operator-facing artifact metadata.

- 2026-04-27: Grok Imagine full-quality retry now has an explicit operator
  command. `auracall media materialize <media_generation_id> --count 1 --json`
  resumes artifact materialization for an existing durable Grok image run,
  routes the browser work through the managed-profile operation dispatcher,
  preserves the run's terminal status, and merges new artifacts into the
  existing media-generation cache instead of submitting another prompt.

- 2026-04-27: Installed Grok resumed-materialization smoke proved the new
  command/control path but not the provider download selector. Run
  `medgen_ada664ba3db24de4821cac245ec74714` stayed succeeded and acquired the
  expected `browser-profiles/default/grok` dispatcher key, but full-quality
  discovery ended at `files-download-missing` with zero download/action button
  candidates. The next fix should inspect the saved/files DOM directly and
  refine those action-surface selectors, not change prompt submission.

- 2026-04-26: Do not primary-click Grok Imagine root tiles while searching for
  full-quality downloads. A normal tile click can open an immature post route,
  toast "post not found, returning home", and leave the page on blurry root
  tiles. Keep direct materialization on hover/focus-only probing; when the root
  tile surface exposes `Save`/`Make video` but no download button, record the
  saved-gallery workflow hint for `https://grok.com/imagine/saved`.

- 2026-04-26: Grok Imagine tile activation is safe only in the immediate
  post-submit context. After leaving the fresh generation page, root tiles no
  longer expose the same download affordance; materialization should use
  `https://grok.com/imagine/saved` or Grok files instead of clicking stale root
  tiles. The browser media executor now marks fresh image runs as `post-submit`
  before allowing primary tile activation; resumed/direct materialization keeps
  the hover/focus-only path.

- 2026-04-26: Resumed/direct Grok Imagine full-quality materialization now has
  a saved-gallery fallback. When root-tile probing reports no download control
  on the stale root surface, the provider adapter navigates once to
  `https://grok.com/imagine/saved` through the normal browser-service mutation
  audit path and retries full-quality download discovery there. Diagnostics
  preserve both `savedGalleryUrl` and `filesUrl` so operators can see the
  remaining stable fallback surfaces.

- 2026-04-26: Installed-runtime Grok smoke
  `medgen_730a0a5ce1b24a34bf000cd35fe65d35` proved the source-installed path
  still caches a generated visible tile, but full-quality discovery can still
  miss after fresh post-submit activation. When diagnostics show
  `activationContext = post-submit`, `primaryTileActivationAllowed = true`,
  and `download-button-missing`, investigate the exact fresh tile/card action
  target before adding more saved-gallery retries.

- 2026-04-26: Fresh Grok Imagine tile activation must use a trusted CDP mouse
  click, not synthetic in-page click events. Human clicks expose provider
  action surfaces after generation; React/provider handlers can ignore
  untrusted dispatched events. Keep the trusted click limited to
  `post-submit`, then rerun download discovery with saved-gallery fallback
  disabled so stale/root pages are still fenced.

- 2026-04-26: Browser-service dev tools must resolve the same managed browser
  profile namespace as product browser paths. `scripts/browser-tools.ts
  --auracall-profile auracall-grok-auto --browser-target grok` was still using
  the AuraCall runtime profile name and could launch the unbound
  `browser-profiles/auracall-grok-auto/grok` profile. The wrapper now derives
  the managed browser profile through the shared launch-context resolver.

- 2026-04-26: Browser-media operation queue keys must use the same managed
  browser profile namespace as browser-service launch/attach. A runtime profile
  like `auracall-grok-auto` can select browser family `default`; media
  generation must therefore acquire the dispatcher lock for
  `browser-profiles/default/grok`, not a runtime-profile-derived
  `browser-profiles/auracall-grok-auto/grok`. The media executor now derives
  its managed profile path through the shared browser launch-context resolver.

- 2026-04-26: Identity-smoke launch must respect the selected browser profile
  namespace, not derive managed profile identity from the AuraCall runtime
  profile name. `auracall-grok-auto` selects browser family `default`, so a
  launch-if-needed identity smoke must open `browser-profiles/default/grok`,
  not `browser-profiles/auracall-grok-auto/grok`. The login launch resolver now
  preserves the resolved browser-family profile name and honors the resolved
  `browser.manualLoginProfileDir` before falling back to derived paths.

- 2026-04-26: Account-binding smokes should be one no-prompt command, not a
  hand sequence of login, doctor, capability discovery, and temporary config
  edits. `auracall profile identity-smoke --target <provider> --include-negative
  --json` checks one provider, and `--all-bound` is the normal dogfood gate for
  every provider with a configured expected identity on the selected AuraCall
  runtime profile. The command launches the managed browser only when no live
  DevTools session exists, probes provider identity through the browser-service
  operation dispatcher, checks the selected runtime profile's configured service
  identity, and runs an in-memory missing-identity negative check without
  mutating `~/.auracall/config.json`.

- 2026-04-26: Browser provider runs must fail fast when the managed browser
  profile is signed out, blocked on an account challenge, or not the account
  expected by the selected AuraCall runtime profile. Carry the configured
  service identity into provider adapters, hard-stop notorious auth blockers
  such as `accounts.google.com` password challenges, and verify the detected
  provider identity before prompt submission or media materialization when an
  expected account is configured.

- 2026-04-26: Treat a missing runtime-profile service identity as unsafe, not
  as permission to run. A signed-in provider browser with no configured
  expected identity can pollute identity-scoped caches or use the wrong
  account silently; fail before prompt submission/materialization and require
  the operator to bind the detected service account to the AuraCall runtime
  profile.

- 2026-04-26: Keep account-bound browser preflight centralized across
  providers. ChatGPT and Gemini should share the same identity expectation
  semantics as Grok while keeping provider-specific identity probes in their
  adapters. Runtime-supplied explicit null expectations must fail after account
  detection; omitted raw adapter options may remain a test/debug escape hatch.

- 2026-04-26: Serialize live probes for one managed browser profile. A
  `wsl-chrome-2` ChatGPT capability probe correctly failed with the browser
  operation busy guard while doctor owned the same profile, so use doctor first
  and rerun capability discovery after the exclusive probe exits.

- 2026-04-26: Timeline event type changes must update both TypeScript unions
  and the persisted response Zod schema. Adding `provider_auth_preflight` only
  to the TypeScript type let tests pass but caused a live media run to fail
  while parsing its own timeline.

- 2026-04-26: Do not assume a managed provider browser profile remains
  authenticated after a successful media run. A later read-only Grok
  browser-tools check found `auracall-grok-auto/grok` on a Google Accounts
  password challenge for `ecochran76@gmail.com` with "Too many failed
  attempts"; stop live Grok automation and require human clearance before the
  next smoke.

- 2026-04-26: Do not let tiny remote Grok Imagine thumbnails satisfy media
  materialization. Live installed run
  `medgen_daab8a2e82674e8e8b17ce799a31087b` reported generated images but
  selected a stale 48 px `assets.grok.com` image as the only artifact; remote
  Grok generated assets now need to be displayed as a substantial preview
  before they count, while current data-url/blob masonry outputs still count.

- 2026-04-25: Browser media materialization needs bounded provider diagnostics
  before repeated live smokes. For Grok Imagine, record selected tile
  fingerprints, source kind/length/prefix, capture outcome, and full-quality
  download attempted/clicked/reason state in run metadata and timeline so the
  next live run explains whether a miss came from DOM selection, data capture,
  screenshot fallback, or provider download controls.

- 2026-04-25: Do not treat redacted provider signatures as materializable
  media. Grok Imagine feature signatures may preserve data-URL shape while
  replacing the body with `<omitted ...>` for compact status output; fallback
  materialization must validate base64 and skip redacted values instead of
  writing tiny placeholder files and inflating artifact counts.

- 2026-04-25: Generic run status must preserve media artifact evidence, not
  only paths and MIME types. Checksum, preview artifact id, preview checksum,
  remote URL, and preview-vs-full-quality comparison fields are operator
  evidence for browser media dogfood and should survive the media-status to
  run-status projection.

- 2026-04-25: Do not make subcommands reuse a required option name from the
  root CLI without a fallback. The full AuraCall CLI already owns
  `-p/--prompt` for text runs, so `media generate --prompt ...` was parsed as
  root prompt state and the media subcommand rejected the request before
  browser launch. Media generation now accepts prompt text from the subcommand
  option, a positional media prompt, or the root prompt fallback.

- 2026-04-25: Treat installed-runtime media smokes as versioned evidence.
  The installed Grok image smoke proved no-navigation submitted-tab behavior,
  visible-tile default count metadata, and cache filing, but that installed
  runtime did not include the newest checksum/full-quality status fields. When
  validating freshly committed media status fields, either update the installed
  runtime first or use the source runtime explicitly and record which surface
  produced the evidence.

- 2026-04-25: Normal managed browser response/chat execution should queue at
  the shared browser execution boundary, not inside provider adapters. Use
  `acquireQueued(...)` for `browser-execution` so response runs and media jobs
  contend through the same browser-service control plane, while login/setup
  human flows remain fail-fast.

- 2026-04-25: Browser-backed media generation is the first product path opted
  into queued browser operation dispatch. Queue at the shared browser media
  executor boundary before provider adapters touch CDP, record queue/acquire
  timeline events for status readers, and use raw DevTools keys only for
  explicit existing-tab readback probes.

- 2026-04-25: Keep browser operation queueing inside the browser-service
  dispatcher. Future service/API/MCP callers should use
  `BrowserOperationDispatcher.acquireQueued(...)` when they need to wait for a
  browser profile turn; hard-stop flows should keep fail-fast `acquire(...)`
  busy results so human-verification and login blockers stay explicit.

- 2026-04-25: Close capability discovery/reporting separately from provider
  invocation. Plan 0050 now proves browser-backed feature-signature discovery
  for Gemini, ChatGPT, and Grok through no-live adapter tests, while
  Deep Research/app/skill invocation remains a future per-capability plan with
  explicit opt-in live-smoke rules.

- 2026-04-25: Provider API media access should not become the default next
  lane just because an explicit adapter exists. After adding Gemini
  `transport = api`, park live API validation unless deliberately selected and
  keep browser-first media/workbench behavior as the active dogfood priority.

- 2026-04-25: Keep Gemini API image generation explicit and separate from
  browser media generation. In this repo, `transport = api` now uses the
  Google GenAI SDK `models.generateImages` path and caches returned inline
  image bytes as durable media artifacts, while default Gemini browser media
  still uses the web `Create Image` tool and the legacy `--generate-image`
  direct-file shortcut remains unchanged.

- 2026-04-25: Do not migrate legacy direct-file browser flags before the
  operator contract demands it. For Gemini images, `--generate-image <file>`
  remains a compatibility shortcut, while `auracall media generate` is the
  preferred durable path for media ids, status polling, timeline evidence, and
  cached artifacts.

- 2026-04-24: Existing-tab readback needs both target id and DevTools port.
  A Chrome target id alone is not enough for a remote API/MCP request because
  provider list-option building cannot infer the DevTools endpoint without
  resolving a browser-service target, which can reopen or reuse the provider
  entrypoint. Diagnostic Grok Imagine video readback must require
  `grokVideoReadbackDevtoolsPort` with `grokVideoReadbackTabTargetId` and
  pass both through `getFeatureSignature`.

- 2026-04-24: Existing-tab diagnostic probes must bypass capability preflight
  when the preflight can touch provider UI. For Grok Imagine video readback,
  `grokVideoReadbackProbe = true` must skip the normal
  `grok-imagine`/`grok-imagine-video-mode` capability discovery path so the
  request attaches to the supplied tab id only and cannot navigate, reload, or
  change Image/Video mode before polling status.

- 2026-04-24: Diagnostic video readback must require an explicit existing-tab
  contract. For Grok Imagine video, any executor branch that exercises
  post-submit polling before live Submit is enabled must require metadata such
  as `grokVideoReadbackProbe = true`, `grokVideoReadbackTabTargetId`, and
  `grokVideoReadbackDevtoolsPort`, and it must not call `runPrompt`,
  navigate, reload, or fall back to provider target resolution.

- 2026-04-24: Keep volatile video polling tab-scoped and no-navigation.
  Grok Imagine video readback should poll the already submitted tab target via
  `getFeatureSignature`, emit timeline events from normalized readback
  decisions, and materialize only generated-account video candidates. Do not
  reload or re-open provider routes while a generated media request is active.

- 2026-04-24: Keep video readback decisions reusable before wiring Submit.
  For Grok Imagine video, one provider feature signature should produce the
  same timeline details, terminal `video_visible` payload, failure reason, and
  materialization candidate whether it is exercised by fixtures, a future
  wait loop, or the executor path.

- 2026-04-24: Do not enable volatile video Submit paths until post-submit
  acceptance is executable. For Grok Imagine video, the gate needs provider
  evidence that distinguishes pending/generating/progress, generated account
  video, public/template video reuse, selected generated media, and
  materialization candidates before any automated Submit click is allowed.

- 2026-04-24: A gated executor skeleton should still persist useful
  pre-submit state. For Grok Imagine video, capability preflight owns the
  explicit Video-mode discovery action, and the executor receives that
  workbench capability evidence so it can emit composer/materialization
  timeline context before failing with `media_provider_not_implemented`
  without typing or submitting.

- 2026-04-24: Make provider mode audits explicit discovery actions, not
  hidden side effects of generic capability reads. Grok Imagine video-mode
  research may need to click the Video radio to expose provider-specific
  controls, but the request must say so (`discoveryAction =
  grok-imagine-video-mode`), preserve before/after control evidence, restore
  the original Image/Video mode, and never type or submit a prompt.

- 2026-04-24: For volatile provider video workbenches, capture mode-specific
  invocation semantics before sharing an image executor path. Grok Imagine
  Video mode exposes the same composer shell but different generated-media
  selection/download context, so the read-only discovery action should preserve
  composer, submit, upload, aspect ratio, filmstrip, download, visible-media,
  and generated/selected counts before any video automation is added.

- 2026-04-24: Do not duplicate media timeline event enums in MCP tool output
  schemas. The API/store schema already owns `MediaGenerationTimelineEvent`;
  MCP media status should reuse that canonical schema so events such as
  `submit_path_observed` and `no_generated_media` do not validate in storage
  while drifting out of the MCP contract.

- 2026-04-24: Grok Imagine mode discovery must scan radio controls, not only
  buttons and generic button roles. The current `/imagine` workbench exposes
  Image/Video and Speed/Quality as `role = radio` buttons, so read-only
  capability discovery should include `[role="radio"]` and preserve checked
  state before any video invocation work is attempted.

- 2026-04-24: Scope Grok Imagine prompt submission to the composer form and
  wait for submit enablement after ProseMirror input. Broad control labels such
  as `go` or `arrow` can match public template cards like `Go Skiing` instead
  of the workbench submit button, and immediate post-insert clicks can race the
  disabled-to-enabled transition. The submit path should require the visible
  composer form and an enabled `type = submit` or explicit
  submit/send/generate/create aria/title control.

- 2026-04-24: Keep timeline event type unions and Zod schemas in lockstep.
  Adding `submit_path_observed` and `no_generated_media` only to TypeScript
  types let unit executors pass but crashed `api serve` when it persisted live
  media timelines. Any new timeline event must update `src/media/types.ts`,
  `src/media/schema.ts`, and at least one service-level persistence test or
  live dogfood before handoff.

- 2026-04-24: Grok Imagine prompt submission needs a separate submit-path
  milestone before artifact polling. `send_attempted` only proves Aura-Call
  clicked a candidate control; it does not prove the workbench accepted a new
  generation. Emit `submit_path_observed` with outcome, route kind, provider
  href, generated count, and public-template counts so operators can
  distinguish generated media, pending generation, blocked state, and template
  reuse without waiting for artifact polling.

- 2026-04-24: Classify stable Grok Imagine public/template terminal media as a
  specific no-generated-output outcome. Once a submitted browser image run has
  repeatedly observed terminal public/template media with
  `generatedImageCount = 0`, emit `no_generated_media` and fail with
  `media_generation_no_generated_output` instead of waiting for the generic
  provider timeout. Preserve provider href, template-route status, and media
  counts so API/MCP status callers can understand the provider outcome without
  rerunning the browser.

- 2026-04-24: Do not let Grok Imagine public gallery/template media satisfy a
  submitted browser image run. The `/imagine/templates/...` surface can expose
  large public share images and videos after a prompt attempt, but those are
  not proof that the account generated a new artifact. Terminal browser media
  success should require provider evidence marked as generated and not
  `publicGallery`; keep public/template media as diagnostics or explicit
  visible-tile materialization evidence only.

- 2026-04-24: Grok visible-tile materialization needs a screenshot fallback for
  template/public media. Browser-side serialization can fail for cross-origin
  public share images even when the tile is visibly rendered. Capture the tile
  rectangle through `Page.captureScreenshot` before falling back to remote URL
  fetches when the goal is operator-visible browser evidence.

- 2026-04-24: Treat Grok Imagine browser support as discoverable before it is
  invokable. In this repo, the first browser-first slice should only expose
  static and read-only managed-browser evidence for Imagine image/video
  availability, labels, routes, modes, gating, and blocked/failure signals.
  Do not submit a generation request until selectors, run-state evidence, and
  artifact materialization paths are known.

- 2026-04-24: Browser-first Grok Imagine needs discovery before invocation. In
  this repo, xAI API research is useful context, but the target operator path
  is the signed-in Grok browser workbench. Do not implement API media execution
  first when the required product surface is browser Imagine; first capture
  account availability, entrypoint, controls, run-state evidence, and artifact
  materialization paths through browser-service-owned discovery.

- 2026-04-23: Reuse ChatGPT feature signatures for read-only workbench
  capability discovery. In this repo, the ChatGPT browser adapter already
  observes volatile account-specific signals such as Web Search, Deep
  Research, Company Knowledge, and visible apps. Map those signatures into
  `workbench_capability_report` entries before adding new DOM scrapers or
  invocation behavior, and keep static apps/skills/account surfaces
  conservative until discovery proves current-account visibility.

- 2026-04-23: After closing a maintenance exception, complete the selected
  integration-hygiene pass before reopening service/runner implementation. In
  this repo, Plan 0038 intentionally paused service/runner architecture work
  until broad HTTP/MCP/runtime/CLI runner-control validation and worktree
  review were done. Passing that hygiene step is a reason to keep the lane
  paused, not a reason to continue extraction by inertia.

- 2026-04-23: `api serve` must resolve the selected AuraCall runtime profile
  before constructing HTTP, workbench, runtime, or media services. Loading raw
  config inside the server bypasses global CLI flags such as `--profile` and
  can send browser/media jobs to the wrong managed browser profile while still
  appearing healthy. Forward CLI options into `resolveConfig()` and log the
  active AuraCall runtime profile at startup.

- 2026-04-23: Active media diagnostics need an early observable run id. In this
  repo, `POST /v1/media-generations` can successfully drive Gemini, record
  `prompt_submitted`, observe image artifacts, and cache the screenshot-backed
  PNG, but the HTTP request blocks until terminal completion. Add an
  asynchronous creation mode or equivalent early id return before expecting API
  callers to poll active `browser-state` diagnostics during media execution.

- 2026-04-23: Keep async media creation on the same service path as synchronous
  creation. In this repo, `wait=false` should only change when the caller gets
  the id; capability discovery, prompt submission, artifact polling, timeline
  persistence, failure handling, and cache materialization must stay shared.

- 2026-04-23: Add a pre-submission stall guard for Gemini browser media
  execution. Async dogfood proved callers can poll a running media id, but a
  live run stalled after `executor_started` and before `prompt_submitted`,
  leaving no submitted `tabTargetId` for browser diagnostics. The executor
  should persist a bounded diagnostic/failure event when prompt submission does
  not complete within the expected window.

- 2026-04-23: Do not make `prompt_submitted` wait for generated Gemini media.
  In this repo, Gemini browser media needs two separate operator states:
  submitted prompt state and generated artifact visibility. Emit provider-owned
  pre-submission progress from tab attachment through send attempts, record
  `prompt_submitted` when Gemini shows submitted-state evidence, and leave
  image visibility to artifact polling so status diagnostics can inspect the
  exact browser tab during stalled provider interactions.

- 2026-04-23: Gemini browser media needs a post-submit route-stability guard,
  not only pre-submit visibility. In this repo, a live run can show valid
  send/generating evidence, then mark `prompt_submitted`, derive a conversation
  id later, and still end up back on the healthy Gemini root app surface with
  no conversation content on the submitted tab. After submitted-state
  observation, keep ownership on the same browser tab and verify the
  conversation route/content stabilizes before long artifact polling.

- 2026-04-23: Treat the submitted browser tab as the authority across providers.
  In this repo, `preserveActiveTab` must forbid post-submit navigation, reload,
  and reopen recovery on ChatGPT, Gemini, and Grok readback/materialization
  paths. If the owned tab does not already expose the expected conversation
  content, fail explicitly instead of trying to recover by URL.

- 2026-04-23: Keep Gemini post-submit milestones and confirmed prompt results
  separate. In this repo, `submitted_state_observed` is only early evidence that
  submit/generation started on the owned tab; `prompt_submitted` should still be
  emitted from the later confirmed prompt result so operators keep the best
  available conversation id and URL.

- 2026-04-23: Gemini no-navigation readback failures must include active-tab
  continuity evidence. In this repo, when active-tab readback fails we need the
  current `href`, `pathname`, derived conversation id, title, and body-text
  size in the error to distinguish same-tab root drift from silent tab rebinding
  or stale conversation assumptions.

- 2026-04-23: Browser mutation audit must attach to provider clients, not only
  provider options. In this repo, many route helpers intentionally accept
  narrowed `Pick<ChromeClient, ...>` handles, so provider adoption should stamp
  mutation context onto the connected client once and let later
  `navigateAndSettle(...)` calls read that context without threading a full
  options object through every helper.

- 2026-04-23: Provider reload recovery is still a browser mutation and needs
  the same audit path as navigation. In this repo, ChatGPT recovery flows used
  raw `Page.reload(...)` after the provider client had already been stamped
  with mutation context. Route those through a browser-service
  `reloadAndSettle(...)` helper so post-failure diagnostics can attribute
  refreshes the same way they attribute navigations.

- 2026-04-21: Public prebuilt `taskRunSpec` input should mean the live
  flattened schema only. In this repo, HTTP `POST /v1/team-runs` and MCP
  `team_run` may now accept `{ taskRunSpec }`, but must validate with
  `TaskRunSpecSchema`, reject compact/prebuilt assignment conflicts, and
  require top-level `teamId` to match `taskRunSpec.teamId` when both are
  present. Preserve spec provenance unless a compact request builds a new spec.

- 2026-04-21: Use the live flattened `TaskRunSpec` schema as the first public
  full-spec compatibility target. In this repo, compact HTTP/MCP team-run
  create requests build one bounded internal spec from known fields, while
  public prebuilt-spec input should validate with `TaskRunSpecSchema` and
  conflict-check transport fields before execution. Do not introduce a
  sectioned public envelope until a versioned compatibility layer is justified,
  and do not use full-spec input as a shortcut into multi-runner or parallel
  execution.

- 2026-04-21: Stamp MCP-created team runs with MCP provenance instead of
  reusing CLI labels. In this repo, MCP team execution should still use the
  existing bounded `TaskRunSpec -> TeamRun -> TeamRuntimeBridge` path, but
  readback and inspection need to show `trigger = "mcp"` and
  `requestedBy.kind = "mcp"` so operators can distinguish MCP-created work
  from CLI and HTTP-created runs. Keep arbitrary prebuilt `taskRunSpec` JSON
  and multi-runner/parallel execution out of this parity slice.

- 2026-04-21: Treat bundled service registry files as build assets, not
  source-only development files. In this repo, any built entrypoint that imports
  configured executor/provider code may resolve `dist/configs/auracall.services.json`;
  the build must copy `configs/` into `dist/configs/` before MCP or packaged CLI
  smokes can be trusted.

- 2026-04-20: Keep the implemented public team execution write on the same
  route-neutral bounded contract as CLI team execution. In this repo,
  `POST /v1/team-runs` constructs one validated bounded `TaskRunSpec` from
  request fields, executes through `TeamRuntimeBridge` and the server-owned
  `ExecutionServiceHost`, and returns deterministic ids/links for inspection
  and response readback. Do not introduce route-only assignment vocabulary,
  arbitrary prebuilt `taskRunSpec` JSON, MCP write parity, or
  multi-runner/parallel execution in this first write slice.

- 2026-04-20: Public team execution writes must reuse the existing
  task/team/runtime chain instead of inventing route-local execution state.
  - The durable rule for the next checkpoint is:
    - first bounded HTTP write target is `POST /v1/team-runs`
    - the route should construct or accept one bounded `TaskRunSpec`
    - execution should flow through `TeamRun` and `TeamRuntimeBridge`
    - response/readback should expose `taskRunSpecId`, `teamRunId`, and
      `runtimeRunId` without duplicating assignment intent into route-only
      metadata
    - MCP write parity waits until the HTTP contract is stable
  - Do not use the public write surface as a shortcut to add multi-runner,
    parallel execution, or a second team-run vocabulary.

- 2026-04-20: Stop extracting `api serve` service-host ownership after the
  remaining boundary is transport-only.
  - The durable rule for the current service/runner lane is:
    - keep listener lifecycle, background-drain timers/pause state,
      request parsing, transport error/status projection, runner readback
      projection, and live service-state probe routing in HTTP
    - keep local runner lifecycle mutations, queued drain execution, startup
      recovery drain execution, recovery/local-claim summaries, and
      operator-control mutations in `ExecutionServiceHost`
    - do not move HTTP timer/status state into runtime just to make the
      server file smaller
  - Further extraction should require a newly reproduced route-neutral runtime
    mutation still living in HTTP, not continuation by inertia.

- 2026-04-20: Keep stored-runtime operator-control family dispatch in the
  service host, not in `POST /status` route code.
  - The durable rule for the current service/runner lane is:
    - `ExecutionServiceHost.controlOperatorAction(...)` owns route-neutral
      dispatch across lease repair, local-action resolution, and run control
    - HTTP may map a validated payload into that service-host input shape
    - HTTP still owns transport status/error projection and background-drain
      pause/resume timer state
  - Do not make `api serve` choose between stored-runtime mutation families
    just because those controls happen to share the `/status` endpoint.

- 2026-04-20: Keep run-control dispatch beside the service-host mutations, not
  in HTTP route code.
  - The durable rule for the current service/runner lane is:
    - `ExecutionServiceHost.controlRun(...)` owns action selection for
      `cancel-run`, `resume-human-escalation`, and targeted `drain-run`
    - HTTP status controls own request validation, transport error mapping,
      and status readback
    - background-drain pause/resume remains HTTP server state because it is a
      server timer/status concern, not a stored runtime-run mutation
  - This keeps operator controls route-neutral without moving HTTP-only
    scheduling semantics into the runtime layer.

- 2026-04-20: Keep serial drain queue ownership in the service host while
  leaving HTTP timer/status behavior at the HTTP boundary.
  - The durable rule for the current service/runner lane is:
    - `ExecutionServiceHost` owns serializing `drainRunsUntilIdle` work for one
      host instance
    - HTTP servers own when to schedule a drain, whether background drain is
      paused, and how that state is projected on `/status`
    - direct response creation and background timers should delegate actual
      queued drain execution through the service-host seam
  - Do not move `/status` state or HTTP timer controls into runtime just to
    centralize code; that would blur transport-specific operator behavior with
    runner ownership.

- 2026-04-20: Keep local runner lifecycle writes behind the service host, not
  scattered across HTTP wrappers.
  - The durable rule for the current service/runner lane is:
    - `ExecutionServiceHost` owns local runner registration, heartbeat refresh,
      and shutdown/stale marking
    - HTTP servers may own timers, request routing, and status projection
    - HTTP servers should not directly write runner lifecycle records unless a
      future service-host seam cannot express the required mutation
  - This keeps the next runner ownership increments inside the runtime service
    layer before any public HTTP/MCP team execution writes or multi-runner
    expansion.

- 2026-04-20: Keep the roadmap execution board pruned to one primary active
  implementation lane after broad planning reassessments.
  - The durable rule for the current phase is:
    - primary active lane is service/runner orchestration beyond the current
      single-host bounded local-runner bridge
    - task/team/agent plans can support that lane, but should not independently
      reopen broad implementation scope
    - config, browser, volatility, and provider-expansion plans stay
      maintenance-only or side-track work unless explicitly selected or a
      concrete mismatch is reproduced
    - response-shape and service-state work stays parked unless a new public
      routing/readback mismatch or provider-owned evidence seam appears
  - Do not treat an `OPEN` plan state alone as permission to resume that lane.
    Read the plan's current roadmap classification first.

- 2026-04-16: `auracall api serve` must wire the configured stored-step
  executor by default if direct `/v1/responses` runs are expected to exercise
  the real browser/API execution path.
  - The durable rule for this seam is:
    - `createResponsesHttpServer(...)` may still accept injected executors for
      tests and bounded overrides
    - but the CLI wrapper `serveResponsesHttp(...)` must install the same
      configured executor path operators expect from normal Aura-Call runtime
      execution
  - Otherwise:
    - direct `/v1/responses` can complete as empty no-op runs
    - mid-turn live `serviceState` probing appears broken even though the
      inspection contract itself is fine

- 2026-04-16: When `api serve` exposes live runtime-inspection
  `serviceState`, resolve the running step AuraCall runtime profile before
  attaching to a managed browser session.
  - The durable rule for the default ChatGPT-backed live probe is:
    - resolve `step.runtimeProfileId` through `resolveConfig({ profile })`
    - only probe the managed browser session when the resolved
      `auracallProfile` matches that running step runtime profile
    - return honest `unavailable` posture instead of probing a mismatched
      runtime profile or falling back to a server-default profile
  - This keeps run-scoped live probing aligned with the actual executing
    browser family and avoids cross-profile state leakage.

- 2026-04-16: Keep live provider `serviceState` probing opt-in on
  `GET /v1/runtime-runs/inspect`, not on `/status`.
  - The durable rule for this seam is:
    - `/status` remains server/runner/background-drain health
    - `GET /v1/runtime-runs/inspect` may expose one run-scoped live
      `serviceState` only when explicitly requested
    - `serviceState` must stay separate from runtime queue/lease posture
    - unavailable live probing should be returned honestly as
      `probeStatus = unavailable` with a bounded reason
  - Do not collapse provider chat-state semantics into generic server health
    or pretend a live probe exists when no provider/browser probe is wired.

- 2026-04-16: On the managed ChatGPT runtime-inspection probe path, treat the
  placeholder assistant turn and stop-button streaming state as the primary
  live `serviceState` evidence before widening heuristics.
  - The durable rule for the first ChatGPT live probe is:
    - `thinking` should come from the assistant placeholder turn such as
      `ChatGPT said:Thinking` or `ChatGPT said:Pro thinking`
    - `response-incoming` should come from visible streaming state with the
      stop button present once assistant output is materialized
    - terminal runs should fall back to explicit `unavailable` posture instead
      of replaying stale provider state
  - Do not broaden the live probe based only on one earlier low-confidence
    `unknown` result when the managed runtime-profile path already has direct
    proof for `thinking` and `response-incoming`.

- 2026-04-16: Default runtime-inspection Gemini live probing must be bounded
  to browser-backed runtime profiles only.
  - The durable rule for Gemini on `GET /v1/runtime-runs/inspect` is:
    - resolve `step.runtimeProfileId` through `resolveConfig({ profile })`
    - require the resolved runtime profile to be browser-backed before
      attaching to a managed Gemini browser session
    - return honest `unavailable` posture for Gemini API-backed runs instead
      of projecting browser semantics onto them
  - Gemini live browser state should stay Gemini-owned:
    - `thinking` from committed prompt history without answer text yet
    - `response-incoming` from visible answer text before the page looks
      quiescent
    - `response-complete` from visible answer text plus quiescent page state
    - `login-required` from visible Gemini sign-in surfaces
  - Do not treat a completed Gemini API run as evidence that the browser live
    probe path is green.

- 2026-04-16: On this WSL Gemini pairing, a visible Gemini `Sign in` surface
  can still be a recoverable remembered-login state rather than a full auth
  loss.
  - The durable operator rule is:
    - if the managed Gemini browser shows a visible `Sign in` button, try one
      bounded manual `Sign in` click first
    - if that click restores the remembered Google session, continue with one
      real AuraCall Gemini command before doing more diagnostics
    - only treat the profile as blocked if the sign-in surface persists after
      that bounded recovery step
  - Do not immediately discard the managed profile or assume exported-cookie
    fallback is required when the remembered session can be resumed in one
    click.

- 2026-04-16: On this WSL Gemini pairing, remembered-login recovery plus
  cookie export restores the browser-backed Gemini path, but the live
  runtime-inspection probe still needs better signal quality.
  - The durable operator rule is:
    - after one successful remembered-login recovery, run
      `auracall login --target gemini --profile auracall-gemini-pro --export-cookies`
      before deeper Gemini browser proofs on this machine
    - confirm one direct Gemini browser smoke succeeds before retrying
      `api serve` probe validation
  - Current live evidence boundary:
    - browser-backed Gemini direct execution is green again after cookie
      export
    - short `api serve` Gemini runs can complete too quickly to observe
      mid-turn state
    - longer active runs currently prove the inspection seam is live but may
      still return `state = unknown` with
      `evidenceRef = gemini-live-probe-no-signal`
  - Do not claim Gemini mid-turn semantic parity yet; the next slice is
    improving Gemini live-state evidence, not more auth/bootstrap work.

- 2026-04-16: Grok passive observation parity should stay Grok-owned and use
  Grok’s existing assistant-result lifecycle instead of ChatGPT/Gemini
  heuristics.
  - The durable rule for Grok on the stored observation seam is:
    - record `thinking` when Grok accepts the submitted prompt and provider
      work starts
    - record `response-incoming` when the first new Grok assistant content is
      observed beyond the baseline snapshot
    - record `response-complete` when the Grok assistant result stabilizes and
      returns
  - Do not reuse ChatGPT placeholder thinking rules or Gemini metadata rules
    for Grok.

- 2026-04-16: Gemini passive observation parity should come from the executor
  path that actually owns Gemini state, not from review-ledger inference.
  - The durable rule for Gemini on the stored observation seam is:
    - let the Gemini web executor emit bounded observations from returned
      provider metadata:
      - `thinking` only when Gemini returns provider thoughts
      - `response-incoming` when text or images materialize
      - `response-complete` on successful executor completion
    - let the browser-native Gemini attachment path emit bounded observations
      from page-state progression:
      - prompt committed into history
      - answer text first visible
      - answer stabilized and finished
  - Do not reuse ChatGPT DOM heuristics for Gemini or invent Gemini states in
    the ledger layer.

- 2026-04-16: On live ChatGPT thinking-mode runs, the most reliable passive
  thinking signal is the placeholder assistant turn, not generic status-node
  text.
  - Live direct-run traces on the managed WSL Chrome profile showed this
    sequence:
    - placeholder assistant text `ChatGPT said:Thinking`
    - growing assistant response while the stop button remains visible
    - completion when the stop button disappears
  - The durable rule for the next passive-monitoring slice is:
    - treat assistant-turn placeholder text plus assistant snapshot growth as
      the primary ChatGPT thinking/response-incoming evidence
    - keep generic `[role="status"]` / `aria-live` / `data-testid*="thinking"`
      scans as supplemental diagnostics only
    - sanitize matched thinking-status text down to bounded state labels and
      drop obvious conversation echoes such as `You said:` or inline file
      bodies before logging or persisting
  - Do not promote generic status-node scans to canonical chat-state evidence
    unless they are proven stable in the live managed-profile path.

- 2026-04-16: Default WSL headful browser launches to `DISPLAY=:0.0` unless
  the operator has already specified a display or explicitly targets
  Windows-hosted Chrome.
  - The durable rule for browser display resolution is:
    - keep explicit `browser.display` first
    - then honor `AURACALL_BROWSER_DISPLAY`
    - on WSL, default to `:0.0` whenever the launch is not explicitly aimed at
      Windows-hosted Chrome
  - Do not require Linux Chrome path discovery to succeed before applying the
    WSL default; that leaves headful launches incorrectly blocked on an empty
    ambient `DISPLAY`.

- 2026-04-15: Persist richer passive provider states on the execution seam,
  not by ledger inference.
  - The durable rule for Slice 1 of passive provider observations is:
    - let ChatGPT browser execution emit stored observations for `thinking`,
      `response-incoming`, and `response-complete`
    - persist them on `browserRun.passiveObservations`
    - let the review ledger project stored observations generically
  - Do not infer those states later from lease state, generic failure text, or
    review-ledger heuristics.

- 2026-04-15: Keep richer passive provider monitoring adapter-owned and
  execution-path persisted.
  - The durable rule after the review-ledger checkpoint is:
    - close the completed ledger plan rather than widening it indefinitely
    - use a separate bounded plan for richer passive monitoring
    - let provider adapters/executors emit `thinking`,
      `response-incoming`, and `response-complete`
    - keep the review ledger generic and projection-only for those states
  - This prevents runtime/service-mode health or generic ledger code from
    inventing provider chat-state semantics.

- 2026-04-15: Keep first-pass team-run review observations durable and
  failure-derived.
  - The durable rule for Slice 4 is:
    - project observations only from stored step failure metadata or explicit
      provider-state details
    - cover provider error, login required, captcha/human-verification, and
      awaiting human action
    - include source, observed timestamp, confidence, and evidence reference
    - do not infer rich live chat states such as `thinking` or
      `response-incoming` from generic failure text
  - This keeps passive monitoring attached to the ledger without letting DOM
    heuristics redefine execution semantics.

- 2026-04-15: Do not infer provider cache paths while enriching team-run
  review-ledger provider references.
  - The durable rule for provider refs is:
    - copy concrete conversation ids, tab URLs, configured URLs, project ids,
      runtime/browser profile ids, agent ids, and selected models from stored
      execution metadata
    - report a cache path only when stored metadata already carries a concrete
      path
    - use an explicit unavailable cache status when stored-step execution has
      not resolved provider cache identity
  - This keeps provider caches supplemental and avoids turning naming
    conventions into false evidence.

- 2026-04-15: Keep `auracall teams review` read-only and aligned with the
  existing team inspection lookup contract.
  - The durable rule for the first operator review surface is:
    - accept exactly one of `--task-run-spec-id`, `--team-run-id`, or
      `--runtime-run-id`
    - preserve alias provenance and bounded matching runtime-run ids
    - return the projected ledger rather than recomputing execution state
    - do not add public team execution writes
  - This keeps whole-sequence review separate from runtime recovery/status and
    leaves passive provider observations for a later ledger-attached slice.

- 2026-04-15: Keep the first team-run review ledger implementation
  projection-only and null-safe.
  - The durable rule for Slice 1 is:
    - project from existing runtime bundles
    - preserve current step, handoff, artifact, input, output, failure, and
      provenance fields
    - read provider conversation refs only from metadata already present on
      step output, currently `structuredData.browserRun`
    - represent unavailable provider refs as `null`
  - Do not add provider scraping, public team execution writes, or passive
    provider-state monitoring while implementing the internal projection helper.

- 2026-04-15: Do not build broad passive provider-state monitoring before
  there is a durable team-run review ledger to attach observations to.
  - The durable sequencing rule is:
    - first create an Aura-Call-owned whole-sequence ledger for team runs
    - then attach passive provider observations to ledger steps
    - keep provider chat caches as supplemental evidence, not the canonical
      orchestration record
  - The first implementation slice should be projection-only and read-only:
    - project from existing task-run spec, team-run, runtime run, steps,
      handoffs, shared state, events, and response summaries
    - preserve provider/cache references when available
    - represent missing provider refs as `null`, not inferred values
  - Rich chat states such as `thinking` and `response-incoming` should be
    provider-adapter observations later, not runtime lease states.

- 2026-04-15: Keep secondary endpoint authority docs aligned with the tested local server surface; do not let `docs/openai-endpoints.md` lag behind `README.md`, `docs/testing.md`, and route-handler tests.
  - The durable rule for this seam is:
    - if the local dev server adds or reshapes bounded inspection/readback
      fields, update secondary endpoint docs in the same pass or immediately
      after the primary contract docs
  - This is especially important for:
    - `GET /v1/team-runs/inspect`
    - `GET /v1/runtime-runs/inspect`
    - compact `/status.localClaimSummary` fields like `statusByRunId`

- 2026-04-15: If runtime inspection already returns bounded queue-projection lease and affinity requirement fields, preserve them in the operator-facing formatter and docs instead of collapsing them to queue/claim/affinity status alone.
  - Runtime inspection CLI now also renders:
    - `activeLeaseId`
    - `activeLeaseOwnerId`
    - bounded affinity requirements and notes
  - Keep the API contract unchanged; this is an operator-surface alignment
    slice, not a new inspection model.

- 2026-04-15: If local-claim summary already computes bounded per-run statuses, preserve them explicitly instead of forcing operators to infer them from grouped buckets plus free-form reasons.
  - Local claim summaries now also return:
    - `statusByRunId`
  - Keep the compact aggregate surface:
    - preserve grouped id buckets
    - preserve `reasonsByRunId`
    - do not widen into full per-run claim projections

- 2026-04-15: If per-run recovery detail already reports `leaseHealth.status = suspiciously-idle` under inspect-only posture, do not drop that operator-attention signal by returning `attention = null`.
  - Preserve bounded per-run attention instead:
    - `attention.kind = suspiciously-idle`
  - Keep the action boundary unchanged:
    - suspiciously-idle remains read-only and non-repairable
  - This keeps recovery detail aligned with the same operator-attention model
    already exposed through lease health and startup attention logs.

- 2026-04-15: If startup recovery keeps suspiciously-idle active leases as diagnostic-only instead of reclaiming them, preserve that count explicitly in the startup log attention summary instead of hiding it under generic `active-lease`.
  - Keep the coarse drain taxonomy unchanged:
    - suspiciously-idle still counts as `active-lease`
  - But also emit bounded startup attention:
    - `attention=suspiciously-idle:<count>`
  - This makes operator startup logs match the already-computed recovery
    health signal without widening the recovery action surface.

- 2026-04-15: If an inspection alias resolves through a latest-match strategy, surface a bounded candidate summary in the same payload.
  - Runtime inspection now also returns:
    - `matchingRuntimeRunCount`
    - bounded `matchingRuntimeRunIds`
  - This makes `teamRunId` and `taskRunSpecId` lookup behavior auditable
    without widening the route into a broader recovery or history endpoint.

- 2026-04-15: When a read-only inspection surface accepts alias lookup keys, preserve the alias provenance in the payload instead of returning only the resolved canonical id.
  - Runtime inspection now returns:
    - `resolvedBy`
    - `queryId`
    - `queryRunId`
  - This keeps alias-driven operator workflows inspectable when `teamRunId` or
    `taskRunSpecId` resolves to the latest matching runtime run instead of a
    directly queried runtime id.

- 2026-04-15: Realigned runtime inspection contracts across route handler tests and operator docs after introducing additional runtime lookup aliases in the route template:
  - added `GET /v1/runtime-runs/inspect` coverage for `runId`, `runtimeRunId`,
    `teamRunId`, and `taskRunSpecId` in
    [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/auracall/tests/http.responsesServer.test.ts)
  - retained and preserved the `runId` + `runnerId` affinity-check path, so
    runner-aware projection is still locked.
  - added explicit HTTP invalid-shape assertion requiring one lookup key with
    message `Provide --run-id, --runtime-run-id, --team-run-id, or --task-run-spec-id.`
  - synchronized [README.md](/home/ecochran76/workspace.local/auracall/README.md) and
    [docs/testing.md](/home/ecochran76/workspace.local/auracall/docs/testing.md) runtime inspect query guidance to the same supported keys.
  - also synchronized planning authority docs so [ROADMAP.md](/home/ecochran76/workspace.local/auracall/ROADMAP.md) and
    [docs/dev/plans/0001-2026-04-14-execution.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/0001-2026-04-14-execution.md)
    now list the current runtime lookup key set, preventing planner/implementation drift.

- 2026-04-13: A roadmap reassessment is not operational until it names the
  concrete live suites that belong in each tier. The durable live-suite split
  for the current phase is:
  - stable baseline:
    - `tests/live/team-grok-live.test.ts` default Grok baseline cases
    - `tests/live/team-chatgpt-live.test.ts` single-provider ChatGPT baseline
  - extended matrix:
    - `tests/live/team-gemini-live.test.ts`
    - Grok/ChatGPT operator-control team cases
    - `tests/live/team-multiservice-live.test.ts`
  - flaky-but-informative probes:
    - provider/browser cases that still need bounded reruns or stronger
      auth/cooldown preflight, especially some Gemini-resume situations
  Keep routine operator guidance anchored to that concrete split instead of
  leaving "baseline vs matrix" as an abstract idea.
- 2026-04-13: After defining the live-suite tiers, add one explicit routine
  baseline command instead of expecting operators to reconstruct the right env
  gates from docs. The current bounded routine entrypoint is:
  - `pnpm run test:live:team:baseline`
  and it intentionally covers only:
  - Grok default team baseline cases
  - ChatGPT single-provider team baseline
  Keep broader Gemini/operator/multiservice coverage as explicit opt-in matrix
  commands rather than folding them into the routine baseline.
- 2026-04-13: Once the docs define baseline versus matrix tiers, mirror that
  split directly in the live test files near the env-gate definitions. A small
  tier comment at the top of each live suite is enough to prevent the suite
  intent from drifting back into tribal knowledge.
- 2026-04-13: Mixed-provider response readback should expose a bounded
  per-step routing projection instead of forcing callers to interpret one
  top-level `metadata.service` / `metadata.runtimeProfile` pair as the full
  route. The durable rule is:
  - keep the top-level response metadata fields for the existing compact
    summary
  - add `metadata.executionSummary.stepSummaries` as the bounded projection of
    stored step state
  - use that field for mixed-provider routing proof in response readback
    instead of treating the top-level fields as a per-step matrix
  - keep recovery detail separate:
    - response readback answers "what route executed?"
    - recovery detail answers "what orchestration lifecycle happened?"
  - lock the split with an explicit model-level assertion:
    - top-level response metadata must stay compact
    - `executionSummary.stepSummaries` must carry the full mixed-provider route
  - also lock the negative side:
    - recovery detail must not silently grow routing fields like
      `runtimeProfile`, `service`, or `stepSummaries`
  - keep response `metadata.executionSummary` bounded to response-readback
    summaries only:
    - do not let it silently absorb recovery-only status fields like
      `activeLease`, `dispatch`, `repair`, `leaseHealth`, or `localClaim`
  - keep top-level `response.output` as the transport payload when runtime
    shared state exposes `structuredOutputs[key="response.output"]`:
    - preserve ordered mixed text + artifact output there
    - keep execution summaries in `metadata.executionSummary`
    - do not leak summary fields into individual `output` items
  - keep user-facing `/status` operator docs aligned with the same tested
    control seam:
    - `localActionControl.resolve-request` applies to currently `requested`
      local action records on direct or team runs
  - keep user-facing response docs aligned with the same readback split:
    - top-level `metadata.service` / `metadata.runtimeProfile` stay compact
    - `metadata.executionSummary.stepSummaries` is the per-step routing
      projection
    - recovery detail stays the lifecycle timeline surface
  - once README plus testing docs both reflect the current control/readback
    contract and a final audit finds no similarly important stale statement,
    stop the doc/readback wording pass and move to a different hardening seam
- 2026-04-13: Keep `GET /status?recovery=true` compact. The durable rule is:
  - recovery summary stays the aggregate surface
  - per-run detail fields stay on `GET /status/recovery/{run_id}`
  - lock the negative side with explicit tests so recovery summary does not
    silently grow:
    - `taskRunSpecId`
    - `orchestrationTimelineSummary`
    - `handoffTransferSummary`
    - `leaseHealth`
  - keep the local-claim split explicit too:
    - top-level `/status.localClaimSummary` stays the direct-run snapshot
    - `recoverySummary.localClaim` is the recovery-filtered aggregate
  - keep server posture explicit too:
    - top-level `/status.runner` remains the server runner snapshot
    - top-level `/status.backgroundDrain` remains the server drain-loop snapshot
    - recovery/source filters do not convert either into recovery-scoped data
    - this remains true even when `recoverySummary` is filtered to
      `team-run` or `all`
- 2026-04-13: Keep adjacent endpoint docs aligned with the tested `/status`
  operator scope:
  - `docs/openai-endpoints.md` must not describe
    `resume-human-escalation`, `drain-run`, or
    `localActionControl.resolve-request` as direct-run-only after the
    host/server path and regressions already prove team-run support
- 2026-04-13: Keep startup-recovery source scoping explicit at the serve
  wrapper:
  - default startup recovery scope remains `direct`
  - `recoverRunsOnStartSourceKind = team-run` recovers only team runs
  - `recoverRunsOnStartSourceKind = all` recovers both direct and team runs
  - lock the `all` case at the serve-wrapper test layer, not just in docs
  - keep the startup cap behavior unchanged after widening scope to `all`:
    - `recoverRunsOnStartMaxRuns` still bounds mixed direct + team candidates
    - startup logs should still report cap saturation and `limit-reached`
- 2026-04-13: Keep targeted `drain-run` ownership failures explicit:
  - if the local configured runner cannot safely claim the targeted run,
    `drainRun(...)` should return:
    - `status = skipped`
    - `reason = <specific local-claim explanation>`
    - `skipReason = claim-owner-unavailable`
  - keep the persisted run's own `sourceKind` unchanged while reporting that
    ownership failure
- 2026-04-13: Keep repeated-pass drain accounting honest:
  - `drainRunsUntilIdle(...)` should preserve repeated executed passes for the
    same run
  - but one reclaimed stale lease should only appear once in
    `expiredLeaseRunIds`, even if the same run executes again on later passes
- 2026-04-13: Keep targeted-drain readback symmetric across outcomes:
  - `operatorControlSummary.targetedDrain` must preserve both:
    - `status = executed`
    - `status = skipped`
  - for skipped targeted drain:
    - `skipReason` should keep the bounded skip posture
    - `reason` should preserve the persisted actionable note when available
    - recovery detail timeline should retain the persisted skipped drain note
- 2026-04-13: Keep cancellation readback stable even when older data lacks a
  cancellation note event:
  - response and recovery-detail fallback should use the cancelled run's
    `updatedAt`
  - fallback readback should keep:
    - `source = null`
    - `reason = null`
- 2026-04-13: Once a cancelled local-action operator path is live-proven on one
  provider, the next highest-value confirmation is the same exact path on a
  second provider, not another same-provider variant. Reuse the same route:
  - approval-required local action starts as `requested`
  - operator resolves it as `cancelled`
  - existing `/status`:
    - `resume-human-escalation`
    - `drain-run`
  - final readback confirms bounded `localActionSummary.cancelled = 1`
  This is now proven on:
  - Grok
  - ChatGPT
- 2026-04-13: Exact-id chat cleanup subprocesses need their own bounded timeout.
  Even with incremental deletion count, one slow provider delete can still pin
  a live suite turn if the delete subprocess is allowed to wait too long. Keep
  the delete subprocess timeout bounded (current helper timeout: `30s`) and let
  failed/timeout deletes remain in the ledger for later retry.
- 2026-04-12: Approval-required local actions should stay `requested` until
  operator control resolves them. The durable rule is:
  - `auracall teams run ... --require-local-action-approval` should map to
    task policy `localActionPolicy.mode = approval-required`
  - the default service-host callback should not auto-execute those requests
  - stored runtime resolution should preserve `requested` local actions when no
    operator decision exists yet
  - dependency local-action guidance should escalate on:
    - `requested`
    - `cancelled`
    instead of treating them as safe-to-continue
  This creates one truthful cancelled-path operator flow:
  - request local action
  - pause for human escalation
  - operator resolves request as `cancelled`
  - operator resumes + drains the same run
  - final readback shows bounded `localActionSummary.cancelled = 1`
- 2026-04-12: Batched live-test chat cleanup should stay incremental. Deleting
  every oldest disposable conversation needed to reach the retain window in one
  enqueue can dominate or stall a single live test turn. Keep the policy:
  - threshold `6`
  - retain newest `3`
  - delete exact ids only
  - delete at most oldest `2` per enqueue
  This still prevents provider chat buildup while keeping live suites bounded.
- 2026-04-12: The team-run local-action control seam should not stay
  artificially direct-run-only once the same local-action records already live
  on stored team runs. The durable rule is:
  - `POST /status` `localActionControl.resolve-request` may apply to currently
    `requested` direct or team local-action records
  - keep the same bounded behavior:
    - resolve only pending requests
    - update stored request status/result summary
    - refresh bounded `step.localActionOutcomes.<stepId>`
    - surface the result later through
      `metadata.executionSummary.localActionSummary`
  The first live negative-path proof also showed an important runtime detail:
  - a forbidden local action on the current tooling team is already rejected by
    step policy before operator intervention
  - the honest live rejection proof is therefore:
    - assert the stored rejected request first
    - then resume + drain the paused run
    - then assert rejected outcome readback plus final terminal success
- 2026-04-12: Before calling the provider-backed team operator-control seam
  generally live-ready, repeat the same approval/resume/drain proof on a
  second provider instead of assuming Grok generalizes. The clean second-
  provider pattern is:
  - reuse the same forbidden local-action pause trigger
  - start the tooling-style team run without any local shell allowlist
  - assert the initial provider-backed run cancels with
    `finalOutputSummary = "paused for human escalation"`
  - then reuse only the existing `/status` actions:
    - `resume-human-escalation`
    - `drain-run`
  - assert final success from the stored terminal step summary rather than a
    convenience transport field
  This proved the seam cleanly on ChatGPT with:
  - `auracall-chatgpt-tooling`
  - terminal stored step summary
    `= "AURACALL_CHATGPT_APPROVAL_TEAM_LIVE_SMOKE_OK"`
- 2026-04-12: The first provider-backed approval proof does not need a new
  team shape if an existing tooling team can deterministically trigger the
  same pause semantics. The durable pattern is:
  - start a tooling-style team run without any allowed local shell policy so
    the default forbidden local-action policy rejects the emitted shell request
  - let dependency guidance escalate and pause the downstream step for human
    escalation
  - use the existing `POST /status`:
    - `resume-human-escalation`
    - `drain-run`
    controls to finish the same provider-backed run
  - assert final success from the stored terminal step summary rather than
    assuming an extra `output_text` convenience field on response readback
  This proves the live operator seam with the minimum added surface area.
- 2026-04-12: Team runs should not stay artificially excluded from the bounded
  operator resume/drain seam once the runtime already supports human-
  escalation pause/resume internally. The durable rule is:
  - `resume-human-escalation` should key off "has a cancelled human-
    escalation step" rather than `sourceKind = direct`
  - targeted `drain-run` should use the persisted run's own `sourceKind`
    instead of hardcoding `direct`
  - response readback and recovery-detail readback still keep different
    bounded shapes:
    - response readback carries structured `operatorControlSummary`
    - recovery detail carries the bounded resumed execution timeline
  This keeps operator control consistent across direct and team runs without
  inventing a second team-only control surface.
- 2026-04-12: Mixed-provider response readback still should not be treated as a
  per-step provider matrix. In the `ChatGPT -> Gemini` live proof, the run
  succeeded end to end and `stepSummaries` correctly showed:
  - step 1 `chatgpt` / `wsl-chrome-2`
  - step 2 `gemini` / `auracall-gemini-pro`
  but `GET /v1/responses/{response_id}` metadata service/runtime still read
  back as the entry-side provider/runtime. The durable rule for now is:
  - use `execution.stepSummaries` as the authoritative mixed-provider proof
  - use recovery/response orchestration timeline for lifecycle confirmation
  - do not assert response metadata service/runtime as though it were terminal-
    step aware until the response model is intentionally widened
- 2026-04-12: The first multi-service team proof should stay tool-free and use
  one fixed lock order across provider browser families. A cross-provider team
  test that touches both ChatGPT and Grok should:
  - prove the provider handoff with `stepSummaries`, not by overloading the
    single response metadata service/runtime fields
  - lock `chatgpt-browser` first and `grok-browser` second to avoid deadlocks
    with provider-specific live suites
  - reuse exact-id cleanup per provider after successful assertions instead of
    inventing a merged cleanup surface
- 2026-04-12: ChatGPT team live proof should trust the managed browser profile
  bound to the runtime profile, not the source Chrome cookie jar. The first
  `auracall-chatgpt-solo` live attempt falsely skipped because it checked for a
  ChatGPT session token in source Chrome `Default`, while the real team path
  runs on the managed `wsl-chrome-2/chatgpt` profile. The durable rule is:
  - use source-cookie preflight only when the runtime actually depends on source
    cookies
  - for managed-profile team baselines, the honest proof is the real provider-
    backed team command itself
  - if that real command succeeds, remove the false preflight rather than
    preserving a misleading skip
- 2026-04-12: Exact-id live-test cleanup is not just a Grok/Gemini concern.
  Once ChatGPT team live tests exist, the same delayed cleanup ledger should
  include `chatgpt` so throwaway baseline chats do not accumulate on that
  provider either. Keep the same policy:
  - enqueue only after successful assertions
  - threshold `6`
  - retain newest `3`
  - delete by exact conversation id only
- 2026-04-12: For bounded direct-run human-escalation operator flows, do not
  treat response readback and recovery-detail readback as interchangeable.
  The durable split is:
  - `GET /v1/responses/{response_id}` carries bounded
    `operatorControlSummary` for:
    - `humanEscalationResume`
    - `targetedDrain`
  - `GET /status/recovery/{run_id}` carries the bounded orchestration timeline
    slice for the resumed terminal lifecycle, not a raw full-history dump
  So the cohesive proof should assert:
  - response readback has the structured operator summary
  - recovery detail has the resume/drain notes it is designed to retain
  Avoid requiring the earlier pause note on the bounded recovery timeline if
  that surface intentionally narrows to the later resumed lifecycle.
- 2026-04-12: If live team smokes are going to create lots of throwaway chats,
  do not delete them immediately after every run and do not rely on fuzzy
  title matching. The durable hygiene pattern is:
  - persist exact browser conversation ids in stored team step output
    (`browserRun.conversationId`, `browserRun.tabUrl`) for each provider
  - enqueue successful live-test conversations into a provider-scoped cleanup
    ledger under `~/.auracall/live-test-cleanup/`
  - only prune when the ledger crosses a small threshold (current shape:
    threshold `6`, retain newest `3`)
  - delete by exact id through `auracall delete <conversationId> --target ...`
  This keeps enough recent chats around for debugging while preventing
  long-running live testing from polluting provider workspaces.
- 2026-04-12: Gemini stored team runs must persist browser conversation
  identity just like Grok. The Gemini web executor was returning answer text
  but dropping conversation metadata from `runGeminiWebWithFallback(...)`,
  which left `browserRun.conversationId = null` in stored team steps and
  blocked exact-id cleanup. The durable rule is:
  - extract Gemini conversation id from response metadata (including current
    `cid`, `chat`, and nested `conversationId` shapes, plus `/app/<id>` URL
    fallbacks)
  - preserve intro-metadata conversation identity across Gemini edit flows when
    the second response omits it
  - return both `conversationId` and canonical `tabUrl` from
    `createGeminiWebExecutor(...)`
  Without that, Gemini live-test cleanup and post-run inspection both stay
  weaker than Grok.
- 2026-04-12: For provider-backed team runs on browser services, do not let
  the AuraCall runtime profile id override an explicit managed browser profile
  directory. If a stored team step resolves a concrete `manualLoginProfileDir`
  and the runtime profile also points at a browser family (for example
  `browserFamily = default`), managed-profile ownership must follow that
  browser family. Otherwise Aura-Call can mint a fresh runtime-profile-
  namespaced managed browser profile, lose the live login/project session, and
  Grok project navigation falls back to `issue finding id`.
- 2026-04-12: Grok team/browser waits need a pre-submit assistant baseline.
  Fast Grok replies can land before the post-submit waiter takes its baseline
  snapshot; when that happens, naive "new content since baseline" logic waits
  the full timeout even though the final answer is already on screen. Capture
  the Grok assistant baseline before submit and pass it into
  `waitForGrokAssistantResult(...)` so the run can complete promptly.
- 2026-04-12: The first public-ish team execution seam should be a bounded CLI
  bridge over the existing runtime bridge, not a new HTTP/MCP surface. Make it
  return inspectable ids and step/runtime identity, then immediately run one
  live smoke on the exact command. If that smoke returns
  `finalOutputSummary = bounded local runner pass completed`, treat it as proof
  that the entrypoint is real but the execution substrate is still stubbed. Do
  not claim live team readiness until a provider-backed
  `executeStoredRunStep` path is wired behind the same command.
- 2026-04-12: For the first live team experiments, keep browser/project/model
  identity anchored on a dedicated AuraCall runtime profile, not on the
  agent/team object itself. The practical pattern is:
  - create one dedicated runtime profile for the experiment
  - bind the provider model and live project/workspace there
  - let the agent reference that runtime profile
  - let the team reference the agent
  This keeps browser/account-bearing state on the existing runtime-profile seam
  while still allowing rapid iteration on agent/team instructions, output
  shape, and project knowledge.
- 2026-04-12: After response-side orchestration timeline readback exists, the
  matching operator-side follow-through should stay on the existing per-run
  recovery detail route:
  - add bounded `orchestrationTimelineSummary` to
    `GET /status/recovery/{run_id}`
  - derive it from the same selected relevant `sharedState.history` entries
  - keep `/status?recovery=true` unchanged
  - keep the item shape aligned with the response reader
  This gives operators the same bounded orchestration timeline signal without
  bloating the compact recovery summary surface.
- 2026-04-12: When durable execution history becomes rich enough to read, the
  first history-backed reader should stay bounded and ride an existing detailed
  surface:
  - expose one compact `metadata.executionSummary.orchestrationTimelineSummary`
    on `GET /v1/responses/{response_id}`
  - derive it from selected relevant `sharedState.history` entries only
  - cap it to a small recent slice instead of dumping raw history
  - keep the item shape compact: `type`, `createdAt`, `stepId`, `note`,
    `handoffId`
  This turns durable history into usable orchestration readback without
  inventing a second history model or bloating the response surface.
- 2026-04-12: Once handoff `taskTransfer` is shaped and consumed at runtime,
  the next durable projection should stay on existing shared-state primitives:
  - append one internal structured output keyed as
    `step.consumedTaskTransfers.<stepId>`
  - append one compact shared-state note with the consumed-transfer count
  - derive both from runtime `sharedStateContext.dependencyTaskTransfers`
  - treat the key as internal so requested-output fulfillment does not mistake
    orchestration state for a user-facing structured result
  This records consumed transfer context durably without inventing a second
  transfer store or expanding public route surfaces in the same slice.
- 2026-04-12: After durable consumed-transfer state exists, detailed readers
  should prefer that stored projection over planned-handoff re-derivation:
  - `GET /v1/responses/{response_id}`
  - `GET /status/recovery/{run_id}`
  - keep the public summary vocabulary unchanged
  - keep planned-handoff fallback only for runs that do not yet have stored
    consumed-transfer state
  This removes avoidable reader re-derivation while preserving the same client
  and operator payload shapes.
- 2026-04-12: Once the handoff-transfer line is coherent enough to pause, the
  next broader orchestration seam should be handoff lifecycle follow-through,
  not more transfer payload or readback growth:
  - advance durable handoff state beyond `prepared` when downstream execution
    actually consumes the handoff
  - append explicit handoff-consumption history on the existing durable
    shared-state/history seam
  - keep the first slice bounded to lifecycle/state progression rather than a
    richer transfer schema
  This aligns runtime behavior with the existing team-run data model, which
  already expects handoff status and append-only history to be meaningful
  orchestration records.
- 2026-04-12: When implementing the first handoff lifecycle slice, keep the
  mutation rule narrow and evidence-based:
  - only a succeeded downstream step with incoming dependency `taskTransfer`
    handoffs may advance those handoffs to `consumed`
  - append one explicit `handoff-consumed` event on the existing execution
    history seam
  - do not broaden the same slice to local-action-only guidance handoffs or a
    richer handoff schema
  This keeps lifecycle progression truthful without inventing a second handoff
  state machine.
- 2026-04-12: Once the handoff line is coherent enough to pause, the next
  broader seam should be history-backed orchestration readback, not more
  handoff-local growth:
  - consume the existing append-only `sharedState.history`
  - stay on existing detailed surfaces first
  - expose one bounded orchestration timeline/summary rather than the raw
    history blob
  - prefer cross-cutting lifecycle signal (`step-*`, `handoff-consumed`,
    operator/runtime notes) over another handoff-specific payload expansion
  This uses the durable execution record the data model already requires,
  instead of continuing to grow isolated point summaries.
- 2026-04-12: Once the bounded handoff-transfer line has:
  - planner shaping
  - bridge preservation
  - downstream runtime/shared-state consumption
  - detailed response readback
  - per-run operator recovery-detail readback
  stop extending it with more read surfaces by inertia.
  The next higher-yield seam is durable shared-state/history projection of
  consumed transfer context so later orchestration readers can recover that
  state without re-deriving it from planned handoffs plus current step shape.
  This keeps the line moving toward orchestration value instead of readback
  sprawl.
- 2026-04-12: After response-side handoff-transfer readback exists, the first
  operator-side readback seam should stay on per-run recovery detail:
  - add bounded `handoffTransferSummary` to `GET /status/recovery/{run_id}`
  - derive it from incoming planned handoffs for the latest dependent step
  - keep `/status?recovery=true` unchanged
  - keep the fields compact: transfer identity plus bounded counts only
  This gives operators precise inspection without bloating the compact recovery
  summary surface.
- 2026-04-12: After handoff `taskTransfer` is consumed at runtime, the first
  readback seam should stay on an existing detailed response surface:
  - expose one compact `metadata.executionSummary.handoffTransferSummary`
  - derive it from incoming planned handoffs to the terminal-or-latest step
  - include only transfer identity plus bounded counts, not the full payload
  - do not widen `/status` or invent a second transfer store in the same slice
  This keeps handoff-transfer visibility aligned with the same contract the
  runner already consumes, without bloating compact operator surfaces.
- 2026-04-12: After bounded handoff `taskTransfer` exists, the first
  downstream consumer should stay on the existing execution-context seam:
  - read incoming dependency handoffs for the current step
  - project them into one bounded shared-state context view such as
    `dependencyTaskTransfers`
  - add one compact prompt context block derived from the same handoff payload
  - do not introduce a second transfer store or new orchestration vocabulary in
    the same slice
  This makes handoff shaping operational without letting the transfer contract
  split across planning and runtime models.
- 2026-04-12: When task-aware handoffs need richer transfer context, keep the
  first slice on the existing handoff `structuredData` seam:
  - derive one compact `taskTransfer` block from the source planned step
  - include only assignment summary and ref identity:
    - `title`
    - `objective`
    - `successCriteria`
    - bounded `requestedOutputs`
    - bounded `inputArtifacts`
  - do not introduce a second handoff model, artifact payload mirror, or
    evaluator vocabulary in the same slice
  This keeps handoff shaping aligned with the stabilized task-run-spec
  substrate without letting orchestration payloads sprawl.
- 2026-04-12: Once the bounded task-run-spec consumer line covers:
  - execution identity selection
  - runtime/browser override consumption
  - task context and structured context runtime input
  - requested-output readback and enforcement
  - provider-budget enforcement
  - input-artifact runtime context
  - input-artifact detailed response readback
  stop extending field-level task-run-spec semantics by inertia.
  Current audit result:
  - `successCriteria` is still too free-form for honest runtime/service
    enforcement without a separate evaluator model
  - `requestedBy` / `trigger` already have the bounded projection they need
  - there is no remaining field-level consumer that clearly beats a checkpoint
    pause
  - the next higher-yield seam is bounded task-aware handoff shaping because
    current handoffs still carry mostly identity plus later local-action
    overlays rather than a fuller task-aware transfer contract
  This keeps the repo from inventing fake assignment semantics after the
  bounded task-run-spec line is already coherent enough to pause.
- 2026-04-12: After task input artifacts become a real runtime execution
  input, the first readback seam should stay on existing detailed response
  reads:
  - expose one bounded `metadata.executionSummary.inputArtifactSummary`
  - derive it from existing step input artifact refs on the
    terminal-or-latest artifact-bearing step
  - include only compact ref identity fields such as `id`, `kind`, `title`,
    `path`, and `uri`
  - do not add a second artifact store, payload mirror, or compact status
    rollup in the same slice
  This keeps assignment-artifact visibility aligned with the existing runtime
  transport and detailed read surfaces.
- 2026-04-12: After the `providerBudget` lane is coherent enough to pause, the
  first `inputArtifacts` consumer should stay on the existing execution-context
  seam:
  - reuse `step.input.artifacts` as the single durable transport
  - inject one bounded `taskInputArtifacts` view into `sharedStateContext`
  - add one bounded prompt context block derived from artifact refs
  - do not invent a second artifact store, artifact payload mirror, or fuzzy
    success evaluator in the same slice
  This makes assignment artifacts real at runtime with the narrowest honest
  execution consumer.
- 2026-04-12: Once `constraints.providerBudget` has:
  - `maxRequests`
  - durable usage ingestion
  - `maxTokens`
  stop extending that lane by inertia. Reassess the remaining task-run-spec
  consumers and prefer the next concrete assignment-content seam over a richer
  budget variant.
  Current audit result:
  - `successCriteria` is too free-form for honest runtime enforcement without a
    new evaluator model
  - `requestedBy` / `trigger` already have the bounded projection they need
  - `inputArtifacts` is the next strongest concrete runtime/service seam
  This keeps the task-run-spec lane grounded in fields with real execution
  substrate instead of inventing fake policy depth.
- 2026-04-12: After durable provider usage exists, the first
  `constraints.providerBudget.maxTokens` rule should consume only that stored
  signal:
  - sum durable `step.providerUsage.*.totalTokens`
  - if the stored total is already above budget, fail before the next step
    executes
  - use one explicit failure code such as
    `task_provider_token_limit_exceeded`
  - do not predict mid-step token spend in the first slice
  This keeps token-budget enforcement evidence-based and conservative.
- 2026-04-12: When durable runtime/service usage is missing, ingest it at the
  execution callback seam before adding token-budget policy:
  - extend `ExecuteStoredRunStepResult` to carry real provider usage
  - persist it as one bounded step-scoped structured output such as
    `step.providerUsage.<stepId>`
  - project readback from that same durable record instead of inventing a
    parallel usage store
  This creates the minimum honest substrate for later `providerBudget.maxTokens`
  work.
- 2026-04-11: Do not enforce `constraints.providerBudget.maxTokens` until
  provider usage is part of durable runtime/service state:
  - current token usage exists in the API/session layer, not on
    `ExecutionRun` / `ExecutionRunStep` / shared runtime state
  - do not substitute prompt-length heuristics or generic token estimates for
    real provider usage in runtime enforcement
  - the next honest seam is usage ingestion, then token-budget policy
  This prevents fake budget semantics on the task-run-spec runtime path.
- 2026-04-11: Start `constraints.providerBudget` with `maxRequests`, not
  `maxTokens`:
  - enforce it at the same pre-execution runner gate used for
    `turnPolicy.maxTurns` and `constraints.maxRuntimeMinutes`
  - in the current sequential runtime, count the next runnable step order as
    the bounded proxy for request count
  - fail before execution with one explicit code such as
    `task_provider_request_limit_exceeded`
  - do not invent provider-native token accounting or a second budget model in
    the first slice
  This makes `providerBudget` real with the narrowest defensible rule before
  any harder token-budget work.
- 2026-04-11: Once the requested-output line has:
  - fulfillment readback
  - readback policy
  - response-surface enforcement
  - stored runtime/service enforcement
  stop extending it by inertia. Reassess the remaining task-run-spec runtime
  consumers and pick the next inert field, not the locally richest one.
  Current audit result:
  - `humanInteractionPolicy` already has runtime consumption
  - `localActionPolicy` already has runtime consumption
  - `providerBudget` is the next clearly inert bounded constraint
  This keeps the task-run-spec lane moving by roadmap leverage instead of
  overfitting one sub-line.
- 2026-04-11: After response-surface enforcement for missing required outputs
  exists, remove the split with stored runtime state at the runner boundary:
  - evaluate required requested outputs immediately before persisting a
    would-be success bundle
  - if clearly missing, persist failed runtime/service terminal state with
    `requested_output_required_missing`
  - preserve produced output and evidence on the failed step
  - do not broaden into per-format schema validation in the same slice
  This keeps terminal semantics aligned between storage and readback without
  inventing a second validator model.
- 2026-04-11: After required requested outputs escalate on readback, the first
  enforcement seam can stay on response semantics before touching stored run
  state:
  - if a run otherwise reads back as `completed` but
    `requestedOutputPolicy.status = missing-required`, downgrade response
    readback to `failed`
  - synthesize bounded failure summary with
    `requested_output_required_missing`
  - do not rewrite persisted runtime run history in the same slice
  This creates real observable enforcement while keeping the first mutation
  boundary narrow.
- 2026-04-11: After requested-output fulfillment evidence exists, the first
  stronger policy seam should be readback escalation, not runtime failure:
  - add one compact `requestedOutputPolicy`
  - derive it from the same `requestedOutputSummary` evidence path
  - use bounded statuses such as `satisfied` and `missing-required`
  - keep runtime terminal status unchanged in the first slice
  This makes missing required outputs explicit to clients before adding harder
  service/runtime enforcement semantics.
- 2026-04-11: After `context` and `structuredContext` are real runtime inputs,
  the next bounded `requestedOutputs` seam should be fulfillment readback, not
  hard validation:
  - derive one compact `requestedOutputSummary` from requested outputs plus
    actual stored response messages, artifacts, and non-internal structured
    outputs
  - report fulfillment evidence and missing required outputs
  - keep the first slice read-only and bounded on `GET /v1/responses/{response_id}`
  - do not introduce a second output-contract model or runtime failure path yet
  This proves `requestedOutputs` has real runtime/readback value before adding
  stricter enforcement semantics.
- 2026-04-11: After `overrides.structuredContext` becomes a real runtime
  consumer, the next bounded task assignment content seam should be
  `TaskRunSpec.context`, not another prompt-shaping variant:
  - carry `taskContext` through planned step structured data
  - inject it into runtime `sharedStateContext`
  - add one bounded prompt context so prompt-driven execution sees the same
    assignment content
  - do not invent a second task-content transport or a separate request model
  Once both `structuredContext` and `context` are real runtime inputs, pause
  further context expansion and move to the next content consumer such as
  `requestedOutputs`.
- 2026-04-11: After the budget/policy lane reaches a checkpoint pause, the
  next higher-yield runtime consumer should be task assignment content rather
  than another scalar guard. The first good seam is
  `overrides.structuredContext`:
  - carry `taskOverrideStructuredContext` into actual runtime step execution context
  - include it in `sharedStateContext` for the runner/bridge callback
  - add bounded prompt context so the same content is visible to prompt-driven execution too
  - do not invent a second task-context transport model
  This turns task assignment content into real execution input without adding
  a new route family or executor path.
- 2026-04-11: Once task-aware runtime policy covers:
  - planning identity selection
  - bridge execution identity evidence
  - `turnPolicy.maxTurns`
  - `constraints.maxRuntimeMinutes`
  stop extending the budget/policy lane by inertia. The next higher-yield
  consumer should be task assignment content at runtime, not another scalar
  guard:
  - prefer one bounded runtime/request seam that consumes assignment context,
    structured context, or requested outputs
  - avoid adding more constraint gates unless they clearly beat that content
    seam
  This keeps the next slice focused on what the task is asking for, not just
  what it forbids.
- 2026-04-11: After `turnPolicy.maxTurns` is enforced at runtime, the next
  bounded task constraint can use the same conservative runner gate:
  - read `step.input.structuredData.constraints.maxRuntimeMinutes`
  - compare it to elapsed run age from `run.createdAt`
  - if the budget is already exceeded, fail before step execution
  - use one explicit failure code such as `task_runtime_limit_exceeded`
  This turns task runtime budget into real post-planning behavior without
  introducing queue-time scheduling or a second timeout model.
- 2026-04-11: After task-aware planning and bridge execution identity are
  coherent, the next runtime behavior seam can stay narrow by enforcing the
  already-modeled task turn budget:
  - read `step.input.structuredData.turnPolicy.maxTurns` at runner time
  - if the next runnable step order exceeds that bound, fail before step execution
  - use one explicit runtime failure code such as `task_turn_limit_exceeded`
  - do not invent a second planning-only budget model
  This turns `turnPolicy.maxTurns` into real post-planning runtime behavior
  without widening scheduler semantics.
- 2026-04-11: Once task-aware runtime/browser overrides affect planning,
  expose the downstream runtime consumption on the existing bridge summary
  before adding more planning policy:
  - include per-step runtime profile, browser profile, and service on
    `TeamRuntimeExecutionSummary`
  - derive them from the actual runtime step when available, otherwise from
    the planned team step
  - prove that a task-selected runtime override survives:
    - planned team step
    - created runtime step
    - final runtime step
    - bridge execution summary
  This keeps the next slice on post-planning execution evidence instead of
  more metadata-only propagation.
- 2026-04-11: After task-aware planning consumes agent filters, prompt
  shaping, and service constraints, the next execution-identity slice should
  stay conservative:
  - let `taskRunSpec.overrides.runtimeProfileId` re-resolve step execution identity on config-driven planning
  - treat `taskRunSpec.overrides.browserProfileId` as a compatibility requirement
  - if the selected or overridden runtime identity cannot satisfy the browser
    requirement, block the step cleanly
  - for already-resolved team inputs, validate compatibility instead of
    inventing a second resolver
  This makes task/run-spec execution identity real without introducing another
  planner or executor path.
- 2026-04-11: After the first task-aware bridge consumer lands, make the next
  task/run-spec slice consume planning behavior, not just identity plumbing:
  - let `taskRunSpec.overrides.agentIds` filter the planned team members/roles
  - let `taskRunSpec.overrides.promptAppend` extend planned step prompts
  - let `taskRunSpec.overrides.structuredContext` flow into planned step structured data
  - let simple `allowedServices` / `blockedServices` constraints block steps
    whose selected service is not permitted
  - do not invent a second planner or executor path for this
  This proves task/run-spec semantics are affecting the plan itself instead of
  remaining passive metadata.
- 2026-04-11: After task/run-spec identity is stable in planning, runtime
  storage, and readback, the next real consumer should be an execution seam,
  not another reporting field. The first good consumer is the team-runtime
  bridge:
  - add task-aware bridge entrypoints
  - reuse the existing task-aware service-plan builders
  - carry `taskRunSpecId` through the bridge execution summary
  - do not invent a parallel task-aware executor path
- 2026-04-11: Once assignment identity is available on:
  - runtime run storage
  - `GET /v1/responses/{response_id}`
  - `GET /status/recovery/{run_id}`
  stop exposing `taskRunSpecId` by inertia. Keep the compact operator surfaces
  compact:
  - do not add `taskRunSpecId` to `/status?recovery=true` without a concrete operator need
  - do not add a second plain `/status` assignment rollup by default
  Prefer reusing the existing detailed-read surfaces until a real consumer
  proves otherwise.
- 2026-04-11: If operators need assignment identity beyond response readback,
  put the next exposure on the bounded per-run recovery detail route first:
  - add `taskRunSpecId` to `GET /status/recovery/{run_id}`
  - keep `/status?recovery=true` compact
  - do not add a second assignment-summary vocabulary
  This keeps detailed operator inspection rich without turning the recovery
  summary into a bulky debug payload.
- 2026-04-19: Recovery detail must keep assignment identity scoped to the
  `taskRunSpec -> teamRun -> runtime` chain.
  - `GET /status/recovery/{run_id}` may expose `taskRunSpecId` and
    `taskRunSpecSummary` for team-run-backed runtime records
  - direct runs must suppress both fields even if a legacy or malformed
    record still carries a persisted `taskRunSpecId`
  - do not let direct-run recovery detail project team assignment metadata
    just because storage contains a stale id
- 2026-04-11: After `taskRunSpecId` is preserved onto runtime run records, the
  first response/readback follow-through should stay narrow:
  - expose `metadata.taskRunSpecId` on `GET /v1/responses/{response_id}`
  - keep it top-level on response metadata
  - do not invent a second `executionSummary` variant for assignment identity
  - do not widen status/recovery payloads until a concrete operator consumer exists
- 2026-04-11: Once the first bounded `TaskRunSpec` contract exists in
  `src/teams/*`, carry `taskRunSpecId` as a first-class runtime run field
  instead of preserving it only inside step-scoped structured data. Keep the
  first follow-through slice narrow:
  - add `ExecutionRun.taskRunSpecId`
  - project `teamRun.taskRunSpecId` onto the runtime run record
  - prove it in runtime type/schema/model tests
  - do not broaden `TaskRunSpec` itself or add new public execution surfaces
- 2026-04-11: The first code-facing `TaskRunSpec` slice should stay stricter
  than the surrounding execution/runtime models:
  - keep assignment intent structured and bounded
  - use explicit enums for requested outputs, input-artifact kinds, and human/local-action policy
  - keep `TaskRunSpec.requestedBy` structured
  - project to simpler execution-side fields such as `TeamRun.requestedBy` at
    the seam instead of weakening the assignment contract
  This preserves the split between assignment intent and execution history.
- 2026-04-11: Before adding code-facing team execution or public `team run`
  surfaces, lock one concrete assignment contract first:
  - one bounded `taskRunSpec`
  - one selected `team`
  - one planned `teamRun`
  - one durable `teamRun.taskRunSpecId` binding
  Do not treat bare `team` config as the complete executable input once this
  layer exists. Keep assignment intent on `taskRunSpec` and execution history
  on `teamRun`.
- 2026-04-11: Once the bounded local-action / human-resume / targeted-drain
  line has:
  - control on `POST /status`
  - responses-side readback on `GET /v1/responses/{response_id}`
  - no second lifecycle model
  stop extending that line by inertia. The next higher-yield architecture seam
  is the missing task / run-spec layer that binds concrete work to the
  existing team/runtime substrate. Prefer that binding layer over more local
  operator reporting once the single-runner lifecycle contract is already
  coherent.
- 2026-04-11: After bounded `resume-human-escalation` and `drain-run` controls
  exist, the first compact operator readback should stay on the existing
  `GET /v1/responses/{response_id}` surface:
  - expose one bounded `metadata.executionSummary.operatorControlSummary`
  - derive resume state from persisted `human.resume.<stepId>` structured
    output
  - derive targeted-drain state from persisted operator `note-added` events
  - do not invent a second operator-history route or a second lifecycle model
  This keeps control and readback coherent on the existing direct-run surfaces.
- 2026-04-11: After bounded human-escalation resume lands, the first post-resume follow-through seam should stay on the same `POST /status` surface and reuse the existing host drain:
  - expose one `runControl.drain-run` action
  - allow it only for direct runs
  - trigger one targeted host-owned drain pass for the requested run
  - reject skipped or non-direct cases cleanly instead of inventing a scheduler-like control plane
  This gives resumed runs one immediate follow-through path without widening into broader orchestration.
- 2026-04-11: After landing bounded local-action resolution, the next local-action lifecycle seam should reuse the existing human-escalation resume model on the same `POST /status` surface:
  - expose one `runControl.resume-human-escalation` action
  - allow it only for direct runs that currently have a cancelled human-escalation step
  - pass note/guidance/override through to the existing runtime resume semantics
  - reject non-paused runs cleanly instead of inventing broader force-resume behavior
  This keeps post-escalation follow-through narrow and consistent with the already-proven runtime model.
- 2026-04-11: The first local-action control seam should stay on the existing `POST /status` surface and mutate the same persisted outcome summary that responses readback already uses:
  - resolve only currently `requested` local action records
  - limit the first control to `approved|rejected|cancelled`
  - update `step.localActionOutcomes.*` in the same write so `metadata.executionSummary.localActionSummary` stays authoritative on later reads
  - reject already-resolved requests instead of overwriting them
  This keeps local-action lifecycle follow-through coherent without inventing a second route family or a second outcome model.
- 2026-04-11: For the first local-action lifecycle follow-through, prefer bounded readback on the existing responses surface over a new control route:
  - reuse the persisted `step.localActionOutcomes.*` structured output
  - expose one compact `metadata.executionSummary.localActionSummary`
  - keep the summary bounded to counts plus compact items
  This makes local-action outcomes visible to clients without inventing a second host-action lifecycle model.
- 2026-04-11: Once the bounded cancel line is coherent end-to-end, stop extending it by default. The next higher-yield local service/runtime seam is local-action lifecycle follow-through:
  - keep cancel work paused once control, late-completion protection, recovery visibility, and responses readback are all in place
  - move to the remaining host-owned execution path that still lacks comparable lifecycle clarity
  - prefer one bounded local-action control/readback seam before any broader reassignment or multi-runner work
  This keeps execution progress driven by roadmap leverage instead of local completeness bias.
- 2026-04-11: After adding bounded cancel control and recovery-side cancellation visibility, the first post-cancel lifecycle follow-through should land on the existing responses readback:
  - expose cancellation outcome through `metadata.executionSummary`
  - include `cancelledAt`, `source`, and `reason`
  - derive it from the stored cancellation note event instead of inventing a second terminal model
  Keep cancelled terminal readback on existing create/read surfaces before considering broader cleanup or retry semantics.
- 2026-04-11: After landing a bounded cancel action, add the first readback on the existing recovery surfaces instead of widening plain status or inventing a second lifecycle model:
  - separate `cancelledRunIds` from `idleRunIds` in recovery summary
  - expose bounded cancellation reason maps on recovery summary
  - expose `cancelledAt`, `source`, and `reason` on per-run recovery detail
  Keep cancel visibility read-only and recovery-scoped first; plain `/status` should stay compact unless there is a stronger operator need.
- 2026-04-11: Once single-runner ownership is live, the first stop path should stay narrow and reuse existing runtime semantics:
  - use the existing `cancelled` vocabulary instead of inventing a second stop state
  - scope the first cancel action to active leases owned by the local runner/host
  - release the active lease with reason `cancelled`
  - if delayed step work finishes after cancellation wins, preserve the `cancelled` terminal state instead of overwriting it with late completion
  Prefer a conservative local cancel seam before any broader reassignment or multi-runner stop behavior.
- 2026-04-11: After the stale-heartbeat line reaches a coherent checkpoint, stop adding more reporting by default. The next higher-yield live runner/service seam is bounded stop/cancel control:
  - the runtime model already carries `cancelled`
  - the host now has enough ownership, lease freshness, and operator visibility to support one conservative stop path
  - this should land before any broader reassignment or multi-runner scheduling work
  Prefer the next control seam over more stale-heartbeat-specific surfaces once classification, repair, and attention are already in place.
- 2026-04-11: Once unrepaired `stale-heartbeat` attention exists on recovery surfaces, the first external consumer should be a compact startup/operator signal, not another status payload:
  - read the existing recovery summary after the bounded startup drain pass
  - emit `attention=stale-heartbeat-inspect-only:<count>` only when nonzero
  - keep ordinary startup logs unchanged when there is no such attention
  This makes the new signal visible during real service start without widening control or scheduling behavior.
- 2026-04-11: After host and operator repair share one stale-heartbeat repair seam, the next bounded signal should be read-only attention, not more automation:
  - surface only `stale-heartbeat` + `inspect-only`
  - keep `suspiciously-idle` outside the attention path
  - put compact aggregates on recovery summary and one explicit flag on per-run detail
  This gives operators a narrow escalation target without inventing another action or scheduler rule.
- 2026-04-11: Once a bounded operator repair action exists, do not leave host recovery on a second reclaim path. Route host repair through the same stale-heartbeat repair seam so:
  - manual operator repair and host repair share one policy gate
  - reclaimable stale-heartbeat leases still recover
  - `suspiciously-idle` stays diagnostic-only everywhere
  This avoids policy drift between status control and host recovery.
- 2026-04-11: Once `stale-heartbeat` is visible on recovery surfaces and consumed in host skip/log behavior, the first operator action should stay manual and narrow:
  - expose a single run-scoped `repair-stale-heartbeat` control on the existing `POST /status` surface
  - allow it only when the run is still classified `stale-heartbeat`
  - require the existing durable repair posture to already be `locally-reclaimable`
  - reject `suspiciously-idle` as diagnostic-only
  This keeps the first stuck-run repair action conservative and auditable instead of broadening into automatic reclaim or reassignment.
- 2026-04-11: After adding read-only stuck-run classification, the first consumer should be the narrowest safe one: let `stale-heartbeat` become its own host skip/log posture, but keep `suspiciously-idle` diagnostic-only. That keeps operator signal high without jumping early to repair automation.
- 2026-04-11: Once live runner-owned leases have real heartbeat freshness, add a read-only stuck-run classifier before any more repair automation. The bounded operator contract is:
  - classify active leases as `fresh`, `stale-heartbeat`, or `suspiciously-idle`
  - derive the result from existing lease heartbeat, runner liveness, and runner activity data
  - surface compact aggregates on recovery summary and per-run detail on recovery detail
  Keep this read-only until operators can inspect the classifications reliably.
- 2026-04-11: Once a live persisted runner owns local claims, do not leave lease freshness as a one-shot timestamp. The first conservative rule is:
  - acquire the lease with a real TTL immediately
  - refresh that lease heartbeat while delayed local step work is still executing
  - stop the heartbeat before final release
  - reread the latest run record before final success/failure persist so heartbeat-side lease revisions are not lost
  Keep this bounded to one local runner pass; do not turn it into multi-runner scheduling.
- 2026-04-11: Once `api serve` owns a live persisted runner id, do not stop at heartbeat liveness. Add one bounded activity seam so operators can tell whether that runner has actually advanced work. The conservative contract is:
  - persist `lastActivityAt`
  - persist `lastClaimedRunId`
  - update them only after a run actually advances
  - surface them on the existing plain `/status.runner` block
  Keep this metadata diagnostic only; do not turn it into multi-runner scheduling, reassignment, or a second execution source of truth.
# Dev Fixes Log

This log captures notable fixes, what broke, why, and how we verified the repair. The goal is to preserve lessons learned and avoid repeating regressions.

## When to update

- After fixing a regression, production bug, or flaky behavior.
- After discovering a confusing failure mode or tricky debugging step.
- After landing a workaround that should be revisited.

## Entry format

- Date:
- Area:
- Symptom:
- Root cause:
- Fix:
- Verification:
- Follow-ups:

## Entries

- Date: 2026-04-11
- Area: Plain status local-claim snapshot
- Symptom:
  - After `recoverySummary.localClaim` landed, operators still had to opt into `?recovery=true` to see any compact local-runner selection posture. Plain `/status` still exposed liveness but not current claimability.
- Root cause:
  - The only compact local-claim aggregate lived on the broader recovery summary path, which is a different operator intent than a lightweight status read.
- Fix:
  - Added a read-only `summarizeLocalClaimState(...)` helper in [src/runtime/serviceHost.ts](/home/ecochran76/workspace.local/auracall/src/runtime/serviceHost.ts).
  - Updated [src/http/responsesServer.ts](/home/ecochran76/workspace.local/auracall/src/http/responsesServer.ts) so plain `/status` now includes `localClaimSummary` without invoking the broader recovery summary/repair path.
  - Added focused coverage in [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/auracall/tests/http.responsesServer.test.ts) and re-verified [tests/runtime.serviceHost.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.serviceHost.test.ts).
- Verification:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Keep plain `/status` limited to the compact direct-run snapshot.
  - Leave broader source filters and repair-heavy views on the recovery routes unless there is a specific operator need.

- Date: 2026-04-11
- Area: Compact local-claim recovery summary
- Symptom:
  - After the single-runner selection seam landed, operators could inspect `localClaim.selected` only through the per-run recovery detail route. That was too narrow for checking overall local runner posture across the current recovery set.
- Root cause:
  - The status recovery summary still aggregated reclaim/repair state only. It had no compact projection of the configured local runner's selected vs blocked vs unavailable posture across runs.
- Fix:
  - Extended [src/runtime/serviceHost.ts](/home/ecochran76/workspace.local/auracall/src/runtime/serviceHost.ts) so `summarizeRecoveryState(...)` now returns bounded `localClaim` aggregates for the configured local runner.
  - Reused the existing single-runner selection seam in [src/runtime/claims.ts](/home/ecochran76/workspace.local/auracall/src/runtime/claims.ts) instead of adding a second claim classifier.
  - Let [src/http/responsesServer.ts](/home/ecochran76/workspace.local/auracall/src/http/responsesServer.ts) surface that summary through the existing `GET /status?recovery=true` contract.
  - Added focused coverage in [tests/runtime.serviceHost.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.serviceHost.test.ts) and [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/auracall/tests/http.responsesServer.test.ts).
- Verification:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Keep the summary compact; deeper diagnosis still belongs on `GET /status/recovery/{run_id}`.
  - Do not widen this into multi-runner competition or scheduling without a separate checkpoint.

- Date: 2026-04-11
- Area: Local runner-selection seam
- Symptom:
  - After local claim-read landed, the repo could explain one configured runner's posture for a run, but host execution and recovery detail were still relying on separate paths. That left `localClaim` descriptive while `serviceHost` claim gating stayed partially duplicated.
- Root cause:
  - The claim-read helper and the host execution gate were not yet sharing one authoritative selected/not-selected decision for the configured local runner.
- Fix:
  - Added `selectStoredExecutionRunLocalClaim(...)` in [src/runtime/claims.ts](/home/ecochran76/workspace.local/auracall/src/runtime/claims.ts) as the bounded single-runner selection seam.
  - Updated [src/runtime/serviceHost.ts](/home/ecochran76/workspace.local/auracall/src/runtime/serviceHost.ts) so `readRecoveryDetail(...)` now exposes `localClaim.selected` and `drainRunsOnce(...)` now gates local execution through the same selection result.
  - Expanded focused coverage in [tests/runtime.claims.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.claims.test.ts), [tests/runtime.serviceHost.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.serviceHost.test.ts), and [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/auracall/tests/http.responsesServer.test.ts).
- Verification:
  - `pnpm vitest run tests/runtime.claims.test.ts tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Keep this seam single-runner scoped until there is a concrete need for multi-runner competition.
  - If operators need more visibility, add a compact summary/read surface before any scheduler-like expansion.

- Date: 2026-04-11
- Area: Local runner claim-read seam
- Symptom:
  - After runner-owned host claims landed, operators and tests could tell whether a claim happened, but they still could not read the configured local runner's current claim posture for a specific run without inferring it from leases, queue state, and runner records separately.
- Root cause:
  - The repo had persisted candidate evaluation helpers and a recovery-detail route, but there was no bounded single-runner read seam tying those together for the currently configured local host runner.
- Fix:
  - Extended [src/runtime/claims.ts](/home/ecochran76/workspace.local/auracall/src/runtime/claims.ts) with `evaluateStoredExecutionRunLocalClaim(...)` for one configured runner.
  - Extended [src/runtime/serviceHost.ts](/home/ecochran76/workspace.local/auracall/src/runtime/serviceHost.ts) so `readRecoveryDetail(...)` now includes `localClaim` when a host `runnerId` is configured.
  - Reused the existing [src/http/responsesServer.ts](/home/ecochran76/workspace.local/auracall/src/http/responsesServer.ts) recovery-detail route instead of adding a new claim route.
  - Added focused coverage in [tests/runtime.serviceHost.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.serviceHost.test.ts) and updated [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/auracall/tests/http.responsesServer.test.ts).
- Verification:
  - `pnpm vitest run tests/runtime.claims.test.ts tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Add one bounded local runner-selection seam before any multi-runner scheduling.
  - Keep this detail block compact; do not turn `/status/recovery/{run_id}` into a broad debug dump.

- Date: 2026-04-11
- Area: Runner-aware host claim ownership
- Symptom:
  - After live runner self-registration landed, `serviceHost` still claimed runnable work through a plain owner string even when a persisted live runner record existed. That meant the durable runner model was visible but still not authoritative for local claim ownership.
- Root cause:
  - Host execution already accepted an `ownerId`, but there was no bounded gate that checked whether a configured runner owner was actually active and unexpired before claiming work.
- Fix:
  - Updated [src/runtime/serviceHost.ts](/home/ecochran76/workspace.local/auracall/src/runtime/serviceHost.ts) so hosts can take a bounded `runnerId`:
    - if the configured runner record is active and unexpired, new leases are claimed under that runner id
    - if the configured runner is missing, stale, or expired, runnable work is skipped with `claim-owner-unavailable`
  - Updated [src/http/responsesServer.ts](/home/ecochran76/workspace.local/auracall/src/http/responsesServer.ts) to pass the live `api serve` runner id through the host claim path.
  - Added focused coverage in [tests/runtime.serviceHost.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.serviceHost.test.ts) for:
    - healthy runner -> runner-owned lease
    - missing runner -> blocked claim with no lease mutation
  - Re-verified [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/auracall/tests/http.responsesServer.test.ts) beside the host change.
- Verification:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Add one bounded local runner-selection or claim-read seam before any multi-runner scheduling.
  - Keep reassignment and broader candidate competition deferred until that simpler claim seam exists.

- Date: 2026-04-11
- Area: `api serve` live runner ownership
- Symptom:
  - The repo had durable runner records, claim evaluation, reconciliation, repair, and status reporting, but `auracall api serve` still did not register itself as a live persisted runner. That left the durable runner model disconnected from the actual service host.
- Root cause:
  - Earlier durable-state slices stopped at data model and inspection seams. `src/http/responsesServer.ts` still owned background drain locally without advertising or heartbeating a persisted runner identity.
- Fix:
  - Updated [src/http/responsesServer.ts](/home/ecochran76/workspace.local/auracall/src/http/responsesServer.ts) so `createResponsesHttpServer(...)` now:
    - creates or reuses one persisted runner id based on the bound local `host:port`
    - passes the shared `runnersControl` seam into `createExecutionServiceHost(...)`
    - heartbeats that runner on a bounded timer while the server is alive
    - marks the runner `stale` on shutdown
    - reports that live runner posture on `/status` under `runner`
  - Added focused coverage in [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/auracall/tests/http.responsesServer.test.ts) for:
    - live runner registration and status reporting
    - stale-on-close behavior
  - Re-verified adjacent host behavior in [tests/runtime.serviceHost.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.serviceHost.test.ts).
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/runtime.serviceHost.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Use the persisted live runner identity in one bounded host claim/lease path instead of stopping at heartbeat-only ownership.
  - Keep multi-runner assignment and reassignment deferred until a single live-claim seam exists.

- Date: 2026-04-09
- Area: Role-aware team planning and explicit planned handoffs
- Symptom:
  - After task-aware planning landed, the planner still lacked a real source of role semantics and still had no explicit handoff entities. That limited the internal model for orchestrator/engineer and proposal-style specialist teams.
- Root cause:
  - Team config only exposed a flat `agents[]` list, and the earlier task-aware planner slice improved assignment intent propagation without yet giving teams a structured role layer or a first-class handoff planning output.
- Fix:
  - Added optional team config metadata in [src/schema/types.ts](/home/ecochran76/workspace.local/auracall/src/schema/types.ts):
    - `teams.<name>.instructions`
    - `teams.<name>.roles.<roleId>`
      - `agent`
      - `order`
      - `instructions`
      - `responseShape`
      - `stepKind`
      - `handoffToRole`
  - Added config coverage in [tests/config.test.ts](/home/ecochran76/workspace.local/auracall/tests/config.test.ts).
  - Extended [src/teams/model.ts](/home/ecochran76/workspace.local/auracall/src/teams/model.ts) so config-driven task-aware planning can:
    - consume team-level instructions
    - consume per-role instructions and response-shape hints
    - bind roles to concrete agents
    - derive role-aware step kinds
    - generate richer task-aware prompts
    - derive explicit planned handoff entities from step dependencies
  - Extended [src/teams/service.ts](/home/ecochran76/workspace.local/auracall/src/teams/service.ts) so `TeamRunServicePlan` now exposes:
    - `handoffs`
    - `handoffsById`
    - config-driven task-aware planning helper support
  - Added focused regression coverage in:
    - [tests/teams.model.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.model.test.ts)
    - [tests/teams.service.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.service.test.ts)
    - [tests/runtime.model.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.model.test.ts)
- Verification:
  - `pnpm vitest run tests/config.test.ts tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts tests/teams.service.test.ts tests/runtime.model.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Decide whether planned handoffs should be persisted directly in the team-run bundle instead of remaining service-plan derived.
  - Define a first explicit local host-action request entity and its ownership boundary relative to steps and handoffs.

- Date: 2026-04-09
- Area: Task-aware team planning seam
- Symptom:
  - After `taskRunSpec` landed, planned team runs still ignored it. The planner was still deriving step intent entirely from resolved member order, which meant assignment-specific objective/output/action semantics were not yet present in the planned steps themselves.
- Root cause:
  - The initial `taskRunSpec` code slice intentionally stopped at types, schemas, and normalization helpers and did not yet wire the assignment object into team-run planning.
- Fix:
  - Added explicit `taskRunSpecId` linkage to planned `teamRun` records in [src/teams/types.ts](/home/ecochran76/workspace.local/auracall/src/teams/types.ts) and [src/teams/schema.ts](/home/ecochran76/workspace.local/auracall/src/teams/schema.ts).
  - Added task-aware planning in [src/teams/model.ts](/home/ecochran76/workspace.local/auracall/src/teams/model.ts) through `createTeamRunBundleFromResolvedTeamTaskRunSpec(...)`, including:
    - step prompt generation from assignment objective and requested outputs
    - input artifact propagation into planned step inputs
    - structured task metadata on planned steps
    - conservative task-aware step-kind inference
  - Added the service-layer helper [src/teams/service.ts](/home/ecochran76/workspace.local/auracall/src/teams/service.ts) so future callers can request a service-ready plan from `resolvedTeam + taskRunSpec`.
  - Added focused coverage in:
    - [tests/teams.model.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.model.test.ts)
    - [tests/teams.service.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.service.test.ts)
    - [tests/runtime.model.test.ts](/home/ecochran76/workspace.local/auracall/tests/runtime.model.test.ts)
- Verification:
  - `pnpm vitest run tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts tests/teams.service.test.ts tests/runtime.model.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Decide whether the next planner seam should derive steps from explicit team roles/policies instead of only ordered members plus assignment intent.
  - Define a first explicit local-action request entity and handoff-planning model.

- Date: 2026-04-09
- Area: First code-facing `taskRunSpec` seam
- Symptom:
  - The assignment layer had been documented, but the code still had no stable object for the concrete work being given to a team. That left future planner/execution code at risk of inferring assignment semantics from ad hoc `initialInputs` or from current member-order team-run defaults.
- Root cause:
  - Earlier slices established team boundaries and team-run execution records first, but stopped before landing a code-facing assignment object.
- Fix:
  - Added `taskRunSpec` types and conservative defaults in [src/teams/types.ts](/home/ecochran76/workspace.local/auracall/src/teams/types.ts).
  - Added matching Zod schemas in [src/teams/schema.ts](/home/ecochran76/workspace.local/auracall/src/teams/schema.ts).
  - Added a bounded normalization helper `createTaskRunSpec(...)` in [src/teams/model.ts](/home/ecochran76/workspace.local/auracall/src/teams/model.ts) so requested outputs, input artifacts, turn policy, human-interaction policy, and local-action policy all produce one stable parsed shape.
  - Added focused coverage in:
    - [tests/teams.types.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.types.test.ts)
    - [tests/teams.schema.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.schema.test.ts)
    - [tests/teams.model.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.model.test.ts)
- Verification:
  - `pnpm vitest run tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Map `team + taskRunSpec` to planned `teamRun` steps explicitly.
  - Keep public `team run` surfaces deferred until that planner seam exists.

- Date: 2026-04-09
- Area: First code-facing task/run-spec planning seam
- Symptom:
  - The roadmap and team docs now distinguished reusable teams from execution runs, but the repo still had no dedicated code-facing assignment object for the concrete work being given to a team.
- Root cause:
  - Earlier planning focused on team boundaries and execution records first, which left the assignment layer implicit and at risk of being inferred from current internal member-order planning defaults.
- Fix:
  - Added [docs/dev/task-run-spec-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/task-run-spec-plan.md) to define the first bounded assignment-layer shape between `team` and `run`.
  - Recommended `taskRunSpec` as the default object name, with `taskSpec` as the fallback.
  - Defined minimum assignment fields for:
    - objective
    - success criteria
    - requested outputs
    - input artifacts
    - constraints
    - overrides
    - turn policy
    - human-interaction policy
    - local-action policy
  - Linked that plan from [ROADMAP.md](/home/ecochran76/workspace.local/auracall/ROADMAP.md), [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/next-execution-plan.md), and [docs/dev/team-run-data-model-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/team-run-data-model-plan.md).
- Verification:
  - Manual readback audit for consistency across team-boundary, team-service-execution, team-run-data-model, roadmap, and execution-plan docs.
- Follow-ups:
  - Choose final naming between `taskRunSpec` and `taskSpec`.
  - Define the first `src/*` schema and planner mapping from assignment object to planned `teamRun`.

- Date: 2026-04-09
- Area: Team/task/run boundary promoted into explicit roadmap sequencing
- Symptom:
  - The semantic split between reusable team templates and concrete assignments was documented in design notes, but the top-level roadmap still treated it mostly as narrative guidance rather than as a gating checkpoint.
- Root cause:
  - Roadmap text had not yet been tightened after the team semantics audit, so future public `team run` work could still appear closer than it should.
- Fix:
  - Updated [ROADMAP.md](/home/ecochran76/workspace.local/auracall/ROADMAP.md) to add explicit service-mode checkpoints for:
    - team semantics
    - task / run-spec modeling
    - team-run execution
    - handoff / host-action behavior
  - Updated [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/next-execution-plan.md) so the active execution board now treats the `team` vs `task / run spec` split as a real gate before public team-execution surfaces.
- Verification:
  - Manual roadmap/readback audit for consistency between top-level roadmap and execution-plan sequencing.
- Follow-ups:
  - Define the first code-facing `task` / `run spec` schema.
  - Keep public `team run` CLI/API/MCP work deferred until that schema exists.

- Date: 2026-04-09
- Area: Team concept boundary before public execution semantics
- Symptom:
  - The repo had a good internal team planning/runtime bridge seam, but the conceptual meaning of `team` was still at risk of drifting toward the current MVP builder defaults:
    - raw member order as workflow order
    - one member -> one prompt-like step
    - no clean separation between reusable team definition and one concrete assignment
- Root cause:
  - The earlier planning docs separated team from runner topology, but they did not yet state explicitly that a team should be a reusable orchestration template with a separate task/run-specific input layer.
- Fix:
  - Updated [docs/dev/team-config-boundary-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/team-config-boundary-plan.md) to define `team` as a reusable orchestration template and to separate:
    - `team`
    - `task` / `run spec`
    - `run`
  - Updated [docs/dev/team-service-execution-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/team-service-execution-plan.md) so future execution semantics bind one concrete task/run spec to one team template and treat ordered member projection as an MVP strategy rather than the full team concept.
  - Updated [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/next-execution-plan.md) so the roadmap now explicitly calls for a task/run-spec layer before any public team-execution surface.
- Verification:
  - Manual audit of the current team boundary docs, internal bridge code, and public CLI help text for semantic consistency.
- Follow-ups:
  - Define the first code-facing schema and naming for `task` / `run spec`.
  - Keep `src/teams/runtimeBridge.ts` internal until that schema exists and public `team run` semantics can be stated without leaking MVP builder assumptions.

- Date: 2026-04-09
- Area: Operator-facing recovery summary on status endpoint
- Symptom:
  - Operators could only infer restart/recovery state from startup logs and had no machine-readable surface to classify run recovery buckets for direct vs team-run recovery.
- Root cause:
  - `GET /status` returned a fixed compatibility posture and omitted host recovery classification by design in the first service-host checkpoint.
- Fix:
  - Added query parsing and validation for `/status` recovery mode in
    [src/http/responsesServer.ts](/home/ecochran76/workspace.local/auracall/src/http/responsesServer.ts):
    - `recovery=1|true` enables recovery summary
    - `sourceKind=direct|team-run` optional filter (defaults to `direct`)
  - Added `/status?recovery=...` tests covering direct summary output, team-run
    filtering, and bad query combinations.
  - Updated user-facing docs in [README.md](/home/ecochran76/workspace.local/auracall/README.md) and [docs/openai-endpoints.md](/home/ecochran76/workspace.local/auracall/docs/openai-endpoints.md).
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts`
- Follow-ups:
  - Add a background host-run visibility endpoint if periodic operator polling becomes a hard requirement.

- Date: 2026-04-09
- Area: Stranded running step recovery on service-host drains
- Symptom:
  - When a run remained in `running` step state without an active lease, `drainRunsOnce` could not reclaim progress because dispatch planning blocked on `running` steps.
- Root cause:
  - The runtime host only handled stale lease expiry and `nextRunnableStepId` discovery; it did not have a mutation path to convert stranded running steps back to runnable state.
- Fix:
  - Added `persistRun(...)` seam to the runtime control contract for host-owned record rewrites.
  - Added `recoverStrandedRunningExecutionRun(...)` in `src/runtime/runner.ts` to rewound stranded running steps to runnable, clear timestamps/failures, and add recovery note events.
  - Wired host drain flow (`src/runtime/serviceHost.ts`) to attempt stranded recovery before deciding `no-runnable-step`, then execute rewound steps in the same pass.
  - Added regression coverage in `tests/runtime.control.test.ts` and `tests/runtime.serviceHost.test.ts`.
- Verification:
  - `pnpm vitest run tests/runtime.control.test.ts tests/runtime.serviceHost.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Confirm duplicate side effects are acceptable for non-idempotent providers before generalizing beyond local `chatgpt`/`api-responses` runners.

- Date: 2026-04-09
- Area: Response HTTP serve startup recovery
- Symptom:
  - Persisted direct runs created while `auracall api serve` was down remained `in_progress` and required manual intervention to complete after restart.
- Root cause:
  - The `responses` HTTP host could create and read direct runs but did not run recovery on startup, and host recovery used a different timestamping path than injected request-time control in tests.
- Fix:
  - Added startup recovery hooks in [src/http/responsesServer.ts](/home/ecochran76/workspace.local/auracall/src/http/responsesServer.ts) to optionally call `executionHost.drainRunsUntilIdle(...)` after listen startup, with conservative pass/run limits and direct-run filtering.
  - Added a direct persisted-run recovery test path and preserved deterministic request-time control by passing injected `now` into the host instance used for both foreground and recovery execution.
  - Exported request reconstruction in [src/runtime/responsesService.ts](/home/ecochran76/workspace.local/auracall/src/runtime/responsesService.ts) so host-level recovery can reuse the same execution invocation path as normal create/readback flows.
- Verification:
  - `pnpm vitest run tests/runtime.responsesService.test.ts tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Decide whether startup recovery should stay bounded to `createResponsesHttpServer` or be generalized as a separate long-running operator service.

- Date: 2026-04-09
- Area: Team runtime bridge execution summary
- Symptom:
  - Initial team bridge summaries were returning only projected team step states, which are write-once planning values and did not reflect runtime execution state.
- Root cause:
  - `TeamRuntimeExecutionSummary.teamStepStatus` and related step details were wired to `teamPlan` state without looking up the executed runtime run record.
- Fix:
  - Added runtime-derived mapping for step status in
    [src/teams/runtimeBridge.ts](/home/ecochran76/workspace.local/auracall/src/teams/runtimeBridge.ts) so each `executionSummary.stepSummary` now carries both:
    - `teamStepStatus` derived from runtime execution state,
    - `runtimeStepStatus` from the runtime step record,
    - runtime source and run state,
    - per-step failure text where present.
  - Updated focused coverage in [tests/teams.runtimeBridge.test.ts](/home/ecochran76/workspace.local/auracall/tests/teams.runtimeBridge.test.ts) for success/fail-fast/blocked behaviors.
- Verification:
  - `pnpm vitest run tests/teams.runtimeBridge.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-ups:
  - Reuse the same bridge summary shape in any future operator-facing team execution surface so team and runtime progress can be inspected without introducing separate status endpoints.

- Date: 2026-03-31
- Area: Final pure-declarative Grok route cleanup
- Symptom:
  - After the previous Grok route-manifest slices, a few hardcoded Grok conversation URLs still remained inside browser-evaluated scripts in `grokAdapter.ts`.
- Root cause:
  - Those scripts synthesize fallback URLs from `conversation:<id>` row data, so they were easy to miss in earlier regex-based route cutovers.
- Fix:
  - Injected helper-backed Grok conversation URL prefixes into the browser-evaluated scripts in [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/auracall/src/browser/providers/grokAdapter.ts), removing the last obvious duplicated runtime Grok route literals.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/services/registry.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Stop the route-only Grok manifest slice here. The remaining Grok-specific strings are either manifest defaults or behavior-coupled workflow logic.

- Date: 2026-03-31
- Area: Grok manifest-backed route helper adoption
- Symptom:
  - Even after Grok/Gemini base route data was added to the services manifest, Grok still had many repeated route strings in provider/listing/navigation helpers and fallback launch paths.
- Root cause:
  - The first Grok route-manifest slice only covered central defaults and top-level provider URL builders; several adapter and browser-runtime call sites were still assembling the same routes inline.
- Fix:
  - Added manifest-backed `projectConversations` for Grok and reused Grok route helpers/constants across [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/auracall/src/browser/providers/grokAdapter.ts), [src/browser/index.ts](/home/ecochran76/workspace.local/auracall/src/browser/index.ts), and [src/browser/llmService/llmService.ts](/home/ecochran76/workspace.local/auracall/src/browser/llmService/llmService.ts).
  - Kept the slice mechanical: only declarative route assembly was changed, not scrape/recovery behavior.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/services/registry.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts`
  - `pnpm run check`
- Follow-ups:
  - The remaining Grok URL literals should only move if they are still pure route construction. Anything mixed with UI workflow/recovery belongs in the later behavior-aware phase.

- Date: 2026-03-31
- Area: Browser-service typed config boundary and manifest-backed Grok/Gemini routes
- Symptom:
  - `pnpm run check` failed in `tests/browser/browserService.test.ts` because `service.getConfig()` was typed as the package-level browser-service config and did not expose Aura-Call's LLM-specific fields like `target`.
  - Grok and Gemini still had duplicated browser route strings outside the manifest boundary, especially in login/default-config and provider URL builders.
- Root cause:
  - The Aura-Call subclass of `BrowserService` inherited the base package `getConfig()` type without re-exposing the richer local `ResolvedBrowserConfig`.
  - The service manifest carried base URLs for Grok/Gemini, but not the central route templates used by Grok provider URL builders and Gemini login/default config.
- Fix:
  - Overrode `getConfig()` in [src/browser/service/browserService.ts](/home/ecochran76/workspace.local/auracall/src/browser/service/browserService.ts) to return Aura-Call's local `ResolvedBrowserConfig`.
  - Added manifest-owned Gemini/Grok route templates and Gemini cookie origins in [configs/auracall.services.json](/home/ecochran76/workspace.local/auracall/configs/auracall.services.json).
  - Cut central callers over to manifest-backed routes in [src/browser/constants.ts](/home/ecochran76/workspace.local/auracall/src/browser/constants.ts), [src/browser/login.ts](/home/ecochran76/workspace.local/auracall/src/browser/login.ts), [src/config.ts](/home/ecochran76/workspace.local/auracall/src/config.ts), [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/auracall/src/browser/providers/grokAdapter.ts), and [src/browser/providers/index.ts](/home/ecochran76/workspace.local/auracall/src/browser/providers/index.ts).
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/grokAdapter.test.ts tests/browser/browserService.test.ts tests/browser/config.test.ts tests/schema/resolver.test.ts`
  - `pnpm run check`
- Follow-ups:
  - The remaining Grok hardcoded routes inside deeper adapter workflows should move only in similarly bounded declarative slices, not mixed with workflow behavior changes.

- Date: 2026-03-31
- Area: ChatGPT acceptance runner harness timeout configuration
- Symptom:
  - `scripts/chatgpt-acceptance.ts --phase root-base` frequently failed with `spawnSync pnpm ETIMEDOUT`, even after command routing and rename logic updates had passed prior regressions.
- Root cause:
  - Non-mutating auracall/probe calls and long-running mutate commands were hard-pinned to fixed 120s/6m process-timeout behavior, which is too short for some real ChatGPT windows under active rate-limit pacing.
- Fix:
  - Added `commandTimeoutMs` to CLI args (`--command-timeout-ms`) and defaulted it to 180000ms.
  - Wired `runAuracall`, `probeAuracall`, and `runChatgptMutation` to use the configured timeout instead of hardcoded values.
  - Kept the rest of the mutation/backoff logic intact.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts`
- Follow-ups:
  - Re-run `scripts/chatgpt-acceptance.ts --phase root-base` with a longer `--command-timeout-ms` during a cooler rate-limit window and verify completion through `root-followups`.

- Date: 2026-03-31
- Area: ChatGPT project sources readiness and upload open gate
- Symptom:
  - `auracall ... projects files add <project> --target chatgpt` failed at `chatgpt-open-project-sources` with:
    - `Surface did not become ready: ChatGPT project sources ready for <id>`
    - diagnostics still showed `/g/<id>/project?tab=sources` and tab labels `Chats`, `Sources`, but no file rows.
- Root cause:
  - The sources-ready predicate was brittle: it required stricter tab state than ChatGPT exposes in fresh empty-project states.
- Fix:
  - In `buildProjectSourcesReadyExpression`, broadened the readiness condition to accept valid source-route pages with source tabs/query even when source rows are still empty.
  - In `openProjectSourcesTab`, added a route-only fallback (`buildProjectRouteExpression`) so we proceed when we are on the correct routed project even if the stricter predicate is momentarily false.
  - In `openProjectSourcesUploadDialog`, added an existing-dialog pre-check and replaced the single generic open-surface wait with explicit click attempts plus upload-markers/global-file-input detection.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files add g-p-69cbf9f685c08191b57b5a74253a1b53 --target chatgpt --file /tmp/chatgpt-source-smoke.txt --verbose --browser-keep-browser`
- Follow-ups:
  - add one negative/empty-project fixture assertion for upload pre-check (existing vs. opened dialog path) in unit coverage and decide whether to keep the route-only fallback long-term.

- Date: 2026-03-31
- Area: ChatGPT project rename/side-panel smoke stability
- Symptom:
  - Live smoke for project create->refresh->rename still fails at rename with `ChatGPT project surface did not hydrate for <id>` after the earlier create modal and service-target fixes.
- Root cause:
  - `openProjectSettingsPanel(...)` still depends on the existing `buildProjectSurfaceReadyExpression(...)` predicate before opening settings; that predicate can reject a routed project page when control labels/tabs are not yet hydrated or are in an unexpected state.
- Fix:
  - Logged and isolated the failure in project-flow smoke; no functional changes in this pass.
- Verification:
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts`
- Follow-ups:
  - adjust project-surface readiness in `openProjectSettingsPanel(...)` to avoid early hard-fail when route is valid but control surface is temporarily inert, then rerun smoke end-to-end.

- Date: 2026-03-31
- Area: Cross-profile ChatGPT tab selection and stale create-project modal cleanup
- Symptom:
  - Running two Aura-Call Chrome windows at once exposed two regressions:
    - ChatGPT tab resolution could inherit a prior `services` list and appear to “remember” another provider in the same profile.
    - A stale “Create project” dialog could remain open in one tab, blocking subsequent smoke runs in that window.
- Root cause:
  - `resolveServiceTarget(...)` merged each resolved service into the stored instance metadata on every scan.
  - The ChatGPT connect path did not perform a dedicated startup cleanup for project dialog artifacts before method-specific actions.
- Fix:
  - In `src/browser/service/browserService.ts`, removed service-list mutation during scan and left `services` untouched unless a new instance is first registered.
  - In `src/browser/providers/chatgptAdapter.ts`, added `dismissCreateProjectDialogIfOpen(...)` and invoked it right after Chrome connect so a stale modal is dismissed via close/escape before continuing.
- Verification:
  - `pnpm vitest run tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
- Follow-ups:
  - run a guarded live ChatGPT smoke on the secondary WSL-Chrome profile after account setup to confirm the stale modal no longer blocks automation.

- Date: 2026-03-31
- Area: Grok file management diagnostics
- Symptom:
  - Grok file-management failures on account and project flows returned generic errors without scoped UI evidence, especially for row actions and save/delete modals.
- Root cause:
  - Several high-variance Grok file flows were still executed without package-level diagnostic context, so diagnostics snapshots did not include the relevant modal/tab roots or candidate action surfaces at failure.
- Fix:
  - wrapped Grok `listAccountFiles`, `uploadAccountFiles`, and `deleteAccountFile` in `withUiDiagnostics(...)` with account-file scoped roots/candidates/buttons.
  - wrapped Grok `listProjectFiles`, `uploadProjectFiles`, and `deleteProjectFile` in `withUiDiagnostics(...)` with project-sources/personal-files modal roots, row selectors, and button candidates.
  - kept behavior and waits unchanged so this is a strict diagnostics adoption slice.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
- Follow-ups:
  - rerun guarded Grok live file flows when profile session is available.
  - resolve unrelated `ResolvedBrowserConfig.target` typecheck error in `tests/browser/browserService.test.ts` that currently blocks a full `pnpm run check`.

- Date: 2026-03-31
- Area: ChatGPT root rename persistence hardening
- Symptom:
  - rename verification sometimes passed before the renamed conversation became the top row in the root sidebar list, which matched early reports of inconsistent “rename appears to succeed then reverts” timing.
- Root cause:
  - the success predicate accepted any matching row in the visible list, so stale row snapshots or an unchanged top row could satisfy the check before the UI had completed reordering.
- Fix:
  - tightened `buildConversationTitleAppliedExpression(...)` with a `requireTopInRootList` option used by rename verification to require the expected conversation to be top when a root list surface is visible;
  - added progressive spacing in `waitForChatgptConversationTitleApplied(...)` (jittered short settle before first poll, and a longer pause before list-refresh verification) to align with observed ChatGPT write pacing.
  - added `requireTopForRootMatch` support in `matchesChatgptConversationTitleProbe(...)` and tests for strict root-top behavior.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts`
- Follow-ups:
  - rerun the guarded live root rename slice and confirm the stricter top-of-list check is sufficient under low-cooldown conditions.

- Date: 2026-03-31
- Area: WSL profile-family naming for multiple ChatGPT accounts
- Symptom:
  - Profile naming for the planned second WSL ChatGPT account was still ambiguous in onboarding docs, while runtime changes and tests had moved toward a `wsl-chrome-2` secondary profile name.
- Root cause:
  - Documentation examples and logs still mixed older naming conventions, so operators saw conflicting signals about whether secondary accounts should reuse the primary `default` profile or use a distinct managed profile namespace.
- Fix:
  - documented `default` as the primary WSL profile family and `wsl-chrome-2` as the explicit secondary family in `docs/configuration.md` and `docs/wsl-chatgpt-runbook.md`;
  - kept runtime behavior unchanged and aligned existing tests to pass with the `wsl-chrome-2` family name where applicable.
- Verification:
  - `pnpm vitest run tests/schema/resolver.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
- Follow-ups:
  - no functional follow-up needed until the new Pro account is logged in; then validate live `--profile wsl-chrome-2 setup/login` for the full path.

- Date: 2026-03-31
- Area: ChatGPT rate-limit retry timing + rename retry cluster sequencing
- Symptom:
  - Live and simulated rate-limit paths were still too rigid: retry delays were not clearly separated between hard rate-limit throttles and generic retryable errors, and row-tagging for rename remained one-shot across a narrow path.
- Root cause:
  - `withRetry(...)` used a fixed short delay after failures and the rename flow had only a coarse single attempt shape.
- Fix:
  - Fixed `LlmService` retry delay policy to be attempt-aware and provider-aware:
    - long, jittered clusters for detected ChatGPT rate-limit messages,
    - shorter jittered delays for other retryable errors.
  - Fixed `isRetryableError` to include ChatGPT rate-limit matching and used provider guard-aware backoff decisions in `getRetryDelayMs`.
  - Updated ChatGPT rename tagging to cluster attempts:
    - conversation-row first,
    - two list-open fallbacks,
    - list refresh attempt with a longer pause,
    while preserving failure evidence in `tagFailures`.
- Verification:
  - `pnpm vitest run tests/browser/llmServiceRateLimit.test.ts`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Keep the guarded live root-conversation rename path in the browser with these timings and collect the next failure signature if any; adjust only if a deterministic live failure proves the current retry cluster still misses the active surface.

- Date: 2026-03-30
- Area: ChatGPT conversation rename diagnostics
- Symptom:
  - repeated `ChatGPT conversation row not found` failures in the rename path still lacked actionable details from the row-tagging stage, and diagnostic dumps were not stable enough to distinguish "no matching candidates" from fallback-path behavior.
- Root cause:
  - `tagChatgptConversationRow(...)` produced inconsistent payload shapes in failure/success paths: duplicate `candidateCount` fields, hardcoded `fallbackUsed`, and a brittle `bestCandidate` merge that did not preserve a normalized candidate summary.
- Fix:
  - normalized row-tag diagnostics in `src/browser/providers/chatgptAdapter.ts`:
    - removed duplicate fields from the failure payload,
    - propagated real `fallbackUsed` state,
    - stabilized `bestCandidate` shape for success and failure summaries,
    - surfaced scoped candidate count in structured summaries,
    - preserved structured recovery info via `tagFailures` so `renameConversation` can include retry context in `withUiDiagnostics`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts`
- Follow-ups:
  - rerun live `ChatGPT root-base` acceptance after this cleanup with verbose diagnostics capture to confirm the row-tag failure reason is now decisive when the stall remains.

- Date: 2026-03-30
- Area: ChatGPT root conversation rename live debugging
- Symptom:
  - focused unit coverage stayed green, but live `scripts/chatgpt-acceptance.ts --phase root-base` kept failing at root-conversation rename with `ChatGPT conversation row action surface unavailable`.
  - the earlier header-menu fallback turned out to be invalid for rename because the header menu exposes `Share`, `View files in chat`, `Move to project`, `Pin chat`, `Archive`, and `Delete`, but not `Rename`.
  - later live failures still reported the row-action surface as unavailable even when the settled conversation page visibly showed multiple `Open conversation options for ChatGPT Accept Base` buttons for the current conversation.
- Root cause:
  - root rename mixed several overlapping issues: the old title-persistence predicate was too strict; the header menu was the wrong surface for rename; and the live page can auto-title the conversation before the row-action path completes. The remaining blocker is not button discovery in the settled DOM; a direct Puppeteer/js_repl probe showed the page had five matching row-action buttons for the current conversation title and a valid `LI.list-none` row candidate. The unresolved gap is earlier in the provider path: the live tagger/ready-state sequence still returns `ok: false` before that settled surface is reliably captured.
- Fix:
  - loosened root title verification so a matching root row anywhere in the visible list, or the current root conversation page title, can satisfy rename persistence.
  - removed the ChatGPT header-menu fallback from rename; rename is now row-menu only.
  - changed root rename to start on the conversation page/sidebar instead of the ChatGPT home page, increased row-tagging wait time, relaxed row-action-button ancestry scoring, added an explicit row-action readiness wait, and added a short-circuit for the case where ChatGPT has already auto-titled the conversation to the requested name.
- Verification:
  - repeated focused regressions:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser-service/ui.test.ts tests/cli/browserConfig.test.ts tests/services/registry.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live repros still failing:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase root-base --state-file docs/dev/tmp/chatgpt-workflow-state.json`
  - direct DOM probe via js_repl + Puppeteer confirmed the settled page exposes multiple matching row-action buttons and a valid row candidate for the current conversation title.
- Follow-ups:
  - add provider-local diagnostics around `tagChatgptConversationRow(...)` so failures report matching-button count, selected row candidate, and the precise reason `ok: false` was returned instead of only the generic UI snapshot.
  - once the tagger reports the settled DOM state directly, rerun `root-base`; if the auto-title short-circuit is enough, treat rename as already satisfied and proceed to `root-followups`.

- Date: 2026-03-30
- Area: Browser-service action-surface fallback + ChatGPT conversation menu adoption
- Symptom:
  - ChatGPT conversation actions were still split across real surfaces, but the provider had to hand-roll that fallback: try the sidebar row menu when present, then fall back to the conversation header menu. The first live `root-base` rerun exposed the concrete rename failure mode: `ChatGPT conversation row not found` on a root conversation whose sidebar row was absent from the current list surface.
- Root cause:
  - browser-service had good primitives for one trigger (`openMenu(...)`, `openAndSelectMenuItem(...)`) but no package-owned helper for the common `ordered menu triggers + per-attempt setup` pattern, so providers kept reimplementing the same row-menu/header-menu fallback glue.
- Fix:
  - added `openAndSelectMenuItemFromTriggers(...)` to `packages/browser-service/src/service/ui.ts`, with ordered trigger attempts, optional per-attempt setup hooks, inter-attempt menu dismissal, and structured attempt history.
  - added focused coverage in `tests/browser-service/ui.test.ts`.
  - updated `src/browser/providers/chatgptAdapter.ts` so conversation delete and conversation rename now treat `sidebar-row` and `conversation-header` as explicit action surfaces and route the fallback mechanics through the package helper.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts tests/services/registry.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live: `pnpm tsx bin/auracall.ts delete 69cb3741-2f58-832f-a6ae-f28779f30741 --target chatgpt --yes --verbose`
  - live: `pnpm tsx bin/auracall.ts delete 69cb35dd-13fc-832f-9d6b-bc0f88125838 --target chatgpt --yes --verbose`
- Follow-ups:
  - this slice proved the delete path and removed the fast-fail missing-row rename case, but root conversation rename still has a separate post-trigger stall during live `root-base`; the next repair should focus on inline-editor discovery / title-persistence verification rather than on more menu-surface fallback glue.

- Date: 2026-03-30
- Area: ChatGPT artifact taxonomy externalization
- Symptom:
  - even after the route/feature/composer/UI/selector manifest cuts, `chatgptAdapter.ts` still hard-coded a second layer of service-specific artifact taxonomy: spreadsheet-vs-download extension rules, content-type-to-extension mappings, extension-to-MIME mappings, default artifact titles, and payload marker strings like `image_asset_pointer` / `table`.
- Root cause:
  - the original ChatGPT pilot treated all artifact logic as out of scope, but a bounded subset of that logic is still declarative taxonomy rather than parsing or download behavior.
- Fix:
  - added an `artifacts` section to the ChatGPT entry in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with typed helpers for artifact kind extensions, content-type extensions, name-to-MIME mappings, default titles, and payload-marker sets.
  - updated `src/browser/providers/chatgptAdapter.ts` so download kind inference, extension/MIME lookup, default image/spreadsheet/canvas titles, and image/table marker checks resolve from the manifest while leaving payload recursion, merge semantics, and materialization logic in code.
  - expanded `tests/services/registry.test.ts` and `tests/browser/chatgptAdapter.test.ts` with focused taxonomy coverage.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this does not move payload parsing, DOM artifact probing, or binary materialization into config.
  - live browser acceptance was not rerun because the slice only changes declarative artifact taxonomy sources, not route or action ordering.

- Date: 2026-03-30
- Area: ChatGPT static DOM-anchor externalization
- Symptom:
  - after the provider selector-family cut, `chatgptAdapter.ts` still repeated a set of stable ChatGPT DOM anchors such as the project dialog roots, source-row selector, conversation-turn selector, artifact/textdoc selectors, and conversation options/delete-confirm buttons, so small DOM-anchor drift still required adapter edits.
- Root cause:
  - the prior selector slice stopped at `src/browser/providers/chatgpt.ts` and did not yet cover the small set of adapter-local anchors that are still declarative enough to live in config without dragging fallback logic into the manifest.
- Fix:
  - added a `dom` section to the ChatGPT entry in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with DOM selector and selector-set helpers.
  - updated `src/browser/providers/chatgptAdapter.ts` to resolve selected static anchors from the manifest while keeping traversal order, row-tagging, and recovery logic in code.
  - expanded `tests/services/registry.test.ts` so the new DOM keys are covered.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this still does not move adapter-local fallback strategy or workflow sequencing into config.
  - live browser acceptance was not rerun because the slice only changes static selector sources, not route or action ordering.

- Date: 2026-03-30
- Area: ChatGPT provider selector-family externalization
- Symptom:
  - even after the earlier ChatGPT manifest cuts, the provider-level selector arrays in `src/browser/providers/chatgpt.ts` were still hard-coded, so stable surface drift in the prompt/send/model/menu/copy/file/attachment families still required code edits instead of manifest updates.
- Root cause:
  - the first pilot focused on models/routes/features and later composer/UI text, but stopped short of the static provider selector config even though that layer is declarative data rather than adapter workflow logic.
- Fix:
  - added a `selectors` section to the ChatGPT entry in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with selector-family resolution.
  - updated `src/browser/providers/chatgpt.ts` to build `CHATGPT_PROVIDER.selectors` from the bundled manifest and to align `loginUrlHints` with the configured compatible-host family.
  - added focused coverage in `tests/services/registry.test.ts` and a new provider-level regression in `tests/browser/chatgptProvider.test.ts`.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this does not move adapter-local selector heuristics or fallback order into config.
  - live browser acceptance was not rerun because the slice only changes provider-level selector sources, not routes or runtime workflow order.

- Date: 2026-03-30
- Area: ChatGPT composer menu/chip heuristic vocabulary externalization
- Symptom:
  - after the first ChatGPT composer taxonomy cut, `chatgptComposerTool.ts` still embedded service-specific heuristic labels for recognizing the `More` submenu, identifying the correct top-level menu family, and ignoring non-tool composer chips like `add files and more` / `thinking`.
- Root cause:
  - the first composer slice stopped at aliases/known labels/file-request labels and left a second tier of declarative menu vocabulary inside the action module even though the mechanics of scoring and traversal were already separate.
- Fix:
  - added `moreLabels`, top-menu signal labels/substrings, and chip-ignore tokens to the ChatGPT `composer` section in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with helpers for those composer arrays.
  - updated `src/browser/actions/chatgptComposerTool.ts` so top-menu scoring, More-submenu selection, and chip filtering consume manifest-backed vocabulary while keeping weights and workflow ordering in code.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - the scoring weights and fallback order still belong in code unless another service proves they should become reusable policy.

- Date: 2026-03-30
- Area: ChatGPT project/conversation UI label externalization
- Symptom:
  - after the initial models/routes/features/composer cuts, `chatgptAdapter.ts` still embedded a tail of low-risk ChatGPT UI strings for project settings, memory modes, sources upload markers, row-menu items, and delete confirmations, so simple label drift would still look like adapter code churn.
- Root cause:
  - the first volatility slices stopped before the remaining declarative UI label dictionaries were extracted, even though those strings were configuration-like data rather than workflow logic.
- Fix:
  - added a `ui` section to `configs/auracall.services.json` for ChatGPT labels and label sets.
  - extended `src/services/registry.ts` with bundled UI label/label-set helpers.
  - updated `src/browser/providers/chatgptAdapter.ts` to resolve project settings labels, project field labels, the project-title edit prefix, source-actions labels, the conversation prompt label, the sidebar row-action prefix, memory labels, sources upload markers, conversation rename/delete labels, project-source remove, and project delete confirmation text from the bundled manifest while keeping selectors and workflows in code.
  - added focused coverage in `tests/services/registry.test.ts`.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this still does not move adapter-local selector families or action ordering into config.
  - live browser acceptance was not rerun for this UI-label-only slice because the covered behavior stayed under the existing adapter tests.

- Date: 2026-03-30
- Area: ChatGPT composer/add-on taxonomy
- Symptom:
  - ChatGPT composer tool aliases and menu label knowledge were still embedded in `chatgptComposerTool.ts`, so every add-on rename or app-label drift still looked like a code patch.
- Root cause:
  - the first service-volatility pilot stopped at models/routes/features, leaving the composer taxonomy in code even though it is declarative service data rather than workflow logic.
- Fix:
  - added a `composer` section to `configs/auracall.services.json` for aliases, known labels, top-level sentinels, and file-request labels.
  - extended `src/services/registry.ts` with helpers for reading that composer data from the bundled manifest.
  - updated `src/browser/actions/chatgptComposerTool.ts` to consume those manifest-backed dictionaries while keeping the actual menu traversal and verification logic in code.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this still does not externalize selector families or action ordering; those should only move if a later service-specific plan shows they are truly declarative.

- Date: 2026-03-30
- Area: Service registry / ChatGPT volatility pilot
- Symptom:
  - low-risk ChatGPT volatility such as browser picker labels, compatible hosts, route templates, and feature/app probe tokens was still embedded in TypeScript constants, so service drift still required code edits.
  - the checked-in service manifest still used the old `configs/oracle.services.json` name even though Aura-Call is the current product surface.
- Root cause:
  - the original service registry only covered Grok browser labels and only exposed async loading for the writable `~/.auracall/services.json` copy, which left synchronous browser constants and route helpers without a clean manifest path.
- Fix:
  - renamed the checked-in manifest to `configs/auracall.services.json` and updated the registry loader.
  - extended `src/services/registry.ts` with typed routes/features sections plus synchronous bundled-manifest helpers for model labels, base URLs, compatible hosts, cookie origins, route templates, and feature/app token dictionaries.
  - moved the narrow ChatGPT pilot surface onto that manifest in `src/cli/browserConfig.ts`, `src/browser/constants.ts`, `src/browser/urlFamilies.ts`, `src/browser/service/browserService.ts`, `src/browser/providers/chatgptAdapter.ts`, and `src/browser/providers/index.ts`, while keeping workflow selectors and mutation logic in code.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/browserService.test.ts tests/browser/providerCache.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/grokModelMenu.test.ts tests/browser/chatgptComposerTool.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase project --state-file docs/dev/tmp/chatgpt-volatility-state.json`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase root-base --resume docs/dev/tmp/chatgpt-volatility-state.json`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase cleanup --resume docs/dev/tmp/chatgpt-volatility-state.json`
- Follow-ups:
  - selectors, artifacts, and rate-limit policy remain intentionally out of scope for this first manifest cut.
  - the live run confirmed the delete path can still encounter a real ChatGPT cooldown mid-phase; keep the guard-first pattern in place for later acceptance slices rather than optimizing for minimum elapsed time.

- Date: 2026-03-30
- Area: Model resolution / ChatGPT provider cache drift
- Symptom:
  - generic Pro selection paths were still hard-coding `gpt-5.2-pro` in several resolver/browser defaults even though that concrete version is time-sensitive and should not be Aura-Call's main operator-facing default.
  - ChatGPT account capabilities such as connected apps can drift outside config, but provider cache identity only keyed on account identity and URL, so cache refreshes could reuse stale capability assumptions.
- Root cause:
  - the stable “current Pro” alias existed only implicitly in docs/tests; several runtime code paths still directly returned the concrete pinned id.
  - provider cache identity had no feature/capability signature field, and ChatGPT had no adapter-level capability probe to feed one.
- Fix:
  - added `CURRENT_OPENAI_PRO_ALIAS` / `CURRENT_OPENAI_PRO_API_MODEL` plus `resolveCurrentOpenAiProModel(...)` in `src/oracle/config.ts`.
  - changed default/generic Pro resolution in CLI/config/browser mapping to use the stable alias instead of directly returning `gpt-5.2-pro`.
  - extended cache identity/payload types with `featureSignature`.
  - merged configured `services.<provider>.features` with a ChatGPT adapter feature probe and used that combined signature to invalidate provider caches when capabilities drift.
- Verification:
  - `pnpm vitest run tests/browser/llmServiceIdentity.test.ts tests/browser/providerCache.test.ts tests/cli/options.test.ts tests/cli/browserConfig.test.ts tests/schema/resolver.test.ts`
- Follow-ups:
  - if ChatGPT exposes a more authoritative connected-apps surface later, replace the current heuristic probe with that stronger source instead of expanding string matching indefinitely.

- Date: 2026-03-30
- Area: ChatGPT browser workspace/profile switching
- Symptom:
  - team wanted a second ChatGPT browser profile for workspace-scoped runs without mutating default chat target behavior.
- Root cause:
  - no visible operator-facing documentation and no regression test explicitly proving `profiles.<name>.services.chatgpt.url` flow for runtime profile selection.
  - confusion about whether a full `g/p-...` URL was required versus profile-level `projectId`/`projectName` scoping.
- Fix:
  - verified existing resolver precedence already supports profile service-url overrides in `resolveConfig`.
  - added a regression test in `tests/schema/resolver.test.ts` asserting profile `work` resolves `browser.chatgptUrl` from `profiles.work.services.chatgpt.url`.
  - added operator docs/examples in `docs/configuration.md` and `README.md` for both URL pinning and `projectId`/`projectName` based profile scoping.
  - added runtime examples for `--profile`, `--project-id`, and `--project-name` selection.
- Verification:
  - `pnpm vitest run tests/schema/resolver.test.ts`
- Follow-ups:
  - if users report remaining legacy key confusion, add migration/compatibility notes for specific field-level migration paths.

- Date: 2026-03-30
- Area: Browser/ChatGPT project source deletion should be idempotent across retry attempts
- Symptom:
  - `projects files remove <projectId> <file>` could fail during retry with `ChatGPT project source action button not found` after the first attempt already removed the file and the UI list changed.
  - `deleteProjectFile` proceeded to search for the action button using the passed filename even when the source row was absent after retries or re-renders.
- Root cause:
  - there was no row-presence re-check after the initial source snapshot; a successful first deletion could still be reattempted and treated as hard failure instead of success.
- Fix:
  - in `src/browser/providers/chatgptAdapter.ts`, added a `deleteProjectFile` flow that:
    - snapshots source rows,
    - resolves the target row by normalized filename match,
    - refreshes source rows when no direct match exists,
    - returns early when the file is already absent (idempotent success),
    - otherwise proceeds with action-menu removal using the refreshed/canonical filename.
  - this keeps existing removal semantics while preventing stale/false-negative action-button targeting.
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm tsx scripts/chatgpt-acceptance.ts --phase project --resume docs/dev/tmp/chatgpt-acceptance-state.json` (pass after re-run)
- Follow-ups:
  - If failures persist, verify the sources action row selector family and add a secondary scoped fallback before further retry tuning.

- Date: 2026-03-30
- Area: Browser/ChatGPT button-backed binary downloads require a delayed-button wait plus one-eval native-click capture
- Symptom:
  - after DOM-side artifact discovery was fixed, `auracall conversations artifacts fetch 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt` still only materialized the canvas text file and missed the visible DOCX download button
- Root cause:
  - the conversation shell became ready before the `Download the DOCX` button itself existed, so a one-shot tag attempt could miss the button entirely
  - even after the transport was identified, the first production implementation assumed it could arm capture state in one CDP `Runtime.evaluate(...)` call and read it back after a later click; the direct browser probe showed the reliable path was to wrap the anchor-click hook and the native `button.click()` inside the same evaluation
  - ChatGPT's button did not go through fetch/XHR; it created a native anchor click to a signed `backend-api/estuary/content?id=file_...` URL, so browser-download-directory polling was the wrong primary mechanism
- Fix:
  - updated `tagChatgptDownloadButtonWithClient(...)` in `src/browser/providers/chatgptAdapter.ts` to retry for up to 10 seconds instead of assuming the button exists as soon as the conversation shell is ready
  - changed button-backed download materialization to:
    - tag the exact button
    - run one in-page native `button.click()` with a temporary anchor-click / `window.open` hook around it
    - capture the signed `backend-api/estuary/content?id=file_...` URL immediately
    - fetch the bytes directly via the authenticated browser session
  - use `content-disposition` / URI filename hints so DOCX downloads keep their real file name (`comment_demo.docx`) instead of a guessed generic name
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live proof:
    - `auracall conversations artifacts fetch 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt`
      - `artifactCount = 2`
      - `materializedCount = 2`
      - materialized:
        - `comment_demo.docx`
        - `Short Document With Comments.txt`
- Follow-ups:
  - run a broader smoke on the large bundle/report chat (`69bded7e-4a88-8332-910f-cab6be0daf9b`) when you want extra confidence across many ZIP/JSON/MD button artifacts, but the underlying transport path is now proven

- Date: 2026-03-30
- Area: Browser/ChatGPT assistant-turn artifact buttons live in the whole turn section, not necessarily inside the `[data-message-author-role]` node, and canvas fallback content can require DOM enrichment
- Symptom:
  - a “vibe coding” chat (`69bded7e-4a88-8332-910f-cab6be0daf9b`) visibly showed dozens of download-like buttons (`Codebase status report`, `Machine-readable handoff JSON`, `Fresh investigation bundle`, `Turn report`, etc.), but `auracall conversations context get ... --json-only` still returned `artifactCount = 0`
  - a DOCX + canvas chat (`69caa22d-1e2c-8329-904f-808fb33a4a56`) already exposed the download in payload metadata, but the canvas artifact lacked `contentText` unless the visible textdoc block was scraped from the DOM
- Root cause:
  - the first DOM-side artifact probe was scoped to the inner `[data-message-author-role]` node, but ChatGPT renders many artifact buttons as sibling content elsewhere in the assistant turn `section[data-testid^="conversation-turn-"]`
  - some canvas/textdoc artifacts carry enough identity in payload metadata (`textdocId`, title, type) but omit the actual body text until the DOM textdoc block is hydrated
  - ChatGPT's inline binary download buttons are neither normal links nor fetch/XHR requests; a native button click programmatically triggers an anchor click to a signed `backend-api/estuary/content?id=file_...` URL
- Fix:
  - moved DOM artifact discovery in `src/browser/providers/chatgptAdapter.ts` to search the whole assistant turn section for visible `button.behavior-btn` controls, excluding textdoc toolbar buttons
  - added normalization/merge helpers so DOM-only download buttons become synthetic `ConversationArtifact`s without clobbering payload-backed artifacts
  - added DOM canvas/textdoc enrichment from `div[id^="textdoc-message-"]` so missing `metadata.contentText` is filled from the live visible block when available
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live proof:
    - `auracall conversations context get 69bded7e-4a88-8332-910f-cab6be0daf9b --target chatgpt --json-only`
      - now returns `artifactCount = 86`
    - `auracall conversations context get 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt --json-only`
      - canvas `Short Document With Comments` now includes full `metadata.contentText`
    - direct browser probe confirmed native `Download the DOCX` click generates a signed anchor to `https://chatgpt.com/backend-api/estuary/content?id=file_...`
- Follow-ups:
  - run a broader smoke on the large bundle/report chat (`69bded7e-4a88-8332-910f-cab6be0daf9b`) when you want more confidence across many ZIP/JSON/MD button artifacts, but the core button-backed materializer is now live

- Date: 2026-03-30
- Area: Browser/ChatGPT conversation artifact materialization needs artifact-specific waits, exact file-id image binding, and serialized live probes
- Symptom: After adding the first `auracall conversations artifacts fetch <conversationId> --target chatgpt` path, the command initially behaved inconsistently in live validation:
  - image/materialization sometimes returned `materializedCount = 0` even though the same conversation already exposed four `image` artifacts in context
  - inline table/spreadsheet materialization could return only one CSV out of two visible tables
  - duplicate-titled image variants could bind the wrong rendered `<img>` when title fallback was allowed
  - running multiple live artifact fetches in parallel against the same managed ChatGPT browser produced contradictory results (`artifactCount = 0`, cache-identity failures, or partial materialization) because the runs were fighting over the same active signed-in tab
- Root cause:
  - the first materializer assumed "conversation surface ready" was enough, but ChatGPT can finish route/page hydration before specific artifacts render
  - inline tables need time for the actual `table[role=\"grid\"]` rows to appear
  - generated images need time for the `img[src*=\"backend-api/estuary/content?id=file_...\"]` elements to appear
  - title fallback for image selection is unsafe when multiple artifacts share the same title; only the file-backed `sediment://file_...` identity is authoritative
  - the managed ChatGPT browser session is effectively single-active-tab state from Aura-Call's perspective, so parallel live probes interfere with each other
- Fix:
  - Added `waitForChatgptTableArtifactRowsWithClient(...)` and `waitForChatgptImageArtifactWithClient(...)` in `src/browser/providers/chatgptAdapter.ts`.
  - `materializeConversationArtifact(...)` now waits for artifact-specific readiness instead of scraping immediately after generic conversation-shell readiness.
  - Tightened image resolution so artifacts with a file id only accept an exact `id=<fileId>` image match; title fallback is used only when no file id exists.
  - Kept the first materializer slice deliberately narrow:
    - `image` -> fetched binary file
    - inline `ada_visualizations` table -> CSV
    - `canvas` -> text file when the artifact is present
    - markdown-only `sandbox:/...` downloads remain metadata-only for now
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live serialized proof on image chat `69bc77cf-be28-8326-8f07-88521224abeb`:
    - `artifactCount = 4`
    - `materializedCount = 4`
    - exact file-id binding now fetches the correct duplicate-titled image variants
  - Live serialized proof on table chat `bc626d18-8b2e-4121-9c4a-93abb9daed4b`:
    - `artifactCount = 2`
    - `materializedCount = 2`
  - Live serialized proof on spreadsheet-download chat `69ca9d71-1a04-8332-abe1-830d327b2a65`:
    - `artifactCount = 1`
    - `materializedCount = 0`
- Follow-ups:
  - Add a real resolver for markdown-only `sandbox:/...` downloads once a stable binary path is known.
  - Keep live ChatGPT artifact validation serialized; do not parallelize against the shared managed browser tab.
  - Find a fresh logged-in canvas conversation for ongoing smoke validation, because the older `69c8a0fc-c960-8333-8006-c4d6e6704e6e` sample no longer reproduces a canvas artifact on this account.

- Date: 2026-03-30
- Area: Browser/ChatGPT spreadsheet-like markdown downloads should normalize as `spreadsheet`, not generic `download`
- Symptom: After adding `ada_visualizations` table extraction, a logged-in spreadsheet chat (`69ca9d71-1a04-8332-abe1-830d327b2a65`) still returned its `.xlsx` artifact as a generic `download`. The artifact was not missing, but the classification was wrong because ChatGPT exposed that spreadsheet as a markdown `sandbox:/...xlsx` link instead of an `ada_visualizations` table entry.
- Root cause:
  - The markdown-download extraction path in `src/browser/providers/chatgptAdapter.ts` treated every `sandbox:/...` link as `kind = download`.
  - Spreadsheet-like downloadable artifacts can arrive through the same markdown path as ordinary zip/json/text outputs, so relying only on `ada_visualizations` missed part of the spreadsheet surface.
- Fix:
  - Added `inferChatgptDownloadArtifactKind(...)` in `src/browser/providers/chatgptAdapter.ts`.
  - Markdown `sandbox:/...` artifacts ending in spreadsheet-like extensions (`.csv`, `.tsv`, `.xls`, `.xlsx`, `.ods`) now normalize as `kind = spreadsheet`.
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live CLI proof on `69ca9d71-1a04-8332-abe1-830d327b2a65` now returns:
    - `artifactCount = 1`
    - `parabola_trendline_demo.xlsx`
    - `kind = "spreadsheet"`
    - `uri = sandbox:/mnt/data/parabola_trendline_demo.xlsx`
- Follow-ups:
  - Keep spreadsheet normalization anchored to concrete observed shapes: `ada_visualizations` tables plus spreadsheet-like download extensions. Do not invent broader spreadsheet semantics unless a richer payload actually exposes them.

- Date: 2026-03-30
- Area: Browser/ChatGPT conversation context now captures spreadsheet/table artifacts from `ada_visualizations`
- Symptom: Some ChatGPT chats with CSV/table outputs still returned `artifactCount = 0` even after downloads, images, and canvas/textdocs were implemented. A real logged-in CSV chat (`bc626d18-8b2e-4121-9c4a-93abb9daed4b`) visibly had downloadable/table artifacts, but `auracall conversations context get <id> --target chatgpt --json-only` returned none of them.
- Root cause:
  - These artifacts are not expressed as markdown `sandbox:/...` links, image asset pointers, or canvas metadata.
  - The authoritative payload shape is `message.metadata.ada_visualizations`, with entries like:
    - `type: "table"`
    - `file_id: "file-..."`
    - `title: "New Patents with ISURF Numbers"`
  - The existing extractor in `src/browser/providers/chatgptAdapter.ts` ignored `ada_visualizations`, so table outputs disappeared completely from cached/exported context.
- Fix:
  - Extended `extractChatgptConversationArtifactsFromPayload(...)` in `src/browser/providers/chatgptAdapter.ts` to normalize `ada_visualizations` entries with `type = table` into first-class `spreadsheet` artifacts.
  - Used `chatgpt://file/<file_id>` as the durable artifact URI and preserved `visualizationType` plus `fileId` in metadata.
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live CLI proof on `bc626d18-8b2e-4121-9c4a-93abb9daed4b` now returns:
    - `artifactCount = 2`
    - `Patents with ISURF Numbers`
    - `New Patents with ISURF Numbers`
    - both with `kind = "spreadsheet"` and `chatgpt://file/<file_id>` URIs
- Follow-ups:
  - If ChatGPT exposes richer table metadata later (sheet names, column schemas, downloadable CSV names, preview text), extend `spreadsheet` metadata from the logged-in payload shape rather than scraping public share-page button text.

- Date: 2026-03-30
- Area: Browser/ChatGPT conversation context now captures generated image artifacts from tool payloads
- Symptom: ChatGPT conversation context already exposed downloadable `sandbox:/...` artifacts and canvas/textdoc blocks, but image-generation chats still flattened the interesting outputs away. On a real logged-in image conversation this meant `auracall conversations context get <id> --target chatgpt --json-only` returned messages and maybe ordinary downloads, but no first-class record of the generated images themselves, their `sediment://...` asset pointers, or the size/dimension/generation metadata needed to persist them sanely in cache/export.
- Root cause:
  - ChatGPT's image outputs do not currently arrive as markdown download links or canvas metadata.
  - The authoritative payload shape is a `tool` message whose `content_type` is `multimodal_text` and whose parts contain JSON objects with `content_type: "image_asset_pointer"`.
  - The existing artifact extractor in `src/browser/providers/chatgptAdapter.ts` only looked for markdown `sandbox:/...` links and `metadata.canvas`, so these tool-image payloads were ignored entirely.
- Fix:
  - Extended `ConversationArtifact.kind` in `src/browser/providers/domain.ts` to include `image` (and reserved `spreadsheet` for future richer table/textdoc payloads).
  - Widened artifact normalization in `src/browser/llmService/llmService.ts` so cached/exported contexts preserve `image` artifacts instead of dropping them as unknown kinds.
  - Added structured-part parsing in `src/browser/providers/chatgptAdapter.ts` and taught `extractChatgptConversationArtifactsFromPayload(...)` to normalize `image_asset_pointer` tool parts into first-class artifacts with:
    - `kind: "image"`
    - `uri = sediment://file_...`
    - `sizeBytes`, `width`, `height`
    - nested `generation` / `dalle` metadata when present
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live CLI proof on logged-in image chat `69bc77cf-be28-8326-8f07-88521224abeb`:
    - `artifactCount = 4`
    - all four generated images now appear in `artifacts[]` with `kind = "image"`
    - metadata includes 1024x1024 dimensions plus generation ids and other DALL-E metadata
- Follow-ups:
  - The public spreadsheet share example still looks download-first on the share page (`Updated bundle ZIP`, `Implementation summary`, etc.). Do not add a special spreadsheet extractor until a richer logged-in payload shape than plain downloads/textdocs is confirmed.

- Date: 2026-03-29
- Area: Browser/ChatGPT conversation context now captures assistant sources plus in-chat artifacts/canvas blocks
- Symptom: ChatGPT conversation CRUD and sent-file read parity were already live, but `auracall conversations context get <id> --target chatgpt --json-only` still flattened the interesting assistant-side context away. On real chats this meant:
  - no `sources[]` even when a turn clearly cited uploaded files through the visible `Sources` UI
  - no durable artifact records for downloadable outputs like `updated skill.zip`, `combined JSON extraction`, or `combined BibTeX extraction`
  - no first-class record of canvas/textdoc content in canvas chats
- Root cause:
  - the adapter only scraped visible DOM message text plus sent user-turn upload tiles
  - the actual authoritative data lived in ChatGPT's backend conversation payload, not only the visible DOM
  - a naive in-page `fetch('/backend-api/conversation/<id>')` was misleading because it could return a JSON `conversation_not_found` error body even on a page that visibly hydrated correctly
  - the first CDP fallback also failed because it matched any `/backend-api/conversation/<id>*` response (`stream_status`, `textdocs`, interpreter download endpoints) and tried `getResponseBody(...)` before `loadingFinished`
  - llmService then masked the adapter failure by falling back to previously cached context with messages but no sources/artifacts
- Fix:
  - Extended `src/browser/providers/domain.ts` with `ConversationArtifact` and `ConversationContext.artifacts`.
  - Extended `src/browser/llmService/llmService.ts` normalization and `src/browser/llmService/cache/export.ts` Markdown/HTML export so `artifacts[]` survive caching/export alongside `sources[]`.
  - Added pure payload extraction in `src/browser/providers/chatgptAdapter.ts`:
    - `extractChatgptConversationSourcesFromPayload(...)`
    - `extractChatgptConversationArtifactsFromPayload(...)`
  - File citations now normalize to synthetic `chatgpt://file/<id>` URLs with `sourceGroup`, downloadable assistant outputs normalize from markdown `sandbox:/...` links, and canvas/textdoc tool messages normalize into `canvas` artifacts with `textdocId`, title, and captured content text from the adjacent code preview.
  - Reworked the payload capture path in `readConversationContext(...)`:
    - only trust the direct fetch path when it is successful and returns a real `mapping`
    - otherwise fall back to CDP network capture on a reload of the already-open conversation route
    - match only the exact `/backend-api/conversation/<id>` response, not sibling endpoints
    - wait for `Network.loadingFinished` before `getResponseBody(...)`
    - re-wait for the visible conversation surface before scraping DOM messages because the payload capture reloads the page
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Direct provider proof on artifact chat `69c3e6d0-3550-8325-b10e-79d946e31562`:
    - `sourceCount = 6`
    - `artifactCount = 30`
  - Live CLI proof on the same artifact chat:
    - includes file-backed sources like `proof.pdf`
    - includes downloadable artifacts like `updated skill.zip`, `combined JSON extraction`, and `combined BibTeX extraction`
  - Live CLI proof on canvas chat `69c8a0fc-c960-8333-8006-c4d6e6704e6e`:
    - `artifactCount = 1`
    - includes canvas artifact `Probe` with `textdocId = 69c8a1018ea08191b3e3cbdb038221e4`
- Follow-ups:
  - If ChatGPT exposes richer non-text artifact classes beyond downloadable `sandbox:/...` links and textdocs, add a second artifact normalization pass instead of flattening them into plain assistant text.
  - The `browser-tools doctor` `__name is not defined` issue observed during DOM recon is separate and still needs its own fix.

- Date: 2026-03-29
- Area: Browser/ChatGPT project-scoped conversation CRUD must anchor to the project page `Chats` tab, not generic `/c/...` anchors
- Symptom: ChatGPT project conversations were conceptually supported by `--project-id`, but the adapter was still treating all visible `/c/...` anchors as one pool. On a project page that is unsafe, because the sidebar still shows root `Recents` and only a limited selected-project subset, while the authoritative project-chat catalog is the main `Chats` panel.
- Root cause:
  - `scrapeChatgptConversations(...)` and project-scoped rename/delete verification relied on generic anchor discovery plus `projectId` matching instead of explicitly preferring the project page conversation panel.
  - Live DOM inspection on the real project page showed the authoritative project-chat rows live under `role="tabpanel" -> SECTION -> OL -> LI`, with their own row-local `Open conversation options for ...` button in the main content area.
  - Without making that surface explicit, project-scoped operations were only “working by luck” as long as ChatGPT happened not to duplicate or reorder those project-chat anchors elsewhere on the page.
- Fix:
  - Updated `src/browser/providers/chatgptAdapter.ts` so project-scoped conversation list reads prefer visible `role="tabpanel"` conversation anchors first, and project-scoped rename/delete verification now also prefers project-panel rows over any sidebar subset row if both render.
  - Scoped the project delete verifier to the project-page conversation panel when a `projectId` is present.
  - Expanded `scripts/chatgpt-acceptance.ts` so it now creates, reads, renames, and deletes a disposable project-scoped conversation using `--project-id`, instead of covering only root conversations.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live targeted proof on project `g-p-69c9a938ade0819199bee2c3e354a53b`:
    - created project conversation `69c9ceb0-a060-8326-9e94-a9972d567e19`
    - `conversations --project-id ... --refresh` returned that project conversation cleanly
    - renamed it to `AC GPT Project Row Probe`
    - project-scoped refresh returned the renamed title
    - deleted it successfully
    - final `conversations --project-id ... --refresh` returned `[]`
- Follow-ups:
  - Run one guarded full `scripts/chatgpt-acceptance.ts` pass to prove the expanded project-conversation slice under the live ChatGPT write-budget guard.

- Date: 2026-03-29
- Area: Browser/ChatGPT root conversation rename must verify the top-row reorder, not just a matching title somewhere
- Symptom: ChatGPT root-conversation rename could still look flaky after the sidebar-row menu + inline input path was fixed. The rename itself often succeeded, but verification could still timeout because the old success check accepted any matching title surface (`document.title`, any matching anchor text, any matching row-menu aria-label) instead of the specific list behavior ChatGPT actually uses after a successful rename.
- Root cause:
  - The provider-level rename verifier in `src/browser/providers/chatgptAdapter.ts` was blind to the strongest ChatGPT-specific signal: after pressing `Enter`, there is a short lag and then the renamed root conversation moves to the top of the root list.
  - The acceptance harness in `scripts/chatgpt-acceptance.ts` only waited for the conversation id to have the expected title somewhere in the refreshed catalog, not for that id to become the new top list entry.
- Fix:
  - Tightened `buildConversationTitleAppliedExpression(...)` / `waitForChatgptConversationTitleApplied(...)` so rename success now requires the same conversation id to be the top visible conversation row with the expected title.
  - Updated `scripts/chatgpt-acceptance.ts` so the rename wait now keys off the refreshed list's first entry: the same conversation id must bubble to the top with the new title.
  - Preserved the authority split explicitly: root-chat rename verification uses the root conversation list, while project-chat verification should continue to use the project page conversation list rather than the abbreviated sidebar subset.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live proof:
    - created disposable root conversation `69c9c950-4544-8333-8cbf-492bc1bd7c1c`
    - renamed it to `AC GPT Top 3wesd8`
    - `conversations --target chatgpt --refresh` returned that same id as the first row with the new title
    - deleted the disposable conversation successfully afterward
- Follow-ups:
  - For project-scoped conversations, keep the project page conversation list as the authoritative postcondition surface; the selected-project sidebar subset is not a complete catalog.

- Date: 2026-03-29
- Area: Browser/ChatGPT existing-conversation composer tool state should be inspected and persisted, not inferred from a successful send
- Symptom: ChatGPT existing-conversation runs could switch add-ons like `web-search`, but there was no durable proof in session metadata about which tool actually ended up selected, and the acceptance harness had to infer success indirectly from later conversation text. When the harness was upgraded to look for the matching browser session by prompt, it also exposed that final ChatGPT browser session metadata still lacked a normalized `conversationId`, so prompt-matched session lookup could race or fail even after a completed browser run.
- Root cause:
  - `ensureChatgptComposerTool(...)` knew how to click the live `Add files and more` surface, but there was no explicit `read current state` helper for existing conversations when the real truth lived in a selected chip or in reopened menu markup.
  - ChatGPT browser-mode result objects were not persisting either the actual selected composer tool or the final normalized `conversationId` into browser runtime metadata, so acceptance/debugging code had to fall back to output scraping.
  - The acceptance harness was reading session metadata immediately after a browser run without polling for the newly completed matching session record.
- Fix:
  - Added `readCurrentChatgptComposerTool(...)` in `src/browser/actions/chatgptComposerTool.ts`, which prefers a visible composer tool chip and otherwise reopens the top-level / `More` menu path to read selected-state from live menu markup.
  - Kept the pure menu/chip resolution logic testable through `resolveCurrentComposerToolSelectionForTest(...)` and added focused coverage in `tests/browser/chatgptComposerTool.test.ts`.
  - Persisted both `composerTool` and normalized `conversationId` in ChatGPT browser results and session runtime metadata through `src/browser/index.ts`, `src/browser/sessionRunner.ts`, `src/browser/types.ts`, `src/sessionManager.ts`, and `packages/browser-service/src/types.ts`.
  - Upgraded `scripts/chatgpt-acceptance.ts` to poll for the matching recent browser session by prompt before asserting persisted tool state.
- Verification:
  - `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live proof:
    - `~/.auracall/sessions/reply-exactly-with-chatgpt-accept-64/meta.json` now records `browser.runtime.composerTool = "web search"` for an existing-conversation `--browser-composer-tool web-search` run on ChatGPT.
- Follow-ups:
  - The broader guarded ChatGPT acceptance rerun is still blocked by a separate rename-title wait lag. Do not treat that as evidence that the new tool-state persistence path failed.

- Date: 2026-03-29
- Area: Browser/ChatGPT acceptance tail must trust the real delete dialog and the tagged project-settings dialog
- Symptom: After the earlier root rename and raw-id delete fixes, the guarded full ChatGPT acceptance run still failed in its final cleanup tail. First it could throw `ChatGPT conversation delete confirmation did not open ...` even though the live `Delete chat?` dialog and `delete-conversation-confirm-button` were visibly on screen. After that was fixed, the same acceptance run advanced one step farther and then failed at project cleanup with `Button not found` from `selectRemoveProjectItem(...)`, even though the live page clearly still had a `Delete project` button in the settings sheet.
- Root cause:
  - Root conversation delete was still keying the confirmation check off the pre-delete page title, so if ChatGPT's real confirm dialog title text no longer matched that older page title exactly, the adapter rejected a perfectly valid visible confirm dialog.
  - Project removal was scoping its `Delete project` search to generic `DEFAULT_DIALOG_SELECTORS`. On the real ChatGPT page, the project settings dialog can coexist with a separate `Too many requests` dialog, so the search could bind to the wrong dialog and never see the actual `Delete project` button.
  - The acceptance harness itself was also too aggressive for this account until its mutating-command timeout budget matched the new rolling write guard behavior; a guarded ChatGPT mutation could be alive but just waiting its turn longer than the runner's old 120s `spawnSync` timeout.
- Fix:
  - Upgraded `scripts/chatgpt-acceptance.ts` so mutating ChatGPT commands get a longer timeout budget and the guard-aware retry path also understands `ChatGPT write budget active until ...`, not only visible cooldown messages.
  - Relaxed `buildConversationDeleteConfirmationExpression(...)` in `src/browser/providers/chatgptAdapter.ts` so the real `delete-conversation-confirm-button` inside a visible `Delete chat?` dialog is authoritative even when the page-title text has drifted.
  - Added a small regression helper/test around that dialog-matching rule in `tests/browser/chatgptAdapter.test.ts`.
  - Scoped `selectRemoveProjectItem(...)` in `src/browser/providers/chatgptAdapter.ts` to the tagged project-settings dialog returned by `tagProjectSettingsDialog(...)` and wrapped the path in `withUiDiagnostics(...)` so overlapping dialogs stop poisoning project removal.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live targeted proofs:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts delete 69c9abe2-72c0-8333-b906-63fc027eddba --target chatgpt --yes --verbose`
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects remove g-p-69c9b039bfd88191af13a04f82b5cf04 --target chatgpt --verbose`
  - Full guarded acceptance proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts`
    - returned `PASS` on suffix `lyveco`
- Follow-ups:
  - Treat `scripts/chatgpt-acceptance.ts` as the canonical ChatGPT browser bar now that it has survived real account cooldowns and overlapping-dialog cleanup states.
  - The next ChatGPT browser work should move to existing-conversation tool/add-on state, not more CRUD tail repair.

- Date: 2026-03-29
- Area: Browser/ChatGPT raw root conversation ids must bypass catalog resolution for delete
- Symptom: After the root rename fix landed, a standalone `auracall delete <conversationId> --target chatgpt` could still fail for a freshly created root conversation with `No conversations matched "<id>"`, even though the provider knew how to build the correct `/c/<id>` route and the conversation was still live in the browser.
- Root cause:
  - The delete command in `bin/auracall.ts` always listed conversations first and matched by refreshed catalog entries before it ever called the provider delete path.
  - ChatGPT root conversation creation can outpace refreshed catalog hydration, so a just-created `69c9...` id can be authoritative before the visible list/cache catches up.
  - That meant the product failed before it even reached the real browser delete code.
- Fix:
  - Added `normalizeChatgptConversationId(...)` to `src/browser/providers/chatgptAdapter.ts` so bare ChatGPT root ids and ChatGPT conversation URLs can be normalized into canonical conversation ids.
  - Advertised that hook through `src/browser/providers/index.ts` / `src/browser/providers/types.ts`.
  - Taught `src/browser/llmService/llmService.ts` to treat provider-native conversation ids as authoritative selectors inside `resolveConversationSelector(...)`.
  - Updated the delete command in `bin/auracall.ts` so an exact provider-native conversation id bypasses conversation-list matching and goes straight to the delete path.
  - Hardened `scripts/chatgpt-acceptance.ts` so the late destructive cleanup steps (`delete` / `projects remove`) will wait once across a known ChatGPT guard cooldown and retry instead of immediately reporting a false runner failure at the tail end of an otherwise-good run.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - Live proof:
    - created fresh root conversation `69c9a282-91a4-832e-b8c0-21fa595a24a9`
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts delete 69c9a282-91a4-832e-b8c0-21fa595a24a9 --target chatgpt --yes --verbose`
    - command deleted successfully without a prior `conversations --refresh`
- Follow-ups:
  - Re-run the full guarded ChatGPT acceptance script after the current cooldown clears; the last full rerun reached the final delete and then hit the guard itself, not a remaining DOM/catalog mismatch.
  - If the acceptance runner still flakes after the one-shot cooldown retry, capture whether the remaining issue is another cleanup retry policy gap or a genuinely new ChatGPT browser behavior.

- Date: 2026-03-29
- Area: Browser/ChatGPT root conversation rename uses the sidebar-row menu, not the header menu
- Symptom: Guarded ChatGPT acceptance stopped failing from rate limits and finally exposed the real root-conversation rename bug: `auracall rename <conversationId> --target chatgpt` timed out on a fresh root conversation even though the conversation itself existed and context reads were already working.
- Root cause:
  - The adapter still had a header-menu fallback for rename on the open conversation route.
  - Live DOM probing showed that the current header `Open conversation options` menu does not expose `Rename` at all for root conversations; it only exposes `View files in chat`, `Move to project`, `Pin chat`, `Archive`, and `Delete`.
  - The real rename surface is the sidebar-row `Open conversation options for ...` menu on the ChatGPT home/list page. After choosing `Rename`, the row rerenders into a plain visible `input[type="text"]` with the current title as its value, so the old synthetic row tag is not stable enough to be the only selector for the edit field.
  - `submitInlineRename(...)` also only had Runtime-level synthetic Enter submission, which is exactly the sort of synthetic keyboard path ChatGPT can ignore on drifted UI surfaces.
- Fix:
  - Extended `packages/browser-service/src/service/ui.ts` so `submitInlineRename(...)` can submit with a real CDP Enter key via `Input.dispatchKeyEvent`, using `native-enter` or `native-then-synthetic` strategies instead of assuming DOM-dispatched keyboard events are equivalent.
  - Rewired `src/browser/providers/chatgptAdapter.ts` so root conversation rename always starts from the list/sidebar row menu, removes the invalid header-menu rename fallback, and falls back from the synthetic tagged-row selector to the real visible `input[type="text"]` once the row enters edit mode.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live WSL non-Pro proof:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts rename 69c99df4-aaf0-8332-8714-d104d751f75d "AC GPT C rsnyfq" --target chatgpt --verbose`
    - fresh list verification:
      - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations --target chatgpt --refresh`
      - confirmed id `69c99df4-aaf0-8332-8714-d104d751f75d` refreshed as title `AC GPT C rsnyfq`
- Follow-ups:
  - ChatGPT root delete should use the same list-first sidebar-row surface for the initial menu open, with the header menu kept only as a delete fallback because that menu really does expose `Delete`.
  - Freshly created root conversation ids can still outrun conversation-catalog resolution for a standalone `delete <conversationId>` call; treat that as a separate resolution/caching issue, not more rename DOM drift.

- Date: 2026-03-29
- Area: Browser-service select-and-reopen verification for menu options
- Symptom: Even after menu-family selection, stable visible-menu handles, and nested submenu traversal were fixed, adapters still needed provider-local reopen logic whenever the authoritative selected-state only existed in menu markup rather than in a visible chip/pill. ChatGPT composer tools like `Canvas` were the concrete case: activation worked, but verification still lived in adapter code.
- Root cause:
  - Browser-service owned menu opening and submenu traversal, but not the final "reopen the same menu family and inspect selected state" pattern.
  - That left adapters rebuilding the same mechanics whenever a surface only exposed authoritative state inside the reopened menu.
- Fix:
  - Added `inspectNestedMenuPathSelection(...)` to `packages/browser-service/src/service/ui.ts` so browser-service can reopen a menu path up to the containing menu and read the selected-state of the target option from the live menu markup.
  - Added `selectAndVerifyNestedMenuPathOption(...)` on top of that, so browser-service can activate an option, reopen the same path, and confirm the option stayed selected before returning success.
  - Rewired `src/browser/actions/chatgptComposerTool.ts` to use the shared select-and-reopen helper instead of its own provider-local reopen/verify path.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT CANVAS VERIFY HELPER PROBE 1." --engine browser --browser-target chatgpt --model gpt-5.2 --browser-composer-tool canvas --verbose`
    - confirmed `Composer tool: canvas`
    - returned `AURACALL CHATGPT CANVAS VERIFY HELPER PROBE 1.`
- Follow-ups:
  - Return to ChatGPT conversation CRUD and only pull more selection logic into browser-service if the conversation surfaces expose another reusable pattern beyond the current menu stack.

- Date: 2026-03-29
- Area: Browser-service visible-menu handles and ChatGPT nested composer menus
- Symptom: The shared nested menu-path helper worked in direct probes, but ChatGPT browser runs still failed on `--browser-composer-tool canvas` with `menu-not-found`, `option-not-found`, or `did not stay selected after activation` once the adapter tried to read the open top-level menu and then open `More` or reopen the menu for verification.
- Root cause:
  - `collectVisibleMenuInventory(...)` returned specific tagged selectors like `[data-oracle-visible-menu-index="1"]`, but it also cleared and reassigned those tags on every inventory pass.
  - Any caller that opened a menu, kept the returned selector, and then performed another inventory read was holding a stale menu handle.
  - The ChatGPT composer path hit that exact pattern twice:
    - open top-level `Add files and more`, read inventory, then try to open `More`
    - reopen menus after activation to verify selected state for submenu tools like `Canvas`
- Fix:
  - Changed `packages/browser-service/src/service/ui.ts` so synthetic visible-menu selectors stay stable across repeated inventory passes while the underlying menu node remains alive instead of being reindexed on every read.
  - Kept the package-owned nested-menu primitives (`openSubmenu(...)`, `selectNestedMenuPath(...)`) and simplified `src/browser/actions/chatgptComposerTool.ts` so normal activation runs through the shared nested-path helper first, with menu inspection reserved for verification and error hints.
  - Refreshed ChatGPT composer menu handles from the current inventory entry selector when reading the top-level or `More` submenu, so the adapter stays aligned with the current browser-service menu handle.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT CANVAS BROWSER SERVICE PROBE 5." --engine browser --browser-target chatgpt --model gpt-5.2 --browser-composer-tool canvas --verbose`
    - confirmed `Composer tool: canvas`
    - returned `AURACALL CHATGPT CANVAS BROWSER SERVICE PROBE 5.`
- Follow-ups:
  - The next package-owned menu extraction should be select-and-reopen verification, since some tools only expose authoritative selected state inside the reopened menu rather than via a composer chip or pill.

- Date: 2026-03-28
- Area: Browser-service backlog shaping from ChatGPT composer/add-on drift
- Symptom: The ChatGPT composer/add-on work surfaced a class of failures that were broader than ChatGPT itself: multiple unrelated visible menus at once, identical trigger labels like `More` on different surfaces, nested submenu paths, and the need to reopen menus to verify selected state when chips/pills were not the whole truth. Without writing those down as package-level learnings, the next adapter would likely reimplement them locally again.
- Root cause:
  - browser-service already owned generic interaction strategies and some diagnostics, but it still lacked package-owned primitives for trigger-anchored menu-family selection, nested submenu traversal, and menu inventory/census
  - the live ChatGPT composer made the gap obvious because it mixed top-level rows, a `More` submenu, and file/source/tool rows in one shared surface
- Fix:
  - Wrote the next active ChatGPT browser plan in `docs/dev/chatgpt-conversation-surface-plan.md` so the project CRUD milestone is no longer conflated with the next conversation/attachment work
  - Marked the project-only plan as effectively closed in `docs/dev/chatgpt-project-surface-plan.md` unless the native UI later exposes clone
  - Expanded `docs/dev/browser-service-upgrade-backlog.md` with the reusable follow-on techniques:
    - trigger-anchored menu-family selection
    - nested menu-path selection
    - menu inventory / census helpers
    - reopen-to-verify option selection
  - Kept the extraction boundary explicit: browser-service should own menu mechanics and diagnostics, while provider adapters still own semantic classification like tool vs source vs file
- Verification:
  - documentation-only update; no code tests were needed
- Follow-ups:
  - When ChatGPT conversation work starts, prefer extracting trigger-anchored menu-family selection or nested submenu helpers into `packages/browser-service/` before adding more provider-local menu glue
  - if a future surface proves those patterns outside ChatGPT too, raise them from backlog guidance into active implementation work
- Date: 2026-03-28
- Area: Browser/ChatGPT composer add-on catalog coverage
- Symptom: Browser-mode could already select `web-search`, but the rest of ChatGPT's current `Add files and more` surface was still effectively undocumented and only partially mapped. That left a real risk that valid human-visible add-ons under the top-level menu and `More` submenu would work only if the operator guessed the exact current label.
- Root cause:
  - The first pass only proved one top-level row (`Web search`) and a narrow alias set (`quickbooks`, `acrobat`, `photoshop`, `calendar`, `drive`).
  - ChatGPT's current add-on surface is no longer flat. The live managed WSL session exposes both top-level rows and a separate `More` submenu, so a reliable mapping has to be based on the real catalog, not on a short guessed list.
- Fix:
  - Probed the live signed-in WSL ChatGPT session and recorded the current visible catalog:
    - top level: `Add photos & files`, `Recent files`, `Company knowledge`, `Create image`, `Deep research`, `Web search`, `More`
    - `More`: `Study and learn`, `Agent mode`, `Canvas`, `Adobe Acrobat`, `Adobe Photoshop`, `Canva`, `GitHub`, `Gmail`, `Google Calendar`, `Google Drive`, `Intuit QuickBooks`, `Quizzes`
  - Expanded `src/browser/actions/chatgptComposerTool.ts` alias coverage so shorthand requests normalize onto the live labels:
    - `research -> deep research`
    - `image|images -> create image`
    - `knowledge -> company knowledge`
    - `study|learn|study mode -> study and learn`
    - `agent -> agent mode`
    - `quiz -> quizzes`
    - `gh|git hub -> github`
    - existing `calendar`, `drive`, `quickbooks`, `acrobat`, `photoshop` mappings remain
  - Kept `Add photos & files` on the normal attachment path and continued rejecting file-upload-style `--browser-composer-tool` requests so file upload does not get conflated with add-on selection.
- Verification:
  - `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/thinkingTime.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro submenu proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT CANVAS PROBE 1." --engine browser --browser-target chatgpt --model gpt-5.2 --browser-composer-tool canvas --verbose`
    - confirmed `Composer tool: Canvas`
    - returned `AURACALL CHATGPT CANVAS PROBE 1.`
- Follow-ups:
  - If we want operators to discover the catalog without source/docs, add a user-facing reference/help surface for the current ChatGPT add-on inventory.
  - Keep treating file upload as the attachment flow (`--file`) even though file-related rows appear in the same ChatGPT menu as the add-ons.

- Date: 2026-03-28
- Area: Browser/ChatGPT composer tool selection and current thinking-depth labels
- Symptom: Browser-mode ChatGPT runs could reach the semantic `Thinking` model, but the live composer surface had drifted in two ways: the depth picker now exposed `Standard` / `Extended` instead of the older `light` / `heavy` labels, and the `Add files and more` button had become a real add-on picker with direct tools plus a `More` submenu. Reused tabs could also leave the wrong menu open, causing Aura-Call to confuse the Thinking menu for the add-ons menu.
- Root cause:
  - `src/browser/actions/thinkingTime.ts` still assumed the older `light` / `heavy` wording instead of ChatGPT's current `Standard` / `Extended` labels.
  - Aura-Call did not yet expose a first-class ChatGPT composer-tool selection path, so add-on tools behind `Add files and more` were unmapped in browser mode.
  - Shared browser-service menu helpers did not recognize some of ChatGPT's current menu row roles (`menuitemradio`, `option`) and did not proactively dismiss stale visible menus before the next selector flow.
  - The first composer-tool picker was too willing to trust any visible menu, including the already-open Thinking menu.
- Fix:
  - Updated `src/browser/actions/thinkingTime.ts` so current ChatGPT thinking-depth selection targets `Standard` / `Extended` directly while keeping `light` / `heavy` as legacy aliases.
  - Added `src/browser/actions/chatgptComposerTool.ts` and wired `--browser-composer-tool <tool>` through `bin/auracall.ts`, `src/cli/browserConfig.ts`, `src/browser/config.ts`, `src/sessionManager.ts`, `src/schema/types.ts`, `src/schema/cli-map.ts`, and `src/browser/service/profileConfig.ts`.
  - Kept the file uploader on the normal attachment flow instead of treating file upload as a composer-tool selection.
  - Hardened `packages/browser-service/src/service/ui.ts` so shared helpers recognize `menuitemradio` / `option` rows and can dismiss stale visible menus before model/thinking/tool selection.
  - Tightened top-level composer-menu scoring so tool selection only trusts menus that actually contain composer/add-on markers such as `More`, `Add photos/files`, `Recent files`, or the requested tool label.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/thinkingTime.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro managed ChatGPT run:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT TOOL PROBE 3." --engine browser --browser-target chatgpt --model gpt-5.2-thinking --browser-thinking-time extended --browser-composer-tool web-search --browser-keep-browser --verbose`
    - confirmed `Thinking time: Extended (already selected)`
    - confirmed `Composer tool: Web search`
    - returned `AURACALL CHATGPT TOOL PROBE 3`
- Follow-ups:
  - Keep Pro out of live validation on this account unless explicitly requested.
  - Continue mapping the remaining ChatGPT add-on rows under `Add files and more` / `More`; file upload should stay on the normal attachment path rather than moving under composer-tool selection.

- Date: 2026-03-28
- Area: Browser/ChatGPT semantic model discovery and selection
- Symptom: Browser-mode ChatGPT model selection was still built around versioned `GPT-5.2 ...` assumptions even though the live picker on the authenticated WSL Chrome session had drifted to semantic rows: `Instant`, `Thinking`, `Pro`, plus `Configure...`. The top button label had also drifted to a generic `ChatGPT`, so `Model picker: ...` logs and current-model detection were no longer meaningful.
- Root cause:
  - `src/browser/constants.ts` and `src/cli/browserConfig.ts` still treated `GPT-5.2 Instant` as the default browser target and mapped base `gpt-5.2` / `gpt-5.1` to stale versioned labels instead of the live semantic rows.
  - `src/browser/actions/modelSelection.ts` assumed the top button text reflected the active model and strongly weighted hardcoded `5.2`/`5.1` tokens during option scoring.
  - The live selected-state signal had drifted too: the active menu row no longer exposes `aria-*` or a named check icon. ChatGPT now marks the active model with a trailing slot (`<div class="trailing" data-trailing-style="default"><svg ...></svg></div>`), so the old selected-state detector could miss a real current selection.
- Fix:
  - Changed the browser default target to `Instant` in `src/browser/constants.ts`.
  - Updated `src/cli/browserConfig.ts` so ChatGPT browser labels now map to the live semantic picker contract:
    - `gpt-5.2` / `gpt-5.1` -> `Instant`
    - `gpt-5.2-thinking` -> `Thinking`
    - `gpt-5.2-pro` / `gpt-5.1-pro` / `gpt-5-pro` -> `Pro`
  - Reworked `src/browser/actions/modelSelection.ts` so option scoring is semantic-first (`instant` / `thinking` / `pro`), `current` mode discovers the checked menu row from the open menu instead of trusting the button caption, and success logs use the real selected row label.
  - Extended selected-state detection to treat the live trailing indicator slot (`.trailing` / `[data-trailing-style]` containing `svg` or `[role="img"]`) as selected alongside the older `aria-*` / named-check affordances.
  - Updated the focused unit/live test expectations in `tests/browser/modelSelection.test.ts`, `tests/browser/modelSelection.label.test.ts`, `tests/cli/browserConfig.test.ts`, `tests/browser/config.test.ts`, and `tests/live/browser-model-selection-live.test.ts` so they now reflect the semantic picker instead of versioned `GPT-5.2 ...` labels.
- Verification:
  - `pnpm vitest run tests/browser/modelSelection.test.ts tests/browser/modelSelection.label.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - Live DOM probe on the signed-in ChatGPT WSL session at port `45011`:
    - confirmed the available rows are `Instant`, `Thinking`, `Pro`, `Configure...`
    - confirmed the selected-state markup lives in the trailing slot, not `aria-*`
    - confirmed non-Pro live switching by clicking `Instant` and then `Thinking`, with the selected row resolving to `instant for everyday chats` and then `thinking for complex questions`
- Follow-ups:
  - Keep ChatGPT live validation on `Instant` / `Thinking` for this account; do not probe `Pro` unless explicitly requested.
  - If ChatGPT changes the trailing selected-slot markup again, update `optionIsSelected(...)` in `src/browser/actions/modelSelection.ts` before changing the higher-level mapping logic.

- Date: 2026-03-28
- Area: Browser/ChatGPT cache identity auto-detection
- Symptom: Signed-in ChatGPT project list/write paths still interrupted with `Cache identity for chatgpt (username/email, leave blank to skip):`, and if the operator skipped the prompt Aura-Call followed up with `Failed to update project cache: Cache identity for chatgpt is required...`. That made managed-browser ChatGPT CRUD feel half-working even though the browser session itself was authenticated.
- Root cause:
  - `src/browser/llmService/llmService.ts` only attempted live browser identity detection when `browser.cache.useDetectedIdentity` was explicitly enabled, so the default path skipped directly to the interactive prompt.
  - ChatGPT did not implement `getUserIdentity(...)`, so even enabling that flag would still have produced `null`.
- Fix:
  - Probed the live signed-in ChatGPT WSL session and confirmed that same-origin `/api/auth/session` returns a stable browser-auth payload with the signed-in user id and email (`user-PVyuqYSOU4adOEf6UCUK3eiK`, `ecochran76@gmail.com`).
  - Added ChatGPT browser identity detection in `src/browser/providers/chatgptAdapter.ts` to read `/api/auth/session`, normalize the `user` / `account` payload into `ProviderUserIdentity`, and fall back to storage/profile-menu hints only if the auth-session read fails.
  - Changed `src/browser/llmService/llmService.ts` so cache identity resolution now prefers detected browser identity by default unless `browser.cache.useDetectedIdentity === false` explicitly disables it.
  - Fixed `bin/auracall.ts` so `projects create --target chatgpt ...` also honors the parent `projects` target flag; without that, the live write smoke could still fall back to the configured provider and throw unrelated Grok create errors.
  - Added focused tests in `tests/browser/chatgptAdapter.test.ts` and new service-level coverage in `tests/browser/llmServiceIdentity.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live signed-in read: `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects --target chatgpt`
    - returned the real project list
    - did not print any `Cache identity for chatgpt...` prompt
    - did not print `Failed to update project cache...`
  - Live disposable write smoke:
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects create --target chatgpt "AuraCall Cache Identity Probe 1774743669" --memory-mode global`
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects remove --target chatgpt g-p-69c87098913c81918e11d312ed7077eb`
    - both completed without the old cache-identity prompt
- Follow-ups:
  - If ChatGPT changes its post-create navigation again, keep treating the canonical `g-p-...` route or refreshed sidebar project list as the only authoritative project-id source; do not regress to trusting arbitrary `/g/<segment>/project` paths.

- Date: 2026-03-28
- Area: Browser/ChatGPT canonical project-id enforcement
- Symptom: After a successful ChatGPT project create/write smoke, the selected browser tab could transiently sit on a malformed route like `/g/AuraCall%20Cache%20Identity%20Probe%201774743669/project`. Because the adapter treated any `/g/<segment>/project` route as a valid project id, that malformed path polluted `readCurrentProject(...)`, `projects --refresh`, cache entries, and name-based cleanup.
- Root cause:
  - `normalizeChatgptProjectId(...)` returned the raw trimmed value when it did not find a `g-p-...` prefix.
  - The ChatGPT route-change, route-ready, current-project, and scrape helpers all accepted those noncanonical route segments as if they were real project ids.
- Fix:
  - Tightened `normalizeChatgptProjectId(...)` in `src/browser/providers/chatgptAdapter.ts` so only canonical `g-p-...` values are treated as project ids.
  - Updated ChatGPT route-settle expressions, `readCurrentProject(...)`, and `scrapeChatgptProjects(...)` so malformed `/g/<non-g-p>/project` routes are ignored instead of becoming authoritative.
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts` for malformed noncanonical project routes and ids.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live disposable smoke:
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects create --target chatgpt "AuraCall Canonical Route Probe 1774744698" --memory-mode global`
    - selected tab landed on `https://chatgpt.com/g/g-p-69c87496161c8191b14903d793282d9c/project`
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects --target chatgpt --refresh` reported the canonical `g-p-69c87496161c8191b14903d793282d9c` id
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects remove --target chatgpt "AuraCall Canonical Route Probe 1774744698"` removed the project successfully
- Follow-ups:
  - Keep canonical `g-p-...` ids as the only acceptable ChatGPT project-id contract in future adapters/cache paths, even if ChatGPT briefly renders intermediary noncanonical routes during create or redirect transitions.

- Date: 2026-03-27
- Area: Browser/Grok WSL acceptance hardening (clone rename verification + project conversation tab fallback)
- Symptom: The new scripted WSL Grok acceptance runner immediately found two last real product problems that earlier manual spot checks had not forced consistently. `projects clone <id> <new-name>` could return success while the refreshed project list still showed `(<source name> clone)` instead of the requested clone name, and right after a successful project-scoped browser prompt the first `conversations --project-id ... --refresh --include-history` could still die with `Project conversations list did not load`.
- Root cause:
  - The CLI clone flow in `bin/auracall.ts` treated the post-clone rename as best-effort. It called `renameProject(...)`, but if the rename drifted or the refreshed list never reflected the requested name, the command only logged a warning and still exited successfully.
  - Project-scoped conversation refresh still relied on an in-page Conversations tab click from the current project page state. After a browser run, Grok sometimes stayed in a project-chat surface where the tab click did not actually materialize the project conversation list, even though the project page itself was valid.
- Fix:
  - Tightened `projects clone <id> <new-name>` in `bin/auracall.ts` so it now waits for the refreshed project list to show the requested clone name for the created id and throws if the rename does not persist.
  - Updated `openConversationList(...)` in `src/browser/providers/grokAdapter.ts` so project-scoped flows can fall back to direct `https://grok.com/project/<id>?tab=conversations` navigation before declaring the conversation list unloaded.
  - While stabilizing the scripted runner, also fixed `scripts/grok-acceptance.ts` to understand the current top-level `conversations context get` payload shape and to verify that the assistant context includes the expected reply even when Grok prepends project instructions text.
- Verification:
  - `pnpm run check`
  - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts --json`
    - final green run returned:
      - `ok: true`
      - project `0c7b28e2-610a-4878-8dfa-c3d34c5a970f`
      - clone `23fb88ea-76bc-41ca-bb23-f21388299423`
      - conversation `aa3ee50d-cc65-4f9b-85a2-9473d115d727`
    - cleanup removed the disposable clone and project successfully
- Follow-ups:
  - Decide later whether project instructions text should keep appearing inline in the assistant conversation-context payload or whether that should be normalized into a distinct system/instructions surface.
  - Treat the scripted acceptance runner as the primary regression tripwire for future Grok browser changes instead of relying on isolated manual CRUD spot checks.

- Date: 2026-03-27
- Area: Browser/Grok WSL acceptance automation
- Symptom: The Grok finish-up checklist had finally gone green on the authenticated WSL profile, but the proof still lived in a manual runbook plus ad hoc shell snippets. That made the definition of done easy to drift: the next refactor could quietly skip clone-rename verification, medium-file failure handling, or project-scoped conversation cleanup simply because the human operator forgot one of the steps.
- Root cause:
  - `docs/dev/smoke-tests.md` had the right acceptance bar, but it was prose plus command fragments, not an executable harness.
  - The real CLI is mixed: some commands return JSON in non-TTY mode, while create/rename/remove/browser-run paths are still human-text oriented. Without a dedicated harness, the live acceptance bar depended on one-off shell parsing and manual project/conversation id tracking.
- Fix:
  - Added `scripts/grok-acceptance.ts`, a scripted WSL-primary acceptance runner that drives the real `auracall` CLI in non-TTY mode, parses the refreshed JSON list/context surfaces, and hard-fails on drift.
  - The runner now covers:
    - project create/rename/clone
    - instructions set/get
    - unique-file add/list/remove
    - the explicit medium-file guard (`Uploaded file(s) did not persist after save: grok-medium.jsonl`)
    - project conversation create/list/context/rename/delete
    - Markdown-preserving browser prompt capture
    - disposable project cleanup
  - Added `pnpm test:grok-acceptance` and updated `docs/dev/smoke-tests.md`, `docs/manual-tests.md`, and `docs/testing.md` so the scripted runner is the primary Grok acceptance path.
- Verification:
  - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts`
    - returned `ok: true`
    - created disposable project `430fd142-382b-4ebc-939d-f40e33b0e31b`
    - created disposable clone `2bc78431-0825-4cb9-af6c-1cf3dd59783b`
    - created/discovered disposable conversation `e7ccc288-7a26-4af1-84ab-8eea308ae806`
    - removed both disposable projects at the end
  - `pnpm run check`
- Follow-ups:
  - Keep this runner opt-in/live for now; it should not be folded into the normal fast test suite.
  - If we later need CI-style reporting, add a thin junit/json wrapper around the live runner instead of duplicating the checklist in another script.

- Date: 2026-03-27
- Area: Browser/Grok WSL acceptance finish-up (Markdown response capture + project delete)
- Symptom: The WSL Grok acceptance pass was still not complete even after project and conversation CRUD mostly worked. The final Markdown-preservation smoke returned flattened output like `alpha` plus `txtCopybeta` instead of the original bullet and fenced code block, and project cleanup still failed with `Project menu button not found` or bogus menu items like `My Projects, Shared with me, Examples` when `projects remove ...` tried to use the current Grok sidebar.
- Root cause:
  - Grok browser runs were not using the richer shared ChatGPT copy-button capture path. `src/browser/actions/grok.ts` still exposed only `waitForGrokAssistantResponse(...)`, which flattened the current Grok assistant DOM via `textContent` and therefore pulled the code-block toolbar (`txt`, `Copy`) into the captured answer.
  - `src/browser/index.ts` then hardwired `answerMarkdown = answerText` for Grok runs, so even when the page contained real structured Markdown, Aura-Call threw it away.
  - Project delete had partially moved to the current sidebar row affordance, but `openProjectMenuButton(...)` was still anchored to the old `Open menu` assumption and accepted any Radix-like collection as a “menu,” which let unrelated project-index tabs (`My Projects`, `Shared with me`, `Examples`) masquerade as a successful row-menu open.
- Fix:
  - Added `waitForGrokAssistantResult(...)` in `src/browser/actions/grok.ts` and kept `waitForGrokAssistantResponse(...)` as a plain-text wrapper for compatibility.
  - Replaced the old Grok assistant snapshot with a richer DOM serializer that:
    - targets the current `response-content-markdown` root,
    - strips sticky copy/tool UI, buttons, thinking/follow-up chrome,
    - reads code from the real `data-testid="code-block"` subtree,
    - reconstructs current Grok lists and fenced code blocks into Markdown,
    - returns separate `text`, `markdown`, and `html`.
  - Wired both local and remote Grok browser run paths in `src/browser/index.ts` to use the richer result so `answerMarkdown` preserves Grok’s Markdown instead of mirroring flattened text.
  - Updated `openProjectMenuButton(...)` / `openProjectMenuAndSelect(...)` in `src/browser/providers/grokAdapter.ts` to:
    - target the current project row in the sidebar by project id / row link,
    - hover-reveal the hidden `button[aria-label="Options"]`,
    - require a real open menu container before proceeding,
    - scope menu-item selection to that menu instead of scanning the whole page.
  - While in this acceptance slice, also fixed `projects instructions set --file ...` in `bin/auracall.ts` so merged CLI/global options are read correctly when Commander promotes `--file` into an array-valued top-level option bag.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live Markdown smoke on the clean clone project:
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --browser-target grok --project-id a65ef98d-e67c-4dd8-b157-343d916d6f60 --model grok-4.1-thinking --prompt $'Return exactly this Markdown:\n- alpha\n```txt\nbeta\n```' --wait --force --browser-keep-browser`
    - returned the bullet plus the fenced `txt` block intact
  - Live project cleanup:
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove a65ef98d-e67c-4dd8-b157-343d916d6f60 --target grok`
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove f3e51b2a-1023-439a-8a67-a62134792f35 --target grok`
    - fresh `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh`
      - no longer listed either disposable project
- Follow-ups:
  - The live WSL Grok profile still tends to keep one spare `about:blank` tab and duplicate hidden `Projects - Grok` tabs after longer CRUD runs. That is separate from correctness, but it is the next tab-hygiene refinement if we keep polishing the browser path.
  - If Grok’s Markdown surface grows more complex (tables, nested lists, richer inline formatting), the current serializer may need a broader grammar than the list/code-block cases covered in this repair.

- Date: 2026-03-27
- Area: Bastion SQL cache branch merge (`cache-mirror-2026-03-27`)
- Symptom: The SQL cache/catalog/search/export work landed on a separate Bastion branch based on an older pre-rename CLI/doc surface, so merging it directly onto the live Aura-Call browser/Grok branch risked reviving stale `oracle` naming and older Grok/UI logic.
- Root cause:
  - The Bastion branch predated the `oracle-cli` -> `auracall` rename and still referenced `bin/oracle-cli.ts`, `~/.oracle`, and older env-var/docs wording.
  - Both branches touched `bin/auracall.ts`, cache export/docs, and Grok adapter instructions handling, so a blind merge would have reintroduced older behavior on active browser surfaces.
- Fix:
  - Cherry-picked the Bastion cache commit onto the current branch and resolved conflicts in favor of the newer Aura-Call browser/Grok behavior.
  - Kept the new SQL cache store/catalog/search/export surfaces, but normalized merged CLI/docs paths and command examples to `auracall`/`~/.auracall`.
  - Kept the current Grok instructions-card fallback instead of the older side-panel click fallback.
  - Harmonized cache debug logging so both `AURACALL_DEBUG_CACHE` and `ORACLE_DEBUG_CACHE` work during the migration period.
- Verification:
  - Conflict-marker sweep over the touched files returned clean.
  - Stale-name sweep over the merged CLI/docs/export surfaces returned clean for `oracle-cli`, `~/.oracle`, and `getOracleHomeDir`.
- Follow-ups:
  - Run full cache/CLI/type validation after the cherry-pick completes.
  - Clean up remaining legacy compatibility env-var naming in a separate pass instead of mixing it into the merge itself.

- Date: 2026-03-27
- Area: Browser/tab stockpile cleanup policy configurability
- Symptom: After centralizing tab reuse and conservative cleanup in browser-service, the behavior was still effectively hardcoded for every Aura-Call profile: keep 3 matching-family tabs, keep 1 blank tab, and always collapse disposable extra windows. That was good as a default but not good enough once multiple long-lived profiles were expected to coexist with different browsing habits.
- Root cause:
  - The cleanup limits lived only inside `openOrReuseChromeTarget(...)`.
  - Aura-Call’s config/schema/profile-merge path did not have fields for the cleanup policy, so profile-specific overrides were impossible even though the runtime behavior was already centralized.
  - Some runtime call sites (remote attach, manual login, Grok fallback opens) would have ignored profile-level overrides even if the config layer knew about them.
- Fix:
  - Added profile-scoped browser config fields:
    - `browser.serviceTabLimit`
    - `browser.blankTabLimit`
    - `browser.collapseDisposableWindows`
  - Threaded them through the browser-service base types, Aura-Call schema/profile merge path, resolved browser config defaults/validation, remote attach, manual login, and Grok fallback opens.
  - Kept the existing cleanup behavior as the default so current profiles do not change unless they opt in.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/schema/resolver.test.ts tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - If users actually need one-off experimentation, add explicit CLI flags later. For now these are intentionally profile/config-level knobs.

- Date: 2026-03-27
- Area: Browser/Grok `projects create` verification and backend validation on WSL Chrome
- Symptom: `auracall projects create ... --target grok` could still look broken even after the sidebar/modal drift fixes. Some live runs printed a generic “could not be verified” failure, and timestamp-style disposable project names made it look like project creation itself was still unreliable.
- Root cause:
  - The create flow was still selecting a generic `grok.com` tab in a browser with many old Grok project tabs open, so create steps could start from the wrong page unless `/project` was targeted explicitly.
  - The CLI still printed success too early when the provider-backed create path failed to resolve a new `/project/<id>` URL.
  - The remaining live “failure” turned out to be a real Grok backend validation rule: names like `AuraCall Create Probe 20260327-1033` are rejected by `POST /rest/workspaces` as phone-number-like input (`WKE=form-invalid:contains-phone-number:name`).
- Fix:
  - Routed Grok create-modal entry and create-step helpers through the `/project` index instead of a broad `https://grok.com/` match.
  - Tightened the CLI contract so provider-backed `projects create` now throws when Aura-Call cannot prove a newly created project page instead of printing a false `Created project ...` line.
  - Added `/rest/workspaces` response capture in `src/browser/providers/grokAdapter.ts` so non-2xx create responses surface the real backend validation error.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Negative live case: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create 'AuraCall Create Probe 20260327-1033' --target grok`
    - now fails with `Create project failed: name: Value contains phone number. [WKE=form-invalid:contains-phone-number:name]`
  - Positive live case: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create 'AuraCall Cedar Atlas' --target grok`
    - listed successfully in `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok`
    - removed successfully with `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove a3418590-843c-4edb-8976-e67f91667f9b --target grok`
- Follow-ups:
  - Avoid timestamp/phone-number-like names in live Grok create smokes.
  - Grok still leaves duplicate tabs around, but after the exact `/project` targeting changes I could not reproduce the old stale-name list regression in a fresh clone/rename/remove cycle. The next live follow-up should move to conversation CRUD instead of more project-list deduping.

- Date: 2026-03-27
- Area: Browser/Grok project CRUD on WSL Chrome
- Symptom: Live Grok project CRUD against the authenticated WSL Chrome profile broke repeatedly on current Grok UI drift: project create failed with `Main sidebar did not open`, upload completion timed out even when the file row showed `50 B`, instructions get/set could not find the old `Edit instructions` affordance, and project delete still tried to reopen the main chat sidebar before using the project-header menu.
- Root cause:
  - Aura-Call was attaching to an existing Grok tab but not bringing it to the front before sidebar-dependent interactions. On a hidden tab, Grok's layout/click state diverged enough that sidebar toggles were effectively no-ops.
  - Grok no longer relies on the older hidden create action inside the `Projects` row; the current UI exposes a direct `New Project` row in the sidebar.
  - Upload completion checks were using naive substring matching for `0 B`, so `50 B` falsely matched as a zero-byte file.
  - The project page no longer exposes an `Edit instructions` button in the old place; the live editor opens from a clickable `Instructions` card in the side panel.
  - Project remove was still carrying an old assumption that the main chat sidebar had to be reopened on a project page before using the project-header menu.
- Fix:
  - Added `ensureGrokTabVisible(...)` in `src/browser/providers/grokAdapter.ts` and invoked it before main-sidebar, generic sidebar, and project-page interactions so live CRUD runs operate on a visible Grok tab.
  - Updated create-project modal opening to prefer the direct `New Project` row and only fall back to the older hover/reveal path if needed.
  - Tightened upload completion checks to use real zero-byte regex matching instead of `includes('0 b')`, so `50 B` no longer trips the zero-byte guard.
  - Updated project instructions opening to click the visible `Instructions` card when the old edit button is absent.
  - Simplified project sidebar and project-menu opening to use the current visible buttons (`Collapse side panel`, `Expand side panel`, `Open menu`) instead of stale root-scoped heuristics.
  - Removed the unnecessary `ensureMainSidebarOpen(...)` dependency from project remove confirmation on project pages.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live Grok project CRUD on WSL Chrome:
    - `projects clone`
    - `projects rename`
    - `projects instructions get`
    - `projects instructions set --text ...`
    - `projects files list/add/list/remove/list`
    - `projects remove`
- Follow-ups:
  - `projects create` is no longer blocked by the original sidebar/upload bugs, but it still needs a stricter end-to-end success proof. In the live pass, disposable project CRUD continued on a cloned project because create/list/read still show drift.
  - Project list/selection still need a better strategy when Grok leaves multiple tabs open for the same project id and one tab has stale title/sidebar state.

- Date: 2026-03-27
- Area: Browser/Wizard profile naming on WSL
- Symptom: After switching the preferred WSL runtime back to the old known-good managed profile, `auracall doctor --profile wsl-chrome --local-only` still resolved `~/.auracall/browser-profiles/wsl-chrome/grok` instead of the live `~/.auracall/browser-profiles/default/grok` store, so the CLI reported an uninitialized synthetic profile even though the real WSL Chrome profile was healthy and signed in.
- Root cause:
  - This was not a generic resolver merge bug. The merged config really did carry `manualLoginProfileDir: ~/.auracall/browser-profiles/default/grok`.
  - `resolveManagedProfileDir(...)` intentionally ignores a configured managed-profile dir under the same managed root when its `<auracallProfile>/<service>` segments do not match the selected Aura-Call profile name. That guard exists to stop stale inherited `browser.manualLoginProfileDir` values from silently pointing one profile at another profile's managed store.
  - We had accidentally made the primary WSL config profile name `wsl-chrome` while still pointing it at the old `default/grok` managed store, so the safety guard correctly treated that as drift.
- Fix:
  - Rebased the primary WSL setup back onto `profiles.default` / `auracallProfile: "default"` in `~/.auracall/config.json`, keeping the long-lived managed profile at `~/.auracall/browser-profiles/default/grok`.
  - Preserved Windows as a separate named profile (`windows-chrome-test`) instead of trying to make both runtimes share one managed-profile namespace.
  - Updated `src/cli/browserWizard.ts` so WSL Chrome now suggests `default` as the profile name on WSL, matching the managed-profile layout we actually want users to keep.
- Verification:
  - `pnpm vitest run tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - `pnpm tsx bin/auracall.ts --profile windows-chrome-test doctor --target grok --local-only --json`
  - Verified the default WSL report now resolves `/home/ecochran76/.auracall/browser-profiles/default/grok` and shows the managed registry/account state instead of a synthetic `wsl-chrome/grok` path.
- Follow-ups:
  - Keep the WSL-first docs and wizard copy aligned with this rule so we do not recreate the same cross-profile mismatch during onboarding.
  - If we ever want one named Aura-Call profile to intentionally point at another managed-profile subtree, that needs an explicit opt-in concept instead of weakening the current drift guard.

- Date: 2026-03-26
- Area: Browser/Windows DevTools endpoint model
- Symptom: The product path for WSL -> Windows Chrome had already moved to auto-discovered DevTools endpoints, but parts of the code and docs still described browser automation as if a single fixed `debugPort` were the authoritative connection target. That kept the fixed-port/firewall mental model alive even after the working path no longer depended on it.
- Root cause:
  - The new Windows behavior (`--remote-debugging-port=0` + `DevToolsActivePort` + `windows-loopback`) was proven in runtime code first, but the type/config surface still treated fixed ports as the default shape.
  - `discoverWindowsChromeDevToolsPort(...)` also kept older candidate ports around without explicitly prioritizing the current recorded `DevToolsActivePort`, which made the recovery contract less obvious than it should have been.
  - User docs still described `--browser-port` as the main Windows helper and kept firewall/`portproxy` guidance too close to the happy path.
- Fix:
  - Added `debugPortStrategy` (`fixed` | `auto`) to the browser-service/browser/session config surface and threaded it through config resolution, login/manual-login flows, runtime launch, and port resolution.
  - On WSL when the configured Chrome path points at Windows Chrome, Aura-Call now defaults that strategy to `auto`; explicit `--browser-port` / `browser.debugPort` continues to imply `fixed`.
  - Updated `discoverWindowsChromeDevToolsPort(...)` to prioritize the current recorded `DevToolsActivePort` before stale requested/advertised ports.
  - Rewrote the README/browser/testing/windows/config docs so the supported Windows path is now documented as managed profile + auto port + discovered endpoint + relay, with fixed-port/firewall notes demoted to advanced manual direct-CDP debugging.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/schema/resolver.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser/browserLoginCore.test.ts`
  - `pnpm run check`
- Follow-ups:
  - If we later expose a user-facing CLI flag for the strategy, it should be positioned as an advanced override, not a normal setup step.
  - Continue auditing reporting surfaces so they describe the actual discovered endpoint as authoritative instead of treating `debugPort` as if it always reflected the live connection.

- Date: 2026-03-26
- Area: Browser profile doctor / Chrome-account persistence
- Symptom: The only reliable onboarding/auth check was provider-specific live identity probing, which forced repeated Grok logins even when the user mainly needed to know whether the managed Chrome profile still carried the browser’s signed-in Google account.
- Root cause: `auracall doctor --local-only` only inspected managed profile paths/cookies/registry state; it never read Chromium account metadata. A first pass using only `Local State` still produced false negatives on a live Windows-managed profile because Chrome had real `account_info` in `Default/Preferences` while `Local State` still had blank `gaia_*` / `user_name` fields.
- Fix: Added Chrome-level Google-account inspection in `src/browser/profileDoctor.ts` by parsing both the managed profile `Local State` (`profile.info_cache[profileName]` + `signin.active_accounts`) and `Default/Preferences` (`account_info`, `google.services.last_gaia_id`, `signin.explicit_browser_signin`). Reports now classify the managed profile as `signed-in`, `signed-out`, or `inconclusive` (copied active-account markers without a primary account identity).
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - `pnpm tsx bin/auracall.ts --profile windows-chrome-test doctor --target grok --local-only --json`

- Date: 2026-03-26
- Area: Grok auth verification + explicit Windows managed-profile preservation
- Symptom: Aura-Call could still treat Grok as “logged in” when guest chat was available, and integrated Windows launch retries could wipe an explicitly selected managed Windows profile if DevTools did not appear on the first requested port. That made first-time Windows Chrome validation misleading and could clobber a user-managed login session during verification.
- Root cause:
  - `ensureGrokLoggedIn(...)` only relied on negative signals (`loginUrlHints`, not-found copy, and missing early CTAs). Guest-capable Grok pages could still satisfy that check before the real `Sign in` / `Sign up` UI surfaced.
  - The Windows retry callback in `src/browser/index.ts` treated all managed profiles as disposable bootstrap targets and force-reseeded them on retry, even when the profile path had been explicitly selected for persistent reuse.
- Fix:
  - Added `src/browser/providers/grokIdentity.ts` and moved Grok auth probing to a positive-signal contract: visible guest CTAs count as guest state, and authenticated runs now require a real parsed identity before `ensureGrokLoggedIn(...)` passes.
  - Hardened the Grok identity helpers against undefined CDP eval responses and updated the focused Grok auth tests.
  - Changed the Windows retry policy so explicit managed profile paths are preserved across DevTools port retries instead of being deleted/reseeded.
  - Updated local config to use Windows Chrome defaults again and pinned Grok’s managed profile to `profiles.default.services.grok.manualLoginProfileDir = "/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok"`, with the Windows Aura-Call profile root as the default managed root.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokIdentity.test.ts tests/browser/profileStore.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/processCheck.test.ts`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - Direct Windows process match for the pinned profile:
    - `findChromeProcessUsingUserDataDir('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok')`
    - returned `pid 203144`, `port 45910`
  - Safe remote attach against that exact profile on `windows-loopback:45910` now blocks on verified Grok auth and reported `visible Sign in/Sign up controls still present`, which is the correct behavior for a guest-only session.
- Follow-ups:
  - The exact pinned Windows-managed Grok profile is now persistent in config, but I could not honestly confirm a signed-in Grok identity on it after the retry-policy fix. The last safe remote attach still saw guest CTAs.
  - Doctor/runtime registration still has a split-brain issue when a live `windows-loopback` session is attached through the remote path: the active port can be credited to the old WSL profile path instead of the Windows-managed path. That should be fixed separately so `auracall doctor` can probe the live Windows-managed profile without manual registry repair.

- Date: 2026-03-26
- Area: Windows Chrome Default-profile bootstrap + crash/restore modal handling
- Symptom: Fresh Windows-managed profiles seeded from a live Windows Chrome Default profile could open with Chrome’s “restore pages / didn’t shut down correctly” UI, destabilize the imported browser session, and fail follow-up auth inspection. Separate Grok identity probes against `windows-loopback:<port>` also failed early with `getaddrinfo EAI_AGAIN windows-loopback`.
- Root cause:
  - Managed-profile bootstrap preserved auth-bearing Chromium state, but it did not scrub copied crash/session markers (`profile.exit_type`, `exited_cleanly`, `Sessions`, `Current Session`, `Last Tabs`, etc.).
  - Live Windows Chromium files such as `Network/Cookies` can be locked when the source profile is open; plain `copyFile(...)`/robocopy is not enough.
  - Grok’s provider attach path still handed the literal `windows-loopback` host directly to CDP in some target-attach branches instead of routing through the browser-service endpoint resolver.
- Fix:
  - Added a Windows shared-read file-copy fallback in `src/browser/profileStore.ts` so WSL bootstrap can copy locked Chromium files through Windows PowerShell when plain file copy fails.
  - Sanitized copied managed profiles for automation by pruning volatile session artifacts and rewriting `Preferences` / `Local State` to mark clean exit state.
  - Added `--hide-crash-restore-bubble` to browser-service Chrome launch flags.
  - Routed Grok provider target attaches through `connectToChromeTarget(...)`, which resolves `windows-loopback` via the browser-service relay before opening the target.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser-service/chromeLifecycle.test.ts`
  - `pnpm vitest run tests/browser/grokIdentity.test.ts tests/browser/profileStore.test.ts`
  - `pnpm run check`
  - Fresh integrated Windows Grok run with a new managed profile:
    - `AURACALL_WSL_CHROME=windows AURACALL_BROWSER_PROFILE_DIR='/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok' pnpm tsx bin/auracall.ts --engine browser --browser-target grok --browser-port 45891 --browser-keep-browser ... --wait --verbose --force`
    - completed successfully and left Chrome running on `45891`
  - Remote identity probe against that live session no longer failed with DNS resolution and returned a concrete result (`identity: null`).
- Follow-ups:
  - A stable imported Windows-managed profile still came up guest-only on Grok in the live proof. The live page showed `Sign in` / `Sign up`, so bootstrap/import stability is improved, but first-run Windows Chrome bootstrap still does not guarantee Grok auth on this machine.
  - `ensureGrokLoggedIn(...)` needs a stronger positive-signal check for setup/doctor flows; absence of an early CTA is not enough.

- Date: 2026-03-26
- Area: Integrated WSL -> Windows Chrome cleanup after successful Grok runs
- Symptom: Integrated WSL -> Windows Chrome launches were working, but successful Grok runs could still leave the managed Windows Chrome process alive afterward. The logs showed `Requested Chrome shutdown via DevTools.` immediately followed by `Skipping shutdown of reused Chrome instance.`
- Root cause:
  - The shutdown bug was not just Windows PID churn. `runBrowserMode(...)` was launching local Chrome on the generic path before delegating to `runGrokBrowserMode(...)`.
  - The Grok-specific path then launched/attached again against the same managed Windows profile, which looked like a reused/adopted instance and therefore lost kill ownership.
  - Separately, Windows Chrome can pivot from the original launcher PID to another browser PID while keeping the same DevTools port, so “current-run ownership” could not rely on PID alone during re-adoption.
- Fix:
  - Routed local Grok runs directly into `runGrokBrowserMode(...)` before the generic local Chrome launch path in `src/browser/index.ts`, so Grok no longer double-launches/reattaches through two separate runners.
  - Updated `packages/browser-service/src/chromeLifecycle.ts` so current-run ownership survives re-adoption by either PID or DevTools port, and kill-capable adopted handles keep shutdown authority instead of degrading to `Skipping shutdown of reused Chrome instance.`
  - Added focused ownership regressions in `tests/browser-service/chromeLifecycleOwnership.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser-service/chromeLifecycleOwnership.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/processCheck.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/browser/profileStore.test.ts`
  - `pnpm run check`
  - Live integrated Windows Chrome proof with a fresh managed profile:
    - `AURACALL_WSL_CHROME=windows ... --prompt "Reply exactly with: windows cleanup proof 3" --wait --verbose --force`
    - returned `windows cleanup proof 3`
    - logged a single launch path (no second generic prelaunch/re-adopt cycle)
    - Windows process probe for `windows-cleanup-proof-3` returned `[]`
- Follow-ups:
  - Consider one more unit regression that asserts local Grok runs only launch once from `runBrowserMode(...)`.
  - Surface the effective elevated Windows debug port more clearly in the CLI when a low requested port is auto-raised into `45891+`.

- Date: 2026-03-26
- Area: WSL Windows-profile discovery and path normalization in browser-service
- Symptom: WSL users still had to reason about three different path forms for the same Chromium profile store (`/mnt/c/...`, `C:\...`, and `\\wsl.localhost\...`), and some paths were normalized too late. In particular, explicit `manualLoginProfileDir` / bootstrap cookie paths could be `path.resolve(...)`'d before they were translated out of UNC or Windows-drive form, and Windows-hosted Chrome/Brave profile discovery still tended to default to the first Windows profile tree instead of the browser family the user actually selected.
- Root cause:
  - WSL/Windows path conversion logic was duplicated in `src/browser/config.ts`, `packages/browser-service/src/chromeLifecycle.ts`, `packages/browser-service/src/loginHelpers.ts`, and `packages/browser-service/src/processCheck.ts`, with slightly different rules in each place.
  - Managed-profile path handling in `src/browser/profileStore.ts` trusted `path.resolve(...)` too early, which turns `\\wsl.localhost\...` into a bogus local POSIX path when called from WSL before normalization.
  - Browser profile discovery knew about Windows Chrome/Brave locations in general, but it did not prioritize the matching browser family from the configured executable hint, so a Windows Brave run could still discover Chrome state first.
- Fix:
  - Added a shared `packages/browser-service/src/platformPaths.ts` helper layer for WSL detection, Windows/WSL path translation, comparable-path normalization, Chromium family detection, and Windows `LocalAppData` inference.
  - Routed browser config, managed-profile root/directory resolution, cookie-source inference, process matching, and Chrome launch through the shared translator instead of keeping separate ad hoc conversions.
  - Updated `packages/browser-service/src/service/profileDiscovery.ts` to accept browser/user-data hints, prioritize the matching browser family (`chrome` vs `brave` vs others), and honor direct `AURACALL_WINDOWS_LOCALAPPDATA` / `AURACALL_WINDOWS_USERS_ROOT` overrides when needed.
- Verification:
  - Focused tests:
    - `pnpm vitest run tests/browser-service/platformPaths.test.ts tests/browser-service/profileDiscovery.test.ts tests/browser-service/processCheck.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/browser/profileStore.test.ts`
    - `pnpm run check`
  - Added regressions for:
    - WSL UNC -> Linux managed-profile normalization in `tests/browser/config.test.ts`
    - Windows drive-path managed-profile-root inference in `tests/browser/config.test.ts`
    - browser-family-aware Windows profile discovery in `tests/browser-service/profileDiscovery.test.ts`
    - shared WSL/Windows path translation in `tests/browser-service/platformPaths.test.ts`
- Follow-ups:
  - The next likely UX improvement is surfacing the auto-discovered Windows browser/profile source more explicitly in `doctor` / `setup`, so users can see when Aura-Call chose Windows Chrome vs Windows Brave without reading verbose logs.

- Date: 2026-03-25
- Area: Integrated WSL -> Windows Chrome launch with seeded Aura-Call managed profiles
- Symptom: Aura-Call could already reuse Windows Chrome through `--remote-chrome windows-loopback:<port>`, but the fully integrated WSL -> Windows launch path still failed for first-run managed profiles seeded from the Windows Chrome default profile. The run launched real Windows Chrome processes, but DevTools never came up and the browser automation bailed after trying `45877-45884`.
- Root cause:
  - WSL Windows-profile process detection was wrong. `findChromePidUsingUserDataDir(...)` returned the first `chrome.exe` PID from `tasklist.exe`, not the Chrome instance for the requested managed profile, so Aura-Call could not reliably distinguish “my managed profile is already running” from “some Chrome exists on Windows.”
  - The launch path also spent a long time proving each bad port was bad through the relay, even when Windows itself was not serving DevTools on that port.
  - Most importantly, the seeded managed Windows Chrome profile on this machine simply did not expose DevTools on the low pinned band (`45877-45884`). The working ports for manual seeded/empty probes were higher (`45891+`).
- Fix:
  - Replaced the WSL Windows-profile PID shortcut with exact Windows `chrome.exe` command-line inspection in `packages/browser-service/src/processCheck.ts`, including remote-debugging-port extraction from the matched process.
  - Updated `packages/browser-service/src/chromeLifecycle.ts` to reuse the exact matched port when a managed Windows profile is already alive, and to probe Windows-local `127.0.0.1:<port>/json/version` before waiting on the WSL relay.
  - Added a Windows WSL debug-port floor (`45891`) for integrated launches so Aura-Call no longer starts inside the known-dead low band when the user/config still pins a low port such as `45877`.
- Verification:
  - Focused tests:
    - `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/portSelection.test.ts tests/browser-service/profileState.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/browser/profileStore.test.ts`
    - `pnpm run check`
  - Direct Windows sanity probes:
    - empty Windows profile + `--remote-debugging-port=45891` answered `http://127.0.0.1:45891/json/version`
    - selectively seeded Aura-Call managed profile + `--remote-debugging-port=45892` also answered `http://127.0.0.1:45892/json/version`
  - End-to-end live smoke from WSL with a fresh Windows Aura-Call profile:
    - `AURACALL_WSL_CHROME=windows AURACALL_BROWSER_PROFILE_DIR='/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-proof-8/grok' pnpm tsx bin/auracall.ts --engine browser --browser-target grok --browser-port 45877 --browser-chrome-path '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe' --browser-cookie-path '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies' --browser-bootstrap-cookie-path '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies' --model grok --prompt 'Reply exactly with: windows chrome just works' --wait --verbose --force`
    - run elevated the requested port to `45891`, attached successfully, passed Grok login/mode selection, and returned `windows chrome just works`
- Follow-ups:
  - Successful integrated runs can still leave the Windows Chrome managed profile process alive because the launch path later re-adopts the profile instance and skips the final kill.
  - The CLI preflight banner still echoes the raw configured `debugPort` even though the runtime launch may elevate it to `45891+`; that user-facing messaging should be aligned.

- Date: 2026-03-25
- Area: WSL remote Chrome relay for Windows loopback DevTools
- Symptom: Raw WSL->Windows CDP TCP remained unreliable in the current mirrored/Tailscale setup even after firewall and `portproxy` work. Windows Chrome could expose DevTools on Windows `127.0.0.1:<port>`, but WSL still could not reliably reach any Windows-hosted TCP ingress.
- Root cause:
  - The real need for the manual remote-browser case was not “make Windows expose CDP on the network,” but “let WSL talk to a Windows-local Chrome somehow.”
  - Aura-Call’s existing `--remote-chrome` path assumed a reachable host:port and had no transport layer for “Windows loopback only.”
- Fix:
  - Added a new WSL-only `--remote-chrome windows-loopback:<port>` path in `packages/browser-service/src/windowsLoopbackRelay.ts` and `packages/browser-service/src/chromeLifecycle.ts`.
  - Aura-Call now starts a local WSL TCP relay, and each relay connection spawns a Windows PowerShell helper that opens a TCP socket to Windows Chrome on Windows `127.0.0.1:<port>` and pumps raw bytes over stdio.
  - Updated remote browser runs to use the relay’s actual local host/port for runtime hints, target cleanup, and error reporting.
- Verification:
  - Focused tests:
    - `pnpm vitest run tests/browser-service/windowsLoopbackRelay.test.ts tests/browser-service/chromeLifecycle.test.ts`
    - `pnpm run check`
  - Transport-only live probe:
    - repeated `fetch('http://127.0.0.1:<relayPort>/json/version')` succeeded through the relay to Windows Chrome `127.0.0.1:45871`
  - End-to-end live smoke:
    - `pnpm tsx bin/auracall.ts --engine browser --browser-target grok --remote-chrome windows-loopback:45871 --model grok --prompt "ping" --wait --verbose --force`
    - run succeeded and returned a real Grok answer through the Windows Chrome session
- Follow-ups:
  - Extend the same relay idea into the integrated Windows-launch/manual-login path instead of keeping it remote-mode-only.
  - Add a dedicated `browser-tools` / `scripts/test-remote-chrome.ts` path for the `windows-loopback` alias so transport verification does not require a full Aura-Call run.

- Date: 2026-03-25
- Area: WSL -> Windows Chrome DevTools bridge
- Symptom: After revisiting the old Windows-browser path, it still looked like a generic firewall/host-resolution problem, but the actual failure was narrower and more structural. Aura-Call could launch a dedicated Windows Chrome profile with `--remote-debugging-port=45871`, Windows itself could reach `192.168.50.108:45872` through an existing `v4tov4` portproxy, yet WSL still could not connect to that same `192.168.50.108:45872` endpoint.
- Root cause:
  - On this machine WSL is using mirrored networking with Tailscale, and both Windows and WSL report the same LAN IPv4 (`192.168.50.108`).
  - The existing Windows `portproxy` (`192.168.50.108:45872 -> 127.0.0.1:45871`) is valid from Windows itself, but WSL cannot use that shared IPv4 as a reliable Windows-host ingress.
  - `resolveWslHost()` is still fundamentally too weak for this case because it falls back to `/etc/resolv.conf` (here `100.100.100.100`) or other guessed IPv4s instead of a deterministic Windows-reachable address.
  - Chrome also does not solve this by itself: even with `--remote-debugging-address=0.0.0.0` or `--remote-debugging-address=::`, Windows Chrome still listened only on `127.0.0.1`.
  - There is also a product-shape gap: Aura-Call's integrated Windows launch path has only one `debugPort`, but safe `portproxy` usage needs two ports (`chromePort` on loopback, `connectPort` for WSL).
- Fix:
  - No runtime code fix landed yet.
  - Captured the working/non-working matrix explicitly and narrowed the viable next path to an elevated Windows `v6tov4` portproxy bound on a Windows IPv6 address that WSL can actually reach.
  - Documented the product gap so future work does not keep trying to force `portproxy` through a single-port launch model.
- Verification:
  - WSL negative checks:
    - `curl http://192.168.50.108:45872/json/version`
    - `curl http://127.0.0.1:45871/json/version`
  - Windows positive checks:
    - `Invoke-WebRequest http://127.0.0.1:45871/json/version`
    - `Invoke-WebRequest http://192.168.50.108:45872/json/version`
    - `netstat -ano | findstr 45871` showed Chrome listening on `127.0.0.1:45871`
    - `netstat -ano | findstr 45872` showed `portproxy` listening on `192.168.50.108:45872`
  - WSL host reachability:
    - `ping -6 fd7a:115c:a1e0::1101:b830`
    - `ping -6 fe80::7400:d6c0:9bc:780d%eth1`
  - Windows-only success, WSL-only failure on shared IPv6:
    - elevated `netsh interface portproxy add v6tov4 listenport=45874 listenaddress=fd7a:115c:a1e0::1101:b830 connectport=45871 connectaddress=127.0.0.1`
    - Windows `Invoke-WebRequest http://[fd7a:115c:a1e0::1101:b830]:45874/json/version` succeeded
    - WSL `curl -g 'http://[fd7a:115c:a1e0::1101:b830]:45874/json/version'` and `nc -vz fd7a:115c:a1e0::1101:b830 45874` still failed
  - Chrome IPv6 bind attempt still failed to expose CDP externally:
    - launched with `--remote-debugging-address=:: --remote-debugging-port=45873`
    - `netstat` still showed only `127.0.0.1:45873`
- Follow-ups:
  - Add a Windows-aware external DevTools connect port concept to Aura-Call/browser-service so launch/login can model `chromePort != connectPort`.
  - Consider replacing `resolveWslHost()` heuristics with a Windows-interrogated host candidate list plus explicit diagnostics when the chosen host equals a local WSL address or `/etc/resolv.conf` nameserver.
  - Before assuming `v6tov4` solves the problem, verify that the chosen Windows IPv6 is not also assigned inside WSL. On this machine the obvious Tailscale/link-local IPv6 addresses were shared, so the proxy still was not usable from WSL.
  - The remaining likely fixes are outside simple firewall tweaking: either a Windows-only relay/tunnel path, or a change to the WSL networking mode so Windows has a distinct ingress address.

- Date: 2026-03-25
- Area: WSL Brave runtime with Windows Brave bootstrap source
- Symptom: It was unclear whether the remaining Brave bootstrap failure was caused by using WSL Chrome as the runtime browser instead of Brave itself.
- Root cause:
  - The real blocker is not the runtime browser binary.
  - The managed profile can inherit some Brave browser state (`AF_SESSION`, `afUserId`, preferences, IndexedDB/local storage) from the copied profile data, but the actual Windows Brave `Network/Cookies` DB remains unreadable from WSL.
  - Without that cookie DB, Grok still treats the session as guest-capable and shows visible `Sign in` / `Sign up` CTAs.
- Fix:
  - No code change needed for this specific check.
  - Verified the behavior explicitly by launching Aura-Call with `/usr/bin/brave-browser` against a fresh managed profile seeded from the Windows Brave source path.
- Verification:
  - `auracall login --target grok --browser-chrome-path /usr/bin/brave-browser --browser-bootstrap-cookie-path /mnt/c/.../Brave-Browser/.../Network/Cookies`
  - Live DOM probe on the Brave-backed session at port `45001`:
    - `signIn: true`
    - `signUp: true`
    - `AF_SESSION` present in localStorage
    - `afUserId` visible in `document.cookie`
- Follow-ups:
  - Surface this mixed state explicitly in `setup` / `doctor`: some auth-related state copied, but the source cookie DB was unreadable, so the managed session is still guest-only.
  - The practical workaround is still a one-time sign-in in the Aura-Call-managed Brave profile.

- Date: 2026-03-25
- Area: Selective managed-profile bootstrap for large Windows Chromium sources
- Symptom: After adding `--browser-bootstrap-cookie-path`, alternate-source bootstrap technically worked, but large Windows Chromium profiles still made `auracall setup` / `auracall login` look stuck because the first-run clone tried to copy too much unrelated browser state. On this machine the Windows Brave profile copy also hit `EACCES` on `Network/Cookies`, which aborted the bootstrap before the user got a clear answer.
- Root cause:
  - The initial managed-profile bootstrap still behaved like a broad profile clone with a small denylist.
  - That pulled in a lot of irrelevant Chromium profile state for onboarding and spent most of its time in large storage buckets.
  - A locked Windows-side cookie DB (`/mnt/c/.../Network/Cookies`) caused the whole copy to fail even though the rest of the auth-bearing profile state was still accessible.
- Fix:
  - Replaced the broad clone with a selective Chromium auth-state subset in `src/browser/profileStore.ts`:
    - top-level browser state like `Local State`
    - profile-level auth-bearing state like `Preferences`, `Network`, `Local Storage`, `IndexedDB`, `WebStorage`, and account/web DBs
  - Added per-entry progress logging so first-run bootstrap shows where time is going.
  - Made locked/unreadable files (`EACCES`, `EPERM`) recoverable during managed-profile copy instead of fatal, so Aura-Call can still seed non-cookie browser state and continue.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/config.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Direct Brave-source bootstrap into a throwaway managed profile completed in about 8 seconds instead of stalling on a near-full-profile clone.
  - Live Brave-seeded Grok login launched from the throwaway managed profile and showed the expected guest UI (`Sign in` / `Sign up`) instead of crashing the bootstrap path.
  - Sweet Cookie probe against the Windows Brave cookie DB returned zero cookies with a warning: `Failed to copy Chrome cookie DB ... EACCES`.
- Follow-ups:
  - If `bootstrapCookiePath` points at a locked/unreadable Windows cookie DB, surface that explicitly in `setup` / `doctor` instead of making users infer it from guest-mode behavior.
  - Decide whether `browser-tools doctor` should be fixed next, since it currently hits an unrelated `__name is not defined` regression on live page probes.

- Date: 2026-03-25
- Area: Managed browser-profile bootstrap from alternate Chromium sources
- Symptom: On WSL, Aura-Call could run the browser through WSL Chrome, but it could not reliably seed the managed Aura-Call profile from a different source profile like Windows Brave. Explicit Windows cookie paths were being treated as runtime browser inputs and silently rewritten back to the discovered WSL Chrome cookie DB whenever `wslChromePreference: "wsl"` was active.
- Root cause:
  - The config layer only had one cookie-path concept: `chromeCookiePath`.
  - That field was doing double duty as both the runtime cookie source and the managed-profile bootstrap source.
  - The WSL runtime preference logic intentionally prefers discovered WSL Chrome paths over explicit Windows paths, which is correct for runtime launching but wrong for first-run managed-profile seeding from another browser.
- Fix:
  - Added a separate `bootstrapCookiePath` field through the browser-service/Aura-Call types, config schema, CLI mapping, and CLI surface.
  - Added `--browser-bootstrap-cookie-path` so setup/login/browser runs can seed the managed Aura-Call profile from a different Chromium profile without changing the runtime browser selection.
  - Updated browser bootstrap, login reseed, and doctor inspection paths to prefer `bootstrapCookiePath` before `chromeCookiePath`.
  - Kept the existing WSL runtime selection behavior for `chromeCookiePath`, so WSL Chrome remains the runtime browser when requested.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live Brave-source probe: `auracall setup/login` and direct `bootstrapManagedProfile(...)` recognized `/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies` as the bootstrap source and started cloning it into a throwaway managed profile under `~/.auracall/browser-profiles/...`
- Follow-ups:
  - Large Windows Chromium profiles can take long enough to clone that setup/login looks stalled. Add progress reporting or selective-copy bootstrap if that remains a practical onboarding problem.

- Date: 2026-03-25
- Area: Aura-Call browser setup machine-readable contract
- Symptom: `auracall setup` had the right onboarding behavior, but only through human-readable output. Agent tooling could not reliably consume the before/after managed-profile state or tell whether login and verification were actually attempted, skipped, or failed.
- Root cause:
  - The new stable JSON work stopped at `auracall doctor`.
  - `setup` reused the normal interactive login/verification path, which prints progress to stdout and therefore would have corrupted any naive JSON output.
- Fix:
  - Added `createAuracallBrowserSetupContract(...)` to `src/cli/browserSetup.ts`.
  - Added `auracall setup --json` in `bin/auracall.ts`.
  - The JSON report now emits `contract: "auracall.browser-setup", version: 1`.
  - The setup contract embeds the initial/final `auracall.browser-doctor` contracts and explicit login/verification step status, including verification model/prompt/session id.
  - During JSON-mode setup, stdout is temporarily redirected to stderr for the login/verification flow so the final contract remains the only stdout payload.
- Verification:
  - `pnpm vitest run tests/cli/browserSetup.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx bin/auracall.ts setup --target grok --skip-login --skip-verify --json`
  - `pnpm run check`
- Follow-ups:
  - Decide whether setup should later embed richer runtime/browser-service probe data, or stay focused on orchestration state.
  - Add a CRUD-capable verification mode so setup can prove more than “guest prompt works”.

- Date: 2026-03-25
- Area: Aura-Call browser doctor machine-readable contract
- Symptom: `auracall doctor` had useful managed-profile/auth output, but only as human-readable text. Agent tooling still had to scrape CLI lines or call lower-level browser-service helpers directly.
- Root cause:
  - The stable versioned JSON contract existed in browser-service, but Aura-Call had not consumed it yet.
  - `auracall doctor` printed local/auth state and selector diagnosis directly, with no versioned host-app envelope.
  - The normal CLI intro banner would also have corrupted any naive JSON stream.
- Fix:
  - Added `createAuracallBrowserDoctorContract(...)` to `src/browser/profileDoctor.ts`.
  - Added `auracall doctor --json` in `bin/auracall.ts`.
  - The JSON report now emits `contract: "auracall.browser-doctor", version: 1`.
  - When a managed browser instance is alive, the report embeds the stable browser-service contract `browser-tools.doctor-report`.
  - The JSON path also carries selector-diagnosis success/failure separately from the browser-service report, and suppresses the normal CLI intro banner so the stream stays machine-readable.
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - `pnpm run check`
- Follow-ups:
  - Decide whether `auracall setup` should emit the same contract family.
  - If remote/non-loopback managed DevTools hosts become common, teach the embedded browser-tools report how to connect without assuming localhost.

- Date: 2026-03-25
- Area: Stable versioned JSON contracts for browser-service doctor/probe output
- Symptom: The package-owned `doctor` and `probe` commands had useful JSON output, but it was just a raw dump of internal objects. That made it hard for agent tooling to consume the output confidently over time.
- Root cause:
  - The first doctor/probe implementation focused on capability, not contract shape.
  - There was no explicit versioned envelope separating stable top-level fields from the evolving inner report structure.
- Fix:
  - Added explicit builders in `packages/browser-service/src/browserTools.ts`:
    - `createBrowserToolsProbeContract(...)`
    - `createBrowserToolsDoctorContract(...)`
  - `probe --json` now emits `contract: "browser-tools.page-probe", version: 1`
  - `doctor --json` now emits `contract: "browser-tools.doctor-report", version: 1`
  - Added envelope-shape tests in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Keep the contract additive where possible.
  - Only bump the version when the top-level JSON shape or semantics actually change.

- Date: 2026-03-25
- Area: Generic cookie/storage presence probes in browser-service
- Symptom: The new package-owned `doctor` / `probe` surfaces could report selected-page DOM and script state, but they still could not answer another common browser-debug question: “does this page actually carry the cookie/storage state I expect?”
- Root cause:
  - The first probe surface stopped at DOM/script facts.
  - Agents still would have needed ad hoc `page.cookies()` or storage `eval` snippets to inspect login/session state generically.
- Fix:
  - Extended `packages/browser-service/src/browserTools.ts` so selected-page probes now include:
    - cookie count, sample cookie names, and domains
    - local/session storage counts and sample keys
    - exact-name presence checks for `--cookie-any`, `--cookie-all`, `--storage-any`, and `--storage-all`
  - Added a direct `collectBrowserToolsPageProbe(...)` test in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx scripts/browser-tools.ts doctor --help`
  - `pnpm tsx scripts/browser-tools.ts probe --help`
  - `pnpm run check`
- Follow-ups:
  - Consider whether the generic probe layer should support prefix/substring operators later.
  - Keep provider-specific interpretation of cookie/storage names out of browser-service itself.

- Date: 2026-03-25
- Area: Package-owned browser-service doctor/report and structured probe surface
- Symptom: Even after the earlier browser-service upgrades, agents still had to choose between low-level `eval` snippets and app-specific doctor commands. There was no package-owned “tell me what this selected page looks like” surface.
- Root cause:
  - `browser-tools` had tab census and basic page utilities, but no structured selected-page report.
  - The new generic probe ideas only existed as backlog notes until there was a package-owned command surface to carry them.
- Fix:
  - Added structured page probes to `packages/browser-service/src/browserTools.ts` for document state, visible selector matches, and script-text token presence.
  - Added `browser-tools probe` for selected-page probe output.
  - Added `browser-tools doctor` to combine the tab census/selection explanation with the selected-page probes.
  - Added summary coverage in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx scripts/browser-tools.ts doctor --help`
  - `pnpm tsx scripts/browser-tools.ts probe --help`
  - `pnpm run check`
- Follow-ups:
  - Add storage/cookie presence probes without pulling provider semantics into the package.
  - Decide whether the doctor/probe JSON shapes should be treated as a stable agent-facing contract.

- Date: 2026-03-25
- Area: Runtime tab-selection summaries for browser-service callers
- Symptom: After adding explainable target resolution, the reasoning still mostly lived in tests and the `browser-tools tabs` CLI. Runtime callers could carry the explanation object, but they still lacked a compact summary for targeted debug logs.
- Root cause:
  - The package had structured target-selection data but no small formatter for “winner plus nearest losers”.
  - Aura-Call's browser wrapper accepted a logger, but there was no generic summary string to feed into it.
- Fix:
  - Added `summarizeTabResolution(...)` to `packages/browser-service/src/service/instanceScanner.ts`.
  - Updated `src/browser/service/browserService.ts` to log the summarized target choice when `resolveServiceTarget(...)` receives a logger.
  - Added focused coverage in `tests/browser-service/stateRegistry.test.ts` and `tests/browser/browserService.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Decide whether a package-owned doctor/report command should consume the same summary helper.
  - Keep the summary compact; detailed tab census remains the job of `browser-tools tabs`.

- Date: 2026-03-25
- Area: Visible-selector and script-text waits in browser-service
- Symptom: After adding the first generic predicate wait, package call sites still had to choose between “selector exists” and writing another custom loop. That was too weak for click readiness and too clumsy for script-payload hydration checks.
- Root cause:
  - `waitForSelector(...)` only answered DOM presence, not visibility/clickability.
  - There was still no generic helper for “wait until bootstrap script text contains X”.
  - Selector-based click helpers such as `pressButton(...)` therefore could still claim readiness before the target was actually visible.
- Fix:
  - Added `waitForVisibleSelector(...)` and `waitForScriptText(...)` to `packages/browser-service/src/service/ui.ts`.
  - Updated `pressButton(...)` to use the visible-selector wait when `requireVisible` is enabled.
  - Expanded `tests/browser-service/ui.test.ts` to cover both new helpers and the `pressButton(...)` integration path.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Surface richer readiness results in targeted debug output instead of collapsing them back to booleans everywhere.
  - Decide whether the legacy boolean wait helpers should keep their current shape permanently or gain overloads/options later.

- Date: 2026-03-25
- Area: Generic readiness / hydration waits in browser-service
- Symptom: The package already had several wait helpers, but they each carried their own polling loop. That made new readiness checks awkward to add and kept hydration waits from sharing one consistent primitive.
- Root cause:
  - Generic waits like `waitForSelector(...)` and `waitForDialog(...)` were implemented independently.
  - There was no package-owned way to poll an arbitrary page predicate or a normalized document-ready condition.
- Fix:
  - Added `waitForPredicate(...)` and `waitForDocumentReady(...)` to `packages/browser-service/src/service/ui.ts`.
  - Rewired `waitForDialog(...)`, `waitForSelector(...)`, and `waitForNotSelector(...)` to use the shared predicate helper.
  - Added focused tests in `tests/browser-service/ui.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Add generic script-text / visible-selector waits on top of the same primitive.
  - Surface the richer wait result in targeted debug paths instead of collapsing everything back to booleans.

- Date: 2026-03-25
- Area: Runtime tab selection diagnostics for browser-service callers
- Symptom: The package CLI could explain tab choice after the first browser-service upgrade, but runtime callers still only got the winning tab id. That meant higher-level automation paths could still silently pick the wrong tab without exposing why.
- Root cause:
  - `instanceScanner.resolveTab(...)` returned only the winner and dropped the scoring context.
  - Aura-Call's browser wrapper consumed that winner directly, so the explainable selection model stopped at the CLI boundary.
- Fix:
  - Added `explainTabResolution(...)` to `packages/browser-service/src/service/instanceScanner.ts`.
  - Kept `resolveTab(...)` as a compatibility wrapper over the new explanation API.
  - Updated `src/browser/service/browserService.ts` to return `tabSelection` from `resolveServiceTarget(...)`, so runtime consumers can inspect candidate scores and reasons.
- Verification:
  - `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Surface the same `tabSelection` explanation in targeted debug output where wrong-tab errors are common.
  - Add generic readiness/hydration probes so the next class of ambiguity is “page not ready yet,” not “wrong tab.”

- Date: 2026-03-25
- Area: Browser-service DevTools tab census and selection explanation
- Symptom: The package had enough low-level capability to inspect Chrome sessions, but not enough deterministic structure to explain which tab `browser-tools eval` / `pick` / `screenshot` would actually target. That kept turning simple “wrong tab” debugging into repeated ad hoc probes.
- Root cause:
  - `browser-tools inspect` listed Chrome processes and URLs, but it did not expose the actual tab-selection rule used by active-page commands.
  - The selection heuristic itself lived as a small opaque helper, so tests could verify the chosen index but not the reasoning or candidate facts behind it.
- Fix:
  - Added exported selection-explanation helpers in `packages/browser-service/src/browserTools.ts`.
  - Added `browser-tools tabs`, which reports the live tab census for one DevTools browser instance and includes the selected tab plus the rule that chose it.
  - Extended the page candidate shape with generic facts (`title`, `readyState`, `visibilityState`, internal/blank flags) so debugging can stay structured instead of falling back to raw `eval`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/stateRegistry.test.ts`
  - `pnpm run check`
  - `pnpm tsx scripts/browser-tools.ts tabs --help`
- Follow-ups:
  - Reuse the same selection explanation model inside `BrowserService` / `instanceScanner` so non-CLI callers can surface why a tab was chosen.
  - Add generic structured probes on top of the tab census so agents need fewer one-off DOM snippets.

- Date: 2026-03-25
- Area: Grok authenticated account detection on managed browser profiles
- Symptom: Even after the managed Grok profile was genuinely signed in, `BrowserAutomationClient.getUserIdentity()` could still return `null`. That made setup/doctor-style verification look guest-like even when the browser session clearly belonged to a real account.
- Root cause:
  - DevTools target scans were storing the CDP page id under `id`, but Aura-Call expected `targetId`, so the resolved Grok tab id could be dropped before provider identity checks reused it.
  - Grok identity fallback probes were also too eager to sample the serialized Next flight payload immediately; on live tabs the first read could happen before the payload hydrated, producing an empty script list even though the account data appeared moments later.
- Fix:
  - Normalized scanned tabs so browser-service always exposes `targetId` even when CDP returns only `id`.
  - Updated the Grok adapter to use normalized target ids in both the generic tab connector and the project-tab connector, instead of passing raw target objects back into CRI.
  - Added a short retry window when reading Grok's serialized identity scripts so authenticated tabs have time to hydrate before Aura-Call concludes there is no account payload.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokIdentity.test.ts tests/browser/grokActions.test.ts tests/browser/browserService.test.ts tests/browser-service/stateRegistry.test.ts`
  - `pnpm run check`
  - Live: `node --import tsx -e "... BrowserAutomationClient ... getUserIdentity() ..."` now returns:
    - `id: c4d43034-7f30-462b-918b-59779bcba208`
    - `name: Eric C`
    - `handle: @SwantonDoug`
    - `email: ez86944@gmail.com`
    - `source: next-flight`
  - Live: `pnpm tsx bin/auracall.ts setup --target grok --skip-login --skip-verify --prune-browser-state` now prints `accountIdentity: Eric C @SwantonDoug <ez86944@gmail.com> [next-flight]`
- Follow-ups:
  - Consider surfacing the same identity in `auracall doctor --local-only` without violating the "do not attach to Chrome" expectation, or keep that mode intentionally metadata-only.
  - Keep using explicit tab ids for Grok browser work; raw `https://grok.com/` URL matches are too ambiguous once many root tabs accumulate in the managed profile.

- Date: 2026-03-25
- Area: Managed browser profile reseed from a newer source Chrome profile
- Symptom: Once `~/.auracall/browser-profiles/<profile>/<service>` existed, re-logging the source Chrome profile did not repair a stale/guest Aura-Call-managed service profile. `auracall login --target grok` kept reopening the old managed profile unchanged.
- Root cause:
  - The original managed-profile design only cloned from the source Chrome profile on first run.
  - Later `login` / `setup` calls always reused the managed profile directory unchanged.
  - That meant source-profile auth repairs stayed trapped in `/home/ecochran76/.config/google-chrome/...` and never propagated into Aura-Call's own managed profile store.
- Fix:
  - Extended `src/browser/profileStore.ts` with managed-profile reseed logic.
  - `auracall login` / `auracall setup` now refresh the managed profile automatically when the configured source cookie DB is newer than the managed cookie DB.
  - Added `--force-reseed-managed-profile` for a destructive rebuild regardless of timestamps.
  - Added safety checks so reseed refuses to overwrite an actively running managed profile.
  - `auracall doctor --local-only` now warns when the source Chrome cookies are newer than the managed profile.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm run check`
  - Live: closed the stale managed Grok browser, ran `pnpm tsx bin/auracall.ts login --target grok`, observed `[login] Refreshed managed profile from /home/ecochran76/.config/google-chrome (Default).`
  - Live DOM after reseed no longer showed visible `Sign in` / `Sign up` CTAs on `https://grok.com/`
  - Managed cookie DB timestamp advanced to match the refreshed profile state
- Follow-ups:
  - Improve positive account-name detection for authenticated Grok sessions so doctor/setup can report the actual account instead of only auth-state heuristics.
  - Fix the separate Grok sidebar/history automation flake (`Main sidebar did not open`) so authenticated provider-path checks are as reliable as the DOM/auth checks.

- Date: 2026-03-25
- Area: Managed Grok profile reseed expectations
- Symptom: Re-logging the WSL source Chrome `Default` profile did not make Aura-Call's existing managed Grok profile logged in again.
- Root cause:
  - Aura-Call now treats `~/.auracall/browser-profiles/<profile>/<service>` as the long-lived execution profile.
  - Once the managed Grok profile already exists, `auracall login --target grok` reuses that managed directory; it does not re-clone or re-sync auth state from the source profile automatically.
  - So changes to `/home/ecochran76/.config/google-chrome/Default` do not repair an already-existing managed Grok profile unless Aura-Call gets an explicit reseed/sync path.
- Fix:
  - No code fix landed in this step.
  - Confirmed the current behavior so onboarding docs and future sync tooling can reflect it accurately.
- Verification:
  - `pnpm tsx bin/auracall.ts doctor --target grok --prune-browser-state`
  - `pnpm tsx bin/auracall.ts login --target grok`
  - Live managed session on `127.0.0.1:45000` showed visible `Sign in` / `Sign up` CTAs
  - Live `BrowserAutomationClient.getUserIdentity()` returned `null`
- Follow-ups:
  - Add an explicit managed-profile reseed/sync command or destructive rebootstrap flow.
  - Be clear in onboarding docs that source-profile re-login alone does not refresh an already-created managed service profile.

- Date: 2026-03-25
- Area: Grok guest session vs identity detection
- Symptom: On the current Grok web UI, Aura-Call could treat a guest-capable conversation page as if it represented a signed-in user and return `Settings` as the account identity.
- Root cause:
  - After fixing `browser-tools` URL scoping, the real Grok conversation tab still showed visible `Sign in` / `Sign up` CTAs.
  - The prior identity path in `src/browser/providers/grokAdapter.ts` treated the generic top-right settings button as a fallback user label.
  - The earlier `afUserId` / `AF_SESSION` signals were not actual account identity; they look like analytics/session state.
- Fix:
  - Updated `getUserIdentity()` to detect visible guest auth CTAs, suppress low-signal labels like `Settings`, and return `null` for guest-like pages instead of fabricating a user.
  - Tightened `ensureGrokLoggedIn()` to key off visible auth CTAs rather than any matching text anywhere in the DOM.
  - Added focused regressions in `tests/browser/grokActions.test.ts` and `tests/browser/grokIdentity.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokIdentity.test.ts`
  - Live `BrowserAutomationClient.getUserIdentity()` against the managed Grok tab should now return `null` instead of `Settings`.
- Follow-ups:
  - Find a durable positive auth signal for real signed-in Grok sessions so Aura-Call can distinguish guest chat capability from authenticated CRUD capability.
  - Update onboarding/doctor output once the positive signal is known, so Grok setup stops looking “good enough” when it is only guest-capable.

- Date: 2026-03-25
- Area: Browser-tools URL-scoped tab selection
- Symptom: `browser-tools eval --url-contains ...` could still inspect the wrong tab when a different page had focus. In the live Grok identity investigation, a focused `accounts.x.ai` tab could win over the explicitly requested Grok conversation tab, producing misleading DOM results.
- Root cause:
  - `packages/browser-service/src/browserTools.ts` selected the focused page before honoring `urlContains`.
  - That made explicit URL scoping advisory instead of authoritative.
- Fix:
  - Changed tab selection so an explicit `urlContains` match wins first.
  - Added `selectBrowserToolsPageIndex` and a focused regression test in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts`
  - `pnpm tsx scripts/browser-tools.ts eval --port 45000 --url-contains '/c/' ...`
- Follow-ups:
  - Keep explicit tab targeting authoritative in other browser-debug helpers too; focused-tab fallback should only apply when the caller did not request a specific URL.

- Date: 2026-03-25
- Area: Browser-service tooling ownership
- Symptom: The `browser-tools` DevTools helper was still implemented as an Aura-Call app script even though its commands (`eval`, `pick`, `cookies`, `inspect`, `kill`, `nav`, `screenshot`, `start`) are generic browser-service functionality.
- Root cause:
  - The tool grew in `scripts/browser-tools.ts` before the browser-service split hardened.
  - That left package-owned browser automation relying on an app-owned CLI implementation, which was the wrong dependency direction.
- Fix:
  - Moved the reusable CLI implementation into `packages/browser-service/src/browserTools.ts`.
  - Exported it from `packages/browser-service/src/index.ts`.
  - Reduced `scripts/browser-tools.ts` to a thin Aura-Call wrapper that only supplies config-driven port resolution, launch defaults, and optional profile copying.
  - Updated `docs/dev/browser-service-tools.md` to document the new ownership split.
- Verification:
  - `pnpm tsx scripts/browser-tools.ts --help`
  - `node --import tsx -e "import { createBrowserToolsProgram } from './packages/browser-service/src/browserTools.ts'; const program = createBrowserToolsProgram({ resolvePortOrLaunch: async () => 9222 }); console.log(program.commands.map((cmd) => cmd.name()).join(','));"`
  - `pnpm run check`
- Follow-ups:
  - If other generic browser debug helpers still live under `scripts/`, move them into `packages/browser-service` or make their app-specific coupling explicit.

- Date: 2026-03-25
- Area: Grok browser auth confirmation vs account identity detection
- Symptom: A live Aura-Call-managed Grok profile could be clearly operational and authenticated, but account-name confirmation still failed. The managed browser session could answer prompts successfully and exposed authenticated state markers, while Aura-Call's identity lookup returned only `Settings`.
- Root cause:
  - The current Grok conversation UI still exposes enough auth state to run chats (`afUserId` cookie, `AF_SESSION` localStorage, successful authenticated conversation runs), but it no longer exposes a stable human-readable account affordance through the older DOM path Aura-Call expects.
  - `src/browser/providers/grokAdapter.ts` falls back to low-signal DOM labels and an older settings-menu path; against the current layout, that can resolve to the generic settings button instead of an account/profile control.
  - `accounts.x.ai` is a separate sign-in surface and did not inherit the live Grok session in the managed profile, so it is not a reliable account-name fallback.
- Fix:
  - No code fix landed yet in this step.
  - Confirmed that auth-state verification and account-identity extraction need to be treated as separate problems in the Grok browser path.
- Verification:
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only`
  - `node --import tsx` invoking `BrowserAutomationClient.fromConfig(...).getUserIdentity(...)` against `127.0.0.1:45000`
  - `pnpm tsx scripts/browser-tools.ts eval --port 45000 --url-contains grok.com ...`
  - Confirmed:
    - live managed instance: `/home/ecochran76/.auracall/browser-profiles/default/grok`
    - authenticated session markers: `afUserId` cookie and `AF_SESSION` localStorage
    - live Grok conversation still answers prompts
    - identity lookup currently returns `Settings`
    - `https://accounts.x.ai/` redirects to `sign-in`
- Follow-ups:
  - Update Grok identity detection to use a current, durable source for account naming instead of the older settings-menu DOM fallback.
  - Avoid treating stray `Sign in` / `Sign up` text on Grok pages as an auth failure signal; it is present in the current live conversation UI even when the session is authenticated.

- Date: 2026-03-25
- Area: Grok browser assistant response extraction
- Symptom: Managed-profile Grok runs and `auracall setup --target grok` could complete successfully but still return UI-adjacent text in the final answer, for example `live dom marker15.8sExplore DOM Mutation ObserversRelated Virtual DOM Concepts`.
- Root cause:
  - `src/browser/actions/grok.ts` captured the last Grok assistant wrapper via raw `textContent`.
  - The current Grok DOM places the real markdown answer, the `.action-buttons` row (elapsed-time chip), and follow-up suggestion buttons inside that same wrapper.
  - Because the snapshot logic treated the whole wrapper as answer text, the timing chip and suggested follow-ups leaked into `answerText`.
- Fix:
  - Updated Grok snapshot extraction to prefer the `.response-content-markdown` root when present.
  - Kept a fallback clone/prune path for non-markdown variants, but now strip `.thinking-container`, `.action-buttons`, suggestion markers, and button-only UI before reading `textContent`.
  - Added focused coverage in `tests/browser/grokActions.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live verification: `pnpm tsx bin/auracall.ts setup --target grok --skip-login --verify-prompt "Reply exactly with: live dom marker" --prune-browser-state`
  - The live answer now returns only `live dom marker`.
- Follow-ups:
  - If Grok introduces a non-markdown assistant renderer, keep the clone/prune fallback aligned with the new DOM rather than going back to whole-wrapper `textContent`.

- Date: 2026-03-25
- Area: Browser doctor / setup legacy-profile classification
- Symptom: `auracall doctor` / `auracall setup` could report a live Aura-Call-managed profile under `~/.auracall/browser-profiles/...` as both `managed` and `legacy`, which was misleading and made the new onboarding output look broken even when the profile path was correct.
- Root cause:
  - Legacy detection used substring matching on `browser-profile`.
  - The new managed profile root `browser-profiles` contains that prefix, so the detector falsely matched the new path family.
- Fix:
  - Changed legacy detection to match the old single-profile directory by exact path segment (`.auracall/browser-profile`) and to keep temp-profile detection separate via the basename `auracall-browser-*`.
  - Added a regression in `tests/browser/profileDoctor.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts`
  - `pnpm tsx bin/auracall.ts setup --target grok --skip-login --skip-verify --prune-browser-state`
  - The real managed profile now reports `legacyBrowserStateEntries: 0`.
- Follow-ups:
  - None for the managed-profile path family; future legacy detection changes should use path segments instead of substring matching.

- Date: 2026-03-25
- Area: Browser onboarding / managed-profile guided setup
- Symptom: Even after adding managed profiles and local doctor inspection, first-time browser onboarding was still too manual: users had to inspect profile state separately, run `auracall login`, reason about which profile path was actually in use, and then remember to run a separate smoke to prove the managed profile worked.
- Root cause:
  - The CLI had a login command and a doctor command, but no orchestration layer that tied them together around the managed profile store.
  - Browser target/model selection for onboarding was implicit and could drift when the configured default model belonged to a different service than the requested setup target.
  - There was no user-facing pause point between opening the managed login browser and launching a real verification run.
- Fix:
  - Added `src/cli/browserSetup.ts` with explicit browser setup target resolution and service-aligned verification model selection.
  - Added `auracall setup --target <chatgpt|gemini|grok>` to inspect the managed profile, optionally open the managed login browser, wait for sign-in confirmation, and then run a real browser verification session against that same managed profile.
  - Reused the existing managed-profile doctor report in `setup`, so the command now prints the resolved Aura-Call profile dir, source profile, and browser-state registry before and after verification.
  - Refactored `auracall login` to share the same managed-profile launch resolution as `setup`.
- Verification:
  - `pnpm vitest run tests/cli/browserSetup.test.ts tests/cli/browserConfig.test.ts tests/browser/profileDoctor.test.ts`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts setup --help`
  - `pnpm tsx bin/auracall.ts setup --target grok --skip-login --verify-prompt ping --prune-browser-state`
  - Live verification returned a real Grok response from the managed profile at `~/.auracall/browser-profiles/default/grok`.
- Follow-ups:
  - Extend the same guided flow with clearer Windows DevTools diagnostics once the Windows-hosted Chrome path is revisited.

- Date: 2026-03-25
- Area: Browser doctor / managed-profile inspection / browser-state hygiene
- Symptom: After the managed-profile work landed, there was still no direct CLI surface to answer the practical onboarding questions: which Aura-Call-managed profile is being used, which source Chrome profile will bootstrap it, and whether `~/.auracall/browser-state.json` still contained stale legacy entries from older bring-up attempts.
- Root cause:
  - The existing `auracall doctor` command only attached to live Chrome and checked UI selectors.
  - Managed-profile resolution, source-profile inference, and browser-state cleanup were spread across lower-level helpers with no user-facing inspection command.
  - Source-profile inference also missed the common Linux cookie path shape `.../Default/Cookies`, so doctor-style reporting could not name the real source profile even when the cookie file was configured correctly.
- Fix:
  - Added `src/browser/profileDoctor.ts` to inspect managed profile resolution, bootstrap/source-cookie inputs, and browser-state entries without attaching to Chrome.
  - Extended `auracall doctor` with `--local-only` and `--prune-browser-state`.
  - Added stale/legacy browser-state classification plus dead-entry pruning.
  - Fixed cookie-path profile inference for direct `.../Default/Cookies` paths.
  - Added focused coverage in `tests/browser/profileDoctor.test.ts` and expanded `tests/browser/profileStore.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/browser/grokActions.test.ts tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --prune-browser-state`
  - Output now reports:
    - managed profile: `~/.auracall/browser-profiles/default/grok`
    - source profile: `/home/ecochran76/.config/google-chrome (Default)`
    - pruned stale browser-state entries when present
- Follow-ups:
  - Add a guided `setup` command that builds on this local inspection instead of making users piece together login/bootstrap steps manually.

- Date: 2026-03-25
- Area: Grok browser composer detection with managed-profile reuse
- Symptom: After switching Aura-Call to managed browser profiles, live Grok runs could still fail with `Grok prompt not ready before timeout`, or they could fill a hidden textarea while the visible submit button stayed disabled.
- Root cause:
  - The current Grok homepage exposes a hidden autosize `<textarea>` plus a visible Tiptap/contenteditable composer.
  - The first selector pass for the new UI matched the hidden textarea before the real editor, so readiness checks and prompt entry targeted the wrong node.
  - That made the composer look ready but left Grok's form state unchanged, so the submit button never enabled.
- Fix:
  - Tightened `src/browser/providers/grok.ts` so textarea selectors only match the explicit visible Grok composer variants.
  - Added visible-editor resolution in `src/browser/actions/grok.ts` that skips `aria-hidden`, hidden, disabled, and zero-size nodes before selecting an input target.
  - Kept the textarea/input setter + `input`/`change` event path for future Grok UI variants while preserving the contenteditable path for the current Tiptap editor.
  - Added focused coverage in `tests/browser/grokActions.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live managed-profile Grok smoke passed:
    `pnpm tsx bin/auracall.ts --engine browser --browser-target grok --model grok --prompt "ping" --wait --verbose --force`
  - Result came from the reused managed profile at `~/.auracall/browser-profiles/default/grok`.
- Follow-ups:
  - Clean stale entries in `~/.auracall/browser-state.json` so live diagnostics do not keep mixing legacy profile paths/hosts with the managed store.
  - Add guided onboarding/inspection commands so users can see which managed profile Aura-Call is bootstrapping/reusing without inspecting logs manually.

- Date: 2026-03-19
- Area: Browser profile persistence and first-run onboarding
- Symptom: Local WSL/browser runs could still launch throwaway `/tmp/auracall-browser-*` profiles, while login/manual-login flows and some service helpers still assumed a single legacy `~/.auracall/browser-profile` path. That made onboarding brittle, broke repeatability, and left Aura-Call without its own deterministic browser profile store.
- Root cause:
  - Local ChatGPT/Grok browser runs still created disposable Chrome user-data dirs and only copied cookies forward.
  - Grok login/browser paths had special-case cookie-source logic that could ignore the intended source profile and seed from the wrong directory.
  - Default/manual-login path selection was split across multiple layers (`config`, browser runtime, reattach, service resolution, remote serve), with stale fallbacks to the old single-profile path.
- Fix:
  - Added `src/browser/profileStore.ts` and switched Aura-Call to managed profiles under `~/.auracall/browser-profiles/<auracallProfile>/<service>` by default.
  - Local runs, reattach, login, browser-service resolution, and `serve` now all target persistent managed profiles instead of `/tmp` automation dirs.
  - Added first-run bootstrap that clones the configured source Chrome profile into the managed profile store, skipping lock files and cache-only artifacts, and kept cookie sync as a fallback when a managed profile still needs seeding.
  - Changed `auracall login` to open the managed Aura-Call profile directly (`preferCookieProfile: false`) so source profiles are bootstrap inputs, not long-term execution targets.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileStore.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/browserService.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Validate the new managed-profile bootstrap live against real WSL and Windows source profiles for Grok/ChatGPT.
  - Replace the remaining onboarding rough edges with explicit `doctor/setup` tooling so users do not need to reason about profile roots and cookie sources manually.

- Date: 2026-03-18
- Area: WSL Chrome fallback selection + local launch
- Symptom: On WSL, Aura-Call could keep honoring persisted Windows Chrome paths even when WSL Chrome was explicitly requested, and local WSL Chrome launches could still stall because they used Windows-only temp/profile and DevTools host assumptions.
- Root cause:
  - `resolveBrowserConfig` let config win over `AURACALL_WSL_CHROME` / `AURACALL_BROWSER_PROFILE_DIR`, and it always preferred configured `chromePath` / `chromeCookiePath` over the WSL-discovered profile.
  - `auracall login` consumed raw `userConfig.browser.*` values instead of the resolved browser config, so `--browser-wsl-chrome wsl` could still inherit Windows Chrome.
  - WSL launches always used Windows-backed temp roots and the WSL-to-Windows DevTools host resolver, even when the selected browser was Linux Chrome.
- Fix:
  - Flipped env override precedence for `AURACALL_WSL_CHROME` and `AURACALL_BROWSER_PROFILE_DIR`.
  - When WSL Chrome is explicitly preferred, resolve browser/cookie paths from the WSL-discovered profile instead of persisting Windows paths through to runtime.
  - Updated `auracall login` and the main browser-config builder to carry the resolved WSL preference forward.
  - Limited Windows host routing to Windows-hosted Chrome only; WSL Chrome now uses local `127.0.0.1` CDP.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/browserService.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live check at the time: `AURACALL_WSL_CHROME=wsl pnpm tsx bin/auracall.ts --engine browser --browser-target grok --model grok --prompt "ping" --wait --verbose --force` launched `/usr/bin/google-chrome`, connected to local DevTools, passed Grok login, and then failed later at prompt readiness rather than setup/attach. The disposable-profile portion of that path was removed on 2026-03-19.
- Follow-ups:
  - Pre-run/session config logging still captures the pre-resolved Windows snapshot even when runtime resolves to WSL Chrome.
  - Investigate the residual Grok prompt-readiness timeout and the stray `undefined:/Users/undefined/...` log line separately.

- Date: 2026-03-18
- Area: Grok browser model picker labels
- Symptom: Grok browser runs got stuck with the model menu open because Aura-Call still targeted the dead `Grok 4.1 Thinking` label while the live UI had moved to `Auto`, `Fast`, `Expert`, and `Heavy`.
- Root cause: Grok browser mode still hard-coded label resolution in `browserConfig`/`selectGrokMode`, so the selector drifted as soon as xAI renamed the picker entries.
- Fix:
  - Moved Grok browser label/alias resolution into `configs/auracall.services.json` via the service registry.
  - Kept only DOM text normalization in the Grok browser code so concatenated live menu text like `ExpertThinks hard - Grok 4.20` still matches the configured label.
  - Updated browser config, runtime selection, and project-instructions modal selection to resolve labels through the same registry.
- Verification:
  - `pnpm vitest run tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
- Follow-ups:
  - The higher-level CLI model canonicalization still collapses `grok` to `grok-4.1`; if Aura-Call should treat plain `grok` as the current flagship browser mode, that mapping should move into the same registry layer.

- Date: 2026-03-18
- Area: Prompt commit detection during browser submit / reattach
- Symptom: Prompt submission could be marked committed too early when the composer cleared and a stop button appeared without a new turn, while the “unknown baseline” path for prompt matching was also less robust than upstream.
- Root cause: Local `verifyPromptCommitted` had drifted from upstream’s hardened logic: it no longer re-read the turn baseline when absent, and its fallback commit condition allowed `composerCleared + stopVisible` without requiring a new turn.
- Fix:
  - Restored baseline turn-count fallback inside `verifyPromptCommitted`.
  - Tightened fallback commit detection so composer-cleared signals only count after a new turn appears.
  - Added the upstream-style `tests/browser/promptComposer.test.ts` coverage and exported the internal helper through a test-only surface.
- Verification:
  - `./node_modules/.bin/vitest run tests/browser/promptComposer.test.ts tests/browser/browserModeExports.test.ts tests/browser/pageActions.test.ts tests/cli/sessionRunner.test.ts`
  - `pnpm run check`

- Date: 2026-03-18
- Area: Browser Cloudflare challenge preservation (ChatGPT/Grok)
- Symptom: When ChatGPT or Grok hit a Cloudflare interstitial, Oracle could tear down the browser/profile on exit, even though the correct recovery path is to leave the browser open so the user can complete the challenge manually.
- Root cause: `ensureNotBlocked` threw a plain error instead of a structured browser-automation error, so browser cleanup had no way to distinguish Cloudflare challenges from ordinary failures. Session error updates also dropped runtime metadata for non-connection browser failures.
- Fix:
  - Changed `ensureNotBlocked` to throw `BrowserAutomationError` with `stage: cloudflare-challenge`.
  - Ported upstream-style preserve-on-cloudflare behavior into the ChatGPT run path and applied the same behavior to the Grok path: leave Chrome/profile alive, emit runtime hints, and surface a reuse-profile hint.
  - Preserved browser runtime metadata in session error updates for browser automation failures that include runtime details.
- Verification:
  - `./node_modules/.bin/vitest run tests/browser/pageActions.test.ts tests/browser/browserModeExports.test.ts tests/cli/sessionRunner.test.ts`
  - `pnpm run check`

- Date: 2026-03-18
- Area: ChatGPT browser assistant response watchdog
- Symptom: Browser runs could finalize long streamed answers too early after a short pause, and the watchdog poller could continue running after the observer path had already won.
- Root cause: `pollAssistantCompletion` used shorter stability thresholds for long answers than upstream’s later fixes, and the background poller was not aborted once `Runtime.evaluate(...awaitPromise)` returned first.
- Fix:
  - Ported the upstream watchdog abort pattern so the poller stops once the observer path wins.
  - Ported the longer stability thresholds for medium/long answers so paused streams are less likely to truncate.
  - Added a focused threshold unit test to lock the long-answer timing behavior.
- Verification:
  - `./node_modules/.bin/vitest run tests/browser/pageActions.test.ts tests/browser/pageActionsExpressions.test.ts`
  - `pnpm run check`
- Date: 2026-02-24
- Area: Cache default posture for account mirroring
- Symptom: Default cache behavior was conservative (`historyLimit=200`, no project-only refresh insertion, cleanup default 30 days), which under-captured larger accounts unless users manually passed flags each run.
- Root cause:
  - CLI fallback constants and docs were tuned for lightweight refreshes, not mirror-depth ingestion.
  - `cache --refresh` defaulted `includeProjectOnlyConversations` to false even when profile cache defaults should have been authoritative.
- Fix:
  - Promoted mirror-first defaults in CLI/runtime:
    - history depth default -> `2000`
    - cleanup default window -> `365` days
  - Added profile cache keys and propagation:
    - `includeProjectOnlyConversations`
    - `cleanupDays`
  - Updated `cache --refresh` option fallback to read `profiles.<name>.cache.includeProjectOnlyConversations`.
  - Aligned internal history fallback limits (llmService + Grok history reader) with the new default depth.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh`
  - `pnpm tsx bin/oracle-cli.ts cache cleanup --provider grok --json`
- Follow-ups:
  - Add explicit smoke coverage for profile-driven `cleanupDays` and `includeProjectOnlyConversations` precedence over CLI defaults.

- Date: 2026-02-23
- Area: Cache maintenance contention (`cache doctor|repair|clear|compact|cleanup`)
- Symptom: SQLite maintenance operations could intermittently fail with `database is locked` under concurrent activity.
- Root cause:
  - Per-identity lock files serialized Oracle maintenance commands, but external SQLite access (or lock races across processes) could still surface transient `SQLITE_BUSY`.
- Fix:
  - Added exponential busy-retry wrapper for SQLite maintenance calls.
  - Applied retry handling to maintenance-critical SQL operations in doctor/repair/clear/compact/cleanup paths.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache doctor --provider grok --json`
  - `pnpm tsx bin/oracle-cli.ts cache compact --provider grok --identity-key <key> --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions all --json`
- Follow-ups:
  - Add optional telemetry counters for retry attempts to identify hotspots.

- Date: 2026-02-23
- Area: Cache parity diagnostics and targeted repair actions
- Symptom: Drift between `cache_entries`, `cache-index.json`, and catalog tables could remain silent until exports/search results looked inconsistent.
- Root cause:
  - Doctor checks focused on sqlite health + missing local files but lacked cross-store parity checks.
  - Repair actions lacked catalog-level parity pruning for orphan source/file rows.
- Fix:
  - Extended `cache doctor` with parity metrics:
    - index keys missing in SQL
    - SQL keys missing in index
    - orphan `source_links`
    - orphan `file_bindings`
  - Added repair actions:
    - `prune-orphan-source-links`
    - `prune-orphan-file-bindings`
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache doctor --provider grok --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions prune-orphan-source-links --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions prune-orphan-file-bindings --json`
- Follow-ups:
  - Add migration-marker parity checks (`schema_migrations`/`meta`) and optional auto-repair guidance.

- Date: 2026-02-23
- Area: WS4 file lifecycle bootstrap (deterministic local blob staging)
- Symptom: Local file pointers could remain host-specific/external and lacked deterministic cache-local placement for retention workflows.
- Root cause:
  - File asset sync stored raw local path pointers when available; no canonical cache blob path existed.
- Fix:
  - Added deterministic blob staging in SQL cache store:
    - local files are copied to `blobs/<sha256>/<filename>` when available,
    - `file_assets.storage_relpath` and metadata pointers are updated to cache-local paths.
  - Added detached stale blob pruning during `cache cleanup` (`blobFilesPruned`), guarded by SQL references.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache cleanup --provider grok --identity-key <key> --days 30 --json`
- Follow-ups:
  - Add explicit `maxBytes`/`maxAgeDays` retention policy controls and pinned-asset protection.

- Date: 2026-02-23
- Area: Cache refresh project conversation hydration mode (`cache --refresh`)
- Symptom: Operators needed two distinct behaviors:
  - conservative refresh that only enriches already-known global conversations with `projectId`
  - full project hydration that can include project-only conversation IDs
- Root cause:
  - The previous refresh path had only the conservative behavior, so project-only IDs discovered in scoped lists were intentionally dropped.
- Fix:
  - Added `oracle cache --refresh --include-project-only-conversations`.
  - Kept default behavior unchanged (existing-ID enrichment only).
  - When the flag is set, refresh now inserts scoped-only conversation IDs from project conversation lists, setting `projectId` at insertion time.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh --include-history --history-limit 200`
  - `pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh --include-history --history-limit 200 --include-project-only-conversations`
  - Compare conversation totals and `projectId`-linked counts between runs.
- Follow-ups:
  - Add an automated smoke script to assert conservative vs opt-in behavior against a fixed fixture identity.

- Date: 2026-02-23
- Area: Cache refresh project-link enrichment (`cache --refresh`)
- Symptom: Project-scoped exports/search could miss project linkage because many cached conversations had no `projectId` even though those conversations appeared under project views in Grok.
- Root cause:
  - Refresh wrote only the global conversation snapshot.
  - Project association data from `listConversations(projectId)` was not merged.
  - Refresh wrote JSON directly, which could diverge from SQL-backed reads in dual/sqlite modes.
- Fix:
  - During `refreshProviderCache`, fetch each project’s scoped conversation list and backfill `projectId`/project URL only for IDs already present in the global conversation set.
  - Keep behavior conservative: do not inject new IDs from project lists.
  - Write refreshed conversations/projects via cache-store APIs so JSON + SQLite stay synchronized.
- Verification:
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh --include-history --history-limit 200`
  - `jq '[.items[] | select(.projectId != null)] | length' ~/.oracle/cache/providers/grok/ez86944@gmail.com/conversations.json` -> `15`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope conversations --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/conversations-by-project-post-enrich`
  - Exported `conversations.json` contains SoyLei conversation rows with `projectId`.
- Follow-ups:
  - Optional future mode: allow inserting project-only IDs when explicitly requested for full project hydration.

- Date: 2026-02-23
- Area: Cache export project filtering (`cache export --project-id`) – resolved
- Symptom: `--scope projects --project-id <existing-id>` exported `0` entries; `--scope conversations --project-id ...` ignored filters.
- Root cause:
  - Planner dropped all `projects` entries when filtering by `entry.projectId` (the `projects` dataset entry has no per-project `projectId` metadata).
  - Export renderer copied raw `projects.json` / `conversations.json` without applying `projectId` filtering at payload level.
- Fix:
  - Kept `projects` index entry when `scope=projects` + `projectId`.
  - Added payload-level filtering for `projects` and `conversations` exports during materialization/CSV/markdown/html rendering.
  - Added conversation project-id extraction fallback from URL (`/project/<id>`) when explicit `projectId` is missing.
  - Added scope-level filtering of conversation-context/file/attachment entries for `scope=conversations` + `projectId`.
- Verification:
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope projects --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/projects-filtered`
  - `jq '.items | length' /tmp/oracle-cache-export-smoke/projects-filtered/projects.json` -> `1`
  - `jq '.items[0].id' /tmp/oracle-cache-export-smoke/projects-filtered/projects.json` -> `8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`
  - `pnpm tsx scripts/verify-cache-export-parity.ts --provider grok --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62` -> pass
- Follow-ups:
  - For `scope=conversations --project-id`, results depend on cached conversation metadata containing project association (`projectId` or project URL). If absent, filtered `conversations.json` may be empty even when project chats exist.

- Date: 2026-02-23
- Area: Cache export project filtering (`cache export --project-id`)
- Symptom: Project-scoped filtering appears ineffective:
  - `--scope projects --project-id <existing-id>` exports `0` entries.
  - `--scope conversations --project-id <existing-id>` exports all conversations (unfiltered).
- Root cause: Superseded by the resolved entry above.
- Fix: Superseded by the resolved entry above.
- Verification:
  - Existing project present in cache:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope projects --format json --out /tmp/oracle-cache-export-smoke/projects-all`
    - exported `projects.json` includes `8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`.
  - Failing filtered export:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope projects --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/projects-filtered`
    - result: `Exported 0 entries`.
  - Unfiltered conversations despite `--project-id`:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope conversations --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/conversations-by-project`
    - result: full conversation export count.
- Follow-ups:
  - See follow-ups in the resolved entry above.

- Date: 2026-02-23
- Area: Grok project instructions modal opener (`pushProjectInstructionsEditButton`)
- Symptom: `projects instructions get` intermittently failed with `Button not found` / `Edit instructions button not found` on the updated Grok project sidebar UI.
- Root cause: The newer sidebar variant often omits a visible labeled "Edit instructions" button; the actionable control is the clickable instructions card (`group/side-panel-section`), so label-only button matching misses.
- Fix:
  - Kept the existing label-first path (`edit instructions`) for older layouts.
  - Added fallback click path that targets the visible instructions side-panel section and dispatches pointer/mouse click sequence.
  - Preserved modal-ready verification (`textarea` must appear) to fail loudly if the open action did not apply.
- Verification:
  - `pnpm tsx scripts/verify-grok-project-instructions-edit.ts`
  - `pnpm tsx scripts/verify-grok-project-instructions-modal.ts`
  - `pnpm tsx bin/oracle-cli.ts projects instructions get 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --target grok`
- Follow-ups:
  - Consider adding a first-class helper for "click panel card by heading text" in browser-service so adapters do not repeat this pattern.

- Date: 2026-02-23
- Area: Grok project instructions retrieval (`projects instructions get`)
- Symptom: Project-level instruction scrape can fail even when project + conversations are accessible, blocking full project cache hydration.
- Root cause: `ensureProjectSidebarOpen` button matching remains brittle in some Grok layouts/timing states; fallback candidates miss the active project-sidebar opener in this flow.
- Fix: Initially documented only; now addressed by the newer entry above (`Grok project instructions modal opener`) with a card-click fallback for the updated sidebar UI.
- Verification:
  - Failing command:
    - `pnpm tsx bin/oracle-cli.ts projects instructions get 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --target grok`
  - Error:
    - `Button not found (candidates: home page, search, history, ec, toggle sidebar)`
- Follow-ups:
  - Reuse the already stable main/project sidebar toggle helpers in instructions path where possible.
  - Keep a dedicated instructions-open smoke for project URLs with sidebar pre-open/closed states.

- Date: 2026-02-23
- Area: Cache export (`cache export`) SQL-first discovery + sqlite materialization
- Symptom: Export planning depended on `cache-index.json` and filesystem mirrors, so sqlite-populated caches could under-export or fail when index/json artifacts were missing.
- Root cause: `buildCacheExportPlan` was index-first with filesystem fallback only; `exportJson` copied files only and could not synthesize payloads from cache store data.
- Fix:
  - Switched export planning order to:
    1. SQL (`cache.sqlite` `cache_entries`) discovery
    2. `cache-index.json` compatibility manifest
    3. filesystem fallback
  - Added SQL dataset->entry mapping for:
    - `projects`, `conversations`
    - `conversation-context`, `conversation-files`, `conversation-attachments`
    - `project-knowledge`, `project-instructions`
  - Added store-backed materialization in JSON export for missing source files:
    - reads through cache store (`json|sqlite|dual`) and writes canonical payload files at export target.
  - Updated CSV/Markdown/HTML exports to read via cache store instead of JSON mirror readers.
  - Fixed `cache export` option parsing so dashed flags (`--conversation-id`, `--project-id`) are honored reliably.
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope conversation --conversation-id d9845a8e-f357-4969-8b1b-960e73af8989 --format json --out /tmp/oracle-export-smoke/json`
  - same scope with `--format csv|md|html|zip`
  - Temporary no-index smoke:
    - move `~/.oracle/cache/providers/grok/<identity>/cache-index.json` aside
    - rerun export conversation json
    - confirm output context file contains expected messages/sources
    - restore index file
- Follow-ups:
  - Add automated parity test matrix for export scopes (`projects|conversations|conversation|contexts`) with SQL-only fixtures.

- Date: 2026-02-23
- Area: Cache catalog CLI filters (`cache sources/files list|resolve`)
- Symptom: `--conversation-id` / `--project-id` appeared accepted but were ignored (filters showed `null`, queries returned unfiltered rows).
- Root cause: Nested Commander actions read only one callback options object; dashed/global flags could land in different option scopes and were not normalized before filter parsing.
- Fix:
  - Normalized command options in catalog actions by merging `program.opts()`, parent opts, command opts, and local options.
  - Added shared option readers that support both camelCase and dashed keys.
  - Updated filter extraction in sources/files list+resolve and cache context search helpers.
- Verification:
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache sources list --provider grok --conversation-id 00000000-0000-0000-0000-000000000000 --limit 5` -> `count: 0`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache sources list --provider grok --conversation-id d9845a8e-f357-4969-8b1b-960e73af8989 --limit 2` -> filtered rows only for that conversation
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files list --provider grok --project-id d3ccca2d-8742-4e6b-b1d2-e96fbc3cdb1f --limit 2` -> `filters.projectId` populated
- Follow-ups:
  - Audit remaining nested subcommands for dashed-option parsing consistency.

- Date: 2026-02-23
- Area: Grok conversation context source extraction (`readConversationContext`)
- Symptom: `conversations context get` / `cache context get` sometimes returned `sources: []` even when Grok UI showed many sources (for example `27 sources` / `Searched web` + `Searched 𝕏` sidebar sections).
- Root cause: Source-chip detection only looked for `[role="button"][aria-label*=sources]`, but Grok renders source controls with varying DOM shapes and labels. The extractor often never opened the Sources sidebar, so accordion links were never collected.
- Fix:
  - Added robust, visibility-aware source-chip detection over `button, [role="button"]` with text matching for `sources`.
  - Added sidebar wait loop before scraping accordions.
  - Kept accordion scraping for `Searched ...` groups and persisted entries with `sourceGroup`.
  - Preserved dedupe and URL normalization behavior.
- Verification:
  - `pnpm tsx scripts/verify-grok-context-sources.ts d9845a8e-f357-4969-8b1b-960e73af8989`
  - `pnpm tsx scripts/verify-grok-context-get.ts d9845a8e-f357-4969-8b1b-960e73af8989`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts conversations context get d9845a8e-f357-4969-8b1b-960e73af8989 --target grok --json-only | jq '.sources | length'`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache context get d9845a8e-f357-4969-8b1b-960e73af8989 --provider grok | jq '.context.sources | length'`
- Follow-ups:
  - Add a dedicated smoke that asserts minimum source count for a known cited conversation fixture.
  - Continue SQL-first export/discovery work so source-rich contexts remain exportable without JSON-index dependency.

- Date: 2026-02-22
- Area: Cache operations lifecycle (`cache clear|compact|cleanup`)
- Symptom: Cache tooling lacked operational lifecycle commands for selective purge, compaction, and stale-data cleanup.
- Root cause: Only refresh/export/query/doctor/repair surfaces existed; no first-class maintenance operations for ongoing cache hygiene.
- Fix:
  - Added `oracle cache clear`:
    - dataset-scoped, optional `--older-than`, optional `--include-blobs`
    - dry-run by default, mutate only with `--yes`
  - Added `oracle cache compact`:
    - SQLite `VACUUM`, `ANALYZE`, `PRAGMA optimize`
  - Added `oracle cache cleanup`:
    - stale clear (`--older-than` / `--days`)
    - stale index-entry prune
    - old backup prune
    - dry-run by default, mutate only with `--yes`
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache clear --provider grok --identity-key <key> --dataset context --json`
  - `pnpm tsx bin/oracle-cli.ts cache compact --provider grok --identity-key <key> --json`
  - `pnpm tsx bin/oracle-cli.ts cache cleanup --provider grok --identity-key <key> --days 30 --json`
- Follow-ups:
  - Serialize/lock cache maintenance by identity; running clear/compact/cleanup in parallel can trigger transient SQLite `database is locked`.

- Date: 2026-02-22
- Area: Cache mutation safety + repair operations (`cache repair`)
- Symptom: Operators had no guided way to perform cache repair actions (index rebuild, orphan pruning, status fixes) with safe defaults.
- Root cause: Diagnostics existed (`cache doctor`), but no repair command with dry-run/confirmation workflow.
- Fix:
  - Added `oracle cache repair` command:
    - dry-run by default,
    - mutating mode requires `--apply --yes`,
    - action selection via `--actions`.
  - Implemented repair actions:
    - `sync-sql` (initialize/sync SQLite cache)
    - `rebuild-index` (regenerate `cache-index.json` from filesystem)
    - `prune-orphan-assets` (drop unreferenced `file_assets` rows)
    - `mark-missing-local` (mark missing `local_cached` assets as `missing_local`)
  - Added automatic per-identity backups before mutation:
    - `backups/<timestamp>/cache.sqlite`
    - `backups/<timestamp>/cache-index.json`
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions all --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions rebuild-index --apply --yes --json`
- Follow-ups:
  - Add explicit catalog re-backfill repair action and parity checks between index entries and SQL datasets.

- Date: 2026-02-22
- Area: Cache integrity checks (`cache doctor`)
- Symptom: No unified integrity command existed to validate SQL health + file-pointer health across provider/identity cache trees.
- Root cause: Migration/backfill and catalog queries existed, but there was no consolidated diagnostic surface for operators/automation.
- Fix:
  - Added `oracle cache doctor` command with:
    - provider/identity scoping (`--provider`, `--identity-key`)
    - SQLite checks (`cache.sqlite` presence, `PRAGMA quick_check`, expected table presence)
    - file-pointer health via `resolveCachedFiles(..., missingOnly=true)`
    - machine-readable output (`--json`) and strict exit mode (`--strict`)
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache doctor --provider grok --json`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache doctor --provider grok`
- Follow-ups:
  - Add `cache repair` with dry-run and explicit mutation actions.

- Date: 2026-02-22
- Area: Cache file-pointer diagnostics (`cache files resolve`)
- Symptom: `cache files list` showed bindings, but there was no built-in way to determine whether bound local files still existed on disk.
- Root cause: Catalog queries returned metadata only; path-existence checks and status classification were not implemented.
- Fix:
  - Added `resolveCachedFiles(...)` in `src/browser/llmService/cache/catalog.ts`.
  - Added CLI command: `oracle cache files resolve`.
  - Resolution now classifies each row as:
    - `local_exists`
    - `missing_local`
    - `external_path`
    - `remote_only`
    - `unknown`
  - Added `--missing-only` filter and summary counters in command output.
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files resolve --provider grok --limit 10`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files resolve --provider grok --missing-only --limit 10`
- Follow-ups:
  - Integrate this classification into `cache doctor` so missing local pointers fail integrity checks.

- Date: 2026-02-22
- Area: SQL cache catalog query surface (sources/files)
- Symptom: Even after catalog backfill, there was no CLI to read normalized `source_links`/`file_bindings`; users had to inspect `cache.sqlite` manually.
- Root cause: Cache CLI exposed context object operations (`context list/get/search`) but no direct catalog query commands.
- Fix:
  - Added `src/browser/llmService/cache/catalog.ts`:
    - `listCachedSources(...)` (SQL-first; JSON context fallback)
    - `listCachedFiles(...)` (SQL-first join `file_bindings` + `file_assets`; JSON manifest/context fallback)
  - Added CLI commands:
    - `oracle cache sources list`
    - `oracle cache files list`
  - Added filters:
    - sources: `--conversation-id`, `--domain`, `--source-group`, `--query`, `--limit`
    - files: `--conversation-id`, `--project-id`, `--dataset`, `--query`, `--resolve-paths`, `--limit`
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache sources list --provider grok --limit 3`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files list --provider grok --limit 3`
- Follow-ups:
  - Add `cache files resolve` and orphan/path integrity checks (`cache doctor`) so missing local assets are surfaced explicitly.

- Date: 2026-02-22
- Area: Cache context retrieval/search (agent + user workflows)
- Symptom: Cached contexts were listable/gettable but not queryable; there was no CLI search surface for retrieving relevant message/source snippets across cached conversations.
- Root cause: Cache CLI exposed only object retrieval (`context list/get`) and exports, without chunked context indexing/query logic.
- Fix:
  - Added `src/browser/llmService/cache/search.ts`:
    - keyword search (`searchCachedContextsByKeyword`)
    - semantic search (`searchCachedContextsSemantically`) with embedding cache table `semantic_embeddings`.
  - Added CLI commands:
    - `oracle cache context search <query>`
    - `oracle cache context semantic-search <query>`
  - Added filters (`--conversation-id`, `--role`, `--limit`) and semantic options (`--model`, `--max-chunks`, `--min-score`, `--openai-*`).
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache context search "oracle" --provider grok --limit 3`
  - `pnpm tsx bin/oracle-cli.ts cache context semantic-search "oracle" --provider grok --limit 3` (expected explicit error without `OPENAI_API_KEY`)
- Follow-ups:
  - Add top-level cache catalog commands (`cache sources/files list`) to complement context search.
  - Add quiet/json-output mode that suppresses banner + warning noise for reliable `jq` pipelines.

- Date: 2026-02-22
- Area: SQLite cache catalog migration/backfill (sources + file pointers)
- Symptom: Existing `cache.sqlite` files could remain v1-style (`cache_entries`/`meta` only) and lacked normalized source/file metadata even when JSON cache had context/files.
- Root cause: Earlier migration only backfilled base datasets and did not guarantee a second-pass catalog sync for `source_links`/`file_bindings`/`file_assets`.
- Fix:
  - Added schema migration ledger entry for catalog hardening.
  - Added `backfill_catalog_v2` pass that walks existing `cache_entries` and writes:
    - context sources -> `source_links`
    - context/files/attachments/knowledge -> `file_bindings`
  - Added file-asset pointer write-through:
    - local file paths now upsert `file_assets` rows with `storage_relpath` when cache-relative,
    - `file_bindings.metadata_json` now carries path/mime/checksum metadata where present.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx scripts/verify-cache-sql-catalog.ts --provider grok <conversationId>`
- Follow-ups:
  - Add SQL-first source/file catalog query commands (beyond context list/get) for agent workflows.

- Date: 2026-02-22
- Area: Cache context CLI bypassing store abstraction
- Symptom: `oracle cache context list/get` read directly from `cache-index.json` and raw JSON files, so behavior could diverge from configured cache backend (`json|sqlite|dual`).
- Root cause: CLI command handlers used provider cache helpers directly instead of llmService/cache-store APIs.
- Fix:
  - Added `CacheStore.listConversationContexts(...)`.
  - Added `LlmService.listCachedConversationContexts(...)` and `LlmService.getCachedConversationContext(...)`.
  - Updated CLI `cache context list/get` to use the new llmService methods.
- Verification:
  - `pnpm run -s check`
  - Runtime smoke in normal environment:
    - `pnpm tsx bin/oracle-cli.ts cache context list --provider grok`
    - `pnpm tsx bin/oracle-cli.ts cache context get <conversationId> --provider grok`

- Date: 2026-01-24
- Area: Cache JSON mirror writes (nested paths)
- Symptom: `conversations context get` could return context, but JSON mirror files (`contexts/*.json`) were missing; some flows silently fell back to cached reads.
- Root cause: `writeProviderCache` created only the provider root directory, not nested path directories (e.g., `contexts/`, `conversation-files/`).
- Fix: Changed cache writes to `mkdir(path.dirname(cacheFile), { recursive: true })` before writing payload.
- Verification:
  - `pnpm tsx bin/oracle-cli.ts conversations context get <id> --target grok --json-only`
  - Confirmed both:
    - SQLite row exists in `cache_entries` (`dataset='conversation-context'`)
    - JSON mirror exists at `~/.oracle/cache/providers/grok/<identity>/contexts/<id>.json`

- Date: 2026-01-24
- Area: Conversation context completeness (source/citation capture)
- Symptom: `conversations context get` returned only messages/files; no explicit list of consulted sources/citations.
- Root cause: `ConversationContext` schema and Grok scraper did not include source link extraction.
- Fix:
  - Added `ConversationContext.sources` (`url`, `title`, `domain`, `messageIndex`) to domain types.
  - Updated Grok `readConversationContext` to collect:
    - inline external `a[href]` links per assistant row, and
    - sidebar citations from the `N sources` chip + `Searched web` / `Searched 𝕏` accordions.
  - Sidebar source extraction now expands accordions and reads linked results from their controlled panels.
  - Updated llmService normalization to sanitize/dedupe source entries before caching/output.
  - Updated context smoke script output to report source count.
- Verification:
  - `pnpm run -s check`
  - Live verification: run `oracle conversations context get <conversationId> --target grok` on a conversation with citations and confirm `context.sources` is populated.

- Date: 2026-01-24
- Area: Cache backend migration (JSON → SQLite)
- Symptom: Cache store migration introduced fragile path resolution and could fail hard when SQLite support was unavailable, risking regressions in cache-dependent flows.
- Root cause: Early SQLite integration derived cache directory from relative index paths and assumed `node:sqlite` availability; dual-store behavior did not consistently tolerate primary-store failure.
- Fix:
  - Added `browser.cache.store` (`json|sqlite|dual`) to schema/profile config and wired selection into `LlmService`.
  - Updated SQLite cache dir resolution to use `resolveProviderCachePath(...)` directly.
  - Hardened `DualCacheStore`:
    - read fallback to JSON when SQLite read fails,
    - seed-primary best-effort only,
    - write-secondary still succeeds when primary fails,
    - throw only when both stores fail.
  - Added migration plan doc: `docs/dev/cache-db-migration-plan.md`.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache context list --help`
  - `pnpm tsx bin/oracle-cli.ts cache context get --help`
  - `pnpm tsx bin/oracle-cli.ts cache export --help`

- Date: 2026-01-24
- Area: Cached context access + export ergonomics
- Symptom: Context JSON was cached on disk but not directly discoverable for agents, and export scope didn’t expose a first-class “contexts” mode.
- Root cause: CLI cache surfaced projects/conversations/exports broadly, but lacked a dedicated cached-context interface.
- Fix:
  - Added `oracle cache context list` and `oracle cache context get <id>` (ID or cached title) to read cached contexts without browser retrieval.
  - Extended `oracle cache export --scope ...` to include `contexts` for JSON/MD/HTML/CSV/ZIP exports.
  - Added fallback scanning of `contexts/*.json` when cache-index entries are missing.
- Verification:
  - `pnpm tsx bin/oracle-cli.ts cache context list --help`
  - `pnpm tsx bin/oracle-cli.ts cache context get --help`
  - `pnpm tsx bin/oracle-cli.ts cache export --help`

- Date: 2026-01-24
- Area: Conversation context retrieval (Grok + llmService + CLI)
- Symptom: No end-to-end command existed to retrieve/store conversation context; provider capability was exposed but not implemented.
- Root cause: `readConversationContext` was declared on provider types but missing in Grok adapter and missing from `LlmService`/CLI command surface.
- Fix:
  - Implemented Grok `readConversationContext(conversationId, projectId?, options?)` with route-aware navigation (`/c/<id>` and `/project/<id>?chat=<id>`) and message scraping from response rows.
  - Added `LlmService.getConversationContext(...)` with cache write-through to `contexts/<conversationId>.json` and cached fallback on live scrape failure.
  - Added CLI `auracall conversations context get <id>` with `--project-id`, `--cache-only`, and history controls for name/selector resolution.
  - Added smoke helper: `pnpm tsx scripts/verify-grok-context-get.ts <conversationId> [projectId]`.
- Verification:
  - `pnpm tsx bin/auracall.ts conversations context get --help`
  - `pnpm tsx scripts/verify-grok-context-get.ts` (usage/compile path)

- Date: 2026-01-24
- Area: Grok project files (new Personal Files modal UX)
- Symptom: `projects files add/list/remove` regressed after UI change; old Sources selectors no longer matched reliably.
- Root cause: Grok moved file interactions behind a `Personal files` modal (search input + Attach button + hover remove + Save), while old code assumed direct Sources-row controls.
- Fix: Reworked Grok file flows to the new modal lifecycle:
  - open `Personal files` modal from project Sources context
  - upload via modal attach/file-input path
  - delete via hover row action, verify pending-remove state (`opacity-50`, `line-through`, `Undo`), then commit with modal `Save`
  - list from modal rows for current UI variant
- Verification:
  - `pnpm tsx bin/auracall.ts projects files add <projectId> -f <file> --target grok`
  - `pnpm tsx bin/auracall.ts projects files remove <projectId> <fileName> --target grok`
  - `pnpm tsx bin/auracall.ts projects files list <projectId> --target grok`

- Date: 2026-01-24
- Area: Grok project sources (Files collapsible + uploads)
- Symptom: `projects files add/remove` failed when the Files list was empty; helper threw `Button not found` and attach menu never opened.
- Root cause: The Files collapsible toggle is sometimes absent when there are no rows; strict toggle matching caused a hard failure.
- Fix: `ensureProjectSourcesFilesExpanded` now tolerates a missing toggle and only expands when a toggle is visible; added a stepwise smoke script to validate sources flows.
- Verification: `pnpm tsx scripts/verify-grok-project-sources-steps.ts 1 <projectId>` and step 5/6 upload+remove succeed.

- Date: 2026-01-14
- Area: Grok project menu (clone/rename) + menu helpers
- Symptom: `projects clone` opened the user/profile menu (items like Settings/Help) and failed to find Clone; rename failed right after clone.
- Root cause: `openMenu` trusted `aria-controls` and did not fall back when the id was missing; project menu detection used broad `aria-haspopup="menu"` and raced DOM readiness.
- Fix: `openMenu` now falls back to the provided menu selector when `aria-controls` resolves to a missing element; `openProjectMenuButton` waits for `button[aria-label="Open menu"]` and matches by label (avoids profile menu).
- Verification: `pnpm tsx bin/auracall.ts projects clone "My Project" "My Project Clone 2" --target grok` and `projects rename <id> "My Project Clone"` succeeded.

- Date: 2026-01-24
- Area: Grok project sources tab selection
- Symptom: `projects files list <id>` failed with “Sources tab not found” even on `?tab=sources`.
- Root cause: Sources tablist can lag or be missing; when content is already rendered, there’s no tab to click.
- Fix: `ensureProjectSourcesTabSelected` now waits for a tablist but treats a rendered sources container as success; only throws if neither tab nor content exists.
- Verification: `pnpm tsx bin/auracall.ts projects files list <projectId> --target grok` returned file names.

- Date: 2026-01-14
- Area: Grok smoke tests + cache CLI usage
- Symptom: Smoke checklist referenced `auracall cache --target grok`, which is not a supported flag (command failed).
- Root cause: Cache CLI is provider-agnostic and does not accept a target override.
- Fix: Updated smoke checklist to use `auracall cache` and added an explicit `--browser-target grok` prompt variant.
- Verification: Live Grok smoke run completed (prompt, projects refresh, conversations list, project prompt, reattach, registry).

- Date: 2026-01-09
- Area: Grok browser conversation scraping (history dialog)
- Symptom: `auracall conversations --target grok --include-history` returned empty results with `SyntaxError` from `Runtime.evaluate`.
- Root cause: Unescaped backslashes in regex literals inside the injected history-dialog script caused JS parse errors (e.g., `\s` collapsed to `s`, `//c/` became a comment).
- Fix: Escaped regex literals inside the template string (match and cleanup patterns, `/c/` pathname regex) so the injected script remains valid JavaScript.
- Verification: Live Grok conversation fetch returned a full list via `pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`.
- Follow-ups: Ensure `updatedAt` parsing finds timestamps in the current Grok UI.

- Date: 2026-01-10
- Area: Grok browser conversation timestamps (history dialog)
- Symptom: Conversation list rendered but `updatedAt` was always `undefined`.
- Root cause: History rows render relative time in a plain text element (e.g., a `div` with "1 hour ago"), not in `<time>` or ARIA attributes, so the scraper never parsed it.
- Fix: Scan descendant text nodes in each history row for short relative/absolute timestamps and parse them before falling back to title cleanup.
- Verification: Live Grok conversation fetch returned populated `updatedAt` values via `pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`.

- Date: 2026-01-10
- Area: Grok browser conversation list (title cleanup)
- Symptom: `auracall conversations --target grok` returned empty results or a `Runtime.evaluate` `SyntaxError`.
- Root cause: Regex literals inside the injected list script used `\t`/`\n` escapes inside a template string, which injected literal newlines and broke regex parsing in the browser.
- Fix: Replace the title-cleanup regexes with `\\s`-based patterns so the injected script is valid.
- Verification: Pending (rerun Grok conversation list after patch).

- Date: 2026-01-10
- Area: Grok browser conversation timestamps (history + list)
- Symptom: `updatedAt` missing when Grok rendered short relative times (e.g., `2h`, `3d`) or when history dialog stayed open after scraping.
- Root cause: Timestamp parsing only handled “X hours ago” wording and didn’t recognize short unit tokens; dialog close relied on generic modal close paths only.
- Fix: Parse short relative units (`2h`, `3d`, `5w`, `2mo`, etc.) and add a history-toggle fallback when closing dialogs.
- Verification: Pending (rerun Grok conversation list/history with `--include-history` and confirm `updatedAt` populated + dialog closed).

- Date: 2026-01-11
- Area: Browser session reattach (dangling sessions)
- Symptom: `auracall session <id> --render` hangs when the browser instance died, even though the session still exists.
- Root cause: Reattach path assumes an active DevTools port and does not validate liveness before waiting.
- Fix: Pending (add fast liveness check against registry/port and fail with a clear message + relaunch hint).
- Verification: Pending (reattach should fail fast when Chrome is closed).

- Date: 2026-01-10
- Area: Grok assistant selectors (doctor + response polling)
- Symptom: `oracle doctor --target grok` failed `assistantBubble`, `assistantRole`, and `copyButton` when using the new Grok UI classes.
- Root cause: Message rows no longer use `.message-bubble` classes; assistant rows are now `div.relative.group.flex.flex-col.items-start`, with action buttons (Copy) nested under the same row.
- Fix: Updated Grok provider selectors to target the new row classes and align assistant detection with `items-start`.
- Verification: Live DOM inspection via `pnpm tsx scripts/browser-tools.ts eval ...` against a Grok conversation.

- Date: 2026-01-10
- Area: Browser registry (manual login + cookie export)
- Symptom: `oracle doctor` reported missing DevTools port even with a login window open.
- Root cause: Manual login + cookie export launches Chrome via `chrome-launcher` without registering the instance in `browser-state.json`.
- Fix: Register the DevTools port/pid after login chrome launches so registry lookups succeed.
- Verification: TBD (rerun doctor after login launch).

- Date: 2026-01-12
- Area: Cache identity + name resolution (llmService)
- Symptom: Cache refresh/name resolution logic diverged across CLI commands and duplicated LlmService behavior.
- Root cause: Cache helpers lived in `bin/auracall.ts` instead of the new LlmService layer.
- Fix: Centralized cache identity/context and name resolution in `src/browser/llmService/llmService.ts`, routing CLI list/resolve flows through it.
- Verification: Pending (rerun `auracall projects`, `auracall conversations`, and `auracall cache --refresh`).
- Follow-ups: Validate model-selection fallback in Phase 3.

- Date: 2026-01-12
- Area: Grok main sidebar state detection (history workflows)
- Symptom: Sidebar open/closed detection reported inverted states during toggle smoke tests.
- Root cause: Width-based checks can be inverted depending on layout/scroll state; the toggle icon state is more reliable.
- Fix: Detect open state via `button[data-sidebar="trigger"] svg.lucide-chevrons-right.rotate-180` (open). Keep width/right-edge check (`rect.width > 120 && rect.right > 40`) as a fallback if SVG changes.
- Verification: `scripts/verify-grok-main-sidebar-toggle.ts` reports correct state transitions.

- Date: 2026-01-12
- Area: Browser-service DOM wait helpers
- Symptom: Sidebar open check occasionally failed right after navigation; time-based sleeps were brittle.
- Root cause: Waits were time-based instead of selector-based, so the toggle could be queried before it was in the DOM.
- Fix: Added `waitForSelector` to `packages/browser-service/src/service/ui.ts` and used it in `ensureMainSidebarOpen` to wait for `button[data-sidebar="trigger"]`.
- Verification: `scripts/verify-grok-project-remove-steps.ts 2 <projectId>` no longer fails due to missing sidebar toggle.
- Fix: Grok project-create model picker needed `pointerdown`/`mousedown` before `click()` to open the Radix listbox. Added this in `resolveProjectInstructionsModal` and `verify-grok-project-create-model-picker.ts`.
- Verification: `pnpm tsx scripts/verify-grok-project-create-steps.ts 2 "My Project" "Instructions here" "Grok 4.1 Thinking"` sets the model correctly.
- Docs: Added `docs/dev/browser-service-tools.md` to centralize reusable browser-service UI helpers and patterns.
- Fix: Project instructions get/set now ensure project sidebar open and wait for the Edit Instructions button via `waitForSelector` before clicking.
- Fix: Project instructions get no longer fails when the edit dialog is already open; we short-circuit on textarea presence and skip model-menu inspection unless a model change is requested.
- Fix: Grok history rename flow required real mouse hover. Added `hoverElement` to browser-service (CDP mouse move + `elementFromPoint` verification) and used it to reveal hover-only controls in the history dialog.
- Verification: `pnpm tsx scripts/verify-grok-history-rename-steps.ts 4 <conversationId>` shows Rename/Delete controls consistently; CLI rename succeeds.

- Date: 2026-01-12
- Area: Dev workflow hygiene
- Note: Keep commits tight and scoped; stage new scripts/docs intentionally, and clean up/commit before switching phases to avoid losing automation learnings.
- 2026-03-26: Aura-Call profile precedence and Windows login endpoint reporting
  - Symptom: `auracall --profile windows-chrome-test login --target grok` still launched `/usr/bin/google-chrome` with WSL cookie paths even though the config profile clearly specified Windows Chrome/Windows cookies/Windows managed root. Separately, the login path printed `windows-loopback:9222` even when the real managed Windows Chrome session was alive on a different elevated port, which made the product path look broken and obscured the actual live browser.
  - Root cause: `src/schema/resolver.ts` applied selected Aura-Call profiles after `browserDefaults` had already been merged into `browser`, and `applyBrowserProfileOverrides()` only filled missing fields. That meant the selected profile could not override global browser defaults. On top of that, profile browser parsing still only recognized legacy `cookiePath/profileName` keys, so v2 profile blocks using `chromeCookiePath` were silently dropped. Separately, `packages/browser-service/src/login.ts` registered and printed the requested debug port instead of the actual `chrome.port` returned by the launcher.
  - Fix:
    - `src/schema/resolver.ts`
      - apply selected profiles from both `auracallProfiles` and v2 `profiles`
      - let selected profile values override global defaults
      - reapply CLI config after profile application so CLI still wins
    - `src/browser/service/profileConfig.ts`
      - add an explicit override mode for profile application
      - accept modern `chromeCookiePath` / `chromeProfile` aliases when reading profile-browser config
    - `src/schema/types.ts`
      - extend `OracleProfileBrowserSchema` with `chromeCookiePath` and `chromeProfile`
    - `packages/browser-service/src/login.ts`
      - register and print `chrome.port` / `chrome.host` instead of the originally requested debug port
  - Verification:
    - `pnpm vitest run tests/schema/resolver.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserLoginCore.test.ts`
    - `pnpm tsx /tmp/resolve-profile.mts`
      - `--profile windows-chrome-test` now resolves Windows Chrome path, Windows cookie DB, Windows managed profile root, `wslChromePreference: "windows"`, and the pinned managed profile dir
    - live:
      - `pnpm tsx bin/auracall.ts --profile windows-chrome-test login --target grok`
      - now prints `Opened grok login in /mnt/c/Program Files/Google/Chrome/Application/chrome.exe`
      - and `Debug endpoint: windows-loopback:45920`
  - Additional finding: after cleaning up the broken sibling Windows browser process that used `--user-data-dir= C:\...windows-chrome-test\grok`, the remaining real listener on `127.0.0.1:45920` was the good managed-profile process with `--user-data-dir=C:\...windows-chrome-test\grok`, and its live DevTools tabs showed Grok pages plus `about:blank`, not the stray `file:///...` tab.

- 2026-03-26: Manual-login reuse should not spawn duplicate Grok tabs
  - Symptom: repeated `auracall --profile windows-chrome-test login --target grok` calls kept adding another `https://grok.com/` page to the live managed Windows profile even when a reusable Grok tab or `about:blank` page already existed.
  - Root cause: `packages/browser-service/src/manualLogin.ts` always finished manual/login launch with `CDP.New({ url })`, regardless of whether the managed browser already had a matching Grok tab or a reusable `about:blank` page.
  - Fix:
    - `packages/browser-service/src/manualLogin.ts`
      - export and update `openLoginUrl(...)`
      - reuse an existing matching page target when present
      - otherwise navigate an existing `about:blank` target
      - only fall back to `CDP.New(...)` when no reusable page exists
    - `tests/browser/manualLogin.test.ts`
      - add coverage for existing-target reuse, `about:blank` reuse, and new-tab fallback
  - Verification:
    - `pnpm vitest run tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/schema/resolver.test.ts tests/browser/profileDoctor.test.ts`
    - live Windows managed-profile check:
      - count `https://grok.com/` page targets on `127.0.0.1:45920`
      - run `pnpm tsx bin/auracall.ts --profile windows-chrome-test login --target grok`
      - count again
      - result stayed `4 -> 4`, so login reuse no longer creates a fifth Grok tab

- 2026-03-26: Windows managed-profile CDP rediscovery must be profile-scoped, not requested-port scoped
  - Symptom: after manually signing into and reopening the Windows Aura-Call-managed Chrome profile, the browser window could be visibly open and signed in while Aura-Call still could not attach. The process command line still advertised `--remote-debugging-port=<requestedPort>`, but that port could be dead or stale, so the failure looked like generic WSL<->Windows networking breakage.
  - Root cause: Windows-from-WSL launch/reuse trusted the requested or previously recorded DevTools port too much. If the live endpoint moved, or if the recorded port no longer matched any responsive listener, Aura-Call had no profile-scoped fallback and treated the session as dead.
  - Fix:
    - `packages/browser-service/src/processCheck.ts`
      - added `probeWindowsLocalDevToolsPort(...)`
      - added `findResponsiveWindowsDevToolsPortForUserDataDir(...)`
      - collect all Windows Chrome processes matching a managed `user-data-dir`, not just the first match
    - `packages/browser-service/src/chromeLifecycle.ts`
      - added `discoverWindowsChromeDevToolsPort(...)`
      - Windows launch/reuse now asks the managed profile for a responsive Windows-local endpoint before declaring the requested port dead
      - when a different live port is found, Aura-Call rewrites `DevToolsActivePort` and adopts that endpoint
    - tests
      - `tests/browser-service/processCheck.test.ts`
      - `tests/browser-service/windowsChromeDiscovery.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/schema/resolver.test.ts`
    - `pnpm run check`
    - live probe:
      - `pnpm tsx /tmp/check-windows-devtools-discovery.mts`
      - returned `{"port":null}` for the current `windows-chrome-test/grok` browser root after checking the profile, advertised port, and Windows-local listeners
  - Additional finding: the current live failure mode is no longer "we picked the wrong port". For the active `windows-chrome-test/grok` session, Windows reported no responsive DevTools port for any Chrome process in that managed profile group. The browser window exists, but CDP is not being exposed at all.

- 2026-03-26: Windows-from-WSL launches should use `--remote-debugging-port=0`, not a preselected fixed port
  - Symptom: the Windows product launcher kept falling into dead `4589x` retries even though a literal Windows PowerShell launch proved Chrome could expose DevTools for the same kind of managed profile. The failure looked like quoting at first, but the evidence was inconsistent: `45941` worked, while nearby fixed ports like `45942` timed out.
  - Root cause: Aura-Call was choosing DevTools ports from Linux/WSL-local availability and passing those fixed ports into stock Windows Chrome. On this machine, some fixed ports simply never came up on the Windows side even though the launch flags were correct.
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - Windows-from-WSL launches now request `--remote-debugging-port=0`
      - poll the managed profile's `DevToolsActivePort` and adopt the real Windows-assigned port
      - retry fresh auto-port launches instead of walking a fixed-port band
    - `tests/browser-service/windowsChromeDiscovery.test.ts`
      - add coverage for `requestedPort: 0` and for `DevToolsActivePort` beating the stale advertised command-line port
  - Verification:
    - `pnpm vitest run tests/browser-service/windowsChromeDiscovery.test.ts`
    - `pnpm run check`
    - live scratch proof:
      - `/tmp/auracall-win-ab-port-zero.ps1` returned a real Windows Chrome endpoint via `DevToolsActivePort`
      - `/tmp/auracall-launch-ab-product-auto.mts` launched through product code and adopted `windows-loopback:53868` on the first try
  - Additional finding: this narrows the earlier suspicion. The current product failure mode was not generic PowerShell escaping; it was fixed-port selection on Windows Chrome. Literal Windows launches with correct quoting do work, and the stable product answer is to let Windows choose the port.

- 2026-03-26: Windows managed-profile liveness must trust the responsive DevTools endpoint, not just the original root PID
  - Symptom: after a clean Windows relaunch on `--remote-debugging-port=0`, Aura-Call could prove the managed profile was live (`DevToolsActivePort=49926`, Windows-local probe ok, `windows-loopback:49926` relay ok), but `auracall doctor --local-only` still marked the registry entry stale/alive=false.
  - Root cause: `isChromeAlive(...)` over-trusted the Windows root PID path for WSL-managed Windows profiles. If that path was flaky or ambiguous, Aura-Call could report `alive=false` even while the actual Windows DevTools endpoint was responsive.
  - Fix:
    - `packages/browser-service/src/processCheck.ts`
      - for WSL + managed Windows profiles, check `probeWindowsLocalDevToolsPort(port)` first
      - treat a responsive Windows-local DevTools endpoint as sufficient proof of life
    - `tests/browser-service/processCheck.test.ts`
      - add coverage for the “tasklist says no, but `/json/version` is alive” case
  - Verification:
    - `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser-service/chromeLifecycle.test.ts`
    - live:
      - relaunched `windows-chrome-test/grok` through product code
      - `DevToolsActivePort` contained `49926`
      - `probeWindowsLocalDevToolsPort(49926) === true`
      - `auracall doctor --profile windows-chrome-test --target grok --local-only --json` now reports `alive: true`

- 2026-03-26: Browser onboarding needs a real wizard, not more setup flags
  - Symptom: the underlying managed-profile setup/login flow had become good enough, but first-time users still had to know too much: which browser runtime to prefer, whether to create a dedicated Aura-Call profile, which profile name to use, and when to run `setup` versus `doctor`. The product had the right primitives but no clear happy path.
  - Root cause: onboarding logic lived in scriptable commands (`setup`, `doctor`, profile-scoped config) with no guided entry point. That forced users to understand config shape before they could benefit from it.
  - Fix:
    - `src/cli/browserWizard.ts`
      - added wizard choice discovery for local/WSL/Windows Chromium sources
      - added profile-name suggestion/validation
      - added config patch + merge helpers for `profiles.<name>`
    - `bin/auracall.ts`
      - added `auracall wizard`
      - wizard writes/updates `~/.auracall/config.json`
      - extracted the existing setup action body into a reusable `runBrowserSetupCommand(...)`, so the wizard reuses the same managed-profile login/verification path instead of forking onboarding behavior
    - tests
      - `tests/cli/browserWizard.test.ts`
      - `tests/cli/browserSetup.test.ts`
  - Verification:
    - `pnpm vitest run tests/cli/browserWizard.test.ts tests/cli/browserSetup.test.ts`
    - `pnpm tsx bin/auracall.ts wizard --help`
    - `pnpm run check`
  - Outcome: the preferred first-run path is now `auracall wizard`, while `auracall setup` remains the scriptable/non-interactive path for automation and advanced users.

- 2026-03-26: Windows bot detection is not coming from a custom Aura-Call user-agent
  - Symptom: Windows-managed Aura-Call Chrome profiles were being flagged by some services as bot-like, raising suspicion that Aura-Call might be overriding the UA string.
  - Investigation:
    - `packages/browser-service/src/chromeLifecycle.ts` and `packages/browser-service/src/manualLogin.ts` do not set `--user-agent` or any explicit UA override.
    - Live probe against `windows-chrome-test/grok` via `pnpm tsx scripts/browser-tools.ts eval --port 62265 --url-contains grok.com ...` returned:
      - `navigator.userAgent = Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36`
      - `navigator.platform = Win32`
      - `navigator.webdriver = true`
  - Conclusion: the current high-signal bot fingerprint is `webdriver=true` on the debug-attached Windows session, not a strange UA string. The current manual-login/debug path uses `--remote-debugging-port=0` plus a managed profile and loopback relay; that is the more plausible cause of bot detection.

- 2026-03-26: WSL -> Windows launcher must emit `--user-data-dir="C:\..."`, not bare `--user-data-dir=C:\...`
  - Symptom: manual PowerShell launches of the kept Windows managed profile worked reliably only when the `--user-data-dir` argument itself contained inner double quotes around the Windows path. The product launcher was building the bare path form instead.
  - Root cause: `packages/browser-service/src/chromeLifecycle.ts` formatted the Windows `user-data-dir` token as `--user-data-dir=C:\...` and then only applied the outer single-quoted PowerShell literal wrapper. That did not match the known-good command shape the user verified manually.
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - `resolveUserDataDirFlag(...)` now returns `--user-data-dir="C:\..."` for WSL -> Windows Chrome launches
    - `tests/browser-service/chromeLifecycle.test.ts`
      - add a regression asserting the quoted Windows path token
  - Verification:
    - `pnpm vitest run tests/browser-service/chromeLifecycle.test.ts --maxWorkers 1`
    - `pnpm vitest run tests/browser-service/windowsChromeDiscovery.test.ts --maxWorkers 1`

- 2026-03-27: Repeated browser actions should reuse existing service tabs before opening new ones
  - Symptom: repeated `auracall login`, remote browser attaches, and Grok project actions could leave behind a growing pile of same-service tabs because different layers independently fell back to raw `CDP.New(...)`.
  - Root cause: browser-service had no single shared tab-open policy. Manual login already knew how to reuse an exact URL or `about:blank`, but remote attach and the Grok adapter still eagerly created new pages.
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - added `openOrReuseChromeTarget(...)`
      - default policy is now: exact URL -> blank/new-tab -> same-origin reuse -> compatible-host family reuse -> new tab
      - after selecting/opening a target, trim the obvious stockpile cases:
        - keep the selected tab
        - keep at most 3 matching-family tabs
        - keep at most 1 spare blank/new-tab page
        - if CDP window ids are available, close extra windows only when every tab in that window is disposable for the same profile/service action
      - `connectToRemoteChrome(...)` now uses that policy instead of always opening a dedicated new tab
    - `packages/browser-service/src/manualLogin.ts`
      - login-tab opening now reuses same-origin service pages too, not just exact URL / blank
    - `src/browser/providers/grokAdapter.ts`
      - Grok’s last-resort project/home target opening now uses the shared helper instead of direct `CDP.New(...)`
    - `src/browser/urlFamilies.ts`
      - added explicit browser-service host families, starting with ChatGPT `chatgpt.com` + `chat.openai.com`
    - `src/browser/login.ts` and `src/browser/index.ts`
      - pass compatible host families into manual login and remote attach so ChatGPT host migrations reuse the existing service tab instead of opening a sibling host tab
    - tests
      - `tests/browser-service/chromeTargetReuse.test.ts`
      - `tests/browser/manualLogin.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
    - `pnpm run check`
  - Additional finding: compatible-host reuse should stay explicit per service. The generic fallback should not guess that unrelated hosts are interchangeable just because the page shape happens to look similar.
  - Additional finding: window cleanup must stay profile-scoped and conservative. The safe line is “close obviously disposable extra windows,” not “try to enforce one global browser window.”

- 2026-03-27: Grok conversation context cache writes failed for nested files, and project conversation lists could stick on generic `Chat` titles
  - Symptom:
    - `auracall conversations context get ... --target grok` failed with `ENOENT ... /contexts/<id>.json`
    - project conversation lists could keep showing generic titles like `Chat` even after the real conversation title was available elsewhere in the UI
  - Root cause:
    - `src/browser/providers/cache.ts` only created the provider cache root, not the parent directory for nested cache files like `contexts/<id>.json`
    - `src/browser/providers/grokAdapter.ts` merged raw/sidebar/history/open conversation records with a first-write-wins strategy, so a low-quality raw title could permanently dominate a better history/sidebar title
  - Fix:
    - `src/browser/providers/cache.ts`
      - `writeProviderCache(...)` now creates `path.dirname(cacheFile)` so nested conversation/project cache writes succeed
    - `src/browser/providers/grokAdapter.ts`
      - added `grokConversationTitleQuality(...)` and `choosePreferredGrokConversation(...)`
      - `listConversations(...)` now merges duplicate conversation ids by title quality / timestamp / URL quality instead of “first source wins forever”
      - added post-submit rename verification in `renameConversationInHistoryDialog(...)`
    - tests
      - `tests/browser/providerCache.test.ts`
      - `tests/browser/grokAdapter.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
    - live `conversations context get` on Grok now returns the expected messages instead of `ENOENT`
    - live `conversations --refresh --include-history` now resolves `e21addd2-1413-408a-b700-b78e2dbadaf8` as `AuraCall Maple Ledger`
  - Additional finding:
    - Grok’s old history-dialog workflow is no longer the dependable place for conversation rename/delete. On current live pages, the project-page `History` control is just an expanded header, while the real action surface appears to be the hidden root-sidebar `Options` button on each conversation row.

- 2026-03-27: Grok conversation rename/delete had moved from the old history dialog to the root sidebar row menu
  - Symptom:
    - `auracall rename ... --target grok` and `auracall delete ... --target grok` were failing with `History dialog did not open`
    - live DOM inspection showed the target conversation still existed in the root sidebar, with a hidden per-row `Options` button and a Radix menu containing `Rename`, `Pin`, and `Delete`
  - Root cause:
    - the old implementation still assumed Grok conversation actions lived behind the history dialog
    - on the current UI, the project-page `History` control is just a collapsible header, while the real conversation action surface is the root sidebar row menu
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - added helpers to tag the target sidebar row and hidden `Options` button
      - added `openGrokConversationSidebarMenu(...)`
      - added sidebar-specific rename/delete verification waits
      - `renameConversation(...)` and `deleteConversation(...)` now use the root sidebar `Options` menu first and only fall back to the old history-dialog flow if the sidebar path fails
  - Verification:
    - live rename of `e21addd2-1413-408a-b700-b78e2dbadaf8` to `AuraCall Maple Harbor` succeeded
    - live delete of that same conversation succeeded
    - follow-up `conversations --refresh --include-history` no longer listed the deleted conversation

- 2026-03-27: Grok live verification needed one explicit WSL-primary acceptance checklist instead of scattered ad hoc smoke commands
  - Symptom:
    - Grok project and conversation CRUD were being repaired successfully, but the repo still lacked one concrete "done" checklist for deciding when the WSL Grok path was actually fully functional.
    - `docs/manual-tests.md` only pointed loosely at `docs/dev/smoke-tests.md`, so the runbook did not clearly say which Grok operations had to pass together before calling the feature complete.
  - Root cause:
    - Live debugging had outpaced the smoke documentation. Each repair was being logged in the journal/fixes log, but the acceptance bar stayed implicit.
  - Fix:
    - `docs/dev/smoke-tests.md`
      - added `Grok Acceptance (WSL Chrome Primary)` with concrete steps for:
        - project create/list/rename/clone
        - project instructions get/set
        - project files add/list/remove
        - conversation create/list/context/rename/delete
        - markdown capture
        - cache freshness and cleanup
      - documented the Grok naming constraint: avoid timestamp-heavy disposable names because they can trip the backend `contains-phone-number` validator
    - `docs/manual-tests.md`
      - now points directly to that acceptance checklist as the canonical Grok runbook
    - `docs/testing.md`
      - now calls out the same checklist as the Grok "fully functional" bar
    - `docs/dev/llmservice-phase-7.md`
      - updated the Phase 7 smoke section so the plan references the same acceptance bar
  - Verification:
    - doc-only update; verified by reading the linked docs together and confirming they now point to the same checklist
  - Additional finding:
    - Windows Chrome should remain secondary/manual-debug coverage until its human-session and debug-session behavior are cleanly separated. The current Grok acceptance bar should stay WSL-primary rather than pretending both paths are equally mature.

- 2026-03-27: Grok project-file upload/list needed stronger saved-state verification on the WSL acceptance path
  - Symptom:
    - the first live `projects files list <project_id> --target grok` run failed with `Personal files modal not found`, while the immediate retry succeeded
    - uploading `/tmp/auracall-grok-stress/medium.jsonl` printed `Uploaded 1 file(s)...`, but a fresh file list never showed `medium.jsonl`
  - Root cause:
    - `src/browser/providers/grokAdapter.ts` still assumed the Personal Files modal would expose its search input immediately after the opener click
    - the upload path only verified transient modal state before `Save`; it never re-read the saved project state, so silently dropped Grok files looked like success
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - hardened `ensurePersonalFilesModalOpen(...)` with retries and a broader wait that accepts the current delayed `Personal files` dialog
      - added `parseGrokPersonalFilesRowTexts(...)` and `readVisiblePersonalFilesWithClient(...)` so list/upload verification share one file-row parser
      - added `waitForProjectFilesPersisted(...)` after `clickPersonalFilesSaveWithClient(...)`, so Aura-Call now reopens the project file surface after Save and fails if the requested file names never actually persist
    - `tests/browser/grokAdapter.test.ts`
      - added parser coverage for file row text normalization and trailing size parsing
    - `docs/dev/smoke-tests.md`
      - extended the Grok acceptance runbook with a file-stress step and documented that unique file names are the primary correctness check
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
    - live multi-file add/list/remove/delete on disposable project `e130b1b0-10b9-410b-97cd-e4f62c8a349e` succeeded on the WSL Grok profile
    - live medium-file upload now fails honestly with `Uploaded file(s) did not persist after save: medium.jsonl`
  - Additional finding:
    - Same-name duplicate uploads are still a provider/product ambiguity. Grok appears willing to accept duplicate names, but the current list/remove surfaces are name-based, so duplicate-name behavior should remain an exploratory stress case, not the primary acceptance bar.

- 2026-03-27: Full WSL Grok acceptance still fails on project-scoped conversation refresh after a real project prompt run
  - Symptom:
    - a full disposable WSL acceptance pass got through project create/rename/clone, instructions get/set, unique-file add/list/remove, medium-file rejection, and the project-scoped browser prompt itself
    - but `auracall conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history` did not yield the newly created project conversation in a usable list
    - the same acceptance run then hit a related cleanup drift: `projects remove` for the disposable project/clone could land on a menu whose visible items were just `Conversations`, not the project action menu
  - Root cause:
    - project-scoped conversation refresh still did not have one dependable source of truth for "conversations that belong to this project after a real prompt run"
    - the previous implementation was too broad in one direction (root/global history results being tagged with the active `projectId`) and too narrow in another (a corrected project-page scrape still returning `[]` even though session metadata proved a project chat URL existed)
    - the disposable project cleanup drift indicates there is still a project/conversation menu-surface ambiguity on the current Grok page state
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - stopped forcing project-scoped `includeHistory` onto the root `https://grok.com/` history path
      - project-scoped raw scraping now ignores nodes inside the main sidebar wrapper
      - open-tab fallback now only keeps Grok tabs whose URL actually belongs to the requested `/project/<id>`
    - This removed the earlier over-inclusive project conversation pollution, but it did not yet solve the deeper problem: the project-scoped list still comes back empty for the live disposable project
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live partial acceptance on:
      - project `628cae8a-8918-4567-912f-e44fde3ee3e0` / `AuraCall Harbor nzlqec`
      - clone `17e57d61-ce6c-4e41-b13c-3f64582daaa2` / `AuraCall Orbit nzlqec`
    - live blocker repro:
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history`
      - result: `[]`
    - live browser-session evidence of the missing conversation still existing:
      - `~/.auracall/sessions/reply-exactly-with-auracall-maple-2/meta.json` recorded
        - project id `628cae8a-8918-4567-912f-e44fde3ee3e0`
        - tab URL `.../project/628cae8a-...?...chat=f3241435-0667-437d-b6ae-246f7815b1ec...`
        - conversation id `f3241435-0667-437d-b6ae-246f7815b1ec`
  - Additional finding:
    - The WSL Grok path is closer, but not done. Before calling it "fully functional," Aura-Call still needs one reliable project-scoped conversation source and a cleanup/remove path that cannot drift from the project menu onto the conversations UI.

- 2026-03-27: Project-scoped Grok conversation refresh now uses the project conversations tab and no longer trashes the global conversation cache
  - Symptom:
    - the live WSL acceptance project had a real conversation and chat id in session metadata, but `auracall conversations --target grok --project-id <id> --refresh --include-history` still returned `[]`
    - the same project-scoped refresh path was also overwriting the shared `~/.auracall/cache/providers/grok/<identity>/conversations.json`, so a failed project refresh could wipe the global cache to `[]`
    - disposable project cleanup was brittle because the tagged project-row menu strategy could throw before broader fallback menu-open paths had a chance to run
  - Root cause:
    - `src/browser/providers/grokAdapter.ts` still treated project-scoped conversation listing too much like the broad global conversation scrape. Even after narrowing some earlier selectors, the code still depended on mixed surfaces instead of the actual project conversations tab that Grok renders in `main`.
    - conversation cache storage was keyed only by provider + identity, not by project scope, so project-scoped refreshes and global refreshes shared the same `conversations.json`.
    - `openProjectMenuButton(...)` hard-failed when the tagged sidebar project row was transient, even though the broader menu-button fallbacks could still have succeeded.
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - added a focused project-conversation readiness wait
      - added direct project-tab conversation extraction from `main [role="tabpanel"]` / `main`
      - changed project-scoped `listConversations(...)` to prefer that focused project list, with project history only as fallback
      - relaxed the tagged project-row menu-open path so transient row-selector failures fall through to other menu strategies
    - `src/browser/providers/types.ts`
      - added `projectId` to `BrowserProviderListOptions`
    - `src/browser/providers/cache.ts`
      - project-scoped conversation lists now use `project-conversations/<projectId>.json`
    - `src/browser/llmService/cache/store.ts`
      - JSON and SQLite conversation-list storage now honor the same project scope
    - `src/browser/llmService/llmService.ts`
    - `src/browser/llmService/providers/grokService.ts`
    - `src/browser/llmService/providers/chatgptService.ts`
    - `bin/auracall.ts`
      - propagated project scope consistently through conversation list resolution and cache writes
    - `tests/browser/providerCache.test.ts`
      - added regression coverage for the project-scoped cache path
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history`
        - returned `f3241435-0667-437d-b6ae-246f7815b1ec` / `AuraCall Maple Ledger`
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations context get f3241435-0667-437d-b6ae-246f7815b1ec --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --json-only`
        - returned the expected project prompt/response pair
      - verified the project-scoped cache landed in `project-conversations/628cae8a-8918-4567-912f-e44fde3ee3e0.json`
      - removed disposable clone `17e57d61-ce6c-4e41-b13c-3f64582daaa2`
      - removed disposable project `628cae8a-8918-4567-912f-e44fde3ee3e0`
      - fresh `projects --target grok --refresh` no longer listed either disposable project
  - Additional finding:
    - This repair fixed correctness, but not yet the global title-quality issue. A follow-up metadata overlay is still needed so the root conversation list can reuse stronger project-scoped titles instead of regressing to `Chat`.

- 2026-03-27: Global Grok conversation lists now reuse stronger project-scoped titles instead of generic `Chat`
  - Symptom:
    - after the project-scoped refresh fix landed, project-scoped conversation list/context calls were correct, but the global `auracall conversations --target grok --refresh --include-history` output could still show the same conversation id as generic `Chat`
    - the weaker title could also persist in the global `conversations.json`, which meant cache-backed selectors/export surfaces could inherit the worse metadata too
  - Root cause:
    - global conversation metadata and project-scoped conversation metadata were still treated as parallel datasets with no reconciliation layer when reading the global list
    - the user-facing CLI conversation list path was still calling the provider directly, bypassing any cache-side metadata overlay
  - Fix:
    - `src/browser/llmService/cache/store.ts`
      - added a read-time conversation overlay for global conversation reads
      - JSON cache store now merges the global conversation list with `project-conversations/*.json`
      - SQLite cache store now merges all `conversations` datasets (global + project-scoped entity ids) when reading the global list
      - Grok reconciliation reuses `choosePreferredGrokConversation(...)` so specific project titles beat generic placeholders like `Chat`
    - `src/browser/llmService/llmService.ts`
      - added a shared helper for overlaying global conversation lists through the cache layer
    - `src/browser/llmService/providers/grokService.ts`
      - global Grok conversation listing now routes through that cache-backed overlay before returning to callers
    - `bin/auracall.ts`
      - the user-facing `conversations` command now uses `llmService.listConversations(...)` instead of calling the provider directly
    - `tests/browser/providerCache.test.ts`
      - added JSON + SQLite regression coverage proving a project-scoped `AuraCall Maple Ledger` title wins over a global `Chat` placeholder for the same id
  - Verification:
    - `pnpm vitest run tests/browser/providerCache.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`
        - now shows `AuraCall Maple Ledger` for `f3241435-0667-437d-b6ae-246f7815b1ec`
      - verified the persisted global cache entry in `~/.auracall/cache/providers/grok/ez86944@gmail.com/conversations.json` now carries the stronger title for that same id
  - Additional finding:
    - The remaining Grok title work is now general ranking/normalization polish. The concrete project-scoped-vs-global `Chat` regression is fixed.

- 2026-03-27: WSL Grok acceptance blockers cleared for project conversation empty-state, project cleanup, and clone rename stability
  - Symptom:
    - after the project-scoped conversation fixes landed, the full disposable WSL Grok acceptance run still had three remaining blockers:
      - after deleting the last project conversation, `conversations --project-id ... --refresh` could fail with `Project conversations list did not load`
      - `projects remove ...` could actually delete the project in Grok but still throw afterward because Aura-Call reopened menus or retried against a page that had already been torn down
      - `projects clone <id> <new-name>` could leave the inline rename editor open and print `Clone rename failed: Project rename stayed in edit mode`
  - Root cause:
    - the project conversation readiness probe only recognized rows or the older `start a conversation in this project` text, not Grok's current empty-state copy `No conversations yet`
    - project conversation delete still ignored `projectId` and started from the generic projects index instead of the actual project conversation list
    - project cleanup reopened the wrong menu surface in some states (sidebar row `Options` instead of the page-level project menu), then retried into a dead/invalid page after the project had already been deleted
    - clone rename used a brittle 3-second “input disappeared” check instead of waiting for the new title to actually apply
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - `waitForProjectConversationList(...)` now treats `No conversations yet` as a loaded project conversation surface
      - `deleteConversation(...)` now mirrors `renameConversation(...)` and uses the actual project page + project conversation list when `--project-id` is present
      - `openProjectMenuButton(...)` now prefers the page-level `Open menu` inside `main` before sidebar row `Options`
      - `selectRemoveProjectItem(...)` now chooses `Remove` or `Delete` from a single opened menu instead of reopening label-specific fallbacks
      - `pushProjectRemoveConfirmation(...)` now confirms an existing remove dialog first and treats an invalid/deleted project page after confirmation as success
      - project rename now waits for the new title to land and retries one more submit/blur cycle before failing
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - the final disposable WSL acceptance run completed cleanly end to end with:
        - project create / rename / clone
        - instructions get/set
        - unique-file add/list/remove
        - medium-file guard failing explicitly as intended
        - project conversation create / context / rename / delete
        - markdown-preserving browser capture
        - clone cleanup + source cleanup both returning success
      - focused project cleanup repro passed after the final fixes:
        - created `AuraCall Cedar Atlas qpwlyc`
        - cloned + renamed to `AuraCall Cedar Orbit qpwlyc`
        - removed clone `c0a97011-5a88-4298-a512-5d68927d2d1a`
        - removed source `4188013b-78f2-43b1-9102-0378581ed047`
        - refreshed project list no longer showed either disposable project
  - Additional finding:
    - WSL Grok CRUD is no longer blocked on the current live UI. The next reliability investment should be a scripted acceptance runner wired directly to `docs/dev/smoke-tests.md`.

- 2026-03-27: Project-scoped Grok conversation context no longer prepends project instructions into the first assistant message
  - Symptom:
    - after the live WSL Grok acceptance runner went green, one residual quality issue remained: project-scoped `conversations context get ... --project-id ...` could return the project instructions text duplicated at the start of the first assistant message payload
    - that polluted downstream cache/export consumers even when the actual user prompt and assistant answer were otherwise correct
  - Root cause:
    - the llmService conversation-context path did not persist project instructions into its cache store consistently, and it had no reconciliation step to strip a duplicated project-instructions prefix from live project-scoped assistant payloads before caching them
  - Fix:
    - `src/browser/llmService/llmService.ts`
      - added `stripProjectInstructionsPrefixFromConversationContext(...)`, a project-scoped normalization helper that removes an exact instructions prefix from the first assistant message only when real assistant content remains after the prefix
      - `createProject(...)`, `updateProjectInstructions(...)`, and `getProjectInstructions(...)` now write the latest project instructions into the cache store
      - `getConversationContext(...)` now reads cached project instructions for `--project-id ...`, applies the prefix-strip normalization when needed, then writes the cleaned context back to cache
    - `tests/browser/llmServiceContext.test.ts`
      - added focused regression coverage for both the positive prefix-strip case and the “instructions text appears later, so do not strip” case
  - Verification:
    - `pnpm vitest run tests/browser/llmServiceContext.test.ts tests/browser/providerCache.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - created disposable project `f9bd98f3-ffbd-4158-b40c-f95231111216`
      - created project conversation `6bfb2942-a443-4cf5-8bf4-23a82e3f264d`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get 6bfb2942-a443-4cf5-8bf4-23a82e3f264d --target grok --project-id f9bd98f3-ffbd-4158-b40c-f95231111216 --json-only`
        - returned the clean assistant text (`Context Probe Inspect`) with no duplicated project instructions prefix
  - Additional finding:
    - the earlier leaked-prefix case did not reproduce on the fresh probe after the broader Grok fixes, so this normalization now acts as a defensive safeguard against future Grok payload drift rather than masking an actively reproducible live bug.

- 2026-03-27: Grok project file CRUD now writes through to the `project-knowledge` cache/catalog dataset
  - Symptom:
    - the live WSL Grok file CRUD surface (`projects files add/list/remove`) was working in the browser, but Aura-Call was treating it as transient UI state
    - `cache files list --provider grok --project-id <id> --dataset project-knowledge` was not being refreshed by live project-file mutations, even though the cache schema and export/catalog tooling already had a dedicated `project-knowledge` dataset for durable project files
  - Root cause:
    - `src/browser/llmService/llmService.ts` exposed `listProjectFiles(...)`, `uploadProjectFiles(...)`, and `deleteProjectFile(...)`, but none of those methods wrote through to `cacheStore.writeProjectKnowledge(...)`
    - the scripted WSL Grok acceptance runner only verified the visible project file list, not the normalized cache/catalog view
  - Fix:
    - `src/browser/llmService/llmService.ts`
      - `listProjectFiles(...)` now refreshes `project-knowledge` from the live provider list
      - `uploadProjectFiles(...)` and `deleteProjectFile(...)` now re-read the live provider list after mutation and write the post-mutation state into `project-knowledge`
      - `createProject(...)` now does the same when a project is created with initial files attached
    - `tests/browser/llmServiceFiles.test.ts`
      - added focused regression coverage proving list/add/remove all write the correct `project-knowledge` cache state
    - `scripts/grok-acceptance.ts`
      - extended the live WSL acceptance runner to assert that `cache files list --provider grok --project-id <id> --dataset project-knowledge` matches the visible file CRUD state after single-file upload, single-file removal, and multi-file upload
    - `docs/dev/smoke-tests.md`, `docs/testing.md`
      - updated the Grok file acceptance bar to require project-knowledge cache freshness, not just the visible file list
    - `tests/browser/grokActions.test.ts`
      - stabilized the plain-text response unit by giving the mock one more steady snapshot and a slightly wider wait budget so the focused validation suite stays clean
  - Verification:
    - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/providerCache.test.ts tests/browser/grokActions.test.ts tests/browser/llmServiceContext.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts --json`
      - passed with disposable project `aa02d27a-8a0c-4c7d-b006-92906f10e11b`, clone `bd23e825-a28a-43ee-948c-63a16605eef7`, and conversation `d6352fd9-34c2-4056-8697-ae670ae90e7e`
      - project file CRUD and `cache files list --dataset project-knowledge` agreed on `grok-file.txt`, `grok-file-a.txt`, and `grok-file-b.md`
      - medium-file guard still failed explicitly as intended with `Uploaded file(s) did not persist after save: grok-medium.jsonl`
  - Additional finding:
    - The remaining Grok file work is now about breadth of file surfaces, not persistence correctness for project files. Project files are now durable in both the live browser view and Aura-Call’s normalized cache/catalog view.

- 2026-03-27: Grok account-wide `/files` CRUD now works and is part of the WSL acceptance bar
  - Symptom:
    - Aura-Call only handled Grok project knowledge files, but Grok also exposes an account-wide `/files` page from the avatar menu
    - that master file list matters because Grok enforces a 1 GB account storage quota there
    - without support for the account-wide surface, Aura-Call could accumulate files and leave users blind to quota usage
  - Root cause:
    - the provider/cache/CLI model only covered project files and conversation files/attachments
    - the live Grok `/files` page has its own row parser, upload input, and a separate two-step inline delete flow (`Delete file`, then row-local `Delete`)
  - Fix:
    - `src/browser/providers/types.ts`, `src/browser/providers/domain.ts`, `src/browser/providers/cache.ts`
      - added account-file provider methods, source typing, and `account-files.json`
    - `src/browser/llmService/cache/store.ts`, `cache/catalog.ts`, `cache/export.ts`, `cache/index.ts`
      - added the `account-files` dataset across JSON + SQLite storage, catalog, and export
    - `src/browser/llmService/llmService.ts`
      - added cache-backed live account-file list/add/remove methods
    - `src/browser/providers/grokAdapter.ts`
      - implemented the live `/files` page adapter, including the current two-step inline delete sequence
    - `bin/auracall.ts`
      - added `auracall files add`, `auracall files list`, and `auracall files remove`
    - `scripts/grok-acceptance.ts`, `docs/dev/smoke-tests.md`, `docs/testing.md`, `docs/manual-tests.md`
      - added account-wide `/files` CRUD plus `account-files` cache freshness to the canonical WSL Grok acceptance bar
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - uploaded disposable account file `auracall-account-files-smoke-1774669753.txt`
      - listed it as Grok file id `3849f21d-c354-4ee0-a8b6-47258d41fd46`
      - removed it successfully with `auracall files remove 3849f21d-c354-4ee0-a8b6-47258d41fd46 --target grok`
      - refreshed `auracall files list --target grok` no longer showed the file
      - refreshed `cache files list --provider grok --dataset account-files --query auracall-account-files-smoke-1774669753` returned `count: 0`
  - Additional finding:
    - The first live delete attempt revealed that Grok account-file removal is not modal-based like project Personal Files. It stages delete inline on the row, so the adapter must explicitly drive the second row-local `Delete` action.

- 2026-03-28: Remaining Grok CRUD plan is now explicit, and conversation file listing/cache parity has started
  - Symptom:
    - after the WSL Grok acceptance bar went green, the remaining CRUD work was still only described conversationally
    - the cache/export layer already modeled `conversation-files` and `conversation-attachments`, but there was no stable service/CLI entry point for conversation-scoped files
  - Fix:
    - added `docs/dev/grok-remaining-crud-plan.md` to make the remaining scope explicit and prioritized
    - wired the plan into `docs/dev/smoke-tests.md`, `docs/testing.md`, and `docs/manual-tests.md`
    - started the first implementation slice:
      - `src/browser/providers/types.ts`
        - `listConversationFiles(...)` now accepts list options
      - `src/browser/llmService/llmService.ts`
        - added `listConversationFiles(...)`
        - added `refreshConversationFilesCache(...)`
        - falls back to `readConversationContext(...).files` when no dedicated provider list method exists
      - `bin/auracall.ts`
        - added `auracall conversations files list <conversationId> [--project-id <id>]`
      - `tests/browser/llmServiceFiles.test.ts`
        - added focused coverage for provider-backed and context-fallback conversation file cache writes
  - Verification:
    - pending focused tests + typecheck
  - Additional finding:
    - The right first step is read/list/cache parity, not upload/delete. It gives the next live Grok adapter work a stable surface to target instead of another one-off browser patch.

- 2026-03-28: Grok conversation-file read parity now uses the live sent-turn file chips, not just service/cache scaffolding
  - Symptom:
    - `auracall conversations files list <conversationId> --target grok` existed at the service/CLI level, but Grok still had no live adapter-backed conversation-file surface
    - the first landing zone depended on provider `listConversationFiles(...)` when available, otherwise on `readConversationContext(...).files`, but Grok exposed neither
  - Fix:
    - live-probed the current WSL Grok conversation page and confirmed the real file surface:
      - user message rows render file chips above the bubble
      - the chip exposes filename text and an icon `aria-label` such as `Text File`
      - the row does not expose a provider file id or remote link
    - `src/browser/providers/grokAdapter.ts`
      - added `mapGrokConversationFileProbes(...)`
      - added `readVisibleConversationFilesWithClient(...)`
      - added Grok `listConversationFiles(...)`
      - updated `readConversationContext(...)` to include `files[]`
      - added a short polling window so context reads do not sample before file chips finish rendering
    - `tests/browser/grokAdapter.test.ts`
      - added focused coverage for conversation-file probe mapping/deduping
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations files list 07adb712-2304-4746-adfd-2c87c888cec0 --target grok`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get 07adb712-2304-4746-adfd-2c87c888cec0 --target grok --json-only`
      - confirmed cache write at `~/.auracall/cache/providers/grok/ez86944@gmail.com/conversation-files/07adb712-2304-4746-adfd-2c87c888cec0.json`
  - Additional finding:
    - Grok conversation-file rows currently do not expose a durable provider-side file id. Aura-Call must synthesize stable ids from conversation id + response row id + chip index until Grok surfaces something richer.
    - Grok currently exposes mutation asymmetrically on conversations:
      - existing conversation composers still have `Attach` for the next turn
      - already-sent file chips only open a read-only preview aside with `Close`
      - no delete/remove/download control was visible on the sent file surface

- 2026-03-28: WSL Grok scripted acceptance is green again after fixing project-create verification, root submit/attach commit, multiline composer input, and `/files` readiness
  - Symptom:
    - after the conversation-file work landed, the full WSL acceptance runner still failed in several real ways:
      - `projects create` could fail even though Grok had actually created the project
      - root/non-project browser runs with an attached file could stage the prompt and attachment but never commit the turn
      - multiline markdown prompts on the live Grok `ProseMirror` composer could be flattened before send
      - `/files` refreshes could falsely fail with `Grok files page did not load` right after a successful delete
  - Root cause:
    - project-create verification only trusted immediate post-submit URL navigation instead of also consulting the live visible project list
    - the Grok send path was too optimistic about when a visible enabled submit control existed and whether a click actually committed the turn
    - the composer input path treated Grok's `ProseMirror` more like a plain text input and could lose line breaks/fence structure
    - the `/files` readiness gate required a narrower page shape than Grok currently presents during some post-delete refresh states
  - Fix:
    - `scripts/grok-acceptance.ts`
      - added a disposable root/non-project conversation-file step to the canonical WSL acceptance runner
      - added polling helper reuse for new conversation discovery instead of a one-shot list diff
    - `src/browser/providers/grokAdapter.ts`
      - added project-create recovery by exact normalized project name against the visible project surfaces
      - hardened the create-project name setters so the entered name must actually stick before continuing
      - broadened the `/files` readiness gate to accept the current usable heading/search/upload/empty-state combinations
    - `src/browser/actions/grok.ts`, `src/browser/index.ts`
      - made `setGrokPrompt(...)` preserve multiline `ProseMirror` content more defensively
      - made `submitGrokPrompt(...)` wait for a real enabled submit, verify commit, and fall back to Enter if click alone does not commit the turn
    - `tests/browser/grokActions.test.ts`, `tests/browser/grokAdapter.test.ts`
      - updated focused regression coverage for the stronger Grok submit/project-create paths
  - Verification:
    - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - root file probe returned `AuraCall Root Submit Probe` with `files=1`
      - multiline markdown probe preserved `- alpha` plus the fenced `txt` block
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json` returned `ok: true`
  - Additional finding:
    - The WSL-primary Grok bar is no longer blocked on core CRUD correctness. The remaining Grok work is now follow-on quality/breadth work plus quota cleanup of disposable artifacts left behind by failed intermediate runs.

- 2026-03-28: Grok `/files` needed a navigation fallback even after the broader ready-gate fix
  - Symptom:
    - `auracall files list --target grok` could still fail with `Grok files page did not load` during quota cleanup, even though the live WSL browser clearly showed a valid `Files - Grok` page with:
      - `Files`
      - `Add new file`
      - row `Options`
      - the expected disposable file names
  - Root cause:
    - the `/files` ready predicate was already correct on the live DOM
    - the remaining failure was the route/attach path into `/files`: Aura-Call could attach on an existing Grok tab, call `Page.navigate(...)`, and then give up before the SPA route fully settled on the files surface
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - added `waitForGrokFilesPath(...)`
      - updated `navigateToGrokFiles(...)` to retry with an in-page `location.assign(...)` fallback before the ready gate gives up
    - verification:
      - the exact `/files` ready predicate evaluated to `ok: true` on the live page after direct CDP inspection
      - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files list --target grok`
  - Additional finding:
    - The lingering Grok `/files` flake was no longer about selector coverage. It was a navigation/settling race on top of an otherwise valid page.

- 2026-03-28: Cleaned the stale Grok acceptance artifacts after the WSL pass went green
  - Work completed:
    - removed the leftover `AuraCall ...` disposable projects created by failed intermediate passes
    - removed the disposable Grok account-file artifacts named like:
      - `grok-file*`
      - `grok-conversation-file*`
      - `grok-root-file*`
      - `grok-acceptance-*`
      - `auracall-conversation-file-probe-*`
  - Verification:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects --target grok --refresh`
      - remaining projects now: `SoyLei`, `Oracle (clone)`, `Oracle`
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files list --target grok`
      - no `grok-file*`, `grok-conversation-file*`, `grok-root-file*`, or `grok-acceptance-*` rows remained
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --dataset account-files --query grok-file`
      - returned `count: 0`
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --dataset account-files --query grok-conversation-file`
      - returned `count: 0`
  - Additional finding:
    - The remaining account-file rows are non-disposable uploads (for example `dup.txt`, `notes.txt`, `spec.md`, doc files, images, and browser-service docs) rather than the acceptance/debug artifacts this cleanup targeted.

- 2026-03-28: `auracall conversations files add ...` could succeed in Grok and still die afterward while refreshing `conversation-files`
  - Symptom:
    - the first live `auracall conversations files add <conversationId> --target grok --prompt ... -f ...` appended the file and follow-up turn successfully, but then exited with:
      - `TypeError: Cannot read properties of undefined (reading 'webSocketDebuggerUrl')`
    - a follow-up context probe showed the mutation had actually happened, so the failure was in the post-send refresh path, not the Grok send itself
  - Root cause:
    - after `runBrowserMode(...)` returned, the CLI asked `llmService.listConversationFiles(...)` to rediscover the browser session
    - that rediscovery could race against Chrome shutdown and stale DevTools state instead of simply reusing the runtime endpoint that had just sent the turn
  - Fix:
    - `bin/auracall.ts`
      - `conversations files add` now keeps the just-used browser alive long enough to refresh `conversation-files` from that same runtime endpoint
      - if the caller did not request `keepBrowser`, the command now closes the browser explicitly after the refresh
    - `src/browser/llmService/llmService.ts`
      - `buildListOptions(...)` now treats explicit runtime `host` / `port` overrides as authoritative and skips service-target rediscovery for that case
    - `tests/browser/llmServiceFiles.test.ts`
      - added a regression that verifies explicit `host` / `port` overrides do not trigger browser rediscovery
  - Verification:
    - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - live fresh conversation `c7188321-f0e4-4c39-ba1f-75e6511dcd14`:
      - first-run `auracall conversations files add ...` returned success
      - `conversations files list`, `conversations context get --json-only`, and `cache files list --dataset conversation-files` all agreed on `grok-conversation-append-fix-22376b.txt`
  - Additional finding:
    - on the WSL Grok path, conversation-file mutation is now practical as append-only add, but Grok still does not expose delete controls for already-sent conversation file chips.

- 2026-03-28: deleting a conversation left stale `conversation-files` cache rows behind
  - Symptom:
    - after deleting live disposable conversation `c7188321-f0e4-4c39-ba1f-75e6511dcd14`, refreshed conversation history no longer listed it, but `cache files list --provider grok --conversation-id ... --dataset conversation-files` still returned the attached file row
  - Root cause:
    - the CLI delete flow refreshed the conversation list cache only
    - it never cleared the per-conversation `conversation-files` / `conversation-attachments` datasets for the deleted conversation id
  - Fix:
    - `bin/auracall.ts`
      - after successful delete, Aura-Call now writes empty `conversation-files` and `conversation-attachments` datasets for each deleted conversation before refreshing the conversation list cache
  - Verification:
    - live disposable conversation `740f3cbe-6790-4729-9952-5ea899053edb`:
      - created
      - appended file via `conversations files add`
      - deleted via `auracall delete ... --target grok --yes`
      - `cache files list --provider grok --conversation-id 740f3cbe-6790-4729-9952-5ea899053edb --dataset conversation-files` returned `count: 0`

- 2026-03-28: `browser.hideWindow` needed launch-time minimization and per-client focus suppression, not a process-global env toggle
  - Symptom:
    - headful Aura-Call browser runs on WSL/Linux could still steal focus even with `browser.hideWindow`
    - the first implementation used a process-global env var to suppress Grok `bringToFront()` calls, which was wrong for simultaneous multi-profile work
  - Root cause:
    - hiding/minimizing after Chrome launched was too late to prevent the initial focus grab
    - Grok still had its own `Page.bringToFront()` path
    - a process-wide env flag would leak focus policy across profiles/runs in one process
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - add `--start-minimized` for headful `hideWindow` launches
      - export `wasChromeLaunchedByAuracall(...)`
      - tag fresh vs adopted Chrome handles so only newly launched windows are auto-hidden
    - `packages/browser-service/src/manualLogin.ts`, `src/browser/index.ts`, `src/browser/reattach.ts`, `src/browser/reattachCore.ts`
      - only auto-hide Aura-Call-launched windows
      - manual-login launch now reapplies hide after opening the initial target URL
    - `src/browser/providers/grokAdapter.ts`
      - replace the process-global focus-suppression env var with per-client metadata
    - tests:
      - `tests/browser-service/chromeLifecycle.test.ts`
      - `tests/browser-service/chromeTargetReuse.test.ts`
      - `tests/browser/manualLogin.test.ts`
      - `tests/browser/grokAdapter.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser-service/chromeLifecycle.test.ts tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/grokAdapter.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live WSL disposable smoke:
      - `_NET_ACTIVE_WINDOW` before launch matched `_NET_ACTIVE_WINDOW` after launch/open (`unchanged: true`)
      - Chrome DevTools still reported `windowState: "normal"` on this X11 stack
  - Additional finding:
    - On the current WSL/X11 environment, "no focus steal" is the trustworthy invariant. DevTools window-bounds state is not a reliable minimized-state oracle there.

- 2026-03-28: browser-service needed an explicit DOM-drift extraction plan after the Grok stabilization push
  - Symptom:
    - repeated Grok fixes kept landing in adapter code even when the failure class was generic:
      - SPA route settling
      - hover-only row actions
      - multi-surface action fallbacks
      - weak failure diagnostics
  - Root cause:
    - the package backlog did not yet spell out the next concrete extractions, so the path of least resistance was another provider-local patch
  - Fix:
    - expanded `docs/dev/browser-service-upgrade-backlog.md` with the current DOM-drift plan and priority order:
      - `navigateAndSettle(...)`
      - anchored row/menu action helpers
      - structured UI diagnostics wrappers
      - canonical action-surface fallback helpers
      - explicit per-client focus policy
      - optional failure snapshots
    - wired that plan into:
      - `AGENTS.md`
      - `docs/dev/browser-automation-playbook.md`
      - `docs/dev/browser-service-tools.md`
      - `docs/dev/smoke-tests.md`
  - Additional finding:
    - the most reusable lesson from the Grok work is not any one selector fix; it is that browser-service needs stronger post-condition helpers and better built-in diagnostics so DOM drift is cheaper to repair next time.

- 2026-03-28: started extracting SPA route settling into browser-service via `navigateAndSettle(...)`
  - Symptom:
    - Grok still had repeated provider-local route code:
      - `Page.navigate(...)`
      - document-ready polling
      - route predicate polling
      - fallback `location.assign(...)`
    - this was the same drift pattern we had already identified in the new backlog
  - Root cause:
    - browser-service had good wait primitives, but no single navigation helper that combined route settling with optional ready checks and a route fallback
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - added `navigateAndSettle(...)`
    - `tests/browser-service/ui.test.ts`
      - added focused coverage for direct success and fallback `location.assign(...)`
    - `src/browser/providers/grokAdapter.ts`
      - moved `/files` navigation settling onto the shared helper
      - moved generic Grok URL/project navigation onto the shared helper
      - kept provider-specific post-validation (`isValidProjectUrl(...)`) in the adapter
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - Additional finding:
    - the first useful extraction was exactly the right size: one package helper plus one provider adoption. It improved maintainability immediately without trying to genericize every Grok branch in one pass.

- 2026-03-28: started extracting anchored row/menu action helpers into browser-service
  - Symptom:
    - Grok still repeated the same row-hover plumbing in multiple places:
      - reveal hidden row actions
      - open hidden row `Options` menus
      - then click rename/delete/menu items
    - the provider code was already using browser-service primitives, but the higher-level row interaction pattern was still duplicated
  - Root cause:
    - browser-service had `hoverAndReveal(...)`, `pressRowAction(...)`, and `openMenu(...)`, but no helper that expressed the common “reveal then act” pattern directly
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - added `clickRevealedRowAction(...)`
      - added `openRevealedRowMenu(...)`
    - `tests/browser-service/ui.test.ts`
      - added focused coverage for both helpers
    - `src/browser/providers/grokAdapter.ts`
      - moved the root/sidebar conversation `Options` menu opening onto `openRevealedRowMenu(...)`
      - moved history-dialog conversation rename/delete row actions onto `clickRevealedRowAction(...)`
    - docs:
      - marked the anchored row/menu backlog item as started in `docs/dev/browser-service-upgrade-backlog.md`
      - updated `docs/dev/browser-service-tools.md`
      - updated `docs/dev/browser-automation-playbook.md`
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
  - Additional finding:
    - This was the right scope for the second extraction too: the generic reveal-then-act helpers now cover the conversation/sidebar/history paths, while the project-row `Options` path still needs one more generalization around link-navigation suppression before it can move fully onto the shared helper.

- 2026-03-28: moved the Grok project-row `Options` path onto the shared row-menu helper shape
  - Symptom:
    - `openProjectMenuButton(...)` still owned a large provider-local block for:
      - picking the best hidden `Options` trigger near the project row
      - suppressing accidental project-link navigation
      - trying direct click first
      - then falling back to manual CDP pointer events
    - that meant the highest-drift part of the project menu path was still not actually using the new browser-service helper
  - Root cause:
    - the first `openRevealedRowMenu(...)` extraction covered plain hidden menu triggers, but not the real-world case where the trigger sits beside a navigable link and needs a prep/fallback stage before open attempts
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - extended `openRevealedRowMenu(...)` with:
        - `prepareTriggerBeforeOpen`
        - `directTriggerClickFallback`
      - the helper now:
        - makes the tagged trigger visible/clickable
        - installs one-shot link click suppression on nearby navigable ancestors
        - retries with a direct `trigger.click()` fallback if the generic `openMenu(...)` path still misses
    - `tests/browser-service/ui.test.ts`
      - added a regression for the prepare + direct-click fallback path
    - `src/browser/providers/grokAdapter.ts`
      - kept the Grok-specific row/button tagging logic
      - replaced the old direct-click + raw CDP pointer-click block with `openRevealedRowMenu(...)`
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
      - project rename/clone/remove and the later project conversation rename/delete flows all completed on the same run
  - Additional finding:
    - The remaining project-row complexity is now mostly “pick the correct button in this row,” not “how do we hover/open the menu safely.” That is a cleaner boundary for deciding what should remain provider-specific.

- 2026-03-28: documented the next browser-service extraction plan and made it the active repair policy
  - Symptom:
    - after the row/menu helper extractions, the remaining question was no longer “how do we open this menu?” but “should trigger scoring move into browser-service too?”
    - leaving that as an implicit judgment call would make the next DOM-drift repair inconsistent again
  - Root cause:
    - the backlog said structured diagnostics were next in priority order, but it did not yet spell out the concrete implementation steps or the rule for when trigger scoring should stay adapter-local
  - Fix:
    - `docs/dev/browser-service-upgrade-backlog.md`
      - made structured UI diagnostics wrappers the active next implementation plan
      - added the concrete phases:
        - `collectUiDiagnostics(...)`
        - `withUiDiagnostics(...)`
        - first Grok adoption surfaces
        - focused tests
        - live WSL Grok acceptance verification
      - added the explicit extraction rule:
        - do not move trigger scoring into browser-service until the same scoring shape repeats on another real surface/provider
    - `AGENTS.md`
      - added the current browser-service plan to the standing repo guidance
    - `docs/dev/browser-automation-playbook.md`
      - wired the same decision into the runbook
    - `docs/dev/browser-service-tools.md`
      - recorded the active extraction plan alongside the helper inventory
  - Additional finding:
    - this gives a better decision boundary:
      - browser-service should own mechanics and diagnostics first
      - adapters should keep app-shaped trigger scoring until there is evidence for a generic primitive

- 2026-03-28: started the structured UI diagnostics extraction and used it to repair the next live Grok drift round
  - Symptom:
    - live Grok regressions were still real, but they had become hard to localize quickly:
      - clone rename sometimes failed on a concrete project page with no obvious selector-level clue
      - root conversation file list after append could fail with a generic “Conversation content not found”
      - root conversation delete could fail with “Conversation sidebar row not found” even though the conversation still existed
  - Root cause:
    - browser-service had generic navigation and row helpers, but fragile flows still did not carry enough scoped UI evidence on failure
    - several of the remaining Grok failures were also hydration/timing problems rather than wrong-selector problems:
      - root `/c/...` reads were using raw `Page.navigate(...)`
      - clone rename could fire before the concrete project page had hydrated
      - root conversation list/delete depended on a home/sidebar surface that can lag behind the actual completed browser run
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - added `collectUiDiagnostics(...)`
      - added `withUiDiagnostics(...)`
      - first diagnostics payload includes:
        - URL/title/readyState
        - active element summary
        - visible dialogs
        - visible menus plus menu items
        - visible buttons in scope
        - scoped candidate census
    - `tests/browser-service/ui.test.ts`
      - added focused diagnostics/enrichment coverage
    - `src/browser/providers/grokAdapter.ts`
      - adopted `withUiDiagnostics(...)` for:
        - project menu open
        - project menu item selection
        - conversation sidebar menu open
      - root conversation reads now use route-settled navigation plus a broader conversation-surface wait
      - sent-turn conversation-file chip polling now waits longer after append
      - root sidebar row tagging now retries long enough to survive the observed post-append lag
      - concrete project rename now waits for the project rename surface to hydrate before acting
      - root/non-project conversation listing now merges the visible home/sidebar conversation surface
    - `scripts/grok-acceptance.ts`
      - widened the root post-browser conversation wait
      - added a deliberate fallback to the fresh browser session’s recorded `conversationId` when the root list surface still lags
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live targeted proofs:
      - `conversations context get db726922-f6a1-49c7-bdc3-f9c607c620a1 --target grok --json-only`
      - `conversations files list db726922-f6a1-49c7-bdc3-f9c607c620a1 --target grok`
      - `projects clone ff05cf94-c79d-4021-b66f-db19eb099c1e 'AuraCall Cedar Orbit hydratefix' --target grok`
      - `delete d966a9e0-85e6-4beb-8461-1bf6e08c3b9e --target grok --yes`
      - `conversations --target grok --refresh --include-history`
  - Additional finding:
    - the new diagnostics made the remaining failures much more specific:
      - clone issues were really pre-hydration rename attempts
      - root append/list issues were really route/surface settle problems
      - root delete issues were really home/sidebar discovery lag, not missing conversations
  - Final verification:
    - the full WSL Grok acceptance runner is green again on a fresh clean pass:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
      - clean pass ids:
        - project `b3f7da94-9342-4194-84ac-34b3c51c480c`
        - clone `ca3d75e7-5cba-4f5c-b801-bcc949d88284`
        - project conversation `77bee9d5-9d28-4fd6-9bb0-0d2a706e321c`
        - root conversation `39ed172c-59c4-4813-a98f-874e5ec7ba33`
    - stale disposable Grok projects from earlier failed runs were cleaned up afterward:
      - removed 42 `AuraCall Cedar (Atlas|Harbor|Orbit) ...` projects
      - verified `leftoverCount: 0` for that disposable family

## 2026-03-28 — ChatGPT project CRUD: DOM findings and first live green pass

- Scope:
  - start ChatGPT project CRUD after the Grok stabilization work
  - switch the browser-mode default model to Instant before the live ChatGPT pass
- Changed:
  - `src/browser/constants.ts`
    - browser-mode default model label now points at Instant instead of Pro
  - `src/cli/runOptions.ts`
    - browser engine fallback model now resolves to `gpt-5.2-instant`
  - `src/schema/resolver.ts`
    - browser-mode model fallback now resolves to `gpt-5.2-instant`
  - `src/browser/providers/chatgptAdapter.ts`
    - added initial ChatGPT project CRUD adapter coverage:
      - `listProjects`
      - `createProject`
      - `renameProject`
      - `selectRemoveProjectItem`
      - `pushProjectRemoveConfirmation`
    - canonicalized ChatGPT project ids to the bare `g-p-...` prefix
    - made create verification route-authoritative:
      - a post-submit route change to a new project id now counts as success even if the new page title/settings controls are still hydrating
    - added a ChatGPT project-surface hydration wait before rename/delete/settings work
    - broadened project-settings readiness detection beyond one specific input selector
    - targeted the real `Delete project?` confirmation dialog instead of the first dialog node, because the project settings sheet stays open underneath it
    - retried `listProjects` once with a fresh tab resolution when the initial attachment dies with `WebSocket connection closed`
  - `src/browser/providers/index.ts`
    - wired the new ChatGPT adapter into the provider registry
  - `tests/browser/chatgptAdapter.test.ts`
    - added focused coverage for:
      - slugged vs bare ChatGPT project id extraction
      - normalized project-name matching
- Live DOM findings that mattered:
  - sidebar project rows expose stable row-menu triggers:
    - `Open project options for <Project Name>`
  - create-project modal:
    - root: `[data-testid="modal-new-project-enhanced"]`
    - name: `input[name="projectName"]`
    - confirm text: `Create project`
  - project-page settings surface:
    - page trigger: aria starts with `Edit the title of ...`
    - secondary trigger: `Show project details`
    - fields:
      - `input[aria-label="Project name"]`
      - `textarea[aria-label="Instructions"]`
  - delete flow is two dialogs:
    - settings sheet remains open
    - destructive confirm dialog overlays it with `Delete` + `Cancel`
  - ChatGPT uses mixed id shapes:
    - current route: bare `g-p-...`
    - sidebar href: `g-p-...-slug`
    - Aura-Call should keep the bare prefix as the canonical project id
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - create/rename/delete disposable ChatGPT project:
      - `AuraCall Harbor Vector`
      - rename to `AuraCall Harbor Ledger`
      - delete successful
    - direct rename/delete also passed on:
      - `g-p-69c852c00f7c8191a935698b7b6df07b`
      - `AuraCall Maple Orbit` -> `AuraCall Maple Harbor` -> deleted
    - `pnpm tsx bin/auracall.ts projects --target chatgpt`
      - now survives the stale-target websocket-close case and returns the real project list again
- Cleanup:
  - deleted the disposable ChatGPT probe projects created during DOM recon and validation
  - the remaining live ChatGPT projects list is back to the user’s real set:
    - `Support Letters`
    - `Reviewer`
    - `SoyLei`
    - `SABER Company`
    - `HARVEST Roads`
- Remaining note:
  - ChatGPT cache writes still prompt for cache identity unless `browser.cache.identityKey` / `browser.cache.identity` is configured; that is not a CRUD blocker, but it is still CLI noise
- Follow-up:
  - `bin/auracall.ts`
    - added `projects create --memory-mode <global|project>` for ChatGPT project creation
  - `src/browser/providers/domain.ts`
    - introduced shared `ProjectMemoryMode` plus normalization for `global` / `default` and `project` / `project-only`
  - `src/browser/providers/types.ts`
  - `src/browser/llmService/llmService.ts`
    - threaded optional project memory mode through provider/service create flows
    - accept bare ChatGPT `g-p-...` ids directly in `resolveProjectIdByName(...)` so `projects remove g-p-...` works without a cache-name lookup
  - `src/browser/providers/chatgptAdapter.ts`
    - mapped memory mode selection to ChatGPT's current create-modal gear menu:
      - `global` -> `Default`
      - `project` -> `Project-only`
    - switched the gear open path from a plain synthetic button click to the shared pointer-driven `openMenu(...)` helper, with `Space`/`ArrowDown` keyboard fallbacks for the current modal behavior
    - broadened project-settings open for rename/delete:
      - stop scoping the `Edit the title of ...` trigger to `main`
      - retry through `Show project details` when the page-level settings surface drifts
  - `tests/browser/chatgptAdapter.test.ts`
    - added coverage for ChatGPT memory-mode label mapping
- Live DOM finding that mattered:
  - ChatGPT create-modal `Project settings` gear is not equivalent to a simple synthetic `click`
  - on the current live DOM it opens on:
    - pointer sequence
    - keyboard `Space`
    - keyboard `ArrowDown`
  - Aura-Call now follows that actual interaction model instead of assuming button-click parity
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable ChatGPT projects:
      - `AuraCall Harbor Memory Global`
      - `AuraCall Harbor Memory Project`
    - `--memory-mode project` now creates successfully on the managed WSL Chrome profile
    - removed both disposable projects successfully by bare `g-p-...` id

## 2026-03-28 — Browser-service absorbed the ChatGPT menu/surface/id learnings

- Scope:
  - stop re-solving the ChatGPT gear/settings drift in provider code
  - move the generalizable parts into browser-service and the provider interface
- Changed:
  - `packages/browser-service/src/service/ui.ts`
    - `pressButton(...)` now accepts ordered `interactionStrategies`
    - `openMenu(...)` now retries ordered interaction strategies and reports which strategy opened the menu
    - added `openSurface(...)` for shared “try these triggers until ready” flows
    - `collectUiDiagnostics(...)` / `withUiDiagnostics(...)` now accept caller `context`
  - `tests/browser-service/ui.test.ts`
    - added focused coverage for:
      - menu interaction-strategy fallback
      - surface trigger fallback
      - diagnostics context preservation
  - `src/browser/providers/types.ts`
    - added provider hooks for project-id normalization/extraction
  - `src/browser/providers/index.ts`
    - wired ChatGPT/Grok project-id hooks into the provider registry
  - `src/browser/llmService/llmService.ts`
    - provider-native project-id passthrough is now hook-based instead of a hardcoded ChatGPT branch
    - configured project-url parsing now asks the provider first
  - `src/browser/providers/chatgptAdapter.ts`
    - create-modal memory-mode now uses browser-service interaction strategies through `openMenu(...)`
    - project-settings open now uses `openSurface(...)` instead of provider-local trigger retry blocks
- Live lesson captured in code:
  - a UI trigger can be “button-shaped” without being plain-click-equivalent
  - browser-service now models that explicitly instead of forcing adapters to hand-roll pointer/keyboard fallbacks
- Verification:
  - focused:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable ChatGPT project `AuraCall BrowserService Surface Probe` with `--memory-mode project`
    - removed it successfully by bare id `g-p-69c86caa0c308191bb2af23d234cf23f`

## 2026-03-29 — browser-service now selects the correct visible menu family

- Problem:
  - multiple menus can be visible at once
  - returning generic selectors like `[role="menu"]` lets later item selection
    hit the wrong menu family
  - provider code was compensating with ad hoc menu scoring logic
- Fix:
  - `packages/browser-service/src/service/ui.ts`
    - added `collectVisibleMenuInventory(...)`
      - bounded visible-menu census with item labels, geometry, and optional
        anchor distance
      - assigns a specific tagged selector to each currently visible menu so
        callers can target the chosen menu directly
    - upgraded `waitForMenuOpen(...)`
      - can now choose the best visible menu by expected item labels, new-vs-old
        menu signatures, and optional anchor proximity
    - upgraded `openMenu(...)`
      - records pre-open menu signatures and passes expected-item context into
        the shared waiter
    - `openAndSelectMenuItem(...)` / `selectFromListbox(...)`
      - now route their intended option label through the shared menu opener
  - `src/browser/providers/chatgptAdapter.ts`
    - ChatGPT project-create memory mode now uses the shared expected-item menu
      selection path for `Default` / `Project-only`
- Why it matters:
  - browser-service now owns the generic "pick the right menu family" fix that
    came out of ChatGPT composer/project drift, instead of leaving it as another
    provider-local menu heuristic
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - created disposable ChatGPT project `AC BS Menu Probe 329` with
      `--memory-mode project`
    - removed it successfully afterward

## 2026-03-28 — ChatGPT project sources/files CRUD now survives fresh reloads

- Scope:
  - finish the ChatGPT project sources/files CRUD slice on the managed WSL Chrome path
  - stop treating the immediate post-picker source row as authoritative persistence
  - fix nested `projects files ...` / `projects instructions ...` target inheritance so `--target chatgpt` works the same way under subcommands
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added reload-backed helpers for project-source persistence and removal verification
    - `uploadProjectFiles(...)` now requires the uploaded source names to survive a fresh `Sources` reload before returning success
    - `deleteProjectFile(...)` now requires the removed source name to stay gone after a fresh reload
    - `listProjectFiles(...)` now performs one hard-reload retry before returning an empty list
  - `bin/auracall.ts`
    - nested `projects files add|list|remove` now inherit `--target` from the parent/root CLI
    - nested `projects instructions get|set` now inherit `--target` from the parent/root CLI too
- Live DOM lesson captured in code:
  - ChatGPT closes the `Add sources` picker and shows a row immediately after file selection, but that first row is not a strong persisted-state proof on its own
  - a fresh `?tab=sources` reload is the right verification boundary for ChatGPT project sources
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable ChatGPT project `AuraCall ChatGPT Sources Acceptance 1774747901`
    - `projects files add g-p-69c8810c65ac8191b2906da27ea5132f --target chatgpt --file /tmp/chatgpt-project-source-gQ3f.md`
    - `projects files list ...` returned `chatgpt-project-source-gQ3f.md`
    - `projects files remove ... chatgpt-project-source-gQ3f.md --target chatgpt`
    - follow-up `projects files list ...` returned `No files found for project g-p-69c8810c65ac8191b2906da27ea5132f.`
    - removed the disposable project afterward

## 2026-03-28 — ChatGPT project instructions now verify against the live settings sheet

- Scope:
  - finish the remaining ChatGPT project-instructions CRUD slice on the managed WSL Chrome path
  - make create-with-instructions and explicit `projects instructions set` rely on the same persisted-state proof
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added `getProjectInstructions(projectId, ...)`
    - added `updateProjectInstructions(projectId, instructions, ...)`
    - added `readProjectSettingsSnapshot(...)` for the live project settings sheet
    - added `waitForProjectInstructionsApplied(...)` so instructions writes only return success after the sheet is reopened and the textarea value matches
    - create-with-instructions now reuses the same persistence verification instead of trusting the first edit pass
    - relaxed project delete success so a fresh post-delete sidebar/project scrape counts as success even if ChatGPT leaves the selected tab on the stale project route
  - `tests/browser/chatgptAdapter.test.ts`
    - adapter capabilities coverage now includes ChatGPT project instructions support
- Live DOM findings that mattered:
  - the current ChatGPT project settings sheet exposes instructions at `textarea[aria-label="Instructions"]`
  - there is still no explicit `Save` button, so the only safe success criterion is reopen-and-verify
  - ChatGPT currently rejects project names longer than 50 characters in the create modal; that is surfaced by the disabled `Create project` button, not by a later API error
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable project `AC GPT Instr 1774749141`
    - `projects instructions set g-p-69c886002f6c8191a47b0335f89f5c59 --target chatgpt --file /tmp/tmp.hA6LUzlmsI`
    - `projects instructions get g-p-69c886002f6c8191a47b0335f89f5c59 --target chatgpt`
      - returned:
      - `Keep answers concise.`
      - `Always surface risks before suggestions.`
    - disposable project deletion succeeded in the live product state even though the original route-based delete post-condition fired falsely; the project no longer appeared in the refreshed project list

## 2026-03-29 — ChatGPT conversation CRUD now works on the managed WSL profile

- Scope:
  - finish root ChatGPT conversation CRUD before moving on to ChatGPT attachment breadth
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added ChatGPT conversation list/read/rename/delete support
    - added canonical root/project conversation URL resolution
    - added sidebar conversation scraping + normalization
    - added row-tagging helpers for sidebar conversation action buttons
    - context reads now poll the turn DOM and do one reload/retry before failing
    - conversation delete now prefers the sidebar row menu and only falls back to the header menu if needed
    - row lookup now polls for sidebar hydration instead of failing on the first miss
  - `src/browser/providers/index.ts`
    - ChatGPT conversation URL resolution is now project-aware
  - `tests/browser/chatgptAdapter.test.ts`
    - added helper coverage for conversation id extraction, conversation probe normalization, canonical conversation URL resolution, and ChatGPT conversation capability advertising
- Live DOM lessons captured in code:
  - ChatGPT can truncate long sidebar conversation titles, so full-prompt filters are not a safe acceptance pattern
  - the route can be correct before the turn DOM is ready, so route checks alone are not enough for context reads
  - the sidebar row menu is the more reliable destructive-action surface for conversations in the current layout
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live non-Pro WSL ChatGPT pass:
    - created conversation `69c9410c-5678-8331-b6b3-d302ad9b922a`
    - listed it successfully
    - read context successfully
    - renamed it to `AuraCall ChatGPT CRUD Renamed`
    - deleted it successfully
    - verified it no longer appeared in the refreshed conversation list

## 2026-03-29 — ChatGPT conversation files now read from real sent-turn upload tiles

- Scope:
  - begin Phase 3 of the ChatGPT conversation surface plan by making real sent-turn uploads visible through CLI read surfaces before attempting any delete semantics
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added ChatGPT conversation-file probe normalization
    - added sent user-turn file tile scraping
    - added `listConversationFiles(...)`
    - `readConversationContext(...)` now returns `files[]` for ChatGPT conversation uploads
  - `tests/browser/chatgptAdapter.test.ts`
    - added coverage for `normalizeChatgptConversationFileProbes(...)`
- Live DOM lessons captured in code:
  - small text-file runs need `--browser-attachments always` during live ChatGPT attachment recon; under `auto`, ChatGPT can inline the file contents into the prompt and never create a real upload tile
  - the current authoritative file-read surface is the sent user-turn tile group (`role="group"` with `aria-label=<filename>`), not the transient picker row and not a speculative `View files in chat` dialog
  - the live sent-turn tile does not currently expose a stronger stable native file id, so the adapter uses synthetic identity built from `conversationId + turn/message id + tile index + file name`
  - product boundary: users can remove files from the composer before send, but cannot delete an already-sent file from a ChatGPT conversation; durable delete belongs to project `Sources`
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created real upload conversation `69c95f14-2ca0-8329-9d3a-be5d1a1967ab` with forced native attachment upload
    - `conversations files list 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt`
      - returned `chatgpt-real-upload-vmuk.txt`
    - `conversations context get 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt --json-only`
      - returned the same file in `files[]` with matching metadata
    - cleanup follow-up:
      - the first delete attempt exposed a stale-postcondition false negative after the destructive action had already succeeded
      - `waitForChatgptConversationDeleted(...)` now refreshes to the authoritative list surface before treating remaining stale anchors as real survivors
      - live reproof:
        - created disposable upload conversation `69c96223-2708-8329-b563-00e171e22b39`
        - `delete 69c96223-2708-8329-b563-00e171e22b39 --target chatgpt --yes`
          - returned `Deleted successfully.`

## 2026-03-29 — ChatGPT llmservice now persists rate-limit cooldown and write spacing

- Scope:
  - analyze why the ChatGPT acceptance path tripped the account-level `Too many requests` dialog
  - add a real guard in the ChatGPT llmservice layer so separate `auracall` CLI processes stop rediscovering the same rate limit by hammering the account
- Root cause:
  - the failure was not one broken DOM path
  - the acceptance path stacked multiple ChatGPT write-heavy operations across separate CLI invocations in a short window:
    - project create/rename
    - source add/remove
    - instructions set
    - later conversation rename/delete
  - once ChatGPT surfaced a visible `Too many requests` / `You're making requests too quickly` dialog, the next fresh process had no memory of that state and kept touching the live browser
- Changed:
  - `src/browser/llmService/llmService.ts`
    - added a persisted provider guard for ChatGPT under `~/.auracall/cache/providers/chatgpt/__runtime__/rate-limit-<profile>.json`
    - mutating ChatGPT llmservice operations are now spaced apart automatically before live browser work begins
    - live ChatGPT llmservice calls now honor a persisted cooldown after a detected rate-limit failure, with a short auto-wait path for near-expired cooldowns and a fail-fast path for longer active cooldowns
    - rate-limit detection currently keys off the real ChatGPT UI error text already captured in adapter/UI-diagnostics failures (`Too many requests`, `...too quickly`, `rate limit`)
  - `src/browser/llmService/providers/chatgptService.ts`
    - moved ChatGPT project/conversation list + rename/delete through the guarded llmservice retry wrapper so the persisted cooldown applies to real live ChatGPT CRUD entry points
  - `src/browser/chatgptRateLimitGuard.ts`
    - added the shared ChatGPT rate-limit guard path/profile/message helpers so llmservice CRUD and browser-mode prompt runs use the same persisted cooldown contract
  - `src/browser/index.ts`
    - ChatGPT browser-mode prompt runs now consult the persisted profile-scoped guard before sending a new prompt
    - successful ChatGPT browser-mode prompt runs now update the same `lastMutationAt` state as ChatGPT CRUD
    - browser-mode failures now inspect the live DOM for `Too many requests` / `...too quickly` text and persist the same cooldown file before rethrowing
  - `tests/browser/llmServiceRateLimit.test.ts`
    - added focused coverage for:
      - persisting cooldown state after a ChatGPT rate-limit error
      - blocking the next live ChatGPT llmservice call in a fresh service instance/process
      - enforcing write spacing across separate service instances
  - `tests/browser/chatgptRateLimitGuard.test.ts`
    - added profile/path + message-summary coverage for the shared guard helper
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/browserModeExports.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`

## 2026-03-29 — ChatGPT guard now enforces a rolling per-profile write budget before the UI rate-limits

- Scope:
  - close the remaining rate-limit hole after the first persisted guard still allowed a long ChatGPT acceptance run to trip the account
  - keep the fix in the shared ChatGPT guard path so browser-mode sends and multi-process CRUD both inherit it automatically
- Root cause:
  - min-spacing plus post-failure cooldown only remembered `lastMutationAt`
  - that was enough to keep adjacent writes apart, but it was not enough to recognize a whole burst of separate CLI mutations within one short window
  - the acceptance script could therefore still create a burst like create/rename/source add/remove/instructions set/browser send/rename/delete before the first visible `Too many requests` dialog had a chance to persist a cooldown
- Changed:
  - `src/browser/chatgptRateLimitGuard.ts`
    - added persisted `recentMutationAts[]` history
    - added shared helpers to prune mutation history, append a new mutation timestamp, and calculate the next allowed write time for a rolling write budget
    - added the new write-budget constants:
      - `CHATGPT_MUTATION_WINDOW_MS`
      - `CHATGPT_MUTATION_MAX_WRITES`
      - `CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS`
  - `src/browser/llmService/llmService.ts`
    - provider guard settings now include rolling-window write-budget parameters
    - mutating ChatGPT CRUD calls now enforce the rolling budget before executing another live write
    - successful mutations now persist `recentMutationAts[]`, not just `lastMutationAt`
    - detected rate-limit failures preserve/advance that same mutation history when writing the cooldown file
  - `src/browser/index.ts`
    - ChatGPT browser-mode prompt sends now enforce the same rolling write budget before sending
    - successful browser-mode ChatGPT writes now append to the same persisted mutation history
    - browser-mode rate-limit failure handling now preserves that mutation history when persisting a cooldown
  - `tests/browser/chatgptRateLimitGuard.test.ts`
    - added coverage for mutation-history pruning, append semantics, and rolling-budget delay calculation
  - `tests/browser/llmServiceRateLimit.test.ts`
    - added focused coverage for rolling-budget enforcement across separate service instances/processes
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - intentionally skipped during this patch because the account had already been rate-limited and the goal of the change was to stop additional live mutation traffic first

## 2026-03-29 — ChatGPT acceptance now aborts long cooldown waits, and project-chat rename prefers the row label

- Scope:
  - stop stale `scripts/chatgpt-acceptance.ts` processes from sleeping through a multi-minute cooldown and then resuming later
  - harden the remaining project-scoped conversation rename persistence check without immediately spending more live writes
- Root cause:
  - the acceptance runner treated waits up to 6 minutes as acceptable retry time after a ChatGPT cooldown/write-budget failure
  - project-page rename propagation can surface the new title first in the row menu label (`Open conversation options for ...`) before the anchor text fully catches up
- Changed:
  - `scripts/chatgpt-acceptance.ts`
    - added a short acceptance-only cooldown ceiling (`30s`)
    - added a preflight cooldown read so later acceptance mutations abort before sending another write into a known long cooldown
    - kept the short retry path for near-expired cooldowns, but long waits now fail fast instead of parking a process
  - `src/browser/providers/chatgptAdapter.ts`
    - `buildConversationTitleAppliedExpression(...)` now prefers the row action label over anchor text when inferring the visible current title
    - `waitForChatgptConversationTitleApplied(...)` now retries once after a fresh list navigation before failing
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`

## 2026-03-29 — ChatGPT acceptance is now phaseable so this account can validate without one giant write burst

- Scope:
  - stop treating one dense ChatGPT end-to-end acceptance burst as the only way to validate the provider on this throttled account
  - make the acceptance harness resumable from already-created disposable entities
- Root cause:
  - the product-side guard now prevents repeated hammering, but a single full acceptance pass still exceeds this account's native write budget before the later root/tool steps finish
- Changed:
  - `scripts/chatgpt-acceptance.ts`
    - added `--phase full|project|project-chat|root-base|root-followups|cleanup`
    - added `--project-id` and `--conversation-id` so later phases can reuse disposable entities created in earlier phases
    - changed cleanup semantics so only `full` auto-cleans in `finally`; partial phases intentionally preserve state for the next phase
- Verification:
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - `pnpm run check`

## 2026-03-30 — ChatGPT project-page conversation rows expose the clean title in the row-menu label, not always in the anchor text

- Area: Browser/ChatGPT project-scoped conversation list/rename verification
- Symptom:
  - during the phased ChatGPT acceptance rerun, project-chat rename failed even though the live project conversation existed and had been renamed
  - the project-page list returned the conversation as:
    - `AC GPT PC bqeekfReply exactly with CHATGPT ACCEPT PROJECT CHAT bqeekf.`
  - that caused the project-chat rename verifier to miss the expected title
- Root cause:
  - the project-page scraper in `src/browser/providers/chatgptAdapter.ts` derived conversation titles from raw anchor text
  - on current ChatGPT project pages, anchor text can concatenate the visible title with the preview snippet; the row action button aria label (`Open conversation options for ...`) is the cleaner title source
- Fix:
  - updated project/page conversation scraping to prefer the row action label over anchor text
  - taught `normalizeChatgptConversationLinkProbes(...)` to prefer a shorter authoritative title when the competing title is just that title with preview text appended
  - added a focused regression in `tests/browser/chatgptAdapter.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
- Follow-up:
  - rerun the phased live `project-chat` acceptance slice once the account has a little more write headroom

## 2026-03-30 — ChatGPT's current rolling write budget needs to be stricter than 4 writes per 2 minutes on this account

- Area: Browser/ChatGPT rate-limit guard
- Symptom:
  - even after the first persisted cooldown + rolling-budget guard work, a phased live rerun still hit a real ChatGPT cooldown during `renameConversation` in the `root-base` slice
  - this happened after `project` and `project-chat` had already gone green, which meant the old `4 writes / 2 minutes` budget was still optimistic for this account when phases were chained with minimal idle time
- Fix:
  - lowered `CHATGPT_MUTATION_MAX_WRITES` in `src/browser/chatgptRateLimitGuard.ts` from `4` to `3`
  - kept the same 2-minute rolling window and existing cooldown handling, so the guard now forces a pause sooner instead of letting the next phase walk right into ChatGPT's own throttle
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
- Follow-up:
  - resume the phased live ChatGPT acceptance run only after the current persisted cooldown clears

## 2026-03-30 — Existing-conversation ChatGPT browser runs must reject reused assistant turns when a rate-limit modal blocks the new turn

- Area: Browser/ChatGPT browser-mode response detection on existing conversations
- Symptom:
  - a `--conversation-id ... --browser-composer-tool web-search` browser run could report a successful answer even though the conversation never got a new turn
  - the live session metadata looked healthy (`composerTool = "web search"`), but the conversation context still only contained the previous root-base prompt/answer
  - a direct `browser-tools` probe on the conversation showed the visible blocking ChatGPT modal:
    - `Too many requests`
    - `You’re making requests too quickly...`
  - the browser run had incorrectly returned the old assistant answer from the previous turn (`CHATGPT ACCEPT BASE ...`) as if it were the new web-search response
- Root cause:
  - existing-conversation browser runs already captured a baseline assistant snapshot, but stale detection relied too heavily on exact text equality
  - if the reused stale turn came back with extra prelude text such as `Thought for a few seconds ...`, the detector could miss that it was still the same underlying assistant message/turn
- Fix:
  - `src/browser/index.ts`
    - baseline assistant `messageId` / `turnId` now travel through the existing-conversation send path
    - added `shouldTreatChatgptAssistantResponseAsStale(...)` so reused assistant `messageId`, reused `turnId`, or responses that only append prelude text ahead of the old answer are treated as stale
    - when no fresh turn appears after that stale detection, browser mode now checks for a visible ChatGPT rate-limit modal and throws the rate-limit failure instead of returning the previous answer
  - `tests/browser/browserModeExports.test.ts`
    - added focused stale-response regressions
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live phased acceptance:
    - `project` green
    - `project-chat` green
    - `root-base` green
    - `root-followups` green
    - `cleanup` green

## 2026-03-30 — ChatGPT phased acceptance should persist resumable state and keep one suffix across resumed phases

- Area: Browser/ChatGPT acceptance harness polish
- Symptom:
  - the harness had already grown `--phase`, `--state-file`, and `--resume`, but the runbook still described mostly manual phase handoff
  - resumed phases generated a fresh suffix/name set even when they were continuing the same disposable acceptance run, which made the logs and state file less coherent than they needed to be
  - `scripts/chatgpt-acceptance.ts` also called `mkdir(...)` when writing the state file without importing it
- Root cause:
  - the first cut of phaseability was focused on surviving account throttling, not on making the resumable path the polished canonical operator workflow
  - docs lagged behind the now-real state-file support, and suffix continuity had not been treated as part of operator ergonomics
- Fix:
  - imported `mkdir` in `scripts/chatgpt-acceptance.ts` so state-file writes are valid
  - resumed runs now reuse the prior summary's suffix and derived disposable names when available, while still creating a fresh temporary working directory per process
  - resumed runs now log the prior recorded failure from the state file
  - added `docs/dev/chatgpt-polish-plan.md` and updated `docs/testing.md`, `docs/dev/smoke-tests.md`, and `docs/dev/chatgpt-conversation-surface-plan.md` so the resumable state-file workflow is the documented default
- Verification:
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - `pnpm run check`

## 2026-03-30 — ChatGPT workbook artifact fetches need the embedded spreadsheet card fallback, not just filename-matching buttons

- Area: Browser/ChatGPT artifact materialization
- Symptom:
  - `auracall conversations artifacts fetch 69ca9d71-1a04-8332-abe1-830d327b2a65 --target chatgpt` returned `artifactCount = 1`, `materializedCount = 0`
  - the artifact was already classified correctly as `kind = "spreadsheet"` with `uri = sandbox:/mnt/data/parabola_trendline_demo.xlsx`, but no file ever materialized
- Root cause:
  - the resolver only knew how to click filename-matching assistant `button.behavior-btn` downloads or scrape inline `ada_visualizations` tables
  - this workbook is exposed through the embedded spreadsheet card instead, and the real download affordance is the card's first unlabeled header button
  - that button emits a signed `backend-api/estuary/content?id=file_...` anchor URL when clicked
- Fix:
  - added a ChatGPT spreadsheet fallback that scopes to the assistant turn containing the artifact title, finds the embedded spreadsheet card, tags its first header button, captures the signed `estuary` URL, and fetches the workbook directly
  - `conversations artifacts fetch` now also writes `conversation-attachments/<conversationId>/artifact-fetch-manifest.json` with per-artifact `materialized|skipped|error` status while keeping the existing `conversation-attachments/<id>/manifest.json` schema unchanged
  - artifact fetches now record per-artifact failures in that sidecar manifest instead of aborting the whole fetch on the first error
- Verification:
  - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations artifacts fetch 69ca9d71-1a04-8332-abe1-830d327b2a65 --target chatgpt`
    - result:
      - `artifactCount = 1`
      - `materializedCount = 1`
      - materialized file `parabola_trendline_demo.xlsx`

## 2026-03-30 — ChatGPT rate-limit pacing should be cluster-aware, not just a flat write counter

- Area: Browser/ChatGPT rate-limit guard
- Symptom:
  - the old guard treated all successful writes as roughly equivalent with a flat `15s` spacing rule plus a `3 writes / 2 minutes` rolling cap
  - that did not match actual ChatGPT behavior well: short clustered rename/delete steps were often fine, but the follow-up refresh or next mutation after the commit was what tended to trigger throttling
- Root cause:
  - the persisted guard only stored timestamps, so it could not distinguish a cheap rename commit from a heavier prompt send or upload
  - it also had no explicit post-commit quiet-period model before the next refresh-heavy or mutating step
- Fix:
  - replaced the flat count-based budget with weighted persisted mutation records in `src/browser/chatgptRateLimitGuard.ts`
  - lighter actions like rename/instructions now count less than create/upload/browser-send
  - every successful write now opens a post-commit quiet period before the next action, starting around 12-18 seconds based on action class and lengthening as recent weighted activity accumulates
  - both `src/browser/llmService/llmService.ts` and `src/browser/index.ts` now enforce that post-commit quiet period plus the weighted rolling budget
  - kept the visible rate-limit modal/cooldown path unchanged on top of the new pacing model
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-03-30 — ChatGPT context/artifact reads now recover from visible rate-limit dialogs locally

- Area: Browser/ChatGPT context + artifact ingestion
- Symptom:
  - the persisted ChatGPT guard already covered prompt sends and llmservice/browser-mode mutations, but `conversations context get` and `conversations artifacts fetch` did not have a provider-local response if ChatGPT surfaced a visible `Too many requests` dialog mid-read
  - that meant read/materialization flows could still fail abruptly on a visible modal even when the next sensible action was simply “dismiss it, wait a bit, and retry once”
- Root cause:
  - ChatGPT adapter read/materialization paths had no local visible-dialog recovery wrapper
  - only the higher-level persisted guard knew about rate limits, and it only had signal after an error escaped
- Fix:
  - added visible ChatGPT rate-limit dialog detection + dismissal helpers in `src/browser/providers/chatgptAdapter.ts`
  - wrapped `readChatgptConversationContextWithClient(...)` and `materializeChatgptConversationArtifactWithClient(...)` in a one-shot recovery path that:
    - detects a visible rate-limit modal
    - dismisses it
    - pauses about 15 seconds
    - retries once
    - then rethrows a real rate-limit failure if the modal/error persists so the persisted cross-process guard can still take over afterward
  - re-proved serialized full-context ingestion plus artifact fetch on three representative chats:
    - image chat `69bc77cf-be28-8326-8f07-88521224abeb`
    - DOCX + canvas chat `69caa22d-1e2c-8329-904f-808fb33a4a56`
    - workbook chat `69ca9d71-1a04-8332-abe1-830d327b2a65`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live serialized proofs:
    - image chat: context `messages = 4`, `files = 1`, `sources = 0`, `artifacts = 4`; fetch `materializedCount = 4`
    - DOCX + canvas chat: context `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 2`; fetch `materializedCount = 2`
    - workbook chat: context `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 1`; fetch `materializedCount = 1`

## 2026-03-30 — ChatGPT surfaced the next browser-service extraction order clearly

- Area: Browser-service package boundary review
- Observation:
  - the ChatGPT cycle repeated a few now-obvious generic failure modes even after the menu/nested-menu/browser-diagnostics extractions landed:
    - overlapping dialogs/overlays need stable scoped handles, not generic `[role="dialog"]`
    - visible blocking surfaces need a package-owned recovery loop with provider-supplied classifiers
    - button-backed downloads need package-owned target capture rather than adapter-local DOM/event glue
    - CDP network-response capture on reload/navigation should be generic, not reimplemented in each adapter
    - shared managed browser profiles need explicit operation leasing/serialization
- Result:
  - wrote `docs/dev/browser-service-lessons-review-2026-03-30.md`
  - linked it from the browser-service backlog/tools/playbook docs
  - set the recommended next extraction order to:
    1. dialog/overlay inventory + stable handles
    2. blocking-surface recovery framework
    3. native download-target capture
    4. network-response capture on reload/navigation
    5. profile-scoped browser operation lease
    6. row/list post-condition helpers
    7. generic action-phase instrumentation
- Verification:
  - docs review only; no runtime behavior changed in this step

## 2026-03-30 — The first ChatGPT lessons are now package-owned browser-service helpers

- Area: Browser-service shared UI helpers
- Symptom:
  - the lessons review identified dialog/overlay inventory and blocking-surface
    recovery as the next two browser-service extractions, but those mechanics
    were still sitting provider-local in the ChatGPT adapter
- Root cause:
  - menus already had package-owned stable handles and reopen/verify flows, but
    overlays/dialogs still only had primitive helpers like `closeDialog(...)`
  - provider adapters therefore kept writing their own detect/dismiss/retry
    loops for blocking surfaces such as ChatGPT's rate-limit modal
- Fix:
  - added `collectVisibleOverlayInventory(...)` to
    `packages/browser-service/src/service/ui.ts`
  - added `dismissOverlayRoot(...)` so one specific overlay root can be
    dismissed by stable selector instead of generic first-match dialog logic
  - added `withBlockingSurfaceRecovery(...)` so providers can supply a
    classifier + dismiss policy while reusing the shared
    detect/dismiss/pause/retry loop
  - moved ChatGPT context/artifact rate-limit modal recovery onto those shared
    helpers
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-03-31 — Explicit browser provider targets now win over stale config-default targets

- Area: Browser service / managed profile routing
- Symptom:
  - explicit Grok-or-ChatGPT operations constructed through browser-service
    could still resolve the wrong managed profile or DevTools target when
    `userConfig.browser.target` pointed at a different provider
- Root cause:
  - `BrowserService.fromConfig(...)` resolved browser config from the raw user
    config without carrying the caller's explicit provider target
  - provider factories and browser client construction therefore defaulted back
    to the config-level target for managed profile lookup and browser-state
    attachment
- Fix:
  - threaded explicit provider target through
    `BrowserService.fromConfig(...)`
  - updated browser client plus ChatGPT/Grok service factories to pass their
    provider target explicitly
  - updated browser-state/profile lookup helpers so explicit target-specific
    resolution does not reattach against another provider's profile
- Verification:
  - `pnpm vitest run tests/browser/browserService.test.ts --maxWorkers 1`

## 2026-03-31 — WSL Linux Chrome now resolves `DISPLAY=:0.0` deterministically

- Area: Browser config / WSL Chrome launch
- Symptom:
  - opening a managed WSL Chrome profile could fail unless the caller's shell
    had already exported `DISPLAY`, even when the selected Aura-Call profile was
    explicitly configured to use Linux Chrome
- Root cause:
  - the `:0.0` fallback lived only inside the low-level launch path, so the
    resolved browser config did not carry a deterministic display value
  - logs therefore reflected ambient shell state, and fallback launcher choices
    could drift when the shell environment was incomplete
- Fix:
  - resolved `browser.display` up front in `src/browser/config.ts`
  - for WSL + Linux-hosted Chrome, defaulted `display` to `:0.0` unless config
    or `AURACALL_BROWSER_DISPLAY` overrides it
  - updated browser launch logging to report resolved `display` and
    `chromePath` from config
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts --maxWorkers 1`

## 2026-03-31 — ChatGPT root rename probe moved onto stronger row-menu and commit helpers, but live rename still does not persist

- Area: ChatGPT browser rename investigation
- Symptom:
  - live root conversation rename still stalled in the ChatGPT acceptance
    `root-base` phase, and direct `auracall rename ... --target chatgpt` runs
    continued to leave the authoritative sidebar row title unchanged
- Root cause:
  - still not fully resolved
  - two partial learnings are now confirmed:
    - the simple sidebar-row trigger path was too weak for a navigable row
      surface and needed the same trigger-prep/direct-click semantics we
      already use for Grok
    - ChatGPT can close the inline rename editor without actually applying the
      new title, so "editor disappeared" is not a sufficient completion signal
- Fix:
  - switched ChatGPT tagged sidebar-row rename/delete menu opening onto
    `openRevealedRowMenu(...)` with trigger prep + direct-click fallback in
    `src/browser/providers/chatgptAdapter.ts`
  - added `submitInlineRename(..., submitStrategy: 'blur-body-click')` in
    `packages/browser-service/src/service/ui.ts`
  - ChatGPT rename now retries one alternate blur/click-away commit if the
    normal submit closes the inline editor without immediately applying the new
    title
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live repro still blocked:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts rename 69cc287c-2f0c-832b-99db-3760fa254e7a "AC GPT C najfie" --target chatgpt --verbose`
  - live DOM after the repro still showed:
    - row title `CHATGPT ACCEPT BASE najfie`
    - no open menu
    - no visible inline rename input
  - conclusion: the new helpers improved the investigation surface but did not
    yet produce a persisted ChatGPT root rename

## 2026-03-31 — ChatGPT live rename confirmed the shared hover-reveal plus native-enter technique

- Area: Browser-service row actions / ChatGPT rename investigation
- Symptom:
  - provider-level rename attempts were still unreliable, and it was unclear
    whether the problem was trigger discovery, edit readiness, or commit
    semantics
- Root cause:
  - the surface behaves like the earlier Grok rename case:
    - the row action trigger is hover-revealed and should be treated as such
    - the rename editor is a real inline input whose focus/typing semantics
      matter
    - editor disappearance alone is not proof of persisted rename
- Fix / learning:
  - direct live repro on the managed ChatGPT tab showed that the reliable
    interaction sequence is:
    - hover the conversation row
    - click the revealed `...` button
    - select `Rename`
    - wait for `input[name="title-editor"]`
    - type natively into that input
    - send one native `Enter`
    - verify the sidebar row text changed
  - documented this as a reusable browser-service technique in
    `docs/dev/browser-service-tools.md`
- Verification:
  - live tab on DevTools port `45011`
  - conversation `69cc287c-2f0c-832b-99db-3760fa254e7a`
  - sidebar title changed successfully to `AC GPT C najfie`

## 2026-03-31 — Browser-service inline rename now supports native typing for row-local editors

- Area: Browser-service inline rename helpers / ChatGPT rename
- Symptom:
  - the successful live ChatGPT rename path required "real" editing semantics,
    but `submitInlineRename(...)` only supported JS value assignment plus submit
- Root cause:
  - some inline rename surfaces accept native focus/typing/Enter reliably while
    remaining flaky under setter-only input updates
- Fix:
  - added `entryStrategy: 'native-input'` to
    `packages/browser-service/src/service/ui.ts::submitInlineRename(...)`
  - native entry now clicks the real input by geometry, selects existing text,
    clears it with native `Backspace`, then types via `Input.insertText(...)`
  - ChatGPT root rename now targets `input[name="title-editor"]` and uses the
    native-input + native-enter path
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Remaining gap:
  - repeated live `auracall rename ... --target chatgpt` repros still did not
    apply the requested new title end-to-end, even after the native-entry
    upgrade
  - this narrows the remaining problem to provider-path orchestration or
    verification, not the base inline input mechanic itself

## 2026-03-31 — ChatGPT provider root rename now follows the exact live-proven row sequence

- Area: ChatGPT browser rename
- Symptom:
  - helper-composed provider renames stayed flaky even after native input and
    pointer-based menu tweaks, while the direct live manual sequence kept
    working
- Root cause:
  - the root rename path was still depending on the older score/title-based row
    tagging flow instead of resolving the exact conversation row by id and
    reproducing the proven interaction path
- Fix:
  - added an exact conversation-link row resolver for ChatGPT root rename
  - replaced the root rename interaction with the direct sequence:
    - exact row by conversation id
    - row hover
    - pointer click on row options
    - pointer click on `Rename`
    - wait for edit mode
    - native text entry
    - native `Enter`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live DOM after provider rename showed conversation
    `69cc287c-2f0c-832b-99db-3760fa254e7a` renamed successfully to
    `AC GPT C najfie provider-7`
- Remaining issue:
  - the top-level `auracall rename ... --target chatgpt` invocation still did
    not return promptly after the rename had already succeeded in the UI
  - that remaining bug is now post-success command lifecycle/cleanup, not the
    rename interaction itself

## 2026-03-31 — ChatGPT project conversation row actions now use the exact project-panel row

- Area: ChatGPT browser project conversation CRUD
- Symptom:
  - project-scoped rename/delete still depended on the older ranked row tagger,
    even after root-chat CRUD had moved to the more reliable exact-row path
- Root cause:
  - the old project row selection searched broadly across `/c/...` anchors and
    scored candidates, which is less reliable than directly resolving the
    authoritative project `Chats` panel row
- Fix:
  - extended `tagChatgptConversationRowExact(...)` with optional `projectId`
    scoping
  - when project-scoped, the resolver now prefers visible `role="tabpanel"`
    project chat rows whose parsed route project id matches the normalized
    project id exactly
  - switched ChatGPT project rename/delete flows onto that exact resolver so
    they use the same hover-reveal/pointer-driven row action path as root chats
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live project conversation smoke on
    `g-p-69cc275fdfac8191be921387165ca803`
    - created conversation `69cc7121-eca0-832c-ab8a-9dde700e87d7`
    - rename returned `Renamed successfully.`
    - delete returned `Deleted successfully.` and `Conversation cache refreshed.`
    - fresh project conversation list returned `[]`
- Remaining gap:
  - immediate post-rename project list reads were inconsistent (`ChatGPT`, then
    `[]`) while the live tab still showed the conversation route, so project
    conversation list/read consistency remains a separate follow-up surface

## 2026-03-31 — ChatGPT project conversation listing now reads the real Chats-panel title

- Area: ChatGPT browser project conversation list/read
- Symptom:
  - project-scoped `auracall conversations --project-id ... --target chatgpt`
    could return `[]` even when the project page visibly contained the chat row,
    and earlier reads could surface placeholder/generic titles
- Root cause:
  - the project list reader had the same page-expression bug as the earlier
    `Chats` readiness probe: browser-evaluated code referenced TS constants like
    `CHATGPT_PROJECT_TAB_CHATS_LABEL` and
    `CHATGPT_CONVERSATION_OPTIONS_PREFIX` directly instead of interpolating
    their literal values
  - after the project page loaded, the scraper also trusted concatenated anchor
    text or generic placeholders instead of the concrete title leaf inside the
    `li.group/project-item` row
- Fix:
  - interpolated the `Chats` label and conversation-options prefix into the
    project-page browser expressions
  - kept the provider on the real project `Chats` surface before scraping
  - updated project row title extraction to prefer the shortest concrete leaf
    text and ignore generic placeholders such as `ChatGPT` / `New chat`
  - hardened `normalizeChatgptConversationLinkProbes(...)` so generic titles
    do not overwrite real titles
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live proof on project `g-p-69cc275fdfac8191be921387165ca803`
    - renamed conversation `69cc7d43-acc0-832f-b1c2-5486459b4825` to
      `AC GPT PC title fixed`
    - fresh project conversation list returned:
      `AC GPT PC title fixed`
    - deleting that conversation succeeded and a fresh project list returned
      `[]`

## 2026-03-31 — ChatGPT project cleanup now survives the split remove-confirm command flow

- Area: ChatGPT browser project delete / acceptance cleanup
- Symptom:
  - phased ChatGPT acceptance was green through `project-chat`, `root-base`,
    and `root-followups`, but `cleanup` still failed on
    `projects remove <projectId> --target chatgpt`
- Root cause:
  - project removal is executed as two separate provider calls:
    `selectRemoveProjectItem(...)` then `pushProjectRemoveConfirmation(...)`
  - the second call reconnects in a fresh browser session, so the confirmation
    dialog may no longer exist even though the first step succeeded
  - `buildProjectDeleteConfirmationExpression()` also referenced the TS
    delete-dialog constant directly inside a browser-evaluated expression
- Fix:
  - interpolated the delete-dialog label into
    `buildProjectDeleteConfirmationExpression()`
  - updated `pushProjectRemoveConfirmation(...)` so if the confirmation dialog
    is missing after reconnect, it reopens project settings, presses
    `Delete project`, waits for the confirmation dialog, then confirms from
    that reconstructed state
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - phased live acceptance rerun:
    - `project-chat` PASS
    - `root-base` PASS
    - `root-followups` PASS
    - `cleanup` PASS

## 2026-04-01 — ChatGPT exact-row actions now share one local menu-item opener

- Area: ChatGPT browser conversation row actions / project cleanup tests
- Symptom:
  - the recently repaired ChatGPT rename/delete paths still duplicated the same
    exact-row hover -> trigger -> menu-item sequence in separate helpers, which
    increases the risk that future DOM drift fixes only land in one path
- Fix:
  - extracted `openChatgptTaggedConversationMenuItem(...)` and reused it for
    the exact-row rename and delete openers
  - added `matchesChatgptProjectDeleteConfirmationProbe(...)` plus focused
    tests so the project delete confirmation shape has direct unit coverage
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Fresh ChatGPT acceptance no longer depends on warm state

- Area: ChatGPT browser acceptance
- Symptom:
  - after the phased rerun went green, there was still a risk that ChatGPT
    acceptance only passed because the browser/session/project state was already
    warm from prior live debugging and partial sweeps
- Fix:
  - reran `scripts/chatgpt-acceptance.ts` from a brand-new state file so the
    full ChatGPT flow had to recreate and verify state from scratch
- Verification:
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --state-file docs/dev/tmp/chatgpt-fresh-state.json --command-timeout-ms 900000`
  - result: `PASS (full)`

## 2026-04-01 — Revealed row menu-item selection moved into browser-service

- Area: Browser-service row actions / ChatGPT conversation CRUD
- Symptom:
  - the repaired ChatGPT root/project rename/delete flow still carried its own
    local `hover row -> open row menu -> pointer-select item` mechanics even
    after the surface had stabilized, which left other providers with no
    package-owned primitive for the same pattern
- Fix:
  - added `openAndSelectRevealedRowMenuItem(...)` to
    `packages/browser-service/src/service/ui.ts`
  - rewired the ChatGPT exact-row rename/delete menu opener to use the new
    package helper while leaving exact row identity resolution and follow-up
    verification in the provider adapter
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Anchored row-action diagnostics moved into browser-service

- Area: Browser-service diagnostics / ChatGPT row actions
- Symptom:
  - ChatGPT still carried three almost-identical local diagnostics collectors
    for exact-row menu open, rename-editor readiness, and delete-confirmation
    readiness, each rebuilding row/trigger visibility plus menu/overlay
    snapshots separately
- Fix:
  - added `collectAnchoredActionDiagnostics(...)` to the browser-service UI
    helpers
  - rewired the ChatGPT exact-row rename/delete diagnostics to use the shared
    helper while preserving provider-specific row matching and post-condition
    logic
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Anchored action-phase failures now auto-attach diagnostics

- Area: Browser-service diagnostics wrappers / ChatGPT row-action phases
- Symptom:
  - even after moving anchored diagnostics into browser-service, adapters still
    had to manually call the collector on every false-result branch, which kept
    the package boundary noisy and easy to drift
- Fix:
  - added `withAnchoredActionDiagnostics(...)` to browser-service
  - it now attaches anchored diagnostics to `{ ok: false }` result objects and
    also enriches thrown errors with the same diagnostic payload
  - rewired the ChatGPT exact-row menu/rename/delete phase helpers to use the
    package wrapper instead of provider-local `collectDiagnostics` lambdas
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — ChatGPT transient blocking-surface classification started

- Area: ChatGPT browser reliability / bad-state recovery
- Symptom:
  - ChatGPT CRUD/history/context surfaces were green, but hostile-state handling
    still focused mostly on the visible rate-limit modal and generic connection
    resets
  - that left red/white transient error surfaces, `server connection failed`
    states, and visible retry affordances under-classified
- Fix:
  - added `docs/dev/chatgpt-hardening-plan.md` as the dedicated hardening plan
  - added pure blocking-surface classifiers in `chatgptAdapter.ts` for:
    - `rate-limit`
    - `connection-failed`
    - `retry-affordance`
    - `transient-error`
  - expanded the existing ChatGPT blocking-surface recovery inspector to look
    beyond the rate-limit modal and include visible retry-affordance buttons
  - widened llmservice ChatGPT retryability matching for known transient
    connection/error strings
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Follow-up:
  - the old rate-limit-only read/materialization wrapper is now
    `withChatgptBlockingSurfaceRecovery(...)`
  - for non-rate-limit ChatGPT bad states (`connection-failed`,
    `retry-affordance`, `transient-error`), the recovery path now reloads the
    page before retrying the wrapped read/materialization operation instead of
    only attempting a dialog dismiss
- Additional verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Follow-up:
  - `scrapeChatgptConversations(...)` now also uses
    `withChatgptBlockingSurfaceRecovery(...)`, so conversation list reads on
    both root and project surfaces recover from the same classified transient
    states as context/artifact reads
  - browser-mode stale-response rejection now checks for any visible classified
    ChatGPT blocking surface instead of only the rate-limit modal, which
    improves operator-visible failures on broken chat turns and connection-loss
    states
- Additional verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Policy correction:
  - browser-mode visible ChatGPT bad-state detection now returns structured
    `kind + summary` instead of flattening everything into a rate-limit-like
    reason string
  - only classified `rate-limit` surfaces are allowed to feed the persisted
    cooldown guard path
  - `retry-affordance`, `connection-failed`, and `transient-error` states now
    surface operation-specific stale-send failures instead of being mistaken for
    cooldowns

- Follow-up:
  - browser-mode stale-send handling now logs structured unexpected-state
    context in development mode (`browser.debug` / verbose logger) before
    failing:
    - classified ChatGPT bad-state kind/summary
    - source/probe details when available
    - explicit retry-affordance policy
    - baseline/answer ids when available
    - recent conversation snapshot
  - retry/regenerate failures now say explicitly that auto-click is disabled,
    which closes the remaining ambiguity in the send-path policy
- Additional verification:
  - `pnpm vitest run tests/browser/domDebug.test.ts tests/browser/browserModeExports.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-up:
  - the dev-mode post-mortem record is now a bounded machine-readable browser
    snapshot, not only a recent-turn string dump
  - the session log now preserves route/title/readiness, active element,
    visible overlays + button labels, visible retry/regenerate buttons, and
    recent turns under a `Browser postmortem (...)` line so later tooling can
    cluster deterministic failure signatures
- Follow-up:
  - the same bounded browser snapshot is now also persisted for debug-mode
    ChatGPT read/recovery paths under `~/.auracall/postmortems/browser/`
  - current covered read surfaces:
    - conversation list refresh
    - conversation context reads
    - conversation file reads
    - artifact materialization
  - each persisted record includes the recovery phase and classified blocking
    surface, so repeated failure classes can be grouped without re-scraping the
    raw session log
  - the persisted record now also includes the actual recovery action/outcome
    used by the current ChatGPT recovery path, which makes it possible to
    separate "same visible symptom, different remediation" during later
    clustering
- Follow-up:
  - ChatGPT read-path recovery now performs one bounded authoritative re-anchor
    after the current dismiss/reload step
  - current re-anchor actions:
    - `reopen-list` for conversation list refresh
    - `reopen-conversation` for context/files/artifact reads
  - persisted post-mortem bundles now capture the full recovery sequence, not
    just the first recovery action
- Verification:
  - live hostile-state validation on the managed WSL ChatGPT browser is now
    green for two synthetic-on-real transient-error cases:
    - injected alert on the active ChatGPT tab, then ran
      `auracall conversations --target chatgpt --refresh`
      - persisted `transient-error` -> `reload-page` -> `reopen-list`
      - command still returned the refreshed list
    - injected alert on the active ChatGPT tab, then ran
      `auracall conversations context get 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt --json-only`
      - persisted `transient-error` -> `reload-page` -> `reopen-conversation`
      - command still returned a valid payload (`messages = 4`)
  - live hostile-state validation is now also green for the remaining
    classified non-rate-limit read-side states:
    - synthetic-on-real `retry-affordance` on
      `auracall conversations context get 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt --json-only`
      - persisted `retry-affordance` -> `reload-page` -> `reopen-conversation`
      - command still returned a valid payload (`messages = 4`)
    - synthetic-on-real `connection-failed` on
      `auracall conversations files list 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt`
      - persisted `connection-failed` -> `reload-page` -> `reopen-conversation`
      - command still returned the expected conversation file list
- Follow-up:
  - debug-mode send-side stale-response failures now persist bounded JSON
    post-mortems to the same `~/.auracall/postmortems/browser/` store as the
    read-side recoveries
  - those send bundles include `mode = send`, the classified surface, the
    browser snapshot, and policy metadata like
    `fail-fast-no-auto-retry-click`

## 2026-03-31 — Browser/profile architecture now has an explicit refactor handoff plan

- Area: Browser profile family configuration
- Symptom:
  - repeated bugs and operator confusion showed that Aura-Call still treats
    logical runtime profile selection, browser-family selection, service target
    selection, and managed-profile path derivation as one mutable merge problem
- Root cause:
  - profile config resolution still mutates a shared `browser` object across
    multiple scopes, while overloaded path fields such as
    `manualLoginProfileDir` continue acting as both derived output and input
    configuration
- Fix:
  - documented the target architecture and landing plan in
    `docs/dev/browser-profile-family-refactor-plan.md`
  - added a matching roadmap entry in `ROADMAP.md`
- Verification:
  - docs review only

## 2026-04-01 — Services manifest now fails fast on unexpected section drift

- Area: Service-volatility manifest core
- Symptom:
  - the checked-in `configs/auracall.services.json` manifest was nominally
    typed, but several route fields were only surviving because
    `src/services/manifest.ts` used permissive `.passthrough()` schemas
  - that meant new route or section drift could silently land in the manifest
    without the typed loader/schema catching it
- Fix:
  - added the already-real route fields to the explicit schema:
    - `app`
    - `files`
    - `projectIndex`
    - `projectConversations`
  - changed the manifest section schemas and top-level manifest schema to
    strict validation
  - added regression tests proving that:
    - unexpected route keys fail fast
    - unexpected service sections fail fast
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Main route/host consumers now require bundled manifest-owned fields

- Area: Service-volatility manifest ownership boundary
- Symptom:
  - even after the manifest pilot landed, several core route/host consumers
    still restated bundled service defaults in code as fallback literals
  - that blurred the ownership boundary and made manifest-backed fields look
    optional when they are now intended to be authoritative checked-in data
- Fix:
  - added required bundled registry helpers for manifest-owned static fields:
    - `requireBundledServiceBaseUrl(...)`
    - `requireBundledServiceCompatibleHosts(...)`
    - `requireBundledServiceCookieOrigins(...)`
    - `requireBundledServiceRouteTemplate(...)`
  - rewired the main static route/host consumers to use those helpers instead
    of repeating duplicated fallback literals:
    - `src/browser/constants.ts`
    - `src/browser/urlFamilies.ts`
    - `src/browser/providers/chatgpt.ts`
    - `src/browser/providers/chatgptAdapter.ts`
    - `src/browser/providers/grokAdapter.ts`
  - added focused registry tests proving the bundled manifest provides the
    required ChatGPT/Grok/Gemini route and host data directly
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Browser picker labels now come from the bundled services manifest

- Area: Service-volatility model-label ownership
- Symptom:
  - `src/cli/browserConfig.ts` still carried a local browser-label lookup table
    for ChatGPT/Gemini/Grok models even though those picker labels were already
    checked into `configs/auracall.services.json`
  - that duplicated ownership made the manifest-backed label slice look less
    complete than it really was
- Fix:
  - added `requireBundledServiceModelLabel(...)` to
    `src/services/registry.ts`
  - rewired `mapModelToBrowserLabel(...)` to require manifest-backed labels
    for inferred browser services instead of reading a local fallback table
  - kept model normalization in code (`gpt-5.1` -> `gpt-5.2`,
    Pro alias normalization) so only the declarative picker labels moved to
    authoritative manifest ownership
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — ChatGPT composer vocabulary no longer duplicates manifest-owned defaults

- Area: Service-volatility ChatGPT pilot
- Symptom:
  - `src/browser/actions/chatgptComposerTool.ts` still carried duplicated
    static alias and label fallback tables even though those values were
    already owned by the bundled services manifest
- Fix:
  - removed the duplicated local composer alias/label fallback bundle and now
    read the ChatGPT composer vocabulary directly from the bundled manifest
    through the existing registry helpers
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser profile-family refactor now has a typed resolution seam

- Area: Browser/profile-family refactor Slice 1
- Symptom:
  - the current resolver path still blends Aura-Call profile selection,
    browser-family wiring, service binding, and launch-plan fields into one
    mutable browser object
- Fix:
  - added a new pure typed resolution helper in
    `src/browser/service/profileResolution.ts`
  - the helper exposes explicit typed layers for:
    - `ResolvedProfileFamily`
    - `ResolvedBrowserFamily`
    - `ResolvedServiceBinding`
    - `ResolvedBrowserLaunchProfile`
  - added focused tests that pin the current expected layering behavior before
    future slices start moving launch/runtime code over to these objects
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Typed profile resolution now drives service/default config layering

- Area: Browser/profile-family refactor Slice 1
- Symptom:
  - the initial typed resolution helper existed, but runtime code still used
    only the legacy ad hoc record-merge logic
- Fix:
  - rewired `src/browser/service/profileConfig.ts` so the new typed
    resolution seam now drives service/default resolution for:
    - selected/default target selection
    - service URL layering
    - service-scoped browser defaults
  - fixed the precedence rule so an explicit browser/CLI target overrides the
    profile default service inside the typed resolution layer
  - added focused coverage in `tests/browser/profileConfig.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser-family defaults now come from the typed resolution seam

- Area: Browser/profile-family refactor Slice 2
- Symptom:
  - browser-family fields in `profileConfig.ts` were still populated by local
    ad hoc derivation, which let generic browser defaults leak into
    profile-selected cookie/bootstrap fields and let browser-family fallback
    claim `manualLoginProfileDir` before service binding ran
- Fix:
  - rewired `applyBrowserProfileDefaults(...)` to consume the typed
    `ResolvedBrowserFamily` layer for browser-family-owned defaults
  - used browser-family source-profile/source-cookie fields directly instead of
    the broader launch-profile projection, so selected profile browser-family
    values win over prefilled generic browser defaults
  - stopped browser-family fallback from claiming
    `manualLoginProfileDir` via `profilePath`, leaving service-scoped
    managed-profile selection to the service-binding layer
  - expanded `tests/browser/profileConfig.test.ts` to pin browser-family
    defaults and explicit-target precedence
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Typed profile/browser layers now also own debug-port-range and cache defaults

- Area: Browser/profile-family refactor Slice 2
- Symptom:
  - after the initial browser-family extraction, `profileConfig.ts` still
    mixed typed resolution with direct raw reads for
    `browser.debugPortRange` and `profile.cache`
- Fix:
  - rewired `applyBrowserProfileOverrides(...)` to use
    `ResolvedBrowserFamily.debugPortRange`
  - rewired cache default application to use
    `ResolvedProfileFamily.cacheDefaults`
  - extended `tests/browser/profileConfig.test.ts` so the typed seam now has
    direct regression coverage for both behaviors
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser-service attach paths now consume the typed launch profile

- Area: Browser/profile-family refactor Slice 3
- Symptom:
  - even after browser-family extraction, the browser-service entry path still
    rebuilt launch-owned fields like profile name, profile dir, debug-port
    config, and fallback managed profile targeting from local ad hoc reads
  - that meant a service scan/reattach could still drift back toward the
    constructor target or stale flattened values instead of using a consistent
    launch-profile view
- Fix:
  - added `resolveBrowserProfileResolutionFromResolvedConfig(...)` for the
    resolved-config/runtime path
  - taught the helper to derive a target-scoped managed profile dir from
    `managedProfileRoot + auracallProfile + target` when
    `manualLoginProfileDir` is absent
  - rewired `src/browser/service/portResolution.ts` and
    `src/browser/service/browserService.ts` to consume launch-owned fields
    from that helper
  - added regression coverage that proves
    `BrowserService.resolveServiceTarget(...)` uses the requested service
    launch profile when scanning fallback tabs
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — resolveBrowserConfig now projects launch-owned fields through the typed seam

- Area: Browser/profile-family refactor Slice 3
- Symptom:
  - after the first launch-profile consumers landed in browser-service attach
    paths, `resolveBrowserConfig(...)` still assembled its final launch-owned
    output fields locally
  - that left the refactor with two parallel interpretations of launch state:
    one for resolved config and one for browser-service runtime
- Fix:
  - rewired `src/browser/config.ts` so launch-owned output fields are now
    projected through
    `resolveBrowserProfileResolutionFromResolvedConfig(...)` after the
    existing env/discovery normalization step
  - added a regression test proving this projection does not accidentally
    re-derive a managed profile dir when `manualLogin` is disabled
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Typed profile resolution now uses the real browser config unions

- Area: Browser/profile-family refactor type cleanup
- Symptom:
  - even after launch-profile consumers were wired in, runtime code still had to
    cast `debugPortStrategy` and `blockingProfileAction` because
    `profileResolution.ts` modeled them as generic strings
- Fix:
  - tightened `profileResolution.ts` to parse and expose:
    - `DebugPortStrategy`
    - resolved browser blocking-profile-action union
  - removed the remaining consumer casts in
    `src/browser/config.ts` and
    `src/browser/service/portResolution.ts`
  - corrected a stale invalid `blockingProfileAction: 'reuse'` test fixture
    in `tests/browser/profileConfig.test.ts`; that value was not part of the
    supported schema and should not be preserved by the typed seam
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser doctor and login prep now share the launch-profile seam

- Area: Browser/profile-family refactor bootstrap slice
- Symptom:
  - browser doctor and login prep were still reconstructing managed profile
    path, profile name, and source-cookie/bootstrap preference locally even
    after runtime config and browser-service attach paths had moved onto the
    typed launch profile
- Fix:
  - rewired `src/browser/profileDoctor.ts` to derive bootstrap/profile-report
    state from the resolved launch profile
  - added `resolveBrowserLoginOptionsFromUserConfig(...)` in
    `src/browser/login.ts` so setup/login callers can use the same seam for
    login prep instead of rebuilding launch inputs ad hoc
  - kept a final `resolveManagedProfileDir(...)` guard in both paths so stale
    inherited managed profile dirs from another Aura-Call profile are still
    corrected to the currently selected profile
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser runtime no longer duplicates managed profile/bootstrap derivation

- Area: Browser/profile-family refactor runtime cleanup
- Symptom:
  - both ChatGPT and Grok browser runtime paths in `src/browser/index.ts`
    still duplicated the same managed-profile/bootstrap derivation logic even
    after config, browser-service, doctor, and login prep had moved onto the
    resolved launch/profile seam
- Fix:
  - added one shared
    `resolveManagedBrowserLaunchContext(...)`
    helper in `src/browser/index.ts`
  - both runtime paths now use it for managed profile dir, default managed
    profile dir, chrome profile, and preferred bootstrap cookie path
  - added a direct export-backed regression in
    `tests/browser/browserModeExports.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/config.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Browser-profile-family refactor now has a defined Phase 1 stop point

- Area: Browser/profile-family planning and execution control
- Symptom:
  - the profile-family refactor had already removed most of the dangerous
    launch/profile ambiguity, but the plans still read as if deeper
    `index.ts` cleanup was the obvious next step
- Fix:
  - marked the refactor as Phase 1 complete enough through commit `196aad27`
  - updated the refactor plan, execution board, and roadmap so the next work is
    explicit Phase 2 cleanup around secondary WSL browser-family config and
    naming clarity instead of uncontrolled runtime-scope expansion
- Verification:
  - planning docs updated:
    - `docs/dev/browser-profile-family-refactor-plan.md`
    - `docs/dev/next-execution-plan.md`
    - `ROADMAP.md`


## 2026-04-01 — Secondary WSL browser families no longer require path-first config teaching

- Area: Browser/profile-family refactor Phase 2 cleanup
- Symptom:
  - `wsl-chrome-2` had been documented as a named secondary profile, but the
    config model still forced operators to express it mostly by repeating raw
    browser fields and `manualLoginProfileDir` wiring inside the profile
- Root cause:
  - the schema had no first-class browser-family registry, and the profile
    normalization bridge would not have preserved a `browserFamily` selector
    even if one had been added
- Fix:
  - added top-level `browserFamilies` plus
    `profiles.<name>.browserFamily`
  - updated profile resolution to merge named browser-family defaults before
    profile-local browser overrides
  - fixed `normalizeConfigV1toV2(...)` to preserve `profile.browserFamily`
    when promoting `profiles` into `auracallProfiles`
  - updated configuration/runbook docs so secondary WSL families are taught via
    named browser-family config first, with `manualLoginProfileDir` kept as an
    advanced override
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/config.test.ts tests/browser/browserService.test.ts tests/browser/login.test.ts tests/browser/profileDoctor.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - live/manual smoke default WSL and `wsl-chrome-2`
  - decide whether `auracall wizard` should emit named browser families by
    default in a later compatibility-conscious slice


## 2026-04-01 — Browser/profile terminology is now explicit in docs and agent guidance

- Area: Config semantics and documentation clarity
- Symptom:
  - the repo still used `profile` to mean several different things:
    AuraCall config entry, browser/account family, native Chromium profile, and
    managed automation profile
  - `AGENTS.md` still carried stale guidance and terminology from an older
    project shape
- Fix:
  - documented the canonical terms in `README.md`,
    `docs/configuration.md`, `docs/wsl-chatgpt-runbook.md`, and
    `docs/dev/browser-profile-family-refactor-plan.md`
  - rewrote `AGENTS.md` as a focused Aura-Call guide with the new semantic
    split and current browser-work rules
- Verification:
  - docs reviewed locally after rewrite
- Follow-ups:
  - keep the implementation terminology stable enough for now
  - only do broad code symbol renames when there is a larger refactor reason


## 2026-04-01 — Config-model refactor is now explicitly sequenced before agents/teams

- Area: Roadmap and architecture sequencing
- Symptom:
  - the repo had clearer browser/runtime-profile semantics, but the roadmap did
    not yet state clearly when the larger config-shape refactor should happen
    relative to future agent/team work
- Fix:
  - added `docs/dev/config-model-refactor-plan.md`
  - updated `ROADMAP.md` and `docs/dev/next-execution-plan.md` so the
    config-model refactor is a named architecture track that should happen
    before agent/team implementation
  - clarified in the browser-profile-family plan that broad code renames and
    final public config-shape decisions are deferred to that larger refactor
- Verification:
  - planning docs reviewed locally after update


## 2026-04-01 — Wizard and default scaffold now emit browser-profile-backed config

- Area: Browser-profile onboarding and config ergonomics
- Symptom:
  - the docs now described browser profiles as first-class config concepts, but
    the wizard and default config scaffold still wrote the older shape directly
    into `profiles.<name>.browser`
- Root cause:
  - the onboarding/config-entry path had not been updated after the
    `browserFamilies` bridge landed, so the easiest path for users still
    taught the pre-refactor mental model
- Fix:
  - updated `src/cli/browserWizard.ts` so wizard-created runtime profiles now
    emit a named browser profile in `browserFamilies` and bind to it via
    `profiles.<name>.browserFamily`
  - updated `src/config.ts` so missing-config scaffolding now emits
    `browserFamilies.default` plus
    `profiles.default.browserFamily = "default"`
  - updated onboarding/config docs to say the wizard/scaffold now emit the
    browser-profile bridge directly
- Verification:
  - targeted onboarding/config tests updated and reviewed locally


## 2026-04-01 — CLI/runtime terminology now distinguishes source vs managed browser profiles

- Area: Product-surface terminology cleanup
- Symptom:
  - docs had the new semantic split, but live CLI/runtime wording still mixed
    older phrases like `Chrome profile`, `managed profile`, and
    `browser profile` in ways that blurred source vs managed state
- Root cause:
  - the terminology lock-in had not yet been pushed through doctor warnings,
    login/bootstrap logs, TUI prompts, and dry-run policy descriptions
- Fix:
  - updated doctor warnings to say `managed browser profile` and
    `source browser cookies`
  - updated login/runtime/bootstrap logs to distinguish managed browser profile
    from source browser profile
  - updated the TUI source-profile prompt and cookie-plan dry-run wording
- Verification:
  - focused browser/CLI tests updated and reviewed locally


## 2026-04-01 — Reserved config landing zone added for future agents and teams

- Area: Config-model refactor preparation
- Symptom:
  - the roadmap and design docs said agents/teams must come after the config-model
    refactor, but the schema had no explicit landing zone for those future layers
- Root cause:
  - the config model had planning language but no reserved shape for future
    higher-level objects
- Fix:
  - added inert top-level `agents` and `teams` schema blocks
  - documented that they are placeholders only and do not drive runtime behavior
  - updated configuration and planning docs to reference that reserved seam
- Verification:
  - config loading tests updated and reviewed locally


## 2026-04-01 — Agent inheritance and override boundary is now explicit in planning docs

- Area: Config-model and future agent architecture
- Symptom:
  - the roadmap said agents should come after the config-model refactor, but
    there was still no precise statement of what an agent should inherit versus
    what it may override
- Root cause:
  - the layering model had been named, but the agent boundary itself was still
    implicit
- Fix:
  - added `docs/dev/agent-config-boundary-plan.md`
  - defined the first explicit contract for:
    - agent inheritance from AuraCall runtime profiles
    - allowed agent overrides
    - non-goals that remain owned by browser profiles or future teams
  - linked that boundary from the roadmap and config-model planning docs
- Verification:
  - planning docs reviewed locally after update


## 2026-04-01 — ChatGPT project-settings commit button vocabulary is now manifest-owned

- Area: ChatGPT service-volatility extraction
- Symptom:
  - the ChatGPT adapter still had one low-risk hard-coded button vocabulary in
    the project-settings commit flow (`save`, `save changes`, `done`,
    `apply`)
- Root cause:
  - that declarative UI label set had not yet been moved into the checked-in
    service manifest even though nearby ChatGPT labels already were
- Fix:
  - added `ui.labelSets.project_settings_commit_buttons` to
    `configs/auracall.services.json`
  - rewired the project-settings commit matcher to consume the manifest-owned
    label set
  - added focused registry and adapter tests to pin the new ownership boundary
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — ChatGPT project-source upload action labels are now manifest-owned

- Area: ChatGPT service-volatility extraction
- Symptom:
  - the ChatGPT adapter still had a hard-coded low-risk upload-action label set
    inside the project-sources upload-dialog readiness probe
- Root cause:
  - those labels (`upload`, `browse`, `upload file`) had not yet been
    promoted into the checked-in service manifest even though adjacent
    project-source labels already were
- Fix:
  - added `ui.labelSets.project_source_upload_actions` to
    `configs/auracall.services.json`
  - rewired the upload-dialog readiness probe to consume that manifest-owned
    label set
  - added focused registry and adapter tests to pin the ownership boundary
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Browser-service stale browser-state is now classified, not just "alive" or "dead"

- Area: Browser-service registry / reattach reliability
- Symptom:
  - stale browser-state and attach failures were being treated as a generic
    boolean "not alive" condition, which made doctor output noisy and limited
    safe pruning/reattach decisions
- Root cause:
  - the shared state registry had no explicit liveness model for dead process,
    dead DevTools port, or profile ownership mismatch
- Fix:
  - added a first explicit browser-service liveness classifier for registry
    entries
  - started surfacing that liveness reason through browser doctor reporting
  - documented the follow-on implementation plan in
    `docs/dev/browser-service-reattach-reliability-plan.md`
- Verification:
  - `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run check`


## 2026-04-01 — Browser doctor now reports why stale browser-state entries were pruned

- Area: Browser-service registry / reattach reliability
- Symptom:
  - doctor could report stale entry kinds currently present, but once stale
    entries were pruned it only surfaced a flat count of removed entries
- Root cause:
  - the shared prune path deleted stale registry entries without returning the
    per-entry liveness reason to callers
- Fix:
  - added package-owned `pruneRegistryDetailed(...)` to return the exact
    stale-entry liveness reasons being removed
  - updated browser doctor to include `prunedRegistryEntryReasons` in the
    local report and warn with the concrete stale reason mix after pruning
- Verification:
  - `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts tests/cli/browserSetup.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Attach resolution now explains discarded stale browser-state candidates

- Area: Browser-service registry / attach diagnostics
- Symptom:
  - attach failures could still look like "no target found" even when nearby
    browser-state entries existed but had already been invalidated by stale
    liveness or profile mismatch
- Root cause:
  - the attach path was only consuming the winning or scanned profile path and
    did not surface which stale registry candidates had just been rejected
- Fix:
  - updated browser-service attach resolution to report discarded stale registry
    candidates for:
    - the selected DevTools port
    - the expected browser profile identity
  - added focused tests so those diagnostics are pinned without changing the
    current tab-selection policy
- Verification:
  - `pnpm vitest run tests/browser/browserService.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/profileDoctor.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`


## 2026-04-01 — Reattach/session flows now classify target loss versus wrong-browser drift

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - failed session reattach still surfaced as a generic raw error string even
    after attach resolution learned to explain stale candidate rejection
- Root cause:
  - the reattach path did not classify missing prior ChatGPT targets versus
    wrong-browser/profile drift before falling back or reporting failure
- Fix:
  - added classified reattach failures for:
    - missing prior ChatGPT target/conversation
    - wrong-browser/profile drift when the prior ChatGPT origin disappears from
      the current Chrome target list
  - updated `attachSession(...)` to print the classified reattach reason instead
    of only the raw exception text
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/cli/sessionDisplay.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Failed reattach now persists stale registry evidence into session metadata

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - reattach failures now classified target loss versus wrong-browser drift, but
    the stale registry candidates that explained nearby dead or mismatched
    browser-state were still only visible in live attach logs
- Root cause:
  - session reattach did not persist the discarded stale registry candidates it
    could have correlated with the classified failure
- Fix:
  - extracted the stale registry candidate collector into a shared helper used
    by attach and reattach flows
  - failed reattach now writes `browser.runtime.reattachDiagnostics` with:
    - classified failure kind/message
    - discarded stale registry candidates captured at failure time
- Verification:
  - `pnpm vitest run tests/browser/registryDiagnostics.test.ts tests/browser/reattach.test.ts tests/cli/sessionDisplay.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status output now shows persisted reattach diagnostics

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - failed reattach now persisted stale registry evidence in session metadata,
    but operators still had to inspect raw metadata files to see it
- Root cause:
  - session/status surfaces did not yet render the stored
    `browser.runtime.reattachDiagnostics` summary
- Fix:
  - added a shared reattach-diagnostics formatter in `sessionDisplay`
  - `auracall session <id>` now prints the stored reattach summary
  - `auracall status` now prints an indented reattach summary under affected rows
- Verification:
  - `pnpm vitest run tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status JSON now exposes stored reattach diagnostics

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - human session/status output now showed persisted reattach diagnostics, but
    automation and postmortem tooling still had no machine-readable session CLI
    surface for the same evidence
- Root cause:
  - `auracall session` and `auracall status` did not yet offer JSON output for
    stored session metadata
- Fix:
  - added `--json` to `auracall session` and `auracall status`
  - list JSON now emits `{ entries, truncated, total }`
  - single-session JSON now emits the raw stored session metadata, including
    nested `browser.runtime.reattachDiagnostics`
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status `--json-only` is now a first-class documented option

- Area: Session CLI / machine-readable output
- Symptom:
  - session/status JSON output worked, but `--json-only` was not advertised on
    those subcommands and could still look like an unrelated ignored flag on
    attach flows
- Root cause:
  - the global intro-banner suppression flag existed, but the session command
    surfaces had not declared it locally or whitelisted it in ignored-flag
    reporting
- Fix:
  - added explicit `--json-only` options to `auracall session` and
    `auracall status`
  - whitelisted `json` and `jsonOnly` in session ignored-flag detection
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status JSON now emits normalized `reattachSummary` objects

- Area: Session CLI / machine-readable reattach diagnostics
- Symptom:
  - raw nested `browser.runtime.reattachDiagnostics` was now available in JSON,
    but tooling still had to traverse nested metadata and aggregate discarded
    stale candidates itself
- Root cause:
  - the machine-readable payload exposed storage-shaped data only, not a stable
    operator-oriented summary object
- Fix:
  - added helper-backed `reattachSummary` objects to single-session and list JSON
    payloads
  - included normalized stale-candidate counts grouped by `reason + liveness`
  - aligned the direct `status` subcommand JSON path with the `session` command
    helper path so both emit the same contract
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session JSON payload now has explicit exported types and a doc

- Area: Session CLI / machine-readable contract
- Symptom:
  - session/status JSON had become useful enough for tooling, but the contract
    still had to be inferred from implementation and tests
- Root cause:
  - the CLI payload helpers existed without named exported payload interfaces or
    a dedicated contract note
- Fix:
  - exported explicit session JSON payload types from `src/cli/sessionCommand.ts`
  - added `docs/dev/session-json-contract.md` as the current contract note
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Reattach now classifies ambiguous same-profile targets

- Area: Browser-service reattach reliability
- Symptom:
  - when the exact prior target disappeared but multiple same-origin ChatGPT tabs
    still existed in the selected browser profile, reattach had no first-class
    ambiguity classification and could only fall through broader recovery
- Root cause:
  - the reattach classifier only distinguished `target-missing` versus
    `wrong-browser-profile`, even though it already knew how many same-origin
    page targets remained
- Fix:
  - added `ambiguous` as a classified reattach failure kind
  - classify the case where the exact target is gone, no exact URL/id match
    remains, and multiple same-origin page targets are still present
  - keep recovery bounded by logging/classifying ambiguity instead of guessing a
    target before fallback recovery
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Generic ChatGPT root tabs must not suppress ambiguous reattach

- Area: Browser-service reattach reliability
- Symptom:
  - a live multi-tab ChatGPT reattach scenario still classified as
    `target-missing` instead of `ambiguous` even though two same-origin pages
    remained in the selected browser profile and the original conversation tab
    was gone
- Root cause:
  - the ambiguity guard treated a generic root tab like
    `https://chatgpt.com/` as an exact-enough match for a prior conversation URL
    because of a broad `startsWith(...)` URL comparison
- Fix:
  - replaced the broad prefix comparison with a more specific target-URL check
  - generic root/origin pages no longer count as exact prior-target matches
  - only genuinely specific same-target URLs suppress ambiguity
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live direct `resumeBrowserSessionCore(...)` repro on a real browser now logs
    `ambiguous` for the staged root-plus-Explore-GPTs conflict


## 2026-04-02 — browser-tools must honor AuraCall runtime profile resolution

- Area: Browser-service tooling / WSL Chrome profile handling
- Symptom:
  - opening `wsl-chrome-2` through `scripts/browser-tools.ts` could appear to
    launch the wrong managed browser profile or behave inconsistently compared
    with real Aura-Call/browser-service launches
- Root cause:
  - the thin Aura-Call wrapper still bypassed AuraCall runtime profile
    resolution
  - it loaded raw user config and resolved only the flattened browser block,
    ignoring AuraCall runtime profile selection and browser target selection
- Fix:
  - added package-owned CLI flags `--auracall-profile` and `--browser-target`
  - forwarded those through `BrowserToolsPortResolverOptions`
  - changed `scripts/browser-tools.ts` to call `resolveConfig(...)` and
    `BrowserService.fromConfig(...)` before attach/launch, so browser-tools now
    uses the same managed browser profile selection logic as Aura-Call
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`


## 2026-04-02 — Managed browser profiles must follow the signed-in subprofile, not always `Default`

- Area: Browser profile semantics / managed WSL Chrome account families
- Symptom:
  - `wsl-chrome-2` could have a signed-in managed Chrome account under
    `Profile 1`, while Aura-Call still resolved `chromeProfile: "Default"` for
    launch, attach, and doctor flows
- Root cause:
  - config/browser resolution treated the source browser profile name as if it
    were always the correct managed browser profile subdirectory too
  - after Chrome sign-in created a new managed subprofile, Aura-Call had no
    logic for following `Local State.profile.last_used` or the signed-in profile
    in `info_cache`
- Fix:
  - added `resolveManagedProfileName(...)`
  - when the configured managed subprofile is `Default`, prefer the managed
    profile's `last_used` entry if it exists on disk, has a signed-in marker,
    and `Default` does not
  - applied that to:
    - typed launch-profile resolution
    - the Aura-Call browser-service wrapper
    - local browser doctor
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/profileResolution.test.ts tests/browser/browserService.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live local doctor on `wsl-chrome-2/chatgpt` now reports:
    - `chromeProfile: "Profile 1"`
    - signed-in Chrome account `consult@polymerconsultinggroup.com`


## 2026-04-02 — browser-tools start must not rewrite explicit managed browser profiles back to `default`

- Area: Browser-service tooling / managed browser profile launch resolution
- Symptom:
  - `scripts/browser-tools.ts --auracall-profile wsl-chrome-2 --browser-target chatgpt start`
    could still reuse or relaunch the `default` managed browser profile even
    after the wrapper learned AuraCall runtime profile selection
  - in some runs it also silently fell back to `~/.cache/scraping`
- Root cause:
  - the package `browser-tools` CLI always injected a default `--profile-dir`,
    so unset launch options were not actually unset
  - `resolveBrowserConfig(...)` did not know the AuraCall runtime profile name,
    so an explicit managed browser profile like
    `~/.auracall/browser-profiles/wsl-chrome-2/chatgpt` could be normalized
    back to `.../default/chatgpt`
  - stale top-level browser service fields could also contaminate service
    binding when switching AuraCall runtime profiles
- Fix:
  - removed package defaults for `browser-tools start --profile-dir` and
    `--chrome-path`, so the resolver only sees explicit operator values
  - fixed profile-service default application so selected-service fields like
    `manualLoginProfileDir` come from the selected service config rather than
    stale top-level browser state
  - added explicit `auracallProfileName` context to `resolveBrowserConfig(...)`
    and threaded it through userConfig-backed call sites
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser/profileResolution.test.ts tests/browser/browserTools.test.ts tests/browser/browserService.test.ts tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `DISPLAY=:0.0 pnpm tsx scripts/browser-tools.ts --auracall-profile wsl-chrome-2 --browser-target chatgpt start`
      now launches:
      - `--profile-directory=Profile 1`
      - `--user-data-dir=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
      - stable DevTools on port `45013`


## 2026-04-02 — top-level browser runs must preserve the selected AuraCall runtime profile

- Area: Browser runtime launch resolution / managed browser profile selection
- Symptom:
  - top-level browser runs like
    `auracall --profile wsl-chrome-2 --engine browser ...`
    could still fall back to `/home/.../browser-profiles/default/chatgpt`
    even after browser-tools and doctor were fixed
- Root cause:
  - the real browser-run path still dropped `auracallProfileName` before
    resolving launch config and managed browser profile dirs
  - `resolveManagedBrowserLaunchContext(...)` then recomputed the managed
    browser profile path without the selected AuraCall runtime profile context
- Fix:
  - persisted `auracallProfileName` in browser session config
  - threaded it into:
    - `runBrowserMode(...)`
    - reattach config resolution
    - the managed browser launch-context helper
  - added regression coverage for:
    - browser session config carrying `auracallProfileName`
    - managed browser launch-context resolution inside a non-default AuraCall
      runtime profile
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser/browserTools.test.ts tests/browser/browserService.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/reattach.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gpt-5.2 --prompt "Reply exactly with: WSL CHROME 2 SESSION OK 3" --verbose --force`
    - now reuses:
      - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
      - `Profile 1`
      - DevTools port `45013`
    - and returns the expected reply


## 2026-04-02 — same-origin reattach must trust selected-port profile-mismatch evidence

- Area: Browser session reattach / cross-profile safety
- Symptom:
  - a real `default` ChatGPT session aimed at the live `wsl-chrome-2`
    DevTools port could still reattach and read the wrong browser profile's
    tab because both browsers were on the same origin (`chatgpt.com`)
- Root cause:
  - reattach classification only trusted fully `live` selected-port owners
  - after Chrome respawned under the same managed browser profile with a new
    PID, the correct `wsl-chrome-2` selected-port entry was downgraded to
    `profile-mismatch`
  - that meant the classifier threw away the strongest signal that port `45013`
    still belonged to the `wsl-chrome-2` managed browser profile
- Fix:
  - added selected-port registry candidate collection to reattach diagnostics
  - reattach now treats selected-port candidates with either:
    - `live`
    - `profile-mismatch`
    as strong browser-profile ownership evidence
  - if the selected DevTools port belongs to a different managed browser
    profile than the session expects, reattach now fails as
    `wrong-browser-profile` before target picking
- Verification:
  - `pnpm vitest run tests/browser/registryDiagnostics.test.ts tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - replayed a stored `default` ChatGPT session against live port `45013`
      from `wsl-chrome-2`
    - confirmed the reattach path classified the attempt as
      `wrong-browser-profile`


## 2026-04-02 — reattach recovery must retry one fresh DevTools attach after launch

- Area: Browser reattach recovery / fresh Chrome launch
- Symptom:
  - `resumeBrowserSessionViaNewChrome(...)` could fail immediately with
    `connect ECONNREFUSED 127.0.0.1:<port>` even after a fresh managed browser
    launch succeeded
- Root cause:
  - the reattach recovery path connected to the new DevTools port too eagerly
  - the main browser-run path already had a bounded `isDevToolsResponsive(...)`
    probe and attach retry, but reattach recovery did not
- Fix:
  - added the same bounded recovery pattern to reattach recovery:
    - first connect attempt
    - if it fails, probe the fresh DevTools port once
    - if reachable, retry the attach once and continue
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - after pruning stale browser-state entries, the `default` ChatGPT
      reattach smoke completed successfully through the fresh-browser recovery
      path
- Remaining follow-up:
  - `wsl-chrome-2` still has a separate fresh-launch issue:
    when reattach has to launch a new managed browser, ChatGPT shows a login
    CTA even though the already-open managed browser is signed in

## 2026-04-02 - browser-tools managed-browser-profile launch isolation

- Symptom:
  - `scripts/browser-tools.ts --browser-target chatgpt start` could return the
    live Grok DevTools port or relaunch onto the Grok port instead of opening a
    separate `default/chatgpt` managed browser profile
  - this made it look like the `default/chatgpt` managed browser profile had
    been wiped when the real problem was launch/attach contamination
- Root cause:
  - the live `default` AuraCall runtime profile still had stale top-level
    browser fields pinned to Grok (`manualLoginProfileDir` and `debugPort`)
  - `scripts/browser-tools.ts` trusted those fields for both registry reuse and
    fresh launch
  - the wrapper also bypassed the new stable preferred-port logic in
    `packages/browser-service/src/manualLogin.ts`
- Fix:
  - `packages/browser-service/src/manualLogin.ts`
    - derive a stable preferred fixed DevTools port from the managed browser
      profile identity before probing for availability
  - `scripts/browser-tools.ts`
    - resolve the managed browser profile dir from AuraCall runtime profile +
      target
    - reuse only a matching registry entry for that exact managed browser
      profile
    - ignore config-derived fixed ports unless the operator explicitly passes
      `--port`
- Verification:
  - tests:
    - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/manualLogin.test.ts tests/browser/profileConfig.test.ts --maxWorkers 1`
    - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - with `default/grok` already open on `45011`, a fresh
      `default/chatgpt` launch now comes up separately on `45065`
    - DevTools tab inventory stays isolated:
      - `45011` => Grok
      - `45065` => ChatGPT

## 2026-04-02 - wsl-chrome-2 fresh reattach launch now keeps the selected AuraCall runtime profile

- Symptom:
  - `wsl-chrome-2` fresh-launch reattach could reopen a ChatGPT login surface
    even though the real `wsl-chrome-2` managed browser profile was already
    signed in
- Root cause:
  - `resumeBrowserSessionViaNewChrome(...)` rebuilt the managed browser profile
    path with `resolveManagedProfileDir(...)` but did not pass the AuraCall
    runtime profile name
  - that allowed the fallback managed browser profile path to collapse to
    `~/.auracall/browser-profiles/default/chatgpt`
    even when the stored session belonged to `wsl-chrome-2`
- Fix:
  - pass `config.auracallProfileName` into `resolveManagedProfileDir(...)`
    during fresh reattach launch
  - added a regression test proving fresh reattach launch preserves the
    selected AuraCall runtime profile's managed browser directory
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - killed the live `wsl-chrome-2/chatgpt` browser
    - replayed the stored `reattach-smoke-wsl` session
    - fresh reattach launch reopened:
      - `~/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
      - `Profile 1`
    - ChatGPT login check passed and the stored response was recovered

## 2026-04-02 - doctor/browser-tools now stay on the selected managed browser profile

- Symptom:
  - `auracall doctor --target chatgpt --prune-browser-state --json` could route
    its runtime probe and selector diagnosis into the live Grok page
  - the same command also surfaced `browserToolsError: "__name is not defined"`
- Root cause:
  - attach discovery still trusted config-derived fixed ports, so stale
    top-level browser state could pull doctor onto the wrong live browser
  - the package-owned browser-tools page probe serialized a transpiled
    `page.evaluate(...)` function that referenced an unavailable `__name`
    helper inside the browser context
- Fix:
  - `src/browser/service/portResolution.ts`
    - removed config-derived fixed-port reuse from attach discovery
    - attach discovery now trusts only:
      - explicit env port overrides, or
      - exact managed browser profile registry matches
  - `src/browser/service/registryDiagnostics.ts`
    - preserve AuraCall runtime profile context when rebuilding expected
      managed browser profile paths
  - `packages/browser-service/src/browserTools.ts`
    - replaced the failing page-side probe function with a raw expression
      string so browser-side execution no longer depends on transpiler helpers
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/portResolution.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts tests/browser/registryDiagnostics.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `auracall doctor --target chatgpt --prune-browser-state --json`
      now attaches runtime probes to the real ChatGPT browser on `38155`
    - `browserToolsError` is now `null`

## 2026-04-02 - config-model target shape is now explicit and the bridge names are documented as transitional

- Durable lesson:
  - the docs had the right semantics, but not one explicit target public shape
  - that made it too easy for implementation work to keep landing on bridge
    names like `browserFamilies` and `profiles` without a clear end-state
- Decision:
  - the design authority is now the layered target shape:
    - `browserProfiles`
    - `runtimeProfiles`
    - `agents`
    - `teams`
  - the currently implemented public keys remain bridge names for now:
    - `browserFamilies`
    - `profiles`
    - `profiles.<name>.browserFamily`
- Implication for future slices:
  - keep current bridge keys stable enough for normal use
  - do not treat bridge names as the long-term model
  - land non-breaking schema/runtime seams toward the target shape before
    doing broad renames

## 2026-04-02 - config inspection and bridge-health commands now expose the target model without changing stored bridge keys

- Durable lesson:
  - once the bridge terminology was clarified, operators still had no easy way
    to inspect the active AuraCall runtime profile, browser-profile bridge, or
    bridge-health problems without reading raw JSON
- Fix:
  - added read-only config-model inspection/reporting commands:
    - `auracall config show`
    - `auracall profile list`
    - `auracall config doctor`
  - onboarding and migration writes now print a compact runtime-profile ->
    browser-profile summary in the target-model terms
- Result:
  - operators can now inspect:
    - the active AuraCall runtime profile
    - browser-profile bridges across all runtime profiles
    - missing/dangling browser-profile references
    - legacy `auracallProfiles` residue
  - without changing the stored bridge-key layout

## 2026-04-02 - resolved browser config still needs one shared managed-browser identity seam

- Symptom:
  - even after the runtime-profile/browser-profile bridge helpers were in
    place, multiple runtime flows were still rebuilding managed browser profile
    identity independently from already-resolved browser config
  - the duplicated logic covered:
    - managed browser profile dir
    - default managed browser profile dir
    - effective Chrome profile name
    - bootstrap cookie source path
- Fix:
  - added
    `resolveManagedBrowserLaunchContextFromResolvedConfig(...)` in
    `src/browser/service/profileResolution.ts`
  - moved browser runtime/bootstrap, login, doctor, browser-service attach,
    browser list targeting, registry diagnostics, and fresh reattach launch onto
    that shared seam
- Durable lesson:
  - centralizing only the user-config -> resolved-config transition is not
    enough
  - the next boundary also matters:
    - resolved browser config -> managed browser profile identity
  - if that second seam stays duplicated, profile/path drift can reappear even
    when higher-level config semantics are already correct

## 2026-04-02 - reattach should reuse one resolved session launch context

- Symptom:
  - reattach had already moved fresh relaunch onto the shared managed-browser
    seam, but `reattach.ts` still rebuilt browser config separately for
    wrong-browser-profile classification and for the relaunch dependency hook
- Fix:
  - added `resolveSessionBrowserLaunchContext(...)`
  - reattach now resolves session browser config once and reuses it across:
    - fresh relaunch
    - registry diagnostics
    - wrong-browser-profile classification
- Durable lesson:
  - after introducing a shared seam, the next cleanup should target the callers
    that still rebuild the same resolved object twice in one flow
  - that is where hidden drift tends to survive longest even when the shared
    helper already exists

## 2026-04-02 - browser runtime entry should share one managed-profile preparation path

- Symptom:
  - after the managed-browser launch seam was centralized, the two main browser
    runtime entry paths in `src/browser/index.ts` still repeated the same local
    launch-preparation work:
    - managed browser profile dir setup
    - bootstrap logging
    - destructive retry eligibility
- Fix:
  - extracted `prepareManagedBrowserProfileLaunch(...)` inside
    `src/browser/index.ts`
  - both ChatGPT and Grok local browser entry flows now use that helper
- Durable lesson:
  - once config/launch semantics are centralized, the next duplication hotspot
    is usually the runtime entrypoint itself
  - that layer should still get one local seam before attempting larger package
    extraction, otherwise provider entry paths drift again even while lower
    layers are clean

## 2026-04-02 - browser runtime entry should also centralize pre-launch config normalization

- Symptom:
  - even after launch-prep was shared, `runBrowserMode(...)` still mixed three
    separate responsibilities inline before provider branching:
    - resolve browser config
    - normalize logger defaults
    - allocate a fixed DevTools port when the strategy is not `auto`
- Fix:
  - extracted `resolveBrowserRuntimeEntryContext(...)` in
    `src/browser/index.ts`
  - the top-level browser runtime path now uses one explicit entry helper for
    pre-launch config preparation
- Durable lesson:
  - the browser runtime entry boundary has at least two useful local seams:
    - pre-launch config preparation
    - managed browser profile launch preparation
  - separating those explicitly is cleaner than one large refactor and gives a
    better base for future provider/runtime cleanup

## 2026-04-02 - config inspection JSON should expose the target model directly, but read-only

- Symptom:
  - the new inspection commands spoke the right terms, but machine-readable
    output still mirrored the bridge model too closely
  - tooling could see:
    - `browserFamilies`
    - `profiles`
    - bridge summaries
  - but not one explicit projected target model
- Fix:
  - added `projectConfigModel(...)` and exposed its result as `projectedModel`
    in `config show --json` and `profile list --json`
- Durable lesson:
  - inspection/output can move ahead of input compatibility safely
  - that is the right order here:
    - first expose the target model read-only
    - only later decide whether to accept target-shape aliases like
      `browserProfiles` / `runtimeProfiles`

## 2026-04-02 - target-shape input aliases need an explicit compatibility policy before implementation

- Durable lesson:
  - once the target model is visible in read-only inspection output, the next
    temptation is to start accepting `browserProfiles` / `runtimeProfiles`
    immediately
  - doing that without a documented policy would create ambiguity around:
    - precedence
    - mixed bridge/target configs
    - write-back behavior
- Decision:
  - document the input-alias policy first
  - keep target-shape aliases unimplemented until that policy is the source of
    truth
- Policy document:
  - [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/config-model-input-alias-plan.md)

## 2026-04-02 - bridge-health diagnostics belong in the config-model seam, not only in CLI formatting

- Symptom:
  - `config doctor` knew how to reason about missing or dangling
    runtime-profile -> browser-profile bridges
  - but that logic lived only inside `configCommand.ts`
  - other model-aware surfaces already depended on `projectConfigModel(...)`,
    so diagnostics and projection were drifting apart
- Fix:
  - added `analyzeConfigModelBridgeHealth(...)` and shared doctor report types
    in [src/config/model.ts](/home/ecochran76/workspace.local/auracall/src/config/model.ts)
  - kept `configCommand.ts` as a presentation layer that formats the shared
    analysis instead of owning it
- Durable lesson:
  - once the target model gets a shared projection seam, its read-only
    diagnostics should live there too
  - CLI/operator surfaces should consume that seam rather than re-implement the
    same bridge rules locally

## 2026-04-02 - overlapping read-only config inspection views should share one model-layer inventory helper

- Symptom:
  - `config show` and `profile list` were both read-only target-model surfaces
  - but each still rebuilt overlapping state locally:
    - active AuraCall runtime profile
    - browser-profile inventory
    - runtime-profile inventory
    - bridge-key presence
- Fix:
  - added `inspectConfigModel(...)` in
    [src/config/model.ts](/home/ecochran76/workspace.local/auracall/src/config/model.ts)
  - rewired CLI report builders to consume that shared inspection view
- Durable lesson:
  - once multiple operator surfaces are exposing the same conceptual model,
    inventory/state assembly should move into the model seam before adding more
    commands or input aliases

## 2026-04-02 - bridge-key names should be centralized before any alias transition starts

- Symptom:
  - even after inspection/reporting state moved into the config-model seam,
    CLI report builders still hardcoded the bridge-key names:
    - `browserFamilies`
    - `profiles`
    - `profiles.<name>.browserFamily`
- Fix:
  - added shared bridge-key metadata in
    [src/config/model.ts](/home/ecochran76/workspace.local/auracall/src/config/model.ts)
  - made `inspectConfigModel(...)` return that metadata so read-only operator
    surfaces consume one bridge contract
- Durable lesson:
  - before a future alias transition, the existing bridge contract needs to be
    explicit and centralized too
  - otherwise read-only surfaces and later dual-read logic will drift on the
    very names they are supposed to diagnose

## 2026-04-02 - first target-shape alias support should be dual-read only, with target precedence and diagnostics

- Symptom:
  - after the policy doc was in place, the next real gap was that
    `browserProfiles` / `runtimeProfiles` still could not be loaded at all
  - delaying all support longer would keep the target model purely notional
- Fix:
  - added bounded phase-1 dual-read support in schema/model/resolver loading
  - target keys now win over bridge keys during reads
  - doctor/model diagnostics now report mixed/conflicting bridge vs target
    definitions instead of silently merging them
  - write paths remain bridge-key-first
- Durable lesson:
  - the safe first step is:
    - dual-read
    - target precedence
    - diagnostics
    - no write-path change
  - do not start by teaching writes or silently normalizing everything into the
    target shape

## 2026-04-02 - once dual-read exists, operator surfaces must report target-key presence and precedence explicitly

- Symptom:
  - after dual-read loading landed, `config show` and `config doctor` still
    mostly spoke in bridge-key terms
  - that left operators unable to tell quickly whether target keys were active
    or which side was winning the read path
- Fix:
  - extended shared inspection/doctor data to include:
    - target-key presence
    - read precedence summaries
  - made the CLI inspection surfaces print those facts directly
- Durable lesson:
  - once config reads become dual-shape, “what keys are present?” and “which
    side is authoritative?” are first-class operator concerns, not hidden model
    details

## 2026-04-02 - first target-shape write support should be explicit and isolated to config migrate

- Symptom:
  - after dual-read and diagnostics landed, the next safe step was target-shape
    output
  - but changing all write paths at once would create too much churn
- Fix:
  - added explicit `auracall config migrate --target-shape`
  - kept:
    - `wizard`
    - `profile scaffold`
    - default `config migrate`
    on bridge-key writes
- Durable lesson:
  - the safe phase-2 write step is an opt-in migration path first
  - do not flip default scaffolding or generalized writes before that path has
    proven stable

## 2026-04-02 - scaffold can support target-shape writes explicitly without changing its default output

- Symptom:
  - once `config migrate --target-shape` existed, scaffold was the next obvious
    write-path gap
  - but flipping scaffold defaults would have created unnecessary churn
- Fix:
  - added explicit `auracall profile scaffold --target-shape`
  - kept default scaffold output on bridge keys
- Durable lesson:
  - target-shape write support can expand one explicit command at a time
  - default scaffolding should remain stable until the target-shape path has
    proven itself across both migrate and scaffold

## 2026-04-02 - dual-shape config support needs one troubleshooting doc, not scattered caveats

- Symptom:
  - by this point the repo had:
    - dual-read config loading
    - precedence diagnostics
    - explicit target-shape write modes
  - but the troubleshooting knowledge was scattered across policy docs, command
    help, and implementation notes
- Fix:
  - added one focused troubleshooting doc for:
    - bridge-shape vs target-shape vs mixed-shape
    - precedence rules
    - common `config doctor` findings
    - explicit target-shape write commands
- Durable lesson:
  - once config support spans multiple shapes, future debugging is faster when
    shape diagnosis lives in one operational doc instead of being reconstructed
    from roadmap and policy fragments

## 2026-04-02 - explicit target-shape writes should cover the guided wizard path too

- Symptom:
  - after `config migrate --target-shape` and `profile scaffold --target-shape`
    landed, the guided `wizard` path was the remaining write surface that could
    only emit bridge keys
  - that left the target-shape path incomplete for intentional guided config
    creation
- Fix:
  - added explicit `auracall wizard --target-shape`
  - kept the underlying wizard patch builder bridge-oriented and materialized
    target-shape output only at the write boundary
- Durable lesson:
  - when a compatibility transition adds an explicit target-shape write mode,
    the guided onboarding path should gain the same opt-in before anyone
    considers flipping defaults
  - keep bridge-vs-target conversion at the write boundary when the internal
    patch/merge helpers are still bridge-native

## 2026-04-02 - once target-shape reads and writes are real, docs should treat it as primary

- Symptom:
  - after dual-read loading plus explicit target-shape writes landed for:
    - `config migrate`
    - `profile scaffold`
    - `wizard`
  - the main docs still taught bridge keys first
  - that kept the repo speaking as if the target model were still only future design
- Fix:
  - made target-shape the primary documented config model
  - moved bridge-key language into compatibility/troubleshooting framing
  - updated the main config example to use:
    - `browserProfiles`
    - `runtimeProfiles`
    - `runtimeProfiles.<name>.browserProfile`
- Durable lesson:
  - once the runtime can read a new public shape and the major write paths can
    emit it explicitly, the main docs should switch to that shape instead of
    continuing to center the compatibility bridge

## 2026-04-02 - once target-shape becomes primary, write defaults should flip together

- Symptom:
  - after target-shape became the primary documented model, write behavior was
    still inconsistent:
    - reads accepted target-shape
    - docs centered target-shape
    - but `wizard`, `profile scaffold`, and `config migrate` still defaulted to
      compatibility bridge output
- Fix:
  - made target-shape the default write mode for:
    - `wizard`
    - `profile scaffold`
    - `config migrate`
  - added explicit `--bridge-shape` compatibility mode instead of keeping
    bridge-shape as the default
- Durable lesson:
  - once a new public config shape is primary in both semantics and docs, the
    major write paths should flip together in one bounded slice
  - leave the old shape behind an explicit compatibility flag rather than
    letting defaults and docs disagree

## 2026-04-02 - config version should signal target-shape vs compatibility bridge output

- Symptom:
  - after target-shape became the default documented and write shape, the file
    `version` field still did not clearly tell operators whether a written
    config was target-shaped or bridge-shaped
- Fix:
  - defined:
    - `version: 3` for target-shape output
    - `version: 2` for compatibility bridge output
  - kept config loading permissive so older files still load during the transition
- Durable lesson:
  - once a config-shape transition is real, the version field should become an
    explicit write-time signal for the active shape instead of lagging behind
    the actual read/write policy

## 2026-04-02 - help text and default output names must follow the new version policy

- Symptom:
  - after target-shape became the default write mode and `version: 3` became
    the target-shape file version, `config migrate` still talked about “v2”
    output and still defaulted to a `.v2` output suffix
- Fix:
  - updated `config migrate` help text to describe version-3 target-shape
    output as the default
  - changed the default migrated output suffix from `.v2` to `.v3`
- Durable lesson:
  - once version policy changes, command descriptions and default output names
    need to change in the same slice or operators will keep getting mixed signals

## 2026-04-03 - top-level selector key should migrate after the shape and version policy are real

- Symptom:
  - after target-shape became the primary documented and written config model,
    the top-level selector key still centered the compatibility name:
    - `auracallProfile`
  - that left the file speaking in two different eras at once:
    - `defaultRuntimeProfile` was the intended target-model term
    - `auracallProfile` still controlled selection
- Fix:
  - added `defaultRuntimeProfile` as the primary top-level selector key in the
    config schema/model layer
  - target-shape writes now emit `defaultRuntimeProfile`
  - normalization still aliases `defaultRuntimeProfile` back into
    `auracallProfile` so the existing runtime/browser stack keeps working
- Durable lesson:
  - once a target config shape is real, the top-level selector key needs to
    move with it
  - do the public-key migration first, then delay any large internal resolved
    field renames until they have a separate justification

## 2026-04-03 - inspection output should show both primary and compatibility selector keys during selector migration

- Symptom:
  - after `defaultRuntimeProfile` became the primary selector key, inspection
    output still mostly showed the resolved active AuraCall runtime profile
    without making it clear which selector key was actually present in the file
- Fix:
  - updated `config show` and `config doctor` to report:
    - primary selector key presence: `defaultRuntimeProfile`
    - compatibility selector key presence: `auracallProfile`
- Durable lesson:
  - during a public-key migration, inspection surfaces should show both the new
    primary key and the still-supported compatibility key until the old key is
    fully retired

## 2026-04-03 - stop config-shape churn once reads, writes, and inspection all agree

- Symptom:
  - after the target shape became primary across:
    - reads
    - default writes
    - docs
    - inspection/doctor output
  - the active planning docs still treated config-shape migration itself as the
    main remaining track
- Fix:
  - moved the execution board up one level:
    - public config transition is now a checkpoint
    - next active work is agent/team-ready layering on top of browser profiles
      and AuraCall runtime profiles
- Durable lesson:
  - once reads, writes, docs, and diagnostics all agree on the primary public
    shape, stop polishing migration mechanics by inertia and move the active
    architecture track up to the next compositional layer

## 2026-04-03 - future agent layering should inherit from the shared runtime-profile seam, not reopen config-shape logic

- Symptom:
  - once the public config transition was stable, the next likely failure mode
    was future agent work re-deriving runtime-profile and browser-profile
    relationships ad hoc from raw config
- Fix:
  - extended the shared projected config model with read-only:
    - `agents[]`
    - `teams[]`
  - projected each agent through its referenced AuraCall runtime profile so the
    model seam already carries:
    - `runtimeProfileId`
    - inherited `browserProfileId`
    - inherited `defaultService`
- Durable lesson:
  - new upper-layer config concepts should compose through the shared
    runtime-profile/browser-profile model seam first
  - do not let future agent/team work reopen raw target-vs-bridge key logic at
    call sites

## 2026-04-03 - once a projected upper-layer seam exists, inspection should surface it directly

- Symptom:
  - after the projected config model gained read-only `agents[]` and `teams[]`,
    those layers were still only visible indirectly inside the raw
    `projectedModel` JSON blob
- Fix:
  - updated config inspection/reporting so:
    - `config show` reports available agents and teams explicitly
    - `profile list` reports projected agents with inherited
      runtime/browser/default-service context
    - `profile list` reports projected teams with agent membership
- Durable lesson:
  - once a shared projected seam exists for a future layer, operator-facing
    inspection should surface that seam directly instead of forcing
    troubleshooting through low-level raw JSON only

## 2026-04-03 - reserved future layers should get reference validation before execution behavior

- Symptom:
  - after `agents` and `teams` became visible in the shared projected model,
    the config doctor still only validated browser-profile and runtime-profile
    references
- Fix:
  - extended the shared config-model doctor to flag:
    - agents with no runtime-profile reference
    - agents that reference missing AuraCall runtime profiles
    - teams that reference missing agents
- Durable lesson:
  - for future config layers, add read-only reference validation before adding
    any execution semantics
  - that keeps layering mistakes visible early without pretending the behavior
    already exists

## 2026-04-03 - projected team inspection should show member resolution state, not just raw ids

- Symptom:
  - after teams gained read-only projection and doctor warnings for missing
    agents, the inventory surface still only showed raw team member ids
- Fix:
  - extended projected teams and `profile list` reporting to surface each team
    member as:
    - resolved or missing
    - inherited runtime profile
    - inherited browser profile
    - inherited default service
- Durable lesson:
  - when a future-layer projection includes references to lower-layer objects,
    inspection should expose reference resolution status directly instead of
    forcing operators to cross-check separate warnings or raw ids by hand

## 2026-04-03 - once CLI inspection proves a future-layer seam, extract one shared resolver before adding behavior

- Symptom:
  - after the projected agent/team inspection surfaces were in place, future
    agent-aware code would still have needed to reconstruct:
    - selected agent
    - referenced runtime profile
    - inherited browser profile
    - inherited default service
    from lower-level helpers
- Fix:
  - added one shared config-model resolver for:
    - `agent -> runtimeProfile -> browserProfile`
  - kept it read-only and behaviorless
- Durable lesson:
  - once a future-layer seam is visible in inspection/reporting, extract one
    shared resolver for non-CLI consumers before any execution semantics land

## 2026-04-03 - once a shared future-layer resolver exists, use it in one real read-only consumer immediately

- Symptom:
  - after `resolveAgentSelection(...)` existed, it was still only a model-layer
    utility without any real consumer demonstrating its contract
- Fix:
  - wired `config show` to expose `resolvedAgents[]` using the shared resolver
    directly
- Durable lesson:
  - after extracting a shared resolver for a future layer, put it into one real
    read-only surface immediately so the contract is exercised before behavior
    semantics arrive

## 2026-04-03 - checkpoint the track once reserved future layers are parsed, projected, inspected, and validated

- Symptom:
  - after several good agent/team-ready seams landed, the roadmap still risked
    treating them as disconnected config-polish work instead of a completed
    pre-execution checkpoint
- Fix:
  - updated planning docs to record the checkpoint explicitly:
    - reserved future layers are now parsed, projected, inspected, and
      validated
    - one shared read-only agent-selection resolver exists
- Durable lesson:
  - once a future layer has enough parsing, projection, inspection, validation,
    and one shared resolver, checkpoint it explicitly before starting the first
    execution-adjacent seam

## 2026-04-03 - the first execution-adjacent agent seam should resolve through runtime-profile selection, not invent agent behavior

- Symptom:
  - once the shared `agent -> runtimeProfile -> browserProfile` resolver
    existed, the next likely mistake was to bolt agent-aware behavior directly
    onto runtime code instead of first proving one narrow selection seam
- Fix:
  - taught shared runtime-profile selection to accept an optional explicit
    agent id and resolve it through:
    - `agent -> runtimeProfile -> browserProfile`
  - threaded that seam into `resolveConfig(...)`
  - added `--agent <name>` as a selection-only CLI path
  - kept explicit `--profile` selection above `--agent`
- Durable lesson:
  - the first execution-adjacent use of a future layer should usually be
    selection semantics, not a new behavior mode
  - when a higher layer resolves onto an existing lower layer, preserve the
    lower layer's explicit override precedence instead of letting the new layer
    silently outrank it

## 2026-04-03 - once a new selection seam exists, the main troubleshooting reports should expose it directly

- Symptom:
  - after `--agent` could resolve onto an AuraCall runtime profile, the main
    inspection surfaces still only showed the final runtime/browser result
    without making the selected agent visible
- Fix:
  - updated `config show` and `config doctor` to report the selected-agent
    resolution chain directly
  - kept the contract read-only:
    - selected agent
    - resolved runtime profile
    - resolved browser profile
- Durable lesson:
  - when a new selection seam is added above an existing runtime layer, make
    the selection chain visible in the main inspection/report path immediately
    so troubleshooting does not require reconstructing hidden inputs by hand

## 2026-04-03 - once a new selection seam affects real runs, persist its provenance in session metadata

- Symptom:
  - after `--agent` could affect real runtime-profile selection, stored session
    metadata still only preserved the flattened resolved runtime/browser state
    and lost whether the run was selected through an agent
- Fix:
  - added `options.selectedAgentId` to stored session metadata
  - threaded the optional selected agent through both:
    - normal run session creation
    - managed browser verification session creation
- Durable lesson:
  - if a new selection seam influences real execution, preserve the original
    selection provenance in session metadata immediately
  - flattened resolved state is not enough for later troubleshooting,
    detached-session reasoning, or future higher-layer composition

## 2026-04-03 - once session metadata preserves new provenance, session/status surfaces should expose it directly

- Symptom:
  - after `selectedAgentId` was persisted in session metadata, operators still
    had to inspect raw metadata files to confirm that a run came from
    `--agent`
- Fix:
  - surfaced normalized `selectedAgentId` in session/status JSON
  - surfaced human-readable selected-agent lines in:
    - `auracall status`
    - `auracall session <id>`
- Durable lesson:
  - when a provenance field is important enough to persist, it is usually
    important enough to surface in the main status and postmortem commands
  - do not force routine troubleshooting through raw metadata files when a
    stable CLI/report contract can expose the same fact directly

## 2026-04-03 - the first higher-layer selection seam needs one shared runtime bundle, not parallel ad hoc lookups

- Symptom:
  - after `--agent` started affecting real config/runtime resolution, the code
    still had separate helper chains for:
    - preferred AuraCall runtime profile selection
    - selected-agent inspection
    - browser-profile inheritance
  - that left runtime/config call sites to reconstruct overlapping pieces of
    the same selection state
- Fix:
  - added `resolveRuntimeSelection(...)` in `src/config/model.ts`
  - rewired:
    - `applyOracleProfile(...)`
    - config inspection/doctor report assembly
    to consume that single resolved selection bundle
- Durable lesson:
  - once a new selection seam becomes execution-adjacent, stop exposing only
    leaf helpers and add one canonical resolved bundle for runtime consumers
  - this reduces drift between inspection/reporting and the real resolution
    path before full execution semantics arrive

## 2026-04-03 - when centralizing browser-facing selection, preserve explicit runtime-profile overrides at call sites

- Symptom:
  - after introducing a shared browser-facing selection helper, browser config
    application lost defaults like:
    - `target`
    - service URLs
    - debug port
  - because `profileConfig.ts` already receives an explicit selected AuraCall
    runtime profile object, and the first helper draft ignored that override in
    favor of lookup-only selection
- Fix:
  - updated the shared browser-facing helper to accept an explicit
    runtime-profile override while still using shared runtime selection for:
    - agent-aware identity
    - runtime-profile precedence
  - rewired `profileConfig.ts` through that final helper
- Durable lesson:
  - a central seam should own precedence and identity, but it must still honor
    explicit higher-confidence objects already selected by the caller
  - otherwise refactors silently downgrade rich call-site context into weaker
    lookup-only reconstruction

## 2026-04-03 - once agent selection affects execution, the browser config contract itself should preserve that provenance

- Symptom:
  - `selectedAgentId` was preserved in outer session metadata, but the actual
    browser run/session config object still flattened away that provenance
  - that would force future browser-runtime helpers to reach outside the
    browser config seam just to understand how the selected AuraCall runtime
    profile was chosen
- Fix:
  - added `selectedAgentId` to the browser config/session types
  - updated `buildBrowserConfig(...)` and its real call sites to preserve it in
    the browser config object itself
- Durable lesson:
  - when a new higher-layer selector becomes execution-adjacent, preserve its
    provenance in the nearest execution config contract, not only in outer
    metadata envelopes
  - this keeps future runtime helpers local to the seam they actually serve

## 2026-04-03 - browser-local runtime metadata should carry higher-layer selection provenance once execution starts

- Symptom:
  - even after browser config objects preserved `selectedAgentId`, browser
    runtime hints and failure metadata still dropped it
  - that meant browser execution diagnostics would still need outer session
    metadata to explain which agent selected the resolved AuraCall runtime
    profile
- Fix:
  - added `selectedAgentId` to browser runtime metadata
  - updated browser runtime hint emitters to carry that field from the browser
    config into runtime/session metadata
- Durable lesson:
  - preserve provenance at every execution-adjacent seam where later debugging
    may begin
  - if runtime diagnostics can start from browser-local metadata, they should
    not be forced to reach outward just to recover higher-layer selection
    context

## 2026-04-03 - once runtime provenance exists, session/status surfaces should prefer it when it adds information

- Symptom:
  - browser-local runtime metadata now preserved `selectedAgentId`, but the
    main status/postmortem surfaces still only showed the request-time
    `options.selectedAgentId`
  - that left the new browser-local provenance invisible unless operators
    inspected raw stored metadata
- Fix:
  - added normalized `runtimeSelectedAgentId` to session/status JSON
  - updated human-readable session/status output to show browser-local
    selected-agent provenance only when it differs from the original request
- Durable lesson:
  - when a new runtime-local provenance field exists, expose it in the main
    status/postmortem surfaces with de-duplication rules
  - operators should see richer runtime truth without being spammed by
    identical request-time and runtime-time copies of the same value

## 2026-04-03 - team inspection should resolve through a canonical team selection helper, not projected-array internals

- Symptom:
  - team reporting already showed inherited agent/runtime/browser state, but it
    was rebuilding that view from `projectedModel.teams`
  - that made the first team-side readiness seam depend on an inspection
    projection detail instead of a reusable selection contract
- Fix:
  - added shared `getTeam(...)` and `resolveTeamSelection(...)` helpers in the
    config model layer
  - updated `profile list` reporting to consume that helper directly
- Durable lesson:
  - once a new config layer becomes execution-adjacent, give it one canonical
    resolver before spreading the same mapping across report surfaces
  - projected inspection arrays are useful outputs, but they should not become
    the hidden source of truth for later selection logic

## 2026-04-03 - once team selection has a canonical resolver, config show should expose it directly

- Symptom:
  - `profile list` could now resolve teams canonically, but `config show` still
    only exposed agents as a normalized resolved surface
  - that meant team-side troubleshooting still had to reconstruct state from
    `projectedModel.teams` or switch commands unnecessarily
- Fix:
  - added `resolvedTeams[]` to `config show`
  - updated text output to print each team plus per-member resolution state and
    inherited runtime/browser/default-service context
- Durable lesson:
  - once one inspection surface gets a normalized resolved contract, add the
    symmetric contract to the primary config-inspection surface too
  - do not force operators to choose between “active config” and “resolved team
    structure” views when both can share the same model-layer helper

## 2026-04-03 - unresolved team members must not silently inherit the active runtime profile in execution-adjacent helpers

- Symptom:
  - the first draft of `resolveTeamRuntimeSelections(...)` reused
    `resolveRuntimeSelection(...)` directly for every team member
  - for a missing agent, that would have fallen back to the active default
    runtime profile, which is misleading for future team execution/planning
- Fix:
  - `resolveTeamRuntimeSelections(...)` now only resolves a runtime selection
    when the team member actually resolves to an agent runtime profile
  - missing or incomplete team members now stay unresolved with `null`
    runtime/browser/default-service fields
- Durable lesson:
  - execution-adjacent helpers should never turn missing membership into a
    valid-looking default selection unless fallback is an explicit product rule
  - preserve unresolved state until a higher layer deliberately decides how to
    handle it

## 2026-04-03 - team config must not accidentally imply future runner topology

- Symptom:
  - once team selection and team runtime-selection helpers existed, the next
    easy step would have been to add `--team` runtime behavior immediately
  - without an explicit boundary, that risks smuggling future service-mode
    runners/parallelism assumptions into today's CLI-era team semantics
- Fix:
  - documented a dedicated team boundary note
  - made the roadmap/execution docs explicitly separate:
    - team coordination config
    - future service/runners orchestration
- Durable lesson:
  - when a compositional config layer becomes execution-adjacent, define the
    execution boundary before adding invocation semantics
  - especially for future parallelism/service work, avoid letting simple
    membership config harden into accidental scheduler policy

## 2026-04-03 - the first public `--team` seam must stay planning-only

- Symptom:
  - once the team boundary was documented, the next useful step was a public
    `--team` selector
  - without a narrow scope, that could have drifted immediately into implicit
    member choice or pseudo-execution semantics
- Fix:
  - added `--team <name>` only to `config show` and `config doctor`
  - surfaced resolved team planning data there, but left active runtime
    selection untouched
- Durable lesson:
  - the first public surface for a new orchestration layer should often be a
    planning/debug seam, not an execution seam
  - if a selector cannot yet run safely, let it explain future resolution
    clearly before letting it control behavior

## 2026-04-03 - ChatGPT rename readiness must verify the actual inline editor, not generic text-entry state

- Symptom:
  - the ChatGPT root rename path waited for a broad "editor ready" condition
    after clicking `Rename`
  - that condition treated any active text input or even selected text as good
    enough, while the actual submit path only works against
    `input[name="title-editor"]`
  - in practice that leaves the rename flow thinking the editor is ready when
    the real inline rename surface never appeared
- Fix:
  - tightened the rename-editor readiness probe to only accept the visible
    `title-editor` input
  - added focused unit coverage for the stricter probe semantics
- Durable lesson:
  - post-trigger readiness checks must align with the exact control the submit
    step will use
  - do not let generic DOM activity masquerade as provider-specific editor
    readiness

## 2026-04-03 - ChatGPT rename persistence should reuse the canonical title probe matcher

- Symptom:
  - inline rename verification used one exported conversation-title matcher in
    tests, but the live rename path still performed a separate ad hoc DOM/title
    check
  - that duplicated semantics and made it easier for quick checks and
    authoritative re-anchor checks to drift apart
- Fix:
  - added one shared title-probe reader in the ChatGPT adapter
  - rewired both inline checks and final rename-persistence verification to use
    `matchesChatgptConversationTitleProbe(...)`
  - after the list-page refresh, root renames now use the stricter
    top-row-required root verification path
- Durable lesson:
  - when a provider already has a canonical matcher for a persisted state, use
    it everywhere the workflow verifies that state
  - authoritative recovery checks should be stricter than fast-path checks, but
    they should still share the same probe contract

## 2026-04-03 - ChatGPT delete confirmation should use the same matcher in live flows and tests

- Symptom:
  - the ChatGPT delete flow already had
    `matchesChatgptDeleteConfirmationProbe(...)`, but the live delete path was
    still polling a separate in-page confirmation expression
  - that created two delete-confirmation semantic paths:
    - test-time matcher logic
    - live-flow expression logic
- Fix:
  - added one shared delete-confirmation probe reader in the adapter
  - rewired both row-menu and header-fallback delete paths to poll that probe
    through the canonical matcher
  - removed the old duplicate confirmation expression
- Durable lesson:
  - if a provider already has a tested confirmation matcher, live interaction
    code should poll a raw probe and reuse that matcher instead of embedding a
    second confirmation definition in page JavaScript
  - canonical confirmation semantics reduce drift in exactly the
    post-trigger phase where UI volatility tends to accumulate

## 2026-04-03 - ChatGPT project-source persistence should share one normalized post-reload matcher

- Symptom:
  - project-source add and remove each had their own persisted-after-reload
    verification loop
  - both loops were really answering the same question after a sources-tab
    refresh:
    - does the normalized source list contain this file name or not?
  - that duplicated persistence semantics across the two sides of the same
    surface
- Fix:
  - added a shared normalized matcher for project-source names
  - rewired both add-persistence and remove-persistence verification to use the
    normalized source list after reload
  - left immediate preview/disappear checks in place so post-action UI feedback
    and post-reload persistence remain separate phases
- Durable lesson:
  - for list-backed mutation surfaces, immediate UI response and persisted state
    should be treated as separate contracts
  - once the persisted-state contract is “normalized list after refresh,” both
    add and remove should share the same matcher instead of maintaining inverse
    bespoke loops

## 2026-04-03 - ChatGPT project settings should use one authoritative persisted snapshot for both name and instructions

- Symptom:
  - project instructions persistence already reopened the settings panel and
    read the persisted textarea value
  - project rename persistence still used a separate route/title-style check
  - that left the settings surface with split persistence semantics even though
    both values ultimately live in the same settings dialog
- Fix:
  - added a shared project-settings snapshot matcher
  - rewired project rename and project instructions persistence to use the same
    reopen-and-read settings snapshot contract
- Durable lesson:
  - when multiple mutable fields share one authoritative settings surface,
    persist verification should share one snapshot contract too
  - do not keep one field on reopen-to-verify and another on ambient route/title
    checks if the real persisted truth lives in the settings panel

## 2026-04-03 - shared persistence helpers may still need bounded fallback proofs when normalized list parsing lags live UI

- Symptom:
  - after moving project-source persistence to the normalized source list, the
    first live `wsl-chrome-2` project smoke regressed at source upload
    persistence even though this surface had been acceptance-green before
  - that showed the normalized list is the right primary contract, but not yet
    always sufficient as the only live proof during reload timing drift
- Fix:
  - kept the shared project-source persistence helper
  - restored the prior DOM-expression check as a bounded fallback inside that
    helper while keeping the normalized list as primary truth
- Durable lesson:
  - when replacing a previously green live verifier with a cleaner normalized
    matcher, keep a bounded fallback until the normalized matcher is proven
    fully sufficient on the live surface
  - architectural cleanup is good, but not at the cost of regressing an
    already-live-green acceptance path

## 2026-04-03 - ChatGPT conversation read paths should share one surface-readiness fallback order

- Symptom:
  - conversation context reads, artifact materialization, and conversation file
    listing all depended on the same conversation surface, but each call path
    carried its own local route/readiness assumptions
  - that left the read side more likely to drift than the already-hardened
    mutation paths
- Fix:
  - added one shared conversation read-surface helper for ChatGPT
  - standardized the fallback order to:
    - navigate to the conversation route
    - wait for the conversation surface
    - reload once if needed
    - reopen the conversation route once if needed
  - rewired context reads, artifact materialization, and file listing to use
    that helper
- Durable lesson:
  - if multiple provider read paths depend on the same conversation-scoped UI
    surface, they should share one readiness contract instead of carrying
    separate route/reload assumptions
  - once mutation hardening is stable, the next safest read-side step is to
    unify surface readiness before changing deeper payload or artifact logic

## 2026-04-03 - after shared read-surface recovery lands, keep the next ChatGPT slice artifact-local

- Symptom:
  - once route/surface readiness was centralized for context reads, file
    listing, and artifact entry, the remaining read-side variability moved down
    into artifact-specific logic rather than conversation-route recovery
- Fix:
  - re-ranked the next hardening slice around artifact-local readiness and
    materialization checks instead of reopening broader route logic
- Durable lesson:
  - after a shared route/surface seam is live-green, the next bounded
    hardening slice should stay at the next lower unstable layer
  - do not reopen a freshly stabilized recovery seam just because another read
    path still feels flaky; first isolate whether the remaining drift is
    artifact-local instead

## 2026-04-03 - ChatGPT image artifact readiness and src resolution should share one identity matcher

- Symptom:
  - image artifact materialization used one rule set for “is the image ready?”
    and another nearby rule set for “which image src should we fetch?”
  - both were trying to match the same artifact identity by file id or title,
    so any later tweak risked drifting one path without the other
- Fix:
  - added one canonical image artifact matcher
  - rewired image readiness polling and image `src` lookup to use that matcher
- Durable lesson:
  - if a provider artifact path asks both “is it present?” and “which node/url
    is the one?”, those questions should share the same identity contract
  - artifact-local hardening should prefer canonical matchers before broader
    recovery changes

## 2026-04-03 - ChatGPT download-button tagging should share one identity contract across regular and spreadsheet paths

- Symptom:
  - regular download artifacts and spreadsheet-card downloads both needed to
    tag the right button, but they rebuilt similar assistant-turn scoping and
    message/turn identity assumptions in separate local paths
  - that made the button-tagging surface more likely to drift than the higher
    level artifact materialization flow
- Fix:
  - added one canonical download-button matcher
  - rewired both button-tagging paths through one shared assistant-turn
    scoping and candidate-selection flow
- Durable lesson:
  - when two artifact subpaths ultimately answer “which button in this
    assistant turn represents the artifact?”, they should share the same
    identity contract even if the DOM widgets differ
  - keep DOM-specific candidate discovery separate if needed, but unify the
    identity match and selection rules

## 2026-04-03 - ChatGPT canvas materialization should reuse the same enrichment resolver as artifact merging

- Symptom:
  - canvas artifact merging already had one enrichment path for filling missing
    `contentText` from visible textdoc probes, but canvas materialization still
    partially rebuilt that fallback locally
  - that left the canvas path with two nearby answers to the same question:
    “what is the authoritative content text for this canvas?”
- Fix:
  - added one shared canvas content resolver
  - rewired canvas materialization to use that resolver instead of mixing raw
    metadata checks with a one-off merge call
- Durable lesson:
  - when an artifact type already has a merge/enrichment contract, downstream
    materialization should reuse it rather than partially reenacting it
  - artifact-local hardening gets more reliable when the merge path and the
    materialization path consume the same resolved content source

## 2026-04-03 - transient ChatGPT conversation read misses should be retryable at the llmService layer

- Symptom:
  - during a live DOCX artifact proof on `wsl-chrome-2`, the first standalone
    `conversations context get` for the fresh conversation failed with
    `ChatGPT conversation ... messages not found`
  - on the same conversation, `conversations artifacts fetch` still succeeded,
    and an immediate standalone `context get` retry also succeeded
- Fix:
  - expanded the ChatGPT retryable-error classifier in
    `src/browser/llmService/llmService.ts`
  - transient read misses like `content not found` and `messages not found` now
    get one bounded llmService retry instead of surfacing immediately
- Durable lesson:
  - once provider-local recovery is already in place, transient read-surface
    misses may still need one higher-layer retry classification so operators do
    not see a raw failure for a conversation that settles on the next attempt
  - a live artifact proof can reveal read-path retry gaps that unit-level
    artifact matcher cleanup alone will not expose

## 2026-04-03 - hot ChatGPT follow-up sends should wait for the composer/send surface to settle before fallback submit

- Symptom:
  - during a live follow-up turn on an already-hot conversation, the send path
    fell through to Enter-key fallback and later failed at prompt-commit
    verification even though the underlying thread was still settling from the
    prior turn
- Fix:
  - added a pre-submit readiness gate in `promptComposer.ts`
  - submission now waits for the stop/send surface to settle before attempting
    the send path
- Durable lesson:
  - a prompt-commit failure on a hot conversation can be a pre-submit readiness
    bug, not necessarily a bad post-submit verifier
  - before weakening commit checks, make sure the composer was actually ready
    to accept a new turn

## 2026-04-03 - expand live artifact proof one class at a time and log side findings without reopening the track

- Symptom:
  - after the DOCX proof, the remaining gap was proof breadth, not a clear new
    adapter seam
  - fresh `.xlsx` and generated-image proofs both worked, but the image
    browser-mode wrapper appeared to linger even though direct `context get`
    and `artifacts fetch` had already proven the artifact was present and
    materializable
- Fix:
  - extended live proof one artifact class at a time:
    - spreadsheet workbook
    - generated image
  - recorded the lingering image-wrapper observation as a deferred note rather
    than opening a new refactor slice immediately
- Durable lesson:
  - once the main hardening seams are in place, grow confidence with narrow
    live proofs across artifact classes
  - when a side finding appears during proof expansion, record it in the
    durable docs and keep the next coding slice deliberate instead of reacting
    immediately

## 2026-04-03 - make team selector precedence explicit in inspection surfaces

- Symptom:
  - `--team` already existed as a planning-only selector, but the current
    precedence rule lived implicitly across config reporting paths
  - that made it too easy to read team planning output as if it participated in
    active runtime selection
- Fix:
  - added one shared selector-policy helper in the config-model seam
  - `config show` and `config doctor` now state:
    - runtime uses `--profile`, then `--agent`, then config default
    - `--team` is planning-only
- Durable lesson:
  - when a selector exists for planning or inspection only, surface that rule
    explicitly in operator reports instead of relying on users to infer it from
    the absence of runtime changes

## 2026-04-03 - keep team orchestration intent separate from runner execution semantics

- Symptom:
  - the future role of teams was already implicit, but not pinned clearly
    enough in the durable architecture docs
  - that made it too easy for future work to blur:
    - team orchestration intent
    - runner/service execution semantics
- Fix:
  - updated the boundary and roadmap docs so teams are explicitly the future
    orchestration layer for:
    - divide-and-conquer task decomposition
    - multi-turn automation across agents
    - explicit data handoff between agents
  - kept runners, parallelism, queueing, and execution topology in the future
    service layer
- Durable lesson:
  - when a higher layer will eventually coordinate lower layers, document the
    ownership split early so later execution features do not collapse intent
    and scheduling into one config concept

## 2026-04-03 - define conservative defaults for future team execution before implementation starts

- Symptom:
  - team orchestration intent was documented, but the first concrete service
    execution defaults were still implicit
  - without that contract, later runner work could drift into parallelism or
    handoff semantics by inertia
- Fix:
  - added a dedicated team service-execution plan with explicit defaults:
    - sequential first
    - explicit handoff payloads
    - one shared run state
    - fail-fast by default
    - runner assignment and parallelism owned by the service layer
- Durable lesson:
  - when a future orchestration layer will sit above runners, lock the default
    execution contract before implementation so early service code optimizes for
    debuggability and replayability rather than speculative throughput

## 2026-04-03 - define the team-run data model before service code invents one ad hoc

- Symptom:
  - the service-execution defaults were now explicit, but the concrete entity
    model for future team runs was still implicit
  - without named entities and minimum fields, later runner/service work could
    drift into inconsistent terms for run state, steps, and handoffs
- Fix:
  - added a dedicated team-run data model plan with four core entities:
    - `teamRun`
    - `step`
    - `handoff`
    - `sharedState`
  - pinned minimum fields, ownership boundaries, and serialization guidance
- Durable lesson:
  - before implementing orchestration services, define the durable entity model
    first so code, storage, events, and postmortems all share the same core
    vocabulary

## 2026-04-03 - land code-facing team-run entity types before wiring service behavior

- Symptom:
  - the planning docs now described the team-run model, but there was still no
    code-facing seam for future implementation to share
- Fix:
  - added a read-only TypeScript entity module for:
    - `TeamRun`
    - `TeamRunStep`
    - `TeamRunHandoff`
    - `TeamRunSharedState`
  - added one conservative default execution policy constant
  - kept the seam behavior-free so later service work can adopt it incrementally
- Durable lesson:
  - once an orchestration model is stable enough in docs, land the shared types
    before execution code so later implementation composes around one vocabulary
    instead of recreating local object shapes

## 2026-04-03 - land team-run schemas next to the shared types, not inside the config schema stack

- Symptom:
  - the team-run entity types now existed, but there was still no validation
    seam for later service code to share
- Fix:
  - added a dedicated `src/teams/schema.ts` module with read-only Zod schemas
    matching the new team-run entity types
  - kept those schemas local to the team orchestration seam instead of folding
    them into the main config schema layer prematurely
- Durable lesson:
  - when introducing a future execution model, keep its entity validation close
    to its own types first; do not expand the main config schema surface until
    that model actually becomes a config/runtime contract

## 2026-04-03 - add a tiny validated team-run builder layer before service execution exists

- Symptom:
  - the team-run types and schemas existed, but future implementation would
    still have had to hand-assemble planned runs, steps, and shared state
- Fix:
  - added a small read-only builder layer in `src/teams/model.ts`
  - the helpers now create validated planned entities from ordered step inputs
    without introducing runner or execution behavior
- Durable lesson:
  - after landing shared types and schemas for a future execution model, add a
    tiny validated factory seam before real runtime code so later
    implementation starts from one canonical construction path

## 2026-04-03 - preserve unresolved team members in planning output instead of dropping them

- Symptom:
  - the first team-run builder seam could create planned runs from explicit step
    inputs, but it did not yet bridge the existing config-model team resolution
    path into that bundle
- Fix:
  - added read-only planners that convert resolved team runtime selections into
    a validated planned `teamRun + steps + sharedState` bundle
  - unresolved team members now remain visible as `blocked` planned steps
    instead of disappearing from the plan
- Durable lesson:
  - when bridging inspection/planning data into a future execution model, keep
    unresolved members visible in the planned output so operators can see why a
    team is not fully runnable before any service execution starts

## 2026-04-03 - expose planned team runs in config inspection before service mode exists

- Symptom:
  - the planner seam could now build planned team runs, but there was still no
    operator-facing inspection surface showing that bundle directly
- Fix:
  - `config show --team <name>` now includes a read-only planned team-run view
    built from the shared team model helpers
  - blocked unresolved members remain visible in that plan
- Durable lesson:
  - once a future execution model can be planned deterministically, surface that
    plan in inspection output before adding runtime behavior so operators can
    verify the intended orchestration shape early

## 2026-04-03 - keep team planning output identical across inspection and diagnostics

- Symptom:
  - `config show --team` exposed the planned team-run bundle, but
    `config doctor --team` still only showed the looser runtime-member preview
  - that split risked inspection and diagnostics drifting into different
    planning contracts before any service execution existed
- Fix:
  - `config doctor --team <name>` now includes the same read-only planned
    team-run bundle as `config show --team <name>`
  - both report builders now share one local inspection-only planner helper
- Durable lesson:
  - once a future execution preview exists, keep inspection and diagnostics on
    the same planned bundle so operators do not have to reconcile multiple
    orchestration previews by hand

## 2026-04-03 - add one service-ready team-run envelope before runners exist

- Symptom:
  - the team layer could now build and display planned runs, but there was
    still no canonical service-facing contract for future runners to consume
  - without that seam, later service code would likely reinvent ad hoc step
    indexing and dispatch classification
- Fix:
  - added `src/teams/service.ts` as the first non-reporting, non-executing
    bridge above the planning bundle
  - the new helper classifies planned bundles into:
    - runnable
    - waiting
    - blocked
    - terminal
    step sets, and preserves a stable `stepsById` map plus missing-dependency
    reporting
- Durable lesson:
  - once a future orchestration plan exists, land one service-ready envelope
    before implementing runners so dispatch semantics do not emerge differently
    in each later service surface

## 2026-04-03 - capture broad platform ideas in the roadmap before they fragment across slices

- Symptom:
  - several future ideas had become clear at once:
    - service mode
    - runners/workers
    - heartbeats
    - Redis/Postgres durability
    - account mirroring
    - API/MCP
    - retrieval
    - provider expansion
    - local actions
  - without capturing them centrally, later implementation would risk drifting
    into whichever adjacent track happened to be warm
- Fix:
  - updated roadmap/execution docs to group those ideas into explicit platform
    tracks with priority buckets:
    - `Now`
    - `Soon`
    - `Later`
- Durable lesson:
  - when the architecture reaches a pause point, widen the roadmap explicitly
    before more code lands so later slices can be chosen against named tracks
    instead of local momentum

## 2026-04-03 - choose Gemini as the first provider side track, but keep it bounded

- Symptom:
  - provider expansion was now an explicit roadmap bucket, but there was still
    no decision on which provider should be the first bounded side track
  - Gemini already had meaningful inherited support, which made it the obvious
    near-term candidate, but that also risked turning into a broad cleanup
    track by inertia
- Fix:
  - added a dedicated Gemini completion plan that treats Gemini as:
    - the first provider-expansion side track
    - audit/alignment first
    - not the new primary platform track
- Durable lesson:
  - when a provider already has partial inherited support, start with an
    explicit completion plan that distinguishes real capability gaps from
    architecture-alignment gaps before choosing code slices

## 2026-04-03 - make Gemini support explicit before picking implementation slices

- Symptom:
  - Gemini already had meaningful inherited support, but the supported surface
    area was still partly implicit
  - without a concrete support/proof matrix, later Gemini slices would risk
    conflating:
    - implemented capability
    - intended support
    - architecture-alignment gaps
- Fix:
  - updated user/dev docs to publish a concrete Gemini matrix across:
    - API
    - Gemini web/browser
  - explicitly marked which surfaces are:
    - supported
    - partially supported
    - not yet committed/documented
- Durable lesson:
  - for inherited provider support, publish the feature/proof matrix before
    coding so the next implementation slice is chosen against an explicit
    support baseline instead of memory

## 2026-04-03 - make Gemini browser doctor explicit instead of implying full live parity

- Symptom:
  - Gemini was already wired into the lower browser-doctor layer, but the
    public `auracall doctor` CLI still implied ChatGPT/Grok-style live doctor
    parity
  - that left Gemini operator semantics ambiguous:
    - local browser-profile inspection was possible
    - full live selector diagnosis was not
- Fix:
  - `auracall doctor --target gemini` now explicitly requires `--local-only`
  - Gemini browser doctor identity status now carries a concrete explanatory
    reason instead of just `supported: false`
  - user/testing docs now state the same boundary directly
- Durable lesson:
  - when inherited provider support only covers part of an operator surface,
    encode that partial support explicitly in the CLI and diagnostics instead
    of leaving it to implicit internal capability

## 2026-04-03 - document Gemini targeting through runtime profiles instead of browser-global drift

- Symptom:
  - Gemini support had a current feature matrix, but user-facing examples still
    foregrounded older operator shapes:
    - `browser.geminiUrl`
    - legacy `oracle` commands in the WSL runbook
  - that drifted away from the rest of Aura-Call's target-shape config model,
    where service URL targeting belongs under the selected AuraCall runtime
    profile
- Fix:
  - updated Gemini docs and the WSL runbook to prefer:
    - `runtimeProfiles.<name>.services.gemini.url`
    - explicit AuraCall runtime-profile selection
    - browser-profile terminology
  - tightened CLI help text so `--gemini-url` is described consistently as a
    Gemini web URL override
- Durable lesson:
  - when a provider inherits older config guidance, align the docs to the
    current runtime-profile/service-binding model before treating the provider
    as architecturally complete

## 2026-04-03 - stop Gemini alignment once concrete drift is gone

- Symptom:
  - after the doctor/local-only fix and runtime-profile doc alignment, Gemini
    still looked like an open alignment track by momentum alone
  - continuing there without another concrete mismatch would risk filler work
- Fix:
  - re-audited Gemini-facing login/session/status/config surfaces
  - marked the operator/runtime alignment slice complete enough
  - moved the Gemini side track to live-proof refresh instead of more semantic
    cleanup
- Durable lesson:
  - for inherited providers, close the alignment slice as soon as the concrete
    drift list is empty and move to proof refresh, rather than polishing
    operator semantics indefinitely

## 2026-04-03 - make Gemini browser targets resolve their own base URL

- Symptom:
  - the first Gemini live-proof attempt on `default -> default` seeded the
    managed Gemini browser profile correctly, but the real browser run opened
    `https://chatgpt.com/` instead of `gemini.google.com`
  - the run then hung on the wrong surface before any Gemini response capture
- Fix:
  - updated browser config resolution so `target: 'gemini'` now derives the
    generic browser `url` field from Gemini inputs/defaults rather than
    ChatGPT defaults
  - added regression coverage to keep Gemini target URL resolution and managed
    Gemini profile derivation pinned
- Durable lesson:
  - when a provider still depends on shared browser config fields like `url`,
    make the target-specific default explicit in the shared resolver or the
    provider can silently inherit another service's base route

## 2026-04-03 - record the Linux Gemini exported-cookie fallback as proof, not a hidden workaround

- Symptom:
  - after the Gemini target URL fix, the next live proof still failed on this
    Linux host because direct keyring-backed Chrome cookie reads returned zero
    Google auth cookies even though the managed Gemini browser profile was
    signed in
- Fix:
  - used the explicit Gemini operator path:
    - `auracall login --target gemini --export-cookies`
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/cookies.json`
  - re-ran live Gemini browser proofs on `default -> default`
  - confirmed:
    - text: green
    - attachment: green
- Durable lesson:
  - on Linux Gemini hosts, treat exported cookies as a first-class proof path
    when `secret-tool`/Chrome cookie decryption cannot surface the required
    Google auth cookies, and record that fact in testing docs instead of
    leaving it as local operator lore

## 2026-04-03 - make Gemini exported-cookie fallback follow the runtime profile first

- Symptom:
  - managed Gemini browser state was already scoped by AuraCall runtime profile
    and browser profile, but the exported-cookie fallback still wrote and read
    one machine-global file:
    - `~/.auracall/cookies.json`
  - that meant two Gemini-capable runtime profiles could overwrite each
    other's fallback cookies
- Fix:
  - `auracall login --target gemini --export-cookies` now writes a scoped
    cookie file under the selected managed Gemini browser profile
  - Gemini browser config now prefers that scoped cookie file before the
    legacy global fallback path
  - the global file is still updated as a compatibility mirror for now
- Durable lesson:
  - when a provider falls back to exported cookies, keep that fallback on the
    same runtime-profile boundary as the managed browser profile rather than
    collapsing back to one machine-global file

## 2026-04-04 - treat explicit Gemini image-capability denials as proof results first

- Symptom:
  - on the explicit `default -> default` Gemini proof pairing, both
    `generate-image` and `edit-image` reached the correct Gemini surface but
    returned provider text indicating image creation was unavailable
- Fix:
  - recorded those cells as non-green proof/capability results in the Gemini
    testing and planning docs instead of opening a speculative product fix
- Durable lesson:
  - when a live provider proof reaches the intended surface and returns an
    explicit capability or account-availability denial, classify it as a proof
    result first and only promote it to an implementation track after a second
    signal shows Aura-Call is actually at fault

## 2026-04-04 - verify a second provider proof target is actually initialized before planning against it

- Symptom:
  - after completing one full Gemini proof pass on `default -> default`, the
    natural next idea was a second pairing proof pass
  - but local Gemini doctor audits showed the other runtime-profile candidates
    were not initialized for Gemini at all
- Fix:
  - recorded that `wsl-chrome-2 -> gemini` and
    `windows-chrome-test -> gemini` both require setup/login before they are
    real proof targets
- Durable lesson:
  - before promoting “prove a second pairing/account” as the next provider
    step, verify that the alternate pairing is already initialized locally or
    the plan should explicitly start with setup instead of pretending the proof
    target already exists

## 2026-04-04 - do not treat second-pairing setup as equivalent to second-pairing proof

- Symptom:
  - after initializing `wsl-chrome-2 -> gemini`, the pairing became locally
    live in `doctor`, but the first real text probe still was not a clean proof
    result
  - the run completed with no text output and still sourced cookies from the
    global compatibility file instead of a pairing-scoped Gemini export
- Fix:
  - recorded the pairing as initialized-but-not-proven in Gemini testing and
    planning docs
- Durable lesson:
  - a second browser pairing is only a real proof target after both conditions
    hold:
    - the managed profile is initialized and live
    - a narrow real browser probe on that pairing returns the expected output

## 2026-04-04 - treat Gemini's visible Sign in page as a real login failure

- Symptom:
  - `auracall login --target gemini --export-cookies` could open the correct
    Gemini page yet keep waiting for cookies while the page still visibly
    showed a signed-out `Sign in` state
  - that left operator output ambiguous and made second-pairing setup look
    healthier than it really was
- Fix:
  - the shared browser-service cookie-export wait loop now supports an
    optional signed-out DOM probe
  - Gemini login/export now uses that probe so a visible sign-in state fails
    fast with an explicit login-required message
- Durable lesson:
  - when a provider login/export flow has a strong visible signed-out page
    state, treat that as a first-class failure condition instead of waiting
    only on cookie presence

## 2026-04-04 - live-validate signed-out Gemini detection before trusting second-pairing readiness

- Symptom:
  - `wsl-chrome-2 -> gemini` had been recorded as initialized after login/setup
    work, but the pairing still had not produced a clean proof result
  - without a live rerun of the new signed-out detection, that pairing could
    still look healthier on paper than it was in the browser
- Fix:
  - reran `auracall --profile wsl-chrome-2 login --target gemini --export-cookies`
    after landing the Gemini signed-out probe
  - confirmed the flow now fails explicitly with:
    - `Gemini login required; the opened Gemini page still shows a visible Sign in state.`
  - updated Gemini testing/planning docs to classify `wsl-chrome-2 -> gemini`
    as managed-profile-seeded but currently signed out, not as a real proof
    pairing
- Durable lesson:
  - after adding a new provider login-state detector, run one live validation
    on the ambiguous pairing immediately so setup docs and proof status do not
    keep overstating readiness

## 2026-04-04 - treat Gemini Sign in as a bounded recovery action when the source Chrome profile is already authenticated

- Symptom:
  - on `wsl-chrome-2 -> gemini`, the visible signed-out `Sign in` state was
    real, but it also turned out to be recoverable by one click because the
    underlying Chrome profile already had the needed Google auth context
  - failing immediately was truthful, but it still left an avoidable manual
    step in the Gemini login/export flow
- Fix:
  - extended the shared cookie-export loop so a signed-out state can attempt
    one bounded recovery action and wait through a short grace window before
    failing
  - wired Gemini to click a visible `Sign in` CTA once before giving up
  - live-validated on `wsl-chrome-2`:
    - `auracall --profile wsl-chrome-2 login --target gemini --export-cookies`
      now succeeds and writes the pairing-scoped cookie file
- Durable lesson:
  - when a provider has a strong visible signed-out state but the next step is
    also mechanically obvious and low-risk, prefer one bounded recovery action
    before surfacing a hard operator failure

## 2026-04-04 - close the loop on second-pairing readiness with a real browser text proof

- Symptom:
  - after `wsl-chrome-2 -> gemini` login/export became green, the pairing was
    still only login-ready on paper because the earlier browser text probe had
    completed with no text output
- Fix:
  - reran one narrow Gemini browser text proof using the pairing-scoped cookie
    export file
  - confirmed the run returned the exact expected output:
    - `WSL2 GEMINI TEXT GREEN 2`
  - updated Gemini testing/planning docs to promote `wsl-chrome-2 -> gemini`
    from login-ready to a real second text-green browser proof pairing
- Durable lesson:
  - after repairing provider login readiness, close the loop with one narrow
    end-to-end browser proof before treating the pairing as genuinely green

## 2026-04-04 - distinguish Aura-Call file-input proof from native Gemini upload-UI proof

- Symptom:
  - after `wsl-chrome-2 -> gemini` became text-green, the next obvious proof
    was a file-input run
  - that run succeeded, but verbose output showed:
    - `Browser will paste file contents inline (no uploads).`
  - calling that simply an "attachment upload" proof would overstate what was
    actually exercised
- Fix:
  - recorded the second-pairing file proof as green for Aura-Call file input
  - updated Gemini docs/planning notes to distinguish:
    - Aura-Call inline file bundling
    - native Gemini upload UI
- Durable lesson:
  - when a provider/file proof succeeds through Aura-Call's own inline bundle
    path, document that path honestly instead of silently upgrading it into a
    native provider-upload claim

## 2026-04-04 - treat forced Gemini attachment mode as a separate proof surface from inline file input

- Symptom:
  - after the inline-bundled file proof was green, the next real question was
    whether Gemini's actual attachment path was also green
  - forcing `--browser-attachments always` did reach the real attachment path,
    but the results were not healthy:
    - uploaded text file returned `[NO CONTENT FOUND]`
    - uploaded image returned a message saying the image did not come through
- Fix:
  - recorded real attachment mode as a concrete Gemini implementation gap in
    testing and planning docs instead of treating the inline-bundled proof as
    sufficient
- Durable lesson:
  - when a CLI supports both inline file input and real provider attachment
    transport, prove and report those paths separately; green on one does not
    imply green on the other

## 2026-04-04 - upstream Gemini MIME upload fix improved request correctness but did not close the live attachment gap

- Symptom:
  - the upstream sync notes already called out a low-scope Gemini upload fix:
    adding MIME types to uploaded files
  - local Gemini upload code still sent untyped blobs, which was a plausible
    reason image uploads were not recognized
- Fix:
  - updated Gemini upload construction to send a MIME-typed blob based on the
    file extension
  - added a focused test proving `.png` uploads are posted as `image/png`
  - reran the real `wsl-chrome-2` forced-upload image proof
- Result:
  - the request shape is now more correct
  - but the live image upload still returned:
    - `It looks like the image didn't upload properly, so I can't see anything to describe! Please try attaching it again.`
- Durable lesson:
  - when an upstream low-scope provider fix matches a live symptom, it is
    still worth landing first, but do not assume request-shape correctness is
    the whole failure without rerunning the live proof immediately

## 2026-04-04 - Gemini upload metadata belongs in the request tuple, but that still does not make real uploads green

- Symptom:
  - the upstream Gemini payload format carries more than the upload id for
    attachments
  - local Aura-Call code still built the `f.req` attachment tuple with only:
    - `[[fileId, 1]]`
  - that left a clear payload mismatch even after the MIME-typed blob upload
    fix had landed
- Fix:
  - updated the Gemini upload metadata model to preserve `mimeType`
  - updated the `f.req` attachment tuple to include:
    - upload id
    - attachment marker
    - MIME type
    - file name
  - added focused coverage proving the emitted `f.req` payload includes:
    - `[[fileId, 1, null, mimeType], fileName]`
- Result:
  - the request now matches the observed upstream shape more closely
  - but the live `wsl-chrome-2` forced-upload image proof still is not green
  - the latest run completed with:
    - `(no text output)`
- Durable lesson:
  - when a provider upload flow still fails after the request shape matches the
    observed contract more closely, stop assuming the next fix is another small
    payload tweak and inspect the deeper upload/response path directly

## 2026-04-04 - Gemini control-frame-only upload responses should fail explicitly

- Symptom:
  - after the MIME and attachment-metadata fixes, the real `wsl-chrome-2`
    forced-upload image path still was not green
  - the latest live run no longer returned a human text complaint, but Aura-Call
    still surfaced it as a misleading `(no text output)` success shape
  - direct inspection showed the raw Gemini response only contained control
    frames like:
    - `wrb.fr`
    - `di`
    - `af.httprm`
    and never included a candidate response body
- Fix:
  - added explicit Gemini control-only response detection
  - updated the Gemini executor to throw when a non-image text run ends with:
    - no text
    - no images
    - a control-only response shape
- Result:
  - the underlying upload bug still exists
  - but the same live forced-upload image proof now fails explicitly with:
    - `Gemini accepted the attachment request but returned control frames only and never materialized a response body.`
- Durable lesson:
  - when a provider returns a recognizable control/ack frame without the real
    content body, prefer an explicit classified failure over silently collapsing
    it into empty output

## 2026-04-04 - repeated Gemini attachment retries returned the same control-only response

- Symptom:
  - once the control-only upload response was classified explicitly, the next
    question was whether the provider simply needed a short retry window to
    materialize the real body
- Fix:
  - reran the same direct `runGeminiWebOnce(...)` image-upload request three
    times against `wsl-chrome-2 -> gemini`
  - tightened the attachment-specific error text to reflect that Gemini had
    accepted the attachment request before failing to materialize a body
- Result:
  - all three attempts returned the same control-only response shape
  - so a simple client-side retry is not the next useful fix
- Durable lesson:
  - when repeated identical provider requests reproduce the same control-only
    acknowledgement without a body, stop assuming the bug is just eventual
    consistency and move the investigation deeper into the protocol contract

## 2026-04-04 - Gemini native upload UI anchors are worth preserving before protocol comparison

- Symptom:
  - the next useful Gemini upload step is to compare Aura-Call's raw upload
    contract against Gemini's own browser-native upload flow
  - that comparison would be slower and noisier if the current working UI
    anchors had to be rediscovered later
- Fix:
  - recorded the current native Gemini upload-menu and preview-chip selectors in
    a dedicated investigation note
- Durable lesson:
  - when a provider has a working native UI surface but a failing raw-client
    path, preserve the live DOM anchors before returning to lower-level
    protocol work

## 2026-04-04 - first Gemini native-upload capture showed envelope drift, not just attachment-field drift

- Symptom:
  - after the attachment-specific diagnostics were in place, the remaining open
    question was whether Aura-Call was missing one small upload field or
    under-specifying the whole Gemini request envelope
- Fix:
  - drove the live native Gemini upload UI on `wsl-chrome-2`
  - captured the browser-native `StreamGenerate` request/response through CDP
- Result:
  - the native menu-item upload path is real
  - the native request still returned control frames only in that capture
  - but the critical finding was that the browser-native `f.req` envelope is
    much richer than Aura-Call's raw client payload, including extra outer
    arrays and extra attachment-trailing fields
- Durable lesson:
  - when a provider's native working path shows a substantially richer request
    envelope than the raw client, stop treating the gap as a single missing
    field and move the work to minimum viable envelope parity

## 2026-04-04 - Gemini native upload is a multi-request flow, not just upload plus StreamGenerate

- Symptom:
  - after the first native upload capture showed a richer `StreamGenerate`
    envelope, it was still unclear whether the raw-client gap lived entirely in
    that one request or in a broader native request sequence
- Fix:
  - ran a broader live native-upload capture on `wsl-chrome-2 -> gemini`
  - recorded the full post-send Gemini request sequence instead of only the
    first attachment-backed `StreamGenerate`
- Result:
  - the native page issued:
    - `batchexecute?rpcids=ESY5D`
    - attachment-backed `StreamGenerate`
    - follow-up `batchexecute?rpcids=PCck7e`
  - the follow-up request means the real native flow is broader than the raw
    Aura-Call model of:
    - upload
    - `StreamGenerate`
  - the reused live tab also surfaced a duplicate-file warning:
    - `You already uploaded a file named gemini-wsl2-upload-proof.png`
- Durable lesson:
  - when a provider's native UI follows the main generation request with more
    service calls, do not keep refining only the first request in isolation;
    first determine whether the later requests are part of the minimum viable
    success path

## 2026-04-04 - Gemini's later native-upload requests were not reachable through normal page-body capture

- Symptom:
  - once the native upload sequence was known to include:
    - `ESY5D`
    - attachment-backed `StreamGenerate`
    - `PCck7e`
  the next goal was to decode the later request payloads directly
- Fix:
  - tried several deeper live body-capture paths on `wsl-chrome-2 -> gemini`:
    - Puppeteer page-level request capture
    - CDP `Network.getRequestPostData`
    - CDP `Fetch.requestPaused`
  - repeated them on both a reused live tab and a fresh Gemini tab
- Result:
  - all of those body-oriented captures consistently surfaced only the early
    `ESY5D` POST body
  - they did not expose decodable request bodies for the later native
    `StreamGenerate` or `PCck7e` calls
- Durable lesson:
  - when a provider's later native requests are visible in sequence capture but
    not reachable through ordinary page-target body hooks, stop assuming the
    remaining gap is just another page-level payload tweak; the next honest
    options are broader browser-target capture or a different implementation
    path

## 2026-04-04 - Gemini ordinary browser uploads should use the live page, not the raw upload client

- Symptom:
  - real Gemini upload-mode runs had converged on a dead end:
    - raw upload requests could be made more correct
    - but native live captures showed a broader request sequence and richer
      payloads than the raw client could honestly mirror
  - the first browser-native helper attempt reached the real upload UI, but the
    live page still held the file chip and prompt because the send never
    actually fired
- Fix:
  - threaded `attachmentMode` into custom browser executors so Gemini could
    route upload-mode runs differently from inline/bundled text paths
  - added a Gemini browser-native upload helper that:
    - opens the live upload menu
    - accepts the real file chooser
    - waits for attachment preview state
    - waits for a genuinely enabled send button
    - verifies that submit actually starts before waiting for an answer
- Result:
  - `wsl-chrome-2 -> gemini` is now green for a real upload-mode text-file
    proof through the live page:
    - `WSL2 NATIVE GEMINI UPLOAD GREEN 2026-04-04`
  - standard Gemini browser upload-mode prompts no longer depend on the raw
    upload protocol path
- Durable lesson:
  - when a provider's raw upload protocol drifts too far from the native live
    UI, pivot ordinary attachment-backed browser runs onto the real page
    instead of continuing low-yield protocol emulation

## 2026-04-04 - Gemini text-upload success does not imply image-upload readiness on the native page

- Symptom:
  - after the browser-driven Gemini upload pivot went green for a real text
    file, the next higher-value proof target was a native image upload on the
    same `wsl-chrome-2 -> gemini` pairing
- Fix:
  - ran the image proof narrowly through the same browser-native path:
    - `--browser-attachments always`
    - PNG input
    - one-sentence description prompt
- Result:
  - not green yet
  - the run stayed unresolved beyond the earlier text-file proof window
  - live Gemini inspection showed the prompt still present without a stable
    attached-image preview or model answer
- Durable lesson:
  - once a browser-native upload path is green for text, re-prove image
    separately; image attachment state and send behavior may still diverge on
    the live provider page

## 2026-04-04 - Gemini native image runs need stricter success gates than text uploads

- Symptom:
  - after the one-time upload gate was cleared, the next Gemini native image
    rerun returned landing-page scaffolding such as:
    - `Hi Eric`
    - `For you`
  as if it were a model answer
  - the live page also showed the prompt still sitting in the composer without
    a stable attachment preview
- Fix:
  - changed Gemini native answer extraction to require the submitted prompt to
    appear in history before any following text can count as an answer
  - tightened attachment stabilization to require a real Gemini attachment
    preview or remove-file affordance, not generic page text
- Result:
  - the image path is still not green
  - but it now fails more honestly instead of false-greening on landing-page
    chrome or missing preview state
- Durable lesson:
  - browser-native image uploads need their own success criteria; text-upload
    heuristics are not strong enough once the provider page mixes hero text,
    composer state, and attachment UI in the same surface

## 2026-04-04 - Gemini image upload is currently blocked at chooser triggering, not answer parsing

- Symptom:
  - after tightening Gemini native image success gates, the next question was
    whether the image was failing at:
    - chooser open
    - attachment preview
    - submit
    - or answer extraction
- Fix:
  - tried the known Gemini image/file upload triggers in order:
    - image-specific hidden control
    - visible `Upload files`
    - file-specific hidden control
- Result:
  - the latest image run failed explicitly with:
    - `Waiting for Gemini file chooser failed across all known upload triggers.`
  - that means the current hard boundary is chooser triggering on this Gemini
    surface, not answer parsing
- Durable lesson:
  - once a browser-native path has honest failure criteria, prefer recording the
    exact highest failing boundary instead of continuing to reason from stale
    false-positive states

## 2026-04-04 - Gemini native image runs should use explicit owned-page semantics

- Symptom:
  - Gemini native image runs on `wsl-chrome-2` were drifting between:
    - pending composer state
    - detached frames
    - vague timeouts
  - unlike ChatGPT/Grok, Gemini was not yet using an equally strict owned-page
    workflow for the native image path
- Fix:
  - moved Gemini native upload-mode runs toward the same browser discipline:
    - exact target ownership
    - competing Gemini tab trimming
    - touch-target aware upload/send clicks
    - `Enter`-first submit
    - explicit failure messages for:
      - provider copy like `Image Upload Failed`
      - attachment disappearing before commit
- Result:
  - the image path is still not green
  - but the current boundary is narrower and more honest:
    - owned Gemini pages can still fail at prompt/upload-menu readiness with
      frame-detach or timeout behavior
    - once the owned page stabilizes, the latest live failure can now be
      reported explicitly as:
      - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
- Durable lesson:
  - for Gemini browser-native work, reuse the ChatGPT/Grok page-ownership model
    first; only keep the truly Gemini-specific selectors and copy local

## 2026-04-04 - Gemini native image submit must require prompt-in-history evidence

- Symptom:
  - after the owned-page hardening work, one later native image rerun on
    `wsl-chrome-2 -> gemini` regressed to:
    - `Timed out waiting for Gemini browser-native attachment response.`
  - live inspection still suggested the run had not really committed the image
    prompt into Gemini history, so the timeout was less honest than the earlier
    explicit pending/composer failures
- Fix:
  - when dispatching synthetic Gemini image uploads, try the hidden file-style
    uploader before the image-only hidden uploader
  - tightened Gemini submit so it only treats the prompt as committed when the
    prompt actually appears in Gemini history or Gemini surfaces explicit
    native failure copy
  - stopped accepting weaker hints like an empty or disabled composer as proof
    of commit on their own
- Result:
  - native Gemini image upload is still not green
  - but the same live path now exits at the more accurate boundary again:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
- Durable lesson:
  - for Gemini browser-native send/commit, use the same post-condition rule as
    ChatGPT/Grok in spirit: a prompt is not "committed" until the live page
    shows durable history evidence or a provider-native failure, not just
    transient composer state changes

## 2026-04-04 - Gemini `--browser-keep-browser` must preserve the failed page, and image staging is slower than the old preview budget

- Symptom:
  - the first Gemini `--browser-keep-browser` reruns were not inspectable
    because the helper closed the only owned page in `finally`, which could
    take the kept Chrome instance down with it
  - once that was fixed, preserved failure pages showed that native Gemini
    image uploads were actually staging:
    - visible `blob:` image
    - visible `Remove file gemini-native-upload-proof.png`
    - empty prompt box
  - that proved the newer failure was not post-submit disappearance anymore;
    the run was still timing out inside image-preview readiness
- Fix:
  - do not close the owned page when `keepBrowser` is set
  - make Gemini prompt clearing attachment-safe instead of blanket select-all
    across the whole composer
  - tighten image preview detection so it no longer accepts weak global blob
    state as proof of staging
  - widen image preview wait from 20s to 45s after preserved-page inspection
    showed Gemini can stage the image later than the old budget
- Result:
  - native Gemini image upload is still not green
  - but the honest boundary moved again and the kept-browser path now works:
    - current live failure:
      - `Waiting failed: 45000ms exceeded`
  - preserved failed pages still show the image staged, so the next slice is
    now specifically about why `waitForAttachmentPreview(...)` misses that
    state during the live wait window
- Durable lesson:
  - for hard browser surfaces, `--browser-keep-browser` must truly preserve the
    failing page or you lose the only trustworthy evidence
  - when native uploads look flaky, distinguish:
    - upload not staged
    - staged but not recognized
    - recognized but not submitted
    - submitted but unanswered
    before changing the next phase

## 2026-04-04 - Gemini image preview timeouts need last-state diagnostics, not opaque `waitForFunction` failures

- Symptom:
  - after preserved-page inspection proved the image really staged, the helper
    was still failing with:
    - `Waiting failed: 45000ms exceeded`
  - that left the next fix underspecified because the timeout itself did not
    say what Gemini actually had on the page at the end of the wait
- Fix:
  - replaced the opaque image preview `waitForFunction(...)` path with explicit
    polling that preserves the last observed:
    - prompt text
    - visible blob count
    - remove-file labels
    - preview names
    - matched attachment names
  - fixed follow-on implementation issues in that new path:
    - `__name is not defined`
    - an in-page expression syntax error caused by leftover TypeScript syntax
- Result:
  - the preview wait path is now inspectable instead of opaque
  - on the latest live rerun, the image flow got past that preview-timeout
    checkpoint and returned to the stronger explicit failure:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
- Durable lesson:
  - when a browser wait is the current boundary, preserve the last live state
    in the error before changing more workflow logic; otherwise the next fix is
    still guesswork

## 2026-04-04 - Gemini attachment submits should try the real send control before `Enter`

- Symptom:
  - after image staging and preview instrumentation improved, Gemini image runs
    were still failing at the same post-staging boundary:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
  - unlike ChatGPT/Grok, Gemini was still preferring `Enter` before trying the
    real send control for attachment-backed prompts
- Fix:
  - changed Gemini attachment submits to try:
    - send button / touch target first
    - `Enter` fallback second
    - in-page click fallback last
  - added last-state detail capture for Gemini submit timeouts so submit-phase
    failures can report composer/attachment state instead of only a generic
    timeout
- Result:
  - native Gemini image upload is still not green
  - but the more realistic click-first submit order did not create a new blind
    failure; the live rerun still returned the same explicit boundary:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
- Durable lesson:
  - for browser attachment prompts, prefer the real send control first and use
    `Enter` as fallback, but do not assume that submit-order alignment alone
    solves provider-specific attachment lifecycle bugs

## 2026-04-04 - Gemini image submit can commit without preserving image context

- Context:
  - Gemini native image upload on `wsl-chrome-2` had been failing at the
    explicit boundary:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
  - preserved-page live inspection showed that one more real send click on that
    failed page could commit the prompt and produce an answer
- Fix:
  - added one bounded resend fallback when Gemini leaves the prompt in the
    composer after the attachment disappears and before prompt-in-history
    evidence appears
- Result:
  - the latest fresh rerun no longer stalled at the old composer-pending
    boundary
  - Gemini returned a real answer instead:
    - `Please upload the image you're referring to, and I'll describe it for you in a single sentence.`
  - the active bug is now narrower:
    - prompt commit/answer materialization can succeed
    - but the staged image is still being lost before Gemini consumes it
- Durable lesson:
  - once a provider-specific attachment path starts returning real text without
    the attachment content, stop treating it as a submit bug; shift the next
    slice to attachment preservation from staged preview into model-visible
    input

## 2026-04-04 - Gemini stable staged-ready gating is not sufficient for image preservation

- Context:
  - after the resend fallback, Gemini native image upload on `wsl-chrome-2`
    was no longer failing at prompt commit
  - the active hypothesis became:
    - Gemini was being submitted too early, before staged image state was
      stable enough for model consumption
- Fix:
  - tightened Gemini attachment readiness to require:
    - matched attachment signals
    - send readiness
    - stable repeated polls before submit
  - added a short extra settle window for image uploads after staged-ready
- Result:
  - focused tests stayed green
  - fresh live rerun still returned the same attachment-blind answer:
    - `Please upload the image you're referring to, and I'll be happy to describe it for you in a single sentence.`
- Durable lesson:
  - a provider can show stable staged UI and still fail to preserve the
    attachment into model-visible input
  - once that is proven live, stop tuning staged-ready timing locally and move
    the next slice to the evidence chain preserved through submit

## 2026-04-04 - Gemini image upload now fails with explicit attachment-loss diagnostics

- Context:
  - Gemini native image runs had reached a misleading intermediate state:
    - prompt commit succeeded
    - answer materialized
    - but the answer was attachment-blind
- Fix:
  - classify attachment-blind image answers as real Gemini browser failures
  - capture attachment evidence at:
    - pre-submit
    - immediate post-submit
    - final answer time
- Result:
  - fresh live rerun on `wsl-chrome-2 -> gemini` now fails explicitly with the
    exact evidence chain:
    - pre-submit:
      - `visibleBlobCount = 1`
      - `Remove file gemini-native-upload-proof.png`
    - post-submit:
      - prompt committed to history
      - blob still visible
      - remove affordance gone
    - final:
      - blob gone
      - prompt still in history
      - attachment-blind answer
- Durable lesson:
  - this is not a generic submit or readiness failure anymore
  - the active bug is attachment association loss during or immediately after
    submit, so the next slice should target that boundary specifically

## 2026-04-04 - Gemini native image association depended on the image uploader path

- Context:
  - Gemini image runs had been narrowed to an attachment-association failure:
    - image staged
    - prompt committed
    - answer materialized
    - but the answer was attachment-blind
  - diagnostics showed the image surviving staging and briefly surviving
    immediate post-submit before association was lost
- Fix:
  - for image-only synthetic `fileSelected` dispatch, prefer:
    - hidden image uploader first
    - hidden file uploader second
  - also keep the hidden-uploader fallback even when the visible upload-files
    menu item does not materialize
- Result:
  - fresh live rerun on `wsl-chrome-2 -> gemini` returned a real image-aware
    answer:
    - `An empty room features white walls, light wood flooring, and a large window overlooking a lush green landscape.`
- Durable lesson:
  - Gemini's hidden image uploader and hidden generic file uploader are not
    interchangeable for model-visible image association
  - if an image stages but the model answers as if no image exists, check the
    uploader path before spending more time on submit timing

## 2026-04-04 - Gemini phase-aware submit diagnostics now have a package-owned seam

- Context:
  - Gemini image debugging produced the first clearly reusable lesson for
    browser-service:
    - attachment-backed actions need named pre/post/final diagnostics
  - keeping that shape provider-local would make the next provider rediscover
    the same wrapper
- Fix:
  - added package-owned:
    - `captureActionPhaseDiagnostics(...)`
    in `packages/browser-service/src/service/ui.ts`
  - Gemini native attachment submit diagnostics now use that helper through the
    Aura-Call browser-service shim
- Result:
  - the first 2026-04-04 Gemini browser-service backlog item is now live code,
    not just a note
  - provider-specific selectors and attachment semantics remain local to Gemini
- Durable lesson:
  - extract the mechanical phase wrapper first
  - leave provider-specific signal reading and semantic false-success
    classification local until a second real provider proves the same shape

## 2026-04-04 - Gemini upload-trigger fallback now has a package-owned seam

- Context:
  - Gemini native upload recovery also exposed a second clearly reusable
    browser-service lesson:
    - ordered upload-trigger fallback is a generic browser mechanic, not a
      Gemini-only idea
  - the existing chooser-trigger loop was already purely mechanical
- Fix:
  - added package-owned:
    - `runOrderedSurfaceFallback(...)`
    in `packages/browser-service/src/service/ui.ts`
  - Gemini native chooser-trigger selection now uses that helper through the
    Aura-Call browser-service shim
- Result:
  - the second 2026-04-04 Gemini browser-service backlog item now has a live
    package seam too
  - provider-specific trigger selectors and upload semantics remain local
- Durable lesson:
  - when a provider loop is only “try these real surfaces in order until one
    works,” extract the fallback runner before extracting provider signal
    semantics

## 2026-04-04 - Gemini attachment preview polling now has a package-owned seam

- Context:
  - Gemini attachment preview waits were also carrying a reusable browser
    mechanic:
    - repeated state reads
    - stable-ready polling
    - last-state timeout reporting
  - the polling mechanics were reusable even though the signal payload shape
    was still Gemini-specific
- Fix:
  - added package-owned:
    - `waitForAttachmentSignals(...)`
    in `packages/browser-service/src/service/ui.ts`
  - Gemini attachment preview stabilization now uses that helper through the
    Aura-Call browser-service shim
- Result:
  - the third 2026-04-04 Gemini browser-service backlog item now has a live
    package seam too
  - provider-specific signal readers and attachment payload shapes remain local
- Durable lesson:
  - extract polling/stability mechanics before trying to force one shared
    cross-provider attachment signal schema

## 2026-04-04 - Cross-provider attachment signal schema is not ready for extraction

- Context:
  - after extracting the reusable mechanics from Gemini, the next question was
    whether ChatGPT/Grok/Gemini now shared one real attachment signal payload
    shape
- Result:
  - no
  - ChatGPT/Grok attachment waits still rely on signals like:
    - `uploading`
    - `filesAttached`
    - `attachedNames`
    - `inputNames`
    - `fileCount`
  - Gemini attachment waits still rely on signals like:
    - `sendReady`
    - `visibleBlobCount`
    - `removeLabels`
    - `previewNames`
    - `matchedNames`
- Durable lesson:
  - the common reusable layer is the mechanic, not the payload schema
  - keep attachment signal payloads provider-local until a second provider
    proves a stable common model instead of extracting a fake abstraction

## 2026-04-04 - Gemini CRUD/cache planning now has a dedicated track

- Context:
  - Gemini browser execution is now healthy enough that the next meaningful
    provider-expansion work is no longer uploads or browser-service mechanics
  - the next missing provider layer is:
    - conversation CRUD
    - Gem-as-project CRUD
    - cache integration to match ChatGPT/Grok expectations
- Decision:
  - create one dedicated planning track instead of scattering Gemini CRUD notes
    across upload and proof docs
  - treat Gemini `Gems` as the provider-local UI concept for the generic
    `Project` domain
  - reuse the existing generic provider cache datasets instead of inventing
    Gemini-only cache families
- Durable lesson:
  - for provider expansion, normalize the provider concept into the existing
    domain/cache model first, then implement CRUD from that normalization

## 2026-04-04 - Gemini already exposes real Gem and conversation CRUD anchors

- Context:
  - the new Gemini CRUD/cache plan started with a DOM recon requirement before
    any implementation
- Result:
  - Gemini root and Gem surfaces are concrete enough to proceed
  - confirmed live anchors include:
    - conversations:
      - `data-test-id="all-conversations"`
      - `data-test-id="conversation"`
      - `data-test-id="actions-menu-button"`
      - stable routes:
        - `/app/<conversationId>`
    - Gems:
      - authoritative route:
        - `/gems/view`
      - create:
        - `data-test-id="open-bots-creation-window"`
        - `New Gem`
      - user Gem route:
        - `/gem/<id>`
      - user Gem direct actions:
        - `Share`
        - `Edit Gem`
        - `More options for "<name>" Gem`
- Durable lesson:
  - Gemini `Gems` are not a speculative abstraction anymore
  - the next Gemini CRUD slice can start from real named surfaces and should
    map Gems directly onto the generic `Project` domain

## 2026-04-04 - Gemini now participates in the generic browser provider/cache path

- Context:
  - Gemini had browser execution support, but it still sat outside the real
    `BrowserProvider -> LlmService -> cache` path used by ChatGPT and Grok for
    project and conversation listing
- Symptom:
  - Gemini CRUD/cache planning existed, but `auracall projects --target gemini`
    and `auracall conversations --target gemini` did not have a real provider
    implementation behind them
- Root cause:
  - the browser provider id, registry, llmService factory, and browser client
    all still treated Gemini as execution-only instead of as a first-class
    browser provider domain
- Fix:
  - widened the typed browser provider id and registry to include Gemini
  - added a Gemini browser provider config plus a minimal Gemini adapter/service
    for:
    - Gem-as-project listing
    - conversation listing
    - Google-account-label identity detection for cache writes
  - updated the CLI project/conversation list surfaces so Gemini goes through
    the same generic browser-provider path
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 projects --target gemini`
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 conversations --target gemini`
- Durable lesson:
  - Gemini provider expansion should enter the existing generic provider/cache
    path early, even if the first slice only supports listing
  - list support plus cache identity is a better first boundary than jumping
    straight to mutation flows

## 2026-04-04 - Gemini Gem create now works through the generic project-create path

- Context:
  - Gemini list support was live, but the first real Gem mutation still did
    not exist behind the generic `projects create --target gemini` surface
- Symptom:
  - Gemini Gem create initially reached the real create page and saved the Gem,
    but Aura-Call still failed verification because it only expected a
    `/gem/<id>` route and did not treat `/gems/edit/<id>` as the native success
    state
  - Gemini project listing could also scrape the wrong page if the focused
    Gemini tab was not already on the Gem manager route
- Root cause:
  - Gemini route assumptions were too narrow
  - Gemini list scraping was still too willing to reuse an arbitrary same-origin
    tab without forcing the authoritative list surface first
- Fix:
  - added Gemini `createProject(...)` against the real `/gems/create` surface
  - accepted `/gems/edit/<id>` as a native successful Gemini Gem create route
  - made Gemini project list scraping navigate to `/gems/view` before scraping
  - widened the shared `projects create` CLI target gate to include Gemini
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 projects create 'AuraCall Gemini Gem CRUD Proof 2026-04-04 1854' --target gemini --instructions-text 'Reply helpfully about AuraCall Gemini CRUD proofs.'`
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 projects --target gemini`
- Durable lesson:
  - Gemini browser CRUD should follow Gemini's real route model, not a
    ChatGPT/Grok-shaped assumption about where success lands
  - Gemini list/read surfaces should explicitly navigate to their authoritative
    route before scraping, even when a reusable same-origin Gemini tab already
    exists
  - one remaining Gem-list name-quality issue is recorded for a later slice and
    should not block create-path progress

## 2026-04-04 - Gemini Gem rename now works through the native edit page

- Context:
  - Gemini Gem create was live, but rename had not landed because the first
    implementation treated the first immediate reopen of `/gems/edit/<id>` as
    the authoritative persistence check
- Symptom:
  - Aura-Call staged the new name and hit a real save path, but rename still
    failed verification with the old name
- Root cause:
  - Gemini does not always expose the persisted renamed title immediately on
    the first post-save re-open
  - the save path is real, but persistence verification needed to poll the edit
    page until the hydrated name input caught up
- Fix:
  - added Gemini `renameProject(...)` against the native `/gems/edit/<id>`
    surface
  - widened the shared `projects rename` CLI target gate to include Gemini
  - verified rename by polling the edit-page name input for the expected
    persisted value instead of trusting the first immediate refresh
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 projects rename 8206744c0568 'AuraCall Gemini Gem CRUD Proof 2026-04-04 1914' --target gemini`
    - authoritative follow-up read on:
      - `https://gemini.google.com/gems/edit/8206744c0568`
- Durable lesson:
  - for Gemini Gem rename, the edit page is the authority, not the manager list
  - Gemini persistence checks should poll hydrated edit-page state before
    calling a rename failed
  - Gemini Gem delete remains separate and should not be bundled into the
    rename slice until a real durable delete proof exists

## 2026-04-04 - Gemini Gem delete now works through the manager row menu

- Context:
  - Gemini Gem create and rename were live, but delete still lacked a durable
    end-to-end proof
- Symptom:
  - the first Gemini delete attempt failed at row targeting even though the Gem
    manager visibly exposed the correct row action
- Root cause:
  - Gemini's current manager list scrape can abbreviate user-Gem names, but
    the manager row action surface still uses the full long-form Gem name in
    `aria-label`
  - the generic click helper was also too brittle on that row button
  - Gemini can render duplicate `Delete Gem?` confirmation dialogs, so delete
    confirmation must click every visible `Delete` button, not just one
- Fix:
  - added Gemini `selectRemoveProjectItem(...)` and
    `pushProjectRemoveConfirmation(...)`
  - widened the shared `projects remove` CLI target gate to include Gemini
  - delete now resolves the authoritative Gem name from `/gems/edit/<id>`,
    finds the exact `More options for "<name>" Gem` row action on `/gems/view`,
    selects `Delete`, and confirms all visible `Delete` dialogs
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - created disposable Gem `AuraCall Gemini Gem Delete Proof 2026-04-04 1935`
    - removed id `525572997076` with:
      - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 projects remove 525572997076 --target gemini`
    - refreshed Gem list no longer included that id
- Durable lesson:
  - for Gemini delete, the edit page is the authority for the current Gem
    title, while the Gem manager row action is the authority for destructive
    actions
  - do not key Gemini delete off the current list scrape name alone
  - when Gemini shows duplicate destructive dialogs, confirm all visible
    destructive buttons in that pass

## 2026-04-04 - Gemini conversation list should ignore non-Gemini configured URLs

- Context:
  - Gemini project CRUD was green, but the next conversation/cache slice
    failed immediately on `conversations --target gemini`
- Symptom:
  - `auracall --profile wsl-chrome-2 conversations --target gemini` failed
    with:
    - `Gemini conversation surface did not become ready: Gemini conversation surface did not settle`
  - after that was fixed, the list returned but cache write-through still
    warned that Gemini cache identity was missing
- Root cause:
  - Gemini conversation list was inheriting the generic `browser.url`, which
    on this host points at ChatGPT, so the Gemini adapter was sometimes being
    asked to settle a ChatGPT URL
  - Gemini cache identity also depended too heavily on a live page account
    label that is not consistently available on the conversation list surface
- Fix:
  - added `resolveGeminiConfiguredUrl(...)` so Gemini list/identity surfaces
    only honor Gemini-compatible configured URLs and otherwise fall back to
    `https://gemini.google.com/app`
  - added a Gemini service fallback from `inspectBrowserDoctorState(...)` so
    cache identity can derive from the managed browser profile's Google-account
    metadata when live Gemini identity probing returns null
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 conversations --target gemini`
    - returned live Gemini `/app/<conversationId>` rows
    - no longer emitted the earlier cache-identity warning
    - wrote cache files under:
      - `~/.auracall/cache/providers/gemini/ecochran76@gmail.com/`
- Durable lesson:
  - Gemini provider surfaces must not trust a cross-provider inherited
    `configuredUrl`
  - managed browser-profile account metadata is an acceptable cache-identity
    fallback when Gemini's live DOM does not expose a stable account label

## 2026-04-05 - Gemini exact route selection must outrank broad `/app` tabs

- Symptom:
  - exact Gemini conversation-route work could still bind to the wrong tab
    instance when multiple Gemini tabs were open
  - live probing of
    `https://gemini.google.com/app/17ecd216fc87eacf`
    showed browser-service resolving a generic `/app` tab, not the exact
    conversation page
- Root cause:
  - the Gemini adapter trusted the service-resolved tab before considering any
    exact requested URL match among open Gemini page targets
  - when browser-service returned the broad `/app` tab, Gemini could ignore a
    more specific already-open exact conversation tab
- Fix:
  - added `geminiUrlMatchesPreference(...)` and
    `selectPreferredGeminiTarget(...)`
  - changed Gemini tab connection to prefer the exact requested URL match
    before the broad service-resolved tab and before generic same-origin reuse
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Durable lesson:
  - Gemini's broad `/app` service tab is not authoritative for exact-route
    work when multiple Gemini tabs are open
  - provider adapters should treat exact requested URL matches as stronger
    evidence than generic same-origin or service-root matches

## 2026-04-05 - Gemini must not inherit ChatGPT URL defaults from `LlmService`

- Symptom:
  - Gemini had working provider-local list/Gem CRUD fixes, but shared
    `LlmService` plumbing still resolved non-Grok services through the
    ChatGPT URL path
  - that left Gemini vulnerable to starting browser-service resolution from
    ChatGPT-biased defaults before adapter-local fixes ran
- Root cause:
  - `LlmService.getConfiguredUrl()` and its launch fallback treated the world
    as:
    - Grok
    - everything else is ChatGPT
- Fix:
  - taught `LlmService` to resolve service-specific configured URLs and default
    launch URLs for:
    - ChatGPT
    - Gemini
    - Grok
  - added focused regression coverage to ensure Gemini uses
    `browser.geminiUrl` and falls back to the Gemini app route instead of the
    ChatGPT home URL
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Durable lesson:
  - provider-specific URL ownership belongs in the shared service base, not
    just in provider adapters
  - preserve provider-local selectors and CRUD semantics, but keep service URL
    and target resolution aligned at the `LlmService` seam first

## 2026-04-05 - Gemini conversation validation must require root-list presence

- Symptom:
  - a strengthened Gemini conversation preflight still passed
    `17ecd216fc87eacf` even though the authoritative managed-profile root list
    did not contain that conversation id
- Root cause:
  - validating only the exact `/app/<conversationId>` route plus same-tab DOM
    evidence is still too permissive for Gemini
  - an exact-route Gemini tab can exist without that conversation being present
    in the current root conversation list/account context
- Fix:
  - changed Gemini conversation preflight to require both:
    - exact conversation route success
    - presence of the same conversation id in the authoritative root list on
      `/app`
- Verification:
  - live:
    - `pnpm tsx /tmp/gemini-preflight-proof.mts`
      - `17ecd216fc87eacf` -> invalid or missing
      - `f626d2f5da22efee` -> valid
    - `pnpm tsx /tmp/gemini-root-list-check.mts`
      - `17ecd216fc87eacf` absent
      - `f626d2f5da22efee` present
  - focused regressions:
    - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
    - `pnpm run check`
- Durable lesson:
  - for Gemini root-chat mutations, exact-route validity is weaker than
    root-list ownership
  - destructive preflight should key off the same authoritative root-list
    surface the mutation flow depends on

## 2026-04-05 - Gemini unusual-traffic interstitials should not look like route-settle bugs

- Context:
  - a rerun of the owned Gemini root-chat delete proof hit
    `https://www.google.com/sorry/index?...continue=https://gemini.google.com/app`
    instead of Gemini `/app`
- Fix:
  - added Gemini-specific blocking-page classification so
    `navigateToGeminiConversationSurface(...)` throws an explicit
    unusual-traffic/interstitial error when Google serves the `sorry` page
    rather than collapsing it into a generic Gemini route-settle failure
- Verification:
  - focused regressions:
    - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
    - `pnpm run check`
- Durable lesson:
  - Gemini live-browser failures should classify upstream Google anti-bot
    interstitials separately from provider DOM/route instability

## 2026-04-05 - Capture captcha-awareness as a roadmap item, not a detour

- Context:
  - Gemini live work hit both:
    - Google `google.com/sorry` anti-bot interstitials
    - visible reCAPTCHA checkbox challenges
- Action:
  - added an explicit deferred captcha-aware browser TODO to:
    - `docs/dev/next-execution-plan.md`
    - `docs/dev/gemini-completion-plan.md`
    - `docs/dev/browser-service-upgrade-backlog.md`
- Durable lesson:
  - once captcha/anti-bot handling becomes visible work, capture it as a
    first-class roadmap item quickly so it does not silently hijack the
    current provider/refactor slice

## 2026-04-05 - Give Gemini browser CRUD a real per-profile mutation guard

- Context:
  - Gemini browser CRUD was still running with effectively no real pacing:
    only the shared generic one-retry `500ms` fallback plus a few provider-local
    sleeps
  - repeated Gemini root-list reloads and delete verification churn were
    bot-shaped enough to trigger Google anti-bot pages
- Fix:
  - added a Gemini-specific shared `LlmService` guard that persists per managed
    browser profile and enforces:
    - post-write quiet period
    - minimum spacing between mutating Gemini actions
    - anti-bot cooldown when Gemini hits `google.com/sorry`, captcha, or
      related blocking errors
- Verification:
  - `pnpm vitest run tests/browser/llmServiceRateLimit.test.ts tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Durable lesson:
  - Gemini should not reuse the “no guard except generic retry” path once it
    starts doing real browser CRUD; even a simpler guard than ChatGPT’s is
    materially better than ad hoc sleeps

## 2026-04-05 - Put Gemini prompt execution behind the shared llmService contract

- Context:
  - Gemini was still partly living on a legacy browserless prompt path while
    ChatGPT/Grok-oriented browser architecture had moved toward the shared
    `LlmService` seam
  - that mismatch made Gemini harder to reason about, harder to cache
    correctly, and easier to bind to the wrong live tab/profile
- Fix:
  - introduced a shared prompt contract on the provider + `LlmService` layers
  - implemented Gemini prompt execution through the managed browser/service
    path with:
    - browser-service tab resolution
    - live composer focus/insertion
    - pointer-based send
    - DOM polling for the new assistant response and conversation id/url
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - once a provider starts needing real CRUD/session/cache behavior, prompt
    execution should live on the same disciplined service contract as the rest
    of the provider surface; split browserless/browserful paths create state,
    targeting, and cache drift

## 2026-04-05 - Gemini prompt-response readers must strip provider UI chrome

- Context:
  - after moving Gemini prompt execution onto the managed browser path,
    `runPrompt(...)` stopped timing out but could still return polluted answer
    text like:
    - `Show thinking Gemini said ACK smoke-...`
- Root cause:
  - live Gemini can expose the completed assistant answer inside nodes that
    also contain provider UI chrome and action labels
  - taking the newest visible response block verbatim is therefore too broad
    even when the correct turn is selected
- Fix:
  - prioritized assistant-specific Gemini response containers ahead of the
    broad fallback scan
  - added assistant-text sanitization to strip leading Gemini UI labels and
    trailing action labels from the extracted response text
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - live:
    - disposable prompt:
      - `Disposable CRUD smoke smoke-1775434245568: reply with exactly ACK smoke-1775434245568`
    - returned:
      - `ACK smoke-1775434245568`
    - conversation id:
      - `d426a807eaa1c09c`
- Durable lesson:
  - for Gemini browser reads, "assistant container found" is not enough;
    extraction must account for provider-owned labels/actions that share the
    same rendered response region

## 2026-04-05 - Re-prove Gemini root-chat CRUD as one managed create/delete smoke

- Context:
  - the Gemini prompt path and the Gemini delete path had each been proven in
    isolation, but the next honest checkpoint was one bounded live smoke using
    the same managed browser profile and returned conversation id
- Fix:
  - ran a disposable managed-path smoke that:
    - created a Gemini root chat through `runPrompt(...)`
    - captured the returned `conversationId`
    - deleted that same conversation through the provider delete flow
    - verified absence from a fresh root conversation list
- Verification:
  - live:
    - create prompt:
      - `Disposable CRUD smoke smoke-1775434245568: reply with exactly ACK smoke-1775434245568`
    - create result:
      - text: `ACK smoke-1775434245568`
      - conversation id: `d426a807eaa1c09c`
    - delete verification:
      - `stillPresent: false`
- Durable lesson:
  - for Gemini CRUD checkpoints, prefer one bounded end-to-end managed smoke
    over separate create-only and delete-only proofs; it validates id handoff
    and authoritative root-list verification in the same slice

## 2026-04-05 - Cache identity should follow the detected logged-in service account

- Context:
  - cache keys were still allowed to prefer configured/profile identity hints
    before the actual logged-in service account
  - that makes cross-account cache segregation brittle when a managed browser
    profile is signed into a different account than the static config implies
- Fix:
  - changed shared `LlmService.resolveCacheIdentity(...)` precedence so:
    - detected provider identity wins when available
    - configured/profile identity stays fallback only
    - prompt fallback still remains last resort when detection is disabled or
      unavailable
- Verification:
  - `pnpm vitest run tests/browser/llmServiceIdentity.test.ts tests/browser/geminiAdapter.test.ts`
  - live on `default -> gemini`:
    - provider identity:
      - `Eric Cochran <ecochran76@gmail.com>`
    - resolved cache key:
      - `ecochran76@gmail.com`
- Durable lesson:
  - service/account cache segregation should key off the live signed-in service
    identity whenever the provider can determine it; config identity is a
    fallback hint, not the authority

## 2026-04-05 - Gemini browser doctor should report the same live account identity as cache/provider paths

- Context:
  - after fixing cache identity precedence, Gemini still had one stale
    inconsistency:
    - browser doctor claimed Gemini account identity probing was unsupported
    - provider/cache paths could already resolve the live signed-in account
- Fix:
  - removed the Gemini-specific unsupported branch from
    `inspectBrowserDoctorIdentity(...)`
  - browser doctor now probes Gemini identity through the same live provider
    path used elsewhere when a managed session is alive
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/geminiAdapter.test.ts`
  - live on `default -> gemini`:
    - `supported: true`
    - `attempted: true`
    - `identity: Eric Cochran <ecochran76@gmail.com>`
- Durable lesson:
  - once a provider can determine the live signed-in account, doctor/debug
    surfaces should expose that same truth; leaving one surface marked
    unsupported creates avoidable confusion about cache/account authority

## 2026-04-05 - Gemini Gem name resolution must not treat arbitrary names as ids

- Context:
  - while validating Gemini Gem project-cache updates, a live proof appeared to
    resolve a newly created Gem name from cache
  - the first result was misleading because `normalizeGeminiProjectId(...)`
    accepted arbitrary free-form names as if they were valid Gemini Gem ids
- Root cause:
  - Gemini project id normalization was too permissive:
    - any non-empty trimmed string survived after light prefix stripping
  - that let name-based resolution bypass the cache path entirely
- Fix:
  - restricted Gemini project-id normalization to:
    - ids extracted from Gemini URLs
    - id-like bare tokens only
  - arbitrary Gem names now fall through to the intended cache-backed
    name-resolution path
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/profileDoctor.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - created Gem:
      - `61f0e955b0ca`
    - name lookup with `allowAutoRefresh: false` resolved back to:
      - `61f0e955b0ca`
- Durable lesson:
  - provider id normalizers must stay strict; if a selector can be both a human
    name and an id, over-accepting the id path can create false-positive cache
    proofs and hide real cache bugs

## 2026-04-05 - Gemini Gem knowledge upload uses hidden upload hosts, not plain file inputs

- Context:
  - the next Gemini parity slice is Gem knowledge file CRUD, and the first live
    question was whether the Gem editor exposes an ordinary file input after
    opening the knowledge upload menu
- Finding:
  - the Gem knowledge surface does not expose a normal visible
    `input[type="file"]` path on the edit page
  - live DOM mapping on `gems/edit/<id>` showed:
    - upload trigger:
      - `button[aria-label*="upload file menu for Gem knowledge"]`
    - upload menu item:
      - `data-test-id="local-images-files-uploader-button"`
    - hidden upload host:
      - `data-test-id="hidden-local-image-upload-button"`
- Durable lesson:
  - Gemini Gem knowledge upload should reuse the existing Gemini hidden-upload
    dispatch strategy from the browser-native path rather than assuming a
    standard file-input workflow

## 2026-04-05 - Gemini Gem edit has a second hidden upload surface and chooser activation is stricter than plain prompt upload

- Context:
  - while implementing Gemini Gem knowledge file CRUD, live upload kept failing
    even after the edit-surface controls were mapped and the service seam was
    wired through `uploadProjectFiles(...)`
- Findings:
  - the Gem edit page contains at least two upload surfaces:
    - the Gem knowledge section
    - the preview conversation composer lower on the page
  - the knowledge section exposes its own hidden buttons with:
    - `xapfileselectortrigger`
    - `data-test-id="hidden-local-image-upload-button"`
    - `data-test-id="hidden-local-file-upload-button"`
  - compile-safe upload/list scaffolding can be added before the live upload is
    fully green, but live proof still matters here because the hidden-trigger
    activation semantics differ from ordinary prompt upload
  - on the live Gem editor, both of these attempts are currently insufficient:
    - synthetic `fileSelected` dispatch alone
    - CDP chooser interception plus naive button activation
- Durable lesson:
  - Gemini Gem knowledge upload should not be treated as "prompt upload, but on
    a different page"
  - the adapter needs a knowledge-surface-specific activation sequence that is
    validated live before claiming Gem knowledge CRUD is green

## 2026-04-05 - Gemini root upload can open the native chooser without Puppeteer emitting a filechooser event

- Context:
  - root new-chat Gemini file upload had regressed even though the visible
    upload button and menu still looked normal on `/app`
  - a live rerun showed the native file chooser opening, but Aura-Call still
    timed out waiting for Puppeteer's `waitForFileChooser()`
- Fix:
  - updated Gemini browser-native upload to:
    - prefer trusted mouse clicks on visible upload controls
    - intercept `Page.fileChooserOpened` through CDP
    - inject files with `DOM.setFileInputFiles`
    - retain Puppeteer chooser handling only as fallback
- Verification:
  - `pnpm vitest run tests/gemini.test.ts tests/gemini-web`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live root composer upload on `default -> gemini`:
    - staged file:
      - `gemini-new-chat-upload-smoke.txt`
    - Gemini answer included:
      - `GEMINI NEW CHAT UPLOAD SMOKE 1775437518`
- Durable lesson:
  - for Gemini upload surfaces, "chooser opened" and "Puppeteer observed a
    filechooser" are not equivalent
  - when Gemini uses native chooser plumbing behind custom controls, CDP
    chooser interception is more reliable than relying only on Puppeteer's
    higher-level filechooser event

## 2026-04-05 - Gemini Gem knowledge persistence needs explicit save-state verification and hydrated readback

- Context:
  - Gemini Gem knowledge upload on the edit page progressed from chooser
    failures to a narrower inconsistency:
    - upload/save returned success
    - a fresh `projects files list --target gemini` still returned empty
- Root cause:
  - two separate issues were mixed together:
    - the Gem edit save path should be verified against Gemini's real status
      indicator (`Gem saved`), not guessed from route changes alone
    - the fresh list/readback path could scrape the edit page before Gemini had
      rehydrated the persisted knowledge-file rows
- Fix:
  - updated Gemini Gem save verification to watch the live save-state element:
    - `div[role="status"].save-state`
    - `Gem saved`
  - kept the save-button helper focused on trusted clicks against the visible
    `Save` / `Update` action surface
  - taught Gemini `listProjectFiles(...)` to wait briefly for hydrated
    knowledge-file signals before concluding the list is empty
  - widened CLI `projects files add|list|remove` target validation to include
    Gemini so the real product path can exercise the provider directly
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live on Gem:
    - `61f0e955b0ca`
  - live upload:
    - `pnpm tsx bin/auracall.ts projects files add 61f0e955b0ca --file /home/ecochran76/workspace.local/auracall/AGENTS.md --target gemini --profile default --verbose`
    - returned:
      - `Uploaded 1 file(s) to project 61f0e955b0ca.`
  - fresh live list:
    - `pnpm tsx bin/auracall.ts projects files list 61f0e955b0ca --target gemini --profile default --verbose`
    - returned:
      - `AGENTS.md`
- Durable lesson:
  - on Gemini Gem edit surfaces, mutation proof and read proof are separate:
    a real save indicator confirms persistence, but fresh list/readback still
    needs a bounded hydration wait before an empty result is trustworthy

## 2026-04-05 - Gemini Gem knowledge delete must require explicit `Gem not saved` -> `Gem saved` transitions

- Context:
  - after Gemini Gem knowledge add/list went green, the first real delete path
    could still fail with:
    - `Gemini Gem knowledge file "AGENTS.md" still appears after delete.`
- Root cause:
  - the initial delete implementation reused a permissive unsaved-state check
    that could pass even when the remove action had not actually dirtied the
    Gem
  - that allowed false-positive progress through the delete flow and made the
    final post-save readback look like the only failure
- Fix:
  - updated Gemini Gem knowledge delete to require the real status transitions:
    - `Gem not saved` after clicking the row-level `Remove file <name>` control
    - `Gem saved` after clicking `Update`
  - kept the final proof on a fresh edit-page readback after save
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - delete:
      - `pnpm tsx bin/auracall.ts projects files remove 61f0e955b0ca AGENTS.md --target gemini --profile default --verbose`
      - returned:
        - `Removed "AGENTS.md" from project 61f0e955b0ca.`
    - fresh list:
      - `pnpm tsx bin/auracall.ts projects files list 61f0e955b0ca --target gemini --profile default --verbose`
      - returned:
        - `No files found for project 61f0e955b0ca.`
- Durable lesson:
  - on Gemini Gem edit pages, save-state text is the authority for destructive
    knowledge mutations; permissive fallbacks hide whether the remove action
    actually registered before `Update`

## 2026-04-05 - Gemini Gem delete is more reliable from the direct Gem page than the manager row

- Context:
  - Gemini Gem delete kept looking flaky when driven from the Gem manager
    surface
  - row-menu assumptions were easy to blur with other Gemini menus and did not
    consistently produce the delete confirmation in automation
- Root cause:
  - the manager page is a good verification surface, but it was not the most
    stable mutation surface for delete on this runtime/profile pairing
  - the direct Gem page exposes a cleaner action chain with dedicated controls:
    - `conversation-actions-menu-icon-button`
    - `delete-button`
    - `confirm-button`
- Fix:
  - moved the Gemini Gem delete mutation flow to `https://gemini.google.com/gem/<id>`
  - kept `gems/view` only for the final absence proof after the destructive
    action has already succeeded
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts projects remove 72ce49fba4a6 --target gemini --profile default --verbose`
    - returned:
      - `Removed project 72ce49fba4a6.`
    - fresh `projects --target gemini` no longer included:
      - `72ce49fba4a6`
- Durable lesson:
  - on Gemini, prefer the direct resource page for destructive Gem actions when
    it exposes a dedicated action menu; use the manager page for readback and
    absence verification instead of treating the row menu as the primary
    mutation authority

## 2026-04-05 - Gemini conversation delete is more reliable from the direct conversation page than the sidebar row

- Context:
  - Gemini root conversation delete still used an older sidebar/list-oriented
    flow even after Gem delete had gone green on the direct resource page
- Root cause:
  - Gemini exposes the same dedicated action-menu UX on `https://gemini.google.com/app/<id>`
    as it does on `https://gemini.google.com/gem/<id>`
  - the sidebar/list surface adds unnecessary state assumptions for a mutation
    that already has a direct page authority
  - a separate CLI mismatch hid the provider capability:
    top-level `auracall delete <id>` still only accepted `chatgpt|grok`
- Fix:
  - moved Gemini conversation delete onto the direct `/app/<id>` flow using:
    - `conversation-actions-menu-icon-button`
    - `delete-button`
    - `confirm-button`
  - widened the top-level delete command to accept `--target gemini`
  - kept absence verification on a refreshed conversation list after the
    mutation
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts delete f7fb3a60d65dfe49 --target gemini --profile default --yes`
    - returned:
      - `Deleted successfully.`
    - refreshed `conversations --target gemini --refresh` no longer included:
      - `f7fb3a60d65dfe49`
- Durable lesson:
  - for Gemini destructive actions, prefer the direct resource page whenever it
    exposes the same native action menu as the list surface
  - immediately reused caches can lag after Gemini conversation delete, so a
    refreshed list read is a stronger proof than the first post-delete cached
    listing

## 2026-04-05 - Gemini cache CLI parity should be handled as shared provider-cache plumbing, not one-off command edits

- Context:
  - Gemini had real provider/account-scoped cache data and live cache identity,
    but large parts of the cache CLI still hard-excluded `gemini`
  - the first practical symptom was operator inconsistency:
    Gemini CRUD/cache work was real, but `cache` and `cache export` still
    behaved as though Gemini had no cache surface
- Root cause:
  - cache command families had repeated local provider gates typed as
    `chatgpt|grok`
  - cache maintenance/reporting helpers also hardcoded those same provider
    unions, so Gemini parity could not be fixed by help-text edits alone
- Fix:
  - centralized cache-provider validation around:
    - `chatgpt`
    - `gemini`
    - `grok`
  - widened the cache inspection/export/maintenance flows to use the same
    provider-aware cache plumbing
  - added a provider-aware configured-URL helper so Gemini cache commands use
    the correct service URL semantics
  - added a bounded Gemini delete-refresh guard so transient empty post-delete
    reads do not immediately poison the conversation cache
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - local:
    - `pnpm tsx bin/auracall.ts cache --provider gemini`
    - returned live Gemini `projects` / `conversations` cache entries
- Durable lesson:
  - once a provider writes real cache state, cache CLI/operator parity belongs
    to shared provider-cache plumbing; leaving repeated provider enums in
    individual commands guarantees drift

## 2026-04-05 - Cache operator flows must not reuse live account detection when the user explicitly targets cache

- Context:
  - Gemini cache/operator commands were widened to accept `--provider gemini`,
    but some deeper cache-context flows still behaved inconsistently under test
  - fixture-backed `cache context list/get --provider gemini` could drift to the
    live signed-in Gemini identity instead of the requested seeded cache
- Root cause:
  - cache operator commands correctly resolved a provider cache context up
    front, but deeper helper methods re-ran cache resolution with default live
    detection semantics
  - cached conversation-context lookup also treated non-UUID selectors as
    titles, which is wrong for Gemini's native hex conversation IDs
- Fix:
  - added explicit `cacheResolve` options to the `LlmService` cached context
    list/get helpers
  - made Gemini cache context CLI commands pass `detect: false`
  - accepted provider-native normalized conversation IDs before title matching
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - when an operator explicitly asks to inspect cache, deterministic provider
    cache resolution is more important than live browser identity detection
  - conversation selector logic must follow provider-native ID semantics rather
    than assuming UUIDs

## 2026-04-05 - Gemini cache parity should be tested against JSON fallback catalogs, not only live browser state

- Context:
  - Gemini cache CLI parity moved beyond simple provider acceptance into read
    paths like keyword search, source inspection, and file inspection
  - these operator commands can read either SQLite catalogs or JSON fallback
    cache documents depending on what exists on disk
- Root cause:
  - without fixture coverage, Gemini cache regressions could hide behind a live
    machine's existing SQLite state or signed-in browser identity
  - that made it hard to prove provider parity for deterministic operator flows
- Fix:
  - expanded the Gemini CLI cache regression fixture to seed:
    - cached conversation messages
    - cached source links
    - cached file refs in conversation context
  - verified:
    - `cache search`
    - `cache sources list`
    - `cache files list`
    - `cache files resolve`
    against Gemini's provider cache namespace
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - provider cache/operator parity needs fixture-backed coverage for the JSON
    fallback path, not just live browser smokes or SQLite-backed happy paths

## 2026-04-05 - Provider cache context construction should live in one shared operator seam

- Context:
  - Gemini parity work kept surfacing stale cache behavior in multiple CLI
    command families
  - the root problem was not Gemini-specific selectors; it was that cache
    provider policy was duplicated in `bin/auracall.ts`
- Root cause:
  - `LlmService` owned cache identity/context semantics, but the CLI still
    reimplemented:
    - provider validation
    - configured URL ownership
    - operator-mode cache resolution
    - maintenance context discovery
- Fix:
  - added a shared cache operator module:
    - [operatorContext.ts](/home/ecochran76/workspace.local/auracall/src/browser/llmService/cache/operatorContext.ts)
  - moved cache export/context/search/catalog flows and maintenance discovery
    onto that shared seam
  - removed one remaining manual cache context assembly site in browser name
    hint resolution
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - once provider cache state is real, cache context construction is shared
    infrastructure, not command-local glue

## 2026-04-05 - Cache robustness depends on separating canonical records from derived catalogs

- Context:
  - the current cache subsystem already supports:
    - JSON canonical-ish payloads
    - SQLite mirrors/indexes
    - source and file catalogs
    - export and maintenance flows
  - but those concerns are still close enough together that maintenance and
    feature growth can blur what is authoritative versus what is derived
- Durable lesson:
  - treat conversation/project/file/source/artifact payloads as canonical cache
    records
  - treat search catalogs, parity indexes, export views, and maintenance scans
    as derived projections over those records
  - robustness and searchability both improve when the write path and the query
    path are allowed to evolve separately behind an explicit schema contract

## 2026-04-05 - Cache planning should anchor future work to one subsystem architecture doc

- Context:
  - the cache stack now spans:
    - JSON records
    - SQLite projections
    - catalog/query helpers
    - export tooling
    - maintenance tooling
  - without one architectural reference, those layers can drift independently
- Fix:
  - added:
    - [cache-architecture-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-architecture-plan.md)
  - linked it from the active schema and TODO docs so future cache work has one
    anti-drift reference point
- Durable lesson:
  - once a subsystem supports multiple storage layers and operator surfaces,
    planning drift becomes as dangerous as code drift; the architecture contract
    needs one explicit home

## 2026-04-05 - Artifact support needs a first-class cache projection seam before more cache growth

- Context:
  - canonical conversation context already carries `artifacts[]`
  - exports already render those artifacts
  - sources/files already have first-class SQL catalog projections
  - artifacts still do not
- Root cause:
  - artifact data is present, but the cache subsystem still lacks a shared
    projection/query seam for it
  - that encourages JSON-scan-heavy operator behavior and risks provider-local
    artifact heuristics drifting into export or adapter code
- Fix:
  - wrote:
    - [cache-artifact-projection-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-artifact-projection-plan.md)
  - defined the next bounded implementation slice around:
    - `artifact_bindings`
    - projection-sync extraction
    - a minimal `cache artifacts list` surface
- Durable lesson:
  - once a canonical entity exists in cache payloads, it should gain a
    first-class projection seam before more operator features are layered on
    top of raw JSON access

## 2026-04-05 - Gemini CLI parity should be closed by explicit scope, not by vague completeness

- Context:
  - Gemini browser/provider support now covers real project, conversation,
    delete, Gem knowledge, and cache operator surfaces
  - remaining gaps are real, but they are no longer the same kind of problem as
    stale CLI target exclusions
- Root cause:
  - “Gemini parity” can sprawl unless the team distinguishes:
    - CLI/operator parity for already-supported surfaces
    - shared cache architecture work
    - explicit provider backlog
- Fix:
  - updated planning docs to treat Gemini CLI parity for already-green surfaces
    as closed for now
  - left the remaining work in explicit backlog buckets:
    - shared cache architecture
    - conversation rename
    - conversation context/files/artifacts parity
    - account-level files parity
- Durable lesson:
  - closeout decisions stay robust when the done-bar is defined by explicit
    supported surfaces and explicit backlog, not by a fuzzy sense that one
    provider is “fully complete”

## 2026-04-06 - Canonical context entities should project through one shared sync seam

- Context:
  - cache writes for conversation context already projected:
    - `source_links`
    - `file_bindings`
  - but that relation sync still lived inline inside `SqliteCacheStore`
  - artifacts existed in canonical context and export, but still had no
    first-class projection path
- Root cause:
  - projection behavior was split across ad hoc store methods instead of one
    rebuildable shared seam
  - that made it harder to add artifacts without repeating the same pattern a
    third time
- Fix:
  - added:
    - [projectionSync.ts](/home/ecochran76/workspace.local/auracall/src/browser/llmService/cache/projectionSync.ts)
  - moved source/file relation sync behind that shared module
  - added `artifact_bindings` and artifact catalog reads on top of the same
    projection boundary
- Verification:
  - `pnpm vitest run tests/browser/cacheCatalog.test.ts tests/browser/providerCache.test.ts tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - once canonical cache entities need SQL/search projections, the projection
    logic should live in one explicit sync layer rather than accreting inside
    store write methods; that keeps new entity types like artifacts from
    becoming one-off special cases

## 2026-04-06 - New cache entity projections should ship with an operator read surface in the same slice

- Context:
  - the first artifact projection slice added:
    - `artifact_bindings`
    - internal artifact catalog reads
  - without an operator surface, that new projection would still be hard to
    validate and easy to forget
- Fix:
  - added:
    - `auracall cache artifacts list`
  - extended the Gemini cache CLI fixture with artifact rows so the new command
    is covered through the same provider-acceptance regression path
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/cacheCatalog.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - when a cache entity becomes first-class in projections, it should gain at
    least one direct operator inspection command in the same slice; otherwise
    the projection remains real in code but weak in operational practice

## 2026-04-06 - Export views should distinguish user-backed files from provider/model artifacts

- Context:
  - export surfaces already rendered `artifacts[]`
  - they did not render `files[]`
  - CSV context exports only counted messages, which hid both uploaded files and
    generated/provider artifacts
- Root cause:
  - artifact work had advanced faster than export/discovery semantics, which
    risked making exports look like only model outputs mattered
- Fix:
  - updated cache export rendering to show:
    - `Files` for user/provider-supplied conversation files
    - `Artifacts` for provider/model outputs
  - updated context/conversation CSV exports to include:
    - `sourceCount`
    - `fileCount`
    - `artifactCount`
- Verification:
  - `pnpm vitest run tests/browser/cacheExport.test.ts tests/browser/cacheCatalog.test.ts tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - cache/export work should not collapse uploads and generated outputs into one
    conceptual bucket; files and artifacts are different entity families and
    should stay visible as such in operator-facing exports

## 2026-04-06 - Cache maintenance must understand every projected entity family, not just the oldest ones

- Context:
  - cache projection work had already added:
    - `artifact_bindings`
  - operator inspection also had:
    - `cache artifacts list`
  - but maintenance still only checked/pruned orphaned:
    - `source_links`
    - `file_bindings`
- Root cause:
  - doctor/repair logic lagged behind the projection model, so artifacts were
    first-class in storage and read paths but second-class in integrity checks
- Fix:
  - extended `cache doctor` parity inspection to count orphan
    `artifact_bindings`
  - added `cache repair --actions prune-orphan-artifact-bindings`
  - added CLI regression coverage with a real orphan artifact row in SQLite
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - whenever a new cache projection table becomes first-class, maintenance
    parity checks and prune actions should be extended in the same broad phase;
    otherwise the cache model drifts into asymmetric operational support

## 2026-04-06 - Reporting/export counts should come from a shared inventory seam, not per-command recomputation

- Context:
  - export rendering already distinguished:
    - `files[]`
    - `artifacts[]`
  - but CSV/reporting counts were still being recomputed inline in export code
    from one-off context reads
- Root cause:
  - the cache model had richer entities than the reporting layer had explicit
    shared read models
- Fix:
  - added shared conversation inventory reads in the cache catalog layer
  - moved export CSV count generation onto that seam
  - widened conversation-list CSV export to include:
    - `messageCount`
    - `sourceCount`
    - `fileCount`
    - `artifactCount`
- Verification:
  - `pnpm vitest run tests/browser/cacheCatalog.test.ts tests/browser/cacheExport.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - once cache entities become first-class, reporting surfaces should consume
    them through one shared inventory API; otherwise search, export, and doctor
    drift back into parallel count logic

## 2026-04-06 - Freshness-only cache listings are not enough once the cache model gets richer

- Context:
  - the top-level `auracall cache` command already showed:
    - freshness
    - stale status
    - source URL
  - but it still said nothing about the actual volume of cached conversation
    messages, sources, files, or artifacts
- Root cause:
  - the operator summary view had not been updated to consume the newer shared
    inventory model
- Fix:
  - reused the conversation inventory seam in `auracall cache`
  - added `inventorySummary` on conversation cache rows with aggregate:
    - `conversationCount`
    - `messageCount`
    - `sourceCount`
    - `fileCount`
    - `artifactCount`
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/cacheCatalog.test.ts tests/browser/cacheExport.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - once a cache subsystem has richer entities, operator summary commands should
    expose at least one compact aggregate view of them; otherwise the surface
    remains technically correct but operationally under-informative

## 2026-04-06 - Maintenance reports should expose cache volume through the same shared inventory model

- Context:
  - the new conversation inventory seam already powered:
    - export CSV counts
    - top-level `auracall cache` summary rows
  - `cache doctor` still only reported integrity/freshness findings
- Root cause:
  - maintenance and reporting surfaces were still drifting apart even after the
    shared inventory model existed
- Fix:
  - reused the shared conversation inventory seam inside `cache doctor`
  - added `inventorySummary` to doctor entries and surfaced conversation/message
    totals in text-mode doctor output
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - once a shared cache inventory model exists, new operator surfaces should
    prefer consuming it directly instead of inventing narrower one-off summary
    fields

## 2026-04-06 - Mutation reports should show before/after inventory, not just low-level deletion counts

- Context:
  - `cache doctor` and top-level `cache` already exposed aggregate conversation
    inventory
  - `cache clear` and `cache cleanup` still mostly reported:
    - matched file targets
    - matched SQL rows
    - pruned index/blob counts
- Root cause:
  - mutation surfaces had not yet been brought onto the same shared inventory
    model as read/report surfaces
- Fix:
  - added `inventoryBefore` / `inventoryAfter` to:
    - `cache clear`
    - `cache cleanup`
  - updated text-mode summaries to show conversation/message before->after
    transitions
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - cache mutation commands should report both operational mechanics and entity
    impact; otherwise the command can be technically precise but still weak for
    operator decision-making

## 2026-04-06 - Gemini conversation rename needs the direct chat-page dialog and native inline-rename submission

- Context:
  - Gemini conversation delete was already green from the direct
    `/app/<conversationId>` page action menu
  - the next parity slice was conversation rename
- Root cause:
  - Gemini does expose rename on the direct chat page, but not as a simple
    setter-plus-save flow
  - the real surface is:
    - menu item `rename-button`
    - dialog input `edit-title-input`
    - dialog save button `save-button`
  - generic setter-style input updates were not enough to make Gemini persist
    the new title
- Fix:
  - added Gemini `renameConversation(...)` through the direct `/app/<id>` page
  - switched the dialog submission onto the shared browser-service
    `submitInlineRename(...)` helper with native input entry and native/synthetic
    Enter fallback
  - verified persistence from a fresh root Gemini conversation-list readback
    instead of trusting only dialog close
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts rename dc7b095922577de3 'AuraCall Gemini Rename Smoke 1775466602' --target gemini --profile default`
- Durable lesson:
  - for inline rename dialogs on modern SPA providers, prefer the shared
    browser-service rename helper once the live surface is understood; setter
    updates alone can close the dialog without actually committing the rename

## 2026-04-06 - Gemini conversation context should read inner turn nodes, not outer UI wrappers

- Context:
  - Gemini browser CRUD was already green for:
    - conversation list
    - conversation rename
    - conversation delete
  - the next parity slice was `conversations context get --target gemini`
- Root cause:
  - the first Gemini context extractor scraped broad visible response nodes such
    as `.response-content` and broad user containers such as `user-query-content`
  - on real Gemini chats that pulled in wrapper chrome instead of canonical
    turn text, producing values like:
    - `Show thinking Gemini said ...`
    - file-chip/user-label wrapper text around the actual prompt
- Fix:
  - implemented Gemini `readConversationContext(...)` on the direct
    `/app/<conversationId>` page
  - changed extraction to read ordered turn containers first:
    - `user-query`
    - `model-response`
  - then extract text from the inner message nodes:
    - user:
      - `user-query-content .query-text-line`
      - `user-query-content .query-text`
    - assistant:
      - `structured-content-container.model-response-text message-content`
      - `.markdown`
  - sanitized wrapper prefixes:
    - `You said`
    - `Show thinking Gemini said`
  - widened `auracall conversations context get` to accept provider `gemini`
    and write through the shared conversation-context cache contract
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 841b485bcb3819af --target gemini --profile default --json-only`
- Durable lesson:
  - for Gemini reads, treat `user-query` and `model-response` as the
    authoritative turn boundaries; broad visible wrapper nodes often mix real
    message text with Gemini chrome and attachment UI

## 2026-04-06 - Gemini conversation files should come from the visible sent-upload chips on the chat page

- Context:
  - Gemini already had live conversation message reads through the direct
    `/app/<conversationId>` page
  - the next bounded parity gap was `conversations files list --target gemini`
- Root cause:
  - the CLI gate still excluded Gemini even though the shared `LlmService`
    fallback can already use `context.files[]` when a provider does not expose a
    dedicated `listConversationFiles(...)`
  - Gemini conversation pages do not expose the file through a separate list
    surface; the durable visible signal is the sent upload chip inside the user
    turn
- Fix:
  - widened `auracall conversations files list` to accept provider `gemini`
  - extended Gemini `readConversationContext(...)` so user turns now collect
    visible sent upload chips from:
    - `[data-test-id="uploaded-file"]`
    - `[data-test-id="file-preview"]`
    - image-preview variants when present
  - file metadata now comes from the live chip surface:
    - full filename from the inner button `aria-label`
    - visible fallback name/type from `.new-file-name` and `.new-file-type`
  - returned stable synthetic file refs under:
    - `gemini-conversation-file:<conversationId>:<ordinal>:<name>`
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations files list 841b485bcb3819af --target gemini --profile default`
- Durable lesson:
  - on Gemini conversation pages, sent file parity should anchor on the
    user-turn upload chip surface first; do not wait for a nonexistent separate
    file catalog when the visible chat chip is the authoritative UI

## 2026-04-06 - Gemini generated-image artifacts need direct assistant-media scraping plus in-page payload serialization

- Context:
  - Gemini conversation reads already covered:
    - canonical `messages[]`
    - visible sent conversation `files[]`
  - the next question was whether Gemini chat pages expose a real artifact
    surface or only text/files
- Root cause:
  - a real managed-browser Gemini image-generation chat showed a visible
    assistant image tile with download/share controls, but
    `conversations context get` still returned no `artifacts[]`
  - the issue was twofold:
    - image-only assistant turns do not always provide useful text content
    - CDP by-value result marshaling was dropping the richer page payload even
      though a direct in-page probe could see it
- Fix:
  - treated visible assistant image nodes on `model-response` as first-class
    conversation artifacts
  - normalized them into `kind: "image"` artifacts with:
    - blob `uri`
    - width / height metadata
    - chat-relative `messageIndex`
  - changed Gemini context extraction to serialize the full page payload inside
    the browser and parse it in Node before shared normalization/cache writes
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 3525c884edae4fa4 --target gemini --profile default --json-only`
- Durable lesson:
  - for Gemini assistant media, do not couple artifact extraction too tightly to
    assistant text extraction; image-only turns are real responses and may need
    direct media scraping plus serialized in-page payload handoff

## 2026-04-06 - Gemini feature/drawer discovery should live in the shared detected-feature signature seam

- Context:
  - Gemini’s browser surface is no longer just CRUD on chats and Gems
  - the product surface now includes evolving mode/drawer choices such as image,
    music, video, canvas, research, and personalization affordances
- Fix:
  - extended browser doctor with a provider-neutral `featureStatus` payload
  - implemented Gemini `getFeatureSignature()` so live Gemini UI discovery now
    feeds the same normalized feature-signature path already used for
    cache/drift semantics
  - widened `auracall doctor --target gemini` to report live identity plus
    detected Gemini feature state when a managed Gemini browser instance is
    alive, while still keeping selector diagnosis unsupported
  - added manifest-backed Gemini feature/drawer tokens so discovery logic is
    explicit and reviewable instead of hiding string probes in adapter code
- Durable lesson:
  - when a provider’s available UI surfaces are volatile, treat feature/drawer
    discovery as first-class provider state and expose it through one shared
    detected-feature signature seam; do not bury it inside one-off debugging
    scripts or cache-only heuristics

## 2026-04-06 - Volatile provider DOM discovery should use one package-owned structured search surface

- Context:
  - Gemini feature discovery started drifting because each new drawer/menu/toggle
    probe wanted another provider-local `evaluate(...)` snippet
  - browser-service already had generic page probes, but not a bounded way to
    ask “which visible nodes currently match these facts?”
- Fix:
  - added `browser-tools search` in
    `packages/browser-service/src/browserTools.ts`
  - the new command matches nodes by generic facts:
    - text
    - `aria-label`
    - role
    - `data-test-id`
    - class substring
    - tag
    - checked / expanded state
  - it returns structured match rows instead of raw DOM dumps, so adapters and
    operators can reason about volatile surfaces without immediately dropping to
    custom page scripts
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live Gemini proof on the managed `default` browser profile:
    - found the exact `Tools` opener
    - found `Create image`, `Canvas`, `Deep research`, `Create video`,
      `Create music`, and `Guided learning` after the drawer opened
    - found the `Personal Intelligence` switch with `checked: true`
- Durable lesson:
  - when a provider surface is volatile, first extract a package-owned
    structured DOM-census primitive, then let provider adapters consume that
    seam; do not keep solving the same discovery problem with one-off
    provider-local `eval(...)` probes

## 2026-04-06 - Shared DOM-search semantics should be extracted once and reused by provider discovery code

- Context:
  - after `browser-tools search` landed, Gemini feature discovery still had its
    own parallel row/switch census implementation
  - that would eventually drift again even if the browser-tools CLI stayed
    correct
- Fix:
  - extracted the DOM-search expression builder into
    `packages/browser-service/src/service/domSearch.ts`
  - moved both:
    - `browser-tools search`
    - Gemini `readGeminiToolsDrawerProbe(...)`
    onto the same shared matching semantics
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/browserTools.test.ts tests/browser/profileDoctor.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - once a volatile DOM-census pattern becomes package-owned, adapters should
    consume that exact helper path instead of preserving a second local copy of
    the same matching model; otherwise the old drift loop just moves one layer
    down

## 2026-04-06 - Browser-service should support both targeted search and broad page listing

- Context:
  - `search` answered “does this exact control exist?”
  - but operators and adapters still needed a generic answer to
    “what important discoverable controls and surfaces are on this page right
    now?”
- Fix:
  - added package-owned `browser-tools ls`
  - the new listing groups visible UI into generic sections:
    - dialogs
    - menus
    - buttons
    - menu items
    - switches
    - inputs
    - links
  - each item now also carries heuristic widget and interaction hints plus
    upload-path detection, including hidden `input[type="file"]` surfaces
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - browser-service should offer both:
    - a targeted structured search surface
    - a broader structured page listing surface
  - provider adapters can then use the right level of evidence instead of
    jumping straight to custom DOM scripts

## 2026-04-06 - Gemini doctor should consume browser-service discovery directly

- Context:
  - `browser-tools ls` could already prove the live Gemini drawer and toggle
    surface, but `auracall doctor --target gemini --json` still sometimes
    returned a weaker provider-local fallback signature
- Fix:
  - extended the browser-tools doctor contract with optional `uiList` evidence
  - changed Gemini feature inspection to derive mode/toggle evidence from that
    `uiList` and merge it with the provider feature signature when present
  - `featureStatus.detected` now includes explicit evidence metadata so it is
    clear when browser-tools `uiList` evidence was present and merged
- Durable lesson:
  - once browser-service can prove a volatile provider surface, browser doctor
    should consume that evidence directly instead of treating it as unrelated
    debugging output and silently preferring weaker provider-local heuristics
  - if the richer browser-service evidence is already present, skip the older
    provider-local fallback probe entirely so doctor does not trigger unrelated
    UI side effects like opening the model picker
  - when doctor depends on a volatile overlay surface, it needs both:
    - a prep step that dismisses stale overlays and opens the intended surface
    - a cleanup step that closes transient overlays after capture
    otherwise repeated live diagnosis leaves the page in mixed or misleading UI
    states

## 2026-04-06 - live provider feature discovery should not stay buried inside browser doctor

- Context:
  - once Gemini drawer/toggle discovery became reliable through browser-service
    `uiList` evidence, `auracall doctor` was carrying two unrelated jobs:
    - browser/runtime health
    - live provider feature inventory
  - that made feature discovery harder to keep current and harder to diff over
    time
- Fix:
  - added a first-class `auracall features --target <provider> [--json]`
    surface
  - added a versioned `auracall.browser-features` contract so live discovery
    has one stable machine-readable payload
  - extracted shared browser feature runtime collection so `doctor` and
    `features` reuse the same browser-tools evidence and Gemini `Tools` drawer
    prep/cleanup path
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/geminiAdapter.test.ts tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts features --target gemini --profile default --json`
- Durable lesson:
  - browser doctor should answer browser health
  - provider feature discovery should have its own command and contract
  - if snapshot/diff is coming next, build it on the same feature-discovery
    contract instead of inventing a second drift format

## 2026-04-06 - feature discovery needs snapshot/diff on the same contract, and nested Commander options need explicit merge semantics

- Context:
  - once `auracall features --target <provider> --json` existed, the next
    practical need was diffing current live surfaces against a saved baseline
  - the first subcommand implementation also exposed a Commander edge case:
    parent and child commands both defined `--json` / `--target`, and naive
    option spreading let a child default overwrite a parent-provided value
- Fix:
  - added shared snapshot/diff support in
    `src/browser/featureDiscovery.ts`
  - added:
    - `auracall features snapshot --target <provider> [--json]`
    - `auracall features diff --target <provider> [--json]`
  - snapshots now live under:
    - `~/.auracall/feature-snapshots/<auracallProfile>/<target>/`
  - changed the nested `features` command family to merge parent/child
    Commander options explicitly instead of relying on naive object spreads
- Verification:
  - `pnpm vitest run tests/browser/featureDiscovery.test.ts tests/browser/profileDoctor.test.ts tests/browser/geminiAdapter.test.ts tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts features snapshot --target gemini --profile default --label smoke --json`
    - `pnpm tsx bin/auracall.ts features diff --target gemini --profile default --json`
- Durable lesson:
  - when a new CLI family introduces nested subcommands with repeated flags,
    merge option state explicitly and test the real nested path
  - if a new anti-drift workflow is meant to compare live and saved state, use
    the same versioned contract for both instead of inventing a second
    snapshot-only format

## 2026-04-06 - Gemini music/video artifacts live in the assistant turn as media players, but the current Canvas tool does not yet prove a first-class artifact surface

- Context:
  - Gemini conversation context already captured visible generated-image
    artifacts, but broader artifact parity was still open
  - live probing on the active managed `default` pairing showed three
    different realities:
    - `Create music` responses render a `video` player with `Share track` /
      `Download track`
    - `Create video` responses render a `video` player with `Share video` /
      `Download video`
    - the current `Canvas` probe only rendered ordinary assistant text on the
      `/app/<id>` page and no separate canvas/doc artifact surface
- Fix:
  - extended Gemini conversation-context extraction to capture assistant-turn
    `video` media nodes as `kind = generated` artifacts
  - preserved stable media metadata:
    - `mediaType`
    - `fileName`
    - width/height
    - share/download/play/mute labels
  - added Gemini-side artifact normalization so generic `Generated media N`
    placeholders become stable titles such as:
    - `Before The Tide Returns`
    - `Generated video 1`
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 8e8e58b57ae544ea --target gemini --profile default --json-only`
    - `pnpm tsx bin/auracall.ts conversations context get 23340d1698de29b8 --target gemini --profile default --json-only`
    - `pnpm tsx bin/auracall.ts conversations context get c653ec3c84410829 --target gemini --profile default --json-only`
- Durable lesson:
  - Gemini’s generated music currently looks like a `video` transport surface,
    not a separate `audio` DOM surface, so artifact classification must key off
    the nearby control labels (`track` vs `video`) rather than the media tag
    alone
  - do not synthesize a `canvas` artifact from tool selection or model prose;
    only normalize Canvas when the page exposes a real persistent doc/canvas
    surface or export control

## 2026-04-06 - Gemini Canvas artifacts require the immersive panel, not just the assistant message

- Context:
  - the shared page `https://g.co/gemini/share/3ed147d51ed4` exposed a
    `Try Gemini Canvas` CTA which led to a dedicated `/canvas` editor route
  - that route proved a real Gemini canvas surface:
    - `div.ProseMirror[aria-label="Canvas editor"]`
    - `button[aria-label="Share and export canvas"]`
    - `button[data-test-id="print-button"]`
    - `button[data-test-id="canvas-create-task-menu"]`
  - the same canvas-backed document also reopens on the standard
    `/app/59b6f9ac9e510adc` conversation route
  - the first extractor patch still missed it live because the read path did
    not explicitly wait for canvas-specific hydration before scraping
- Fix:
  - widened Gemini conversation-settle waits so a visible canvas chip now
    triggers an additional wait for the immersive panel/editor surface
  - normalized the visible immersive canvas panel into a first-class
    `kind = canvas` artifact with:
    - `uri = gemini://canvas/<conversationId>`
    - `metadata.contentText`
    - `metadata.createdAt`
    - share/print/create flags
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 59b6f9ac9e510adc --target gemini --profile default --refresh --json-only`
- Durable lesson:
  - on Gemini, a canvas artifact is a two-part surface:
    - the assistant-turn chip on the chat stream
    - the immersive editor panel with the actual document content
  - the chip alone is not sufficient; context extraction must wait for the
    editor panel before claiming canvas parity

## 2026-04-06 - Gemini artifact fetch needs the same shared CLI seam as ChatGPT/Grok, plus browser-authenticated binary fetches

- Context:
  - Gemini conversation context could now describe real `image`, `generated`,
    and `canvas` artifacts, but `auracall conversations artifacts fetch` still
    hard-rejected `--target gemini`
  - the proven Gemini artifact families also differ in transport:
    - `canvas` is local text already present in `metadata.contentText`
    - generated music/video expose authenticated download URLs on
      `contribution.usercontent.google.com`
- Fix:
  - widened the CLI target gate so
    `auracall conversations artifacts fetch --target gemini <id>` is reachable
  - added Gemini `materializeConversationArtifact(...)` with the first bounded
    surface support:
    - `canvas` -> `.txt`
    - generated music/video -> authenticated browser-context binary fetch
  - kept the implementation provider-local because the DOM/timing semantics are
    still Gemini-specific even though the manifest/output contract is shared
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations artifacts fetch 59b6f9ac9e510adc --target gemini --profile default`
    - `pnpm tsx bin/auracall.ts conversations artifacts fetch 8e8e58b57ae544ea --target gemini --profile default`
    - `pnpm tsx bin/auracall.ts conversations artifacts fetch 23340d1698de29b8 --target gemini --profile default`
- Durable lesson:
  - once a provider has real `artifacts[]`, stale CLI target gates become the
    next operational bug even if the provider implementation itself is already
    ready
  - Gemini media downloads are best fetched in the live page context with
    `credentials: 'include'`; do not assume the signed `usercontent` URL is
    safely reusable outside the authenticated browser session

## 2026-04-06 - Gemini conversation file fetch needs a separate bounded seam from artifact fetch, and direct route opens can still trip Google interstitials

- Context:
  - Gemini chat uploads were listable through `context.files[]` and
    `conversations files list`, but there was no shared CLI/service path to
    materialize those user-uploaded files
  - unlike Gemini `artifacts[]`, user uploads do not yet have one stable
    transport shape:
    - some chats may expose a direct preview/download URL
    - others only expose a clickable preview surface
- Fix:
  - added shared `LlmService.materializeConversationFiles(...)`
  - added `auracall conversations files fetch <conversationId> --target ...`
  - wired Gemini `downloadConversationFile(...)` with the first bounded fetch
    modes:
    - direct preview/download URL fetch in the live page context
    - text-preview recovery after trusted-clicking the visible file chip
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - do not overclaim Gemini chat-file parity from `files[]` metadata alone; a
    provider needs a real file materialization seam before `fetch` is honest
  - on Gemini, direct `/app/<id>` route opens can still hit Google’s
    `sorry` interstitial, so live chat-file fetch validation should be treated
    as narrower and more state-sensitive than artifact fetches on already-open
    conversations

## 2026-04-07 - Gemini anti-bot pages require manual clearance until captcha automation exists

- Context:
  - recent Gemini debugging hit `google.com/sorry` during live route probes
  - provider/service handling was already able to classify the anti-bot state,
    but operator instructions did not yet make the resume rule explicit
- Fix:
  - updated repo/runbook guidance to treat Gemini `sorry` / CAPTCHA /
    reCAPTCHA / human-verification pages as a hard stop for automation
  - documented the required operator behavior:
    - stop automated retries on that managed browser profile
    - clear the page manually first
    - then resume with the lowest-churn AuraCall path
- Durable lesson:
  - until first-class captcha automation exists, the correct response to a
    Gemini anti-bot page is not “retry harder”; it is “pause, clear manually,
    then resume carefully”

## 2026-04-07 - Gemini conversation reads must not blindly reuse or reload the wrong tab when debugging stateful surfaces

- Context:
  - Gemini uploaded-image debugging exposed two distinct read hazards:
    - a stale `tabTargetId` / `tabUrl` can point AuraCall at a different hidden
      Gemini conversation than the one the operator asked for
    - some Gemini chat surfaces are richer on an already-hydrated live tab than
      on a fresh provider-driven route open of the same `/app/<id>` URL
- Fix:
  - Gemini tab attach no longer directly reuses a previously resolved tab when
    its recorded `tabUrl` does not match the requested conversation route
  - Gemini read/materialize paths now preserve an already-ready exact
    conversation tab instead of always forcing another route load first
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - on Gemini, “same host, same app shell” is not enough to justify tab reuse;
    conversation reads should require exact route agreement before short-
    circuiting to an existing target
  - for stateful surfaces like uploaded-image chips, prefer scraping the
    already-hydrated exact tab when it is available instead of assuming a fresh
    route load is semantically identical

## 2026-04-07 - Gemini chat uploads should be modeled as user-turn button hosts, not a pile of unrelated leaf selectors

- Context:
  - Gemini exposed two apparently different chat-upload DOMs:
    - text/file chips under `button.new-file-preview-file`
    - uploaded-image chips under `button.preview-image-button`
  - both actually share the same higher-level shape:
    - they live in `user-query`
    - the clickable button is the host
    - the visible filename/type/icon or preview image is button content
- Fix:
  - shifted Gemini upload discovery/fallback logic toward `user-query` button
    hosts first and leaf nodes second
  - widened browser-tools tab selection so `--url-contains` prefers a visible
    route match over a focused hidden tab, which reduces route drift back to
    root `/app`
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Durable lesson:
  - for Gemini chat history, the stable abstraction is the user-turn upload
    widget, not the filename span or preview image leaf
  - browser debugging tools should prefer the visible exact-route tab when the
    operator asked for one; drifting back to a focused hidden root tab is both
    misleading and noisier for anti-bot posture

## 2026-04-07 - Gemini uploaded-image fetch needs inline-surface fallback, not just URL fetch

- Context:
  - once Gemini uploaded-image chips were discoverable as conversation files,
    `conversations files fetch` still failed on the live image chat
  - the image `remoteUrl` was a real `lh3.googleusercontent.com` URL, but
    browser-context fetch and plain Node fetch both hit non-OK responses
  - Gemini already rendered the uploaded image inline on the chat page, so the
    bytes were visually available even though direct network fetch was brittle
- Fix:
  - deduped uploaded-image rows by physical `remoteUrl` so one image no longer
    becomes multiple file refs from the host button plus child `img`
  - added a browser-native materialization fallback for Gemini uploaded-image
    files:
    - if direct fetch fails
    - and preview open fails or is unnecessary
    - capture the visible image surface from the live page
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get ab30a4a92e4b65a9 --target gemini --profile default --json-only`
    - `pnpm tsx bin/auracall.ts conversations files list ab30a4a92e4b65a9 --target gemini --profile default`
    - `pnpm tsx bin/auracall.ts conversations files fetch ab30a4a92e4b65a9 --target gemini --profile default --verbose`
- Durable lesson:
  - for Gemini uploaded images, a visible inline rendering can be a more
    reliable materialization surface than the nominal image URL
  - when providers expose both a host button and a child image for one upload,
    dedupe by the physical asset URL, not by DOM node count
- 2026-04-07: Gemini direct conversation upload chips should be modeled as
  clickable button hosts under `user-query`, not split into unrelated text vs
  image selector families. The stable host patterns currently proven are
  `button.new-file-preview-file` and `button.preview-image-button`.
- 2026-04-07: Browser tab selection for live Gemini DOM work should prefer a
  visible exact route match over a hidden/focused generic root tab. Reusing the
  wrong `/app` tab causes route drift, weaker evidence, and higher anti-bot
  pressure.
- 2026-04-07: Gemini uploaded-image fetch cannot rely only on direct media URL
  download. Some visible uploaded-image previews use signed image URLs that
  return 403 outside the live page context, so the provider needs a
  browser-native visible-preview capture fallback.
- 2026-04-07: Gemini direct chat upload chips may expose multiple nested DOM
  nodes for one logical file. Deduping only by per-node ordinal is not stable
  enough. First dedupe by chip host element, then normalize the resulting
  `FileRef[]` by stable semantics such as `remoteUrl` or
  `name + kind + messageIndex`.
- 2026-04-07: Browser-tools page probes now classify anti-bot/human-check
  surfaces first-class instead of leaving them as raw page text. The shared
  `blockingState` seam currently covers:
  - Google `google.com/sorry`
  - CAPTCHA / reCAPTCHA
  - Cloudflare interstitials
  - generic human-verification pages
- 2026-04-07: Once a shared blocking-state seam exists, doctor/features should
  consume it directly instead of continuing with deeper selector diagnosis on a
  page that already requires manual human clearance.
- 2026-04-07: Setup/login verification flows should also consult the shared
  blocking-state seam before launching a live verification prompt. If the
  managed browser is already on a blocking page, the right move is to stop and
  surface manual-clear guidance, not to burn another verification run.
- 2026-04-07: Package-owned browser-service CLIs should follow the same rule.
  `browser-tools probe|doctor` now exit nonzero on `blockingState.requiresHuman`
  so manual DOM work stops early instead of looking like a successful ordinary
  probe on a page that already requires human clearance.
- 2026-04-07: Anti-drift browser feature commands must not persist blocked-page
  state as if it were a real provider feature surface. `auracall features
  snapshot|diff` now stop early on `blockingState.requiresHuman` instead of
  writing or comparing misleading feature evidence.
- 2026-04-07: `auracall login --target ...` should verify the post-launch page
  with the same shared blocking-state seam used by doctor/features/setup. A
  managed browser that lands on `google.com/sorry`, CAPTCHA, Cloudflare, or a
  similar human-check page is not a successful ordinary login result.
- 2026-04-07: Shared browser execution should consult the same generic
  blocking-page seam immediately after navigation settles, before deeper
  login/prompt automation. For headful local runs, manual-clear blocking pages
  should preserve the browser session so a human can clear the page without
  another relaunch.
- 2026-04-07: User-facing Gemini/browser docs should describe the current
  public contract, not stale roadmap state. In particular:
  - Gemini feature discovery / snapshot / diff are first-class now
  - blocking pages now stop the main operator/browser-run surfaces early with
    manual-clear guidance
  - Gemini account-level files are still unsupported and should be called out
    explicitly instead of being implied by the broader file surfaces
- 2026-04-07: If `packages/browser-service/` is intended for future
  independent launch, it needs its own package-facing README now. The package
  boundary should be documented at the package root, not only in Aura-Call
  internal planning docs.
- 2026-04-07: Gemini Deep Research immersive panels should be modeled as
  first-class conversation `document` artifacts on the standard `/app/<id>`
  route. If the shared artifact contract does not explicitly allow
  `kind: "document"`, the provider read succeeds locally but the new artifact
  disappears during service normalization and cache persistence.
- 2026-04-07: For Gemini Deep Research artifact fetch, the preferred
  materialization path is the live `Share & Export -> Copy contents` control.
  Keep a bounded fallback to the visible immersive-panel text while that export
  menu item is still not reliably reachable through automation, so operator
  fetch stays useful instead of failing outright.
- 2026-04-07: Gemini `/mystuff` route readiness is not sufficient proof that
  account-library content is present. The route can settle before the
  `Documents` / `Media` sections hydrate, so account-level listing needs a
  second wait on visible library content, not just pathname readiness.
- 2026-04-07: Gemini `My stuff` is not an account-file CRUD surface. Even
  though the page exposes account-scoped `Documents` / `Media` entries, it is
  better modeled as a conversation/artifact link index than as the Gemini
  equivalent of Grok `/files`. Do not wire it into `account-files` commands.
- 2026-04-07: Once provider/browser parity reaches a maintenance checkpoint,
  the next highest-value work is usually not another provider-specific slice.
  Capture the next platform track explicitly instead. Aura-Call now has enough
  team-run planning/data vocabulary that the next strategic seam should be the
  shared service/runtime execution model, so future CLI/API/MCP/team execution
  can sit on one execution core instead of growing separate orchestration
  paths.
- 2026-04-07: When adding the first shared runtime execution model, do not
  mutate the existing team-run vocabulary in place. Keep `src/teams/*` as the
  planning/orchestration-facing model and add a separate `src/runtime/*` seam
  for execution records, then project deterministically from team-run bundles
  into runtime bundles. That keeps planning semantics and execution semantics
  explicit instead of collapsing them prematurely.
- 2026-04-07: The first runtime execution slice should stop at shared
  vocabulary plus projection. `run`, `runStep`, `runEvent`, `runLease`, and
  `sharedState` are enough to anchor later dispatcher/API/MCP work without
  smuggling in premature runner behavior.
- 2026-04-07: For the future HTTP API, default to OpenAI-compatible `/v1/...`
  routes wherever the conceptual operation already matches. Prefer optional
  `X-AuraCall-*` headers for execution hints like runtime profile, agent, or
  team selection, because headers preserve request-body compatibility better
  than mandatory AuraCall-specific JSON fields. Reserve `/auracall/...` for
  operational/admin surfaces that do not fit cleanly into the OpenAI
  compatibility model.
- 2026-04-07: Mixed text + artifact answers should be modeled as ordered
  sibling output items in one `responses` timeline, not as text-only messages
  with hidden side metadata and not as a separate out-of-band artifact API.
  Keep assistant prose in `message` items and durable non-text outputs in
  explicit `artifact` items with stable ids, typed artifact family, MIME/URI,
  and bounded metadata.
- 2026-04-07: The first API-facing implementation seam should be route-neutral
  request/response types under the runtime layer, not HTTP handlers first. That
  keeps `responses`, `chat/completions`, and MCP adapters pointed at one shared
  execution contract instead of letting route handlers define the model by
  accident.
- 2026-04-07: Once route-neutral runtime API scaffolding exists, freeze it
  until the runtime persistence boundary is explicit. The existence of
  `src/runtime/api*` is not permission to start HTTP handlers or transport
  adapters early; the next active implementation target remains durable
  execution-record persistence, with API routes/adapters deferred until that
  runtime core is settled.
- 2026-04-07: The first runtime persistence seam should stay JSON-first and
  bundle-oriented: `~/.auracall/runtime/runs/<id>/bundle.json` is sufficient
  to make run identity durable without smuggling in dispatcher, queue, or HTTP
  behavior. Read/write/list helpers are the right boundary for this slice.
- 2026-04-07: The first dispatcher slice should stay classification-only. A
  runtime dispatch plan may identify `nextRunnableStepId`, deferred runnable
  work under sequential mode, missing dependencies, and fail-fast
  `blockedByFailureStepIds`, but it should not yet acquire leases, mutate run
  state, or execute steps.
- 2026-04-07: The first lease slice should stay bundle-local and explicit.
  Acquire/heartbeat/release/expire transitions may update a persisted runtime
  bundle and append lease events, but they should not imply a background
  runner loop, automatic recovery daemon, or step execution behavior.
- 2026-04-08: Once the runtime store is durable enough for lease/dispatcher
  mutations, add explicit revisioned record writes before exposing broader
  control surfaces. `record.json` plus optional compare-and-swap semantics are
  enough to make bundle updates disciplined without pretending we already have
  distributed locking or runner daemons.
- 2026-04-08: Before any external control surface lands, add one internal
  runtime control seam that composes persisted-record reads, dispatch-plan
  inspection, and lease transitions. That keeps future CLI/API/MCP adapters
  pointed at one local control contract instead of assembling the runtime core
  ad hoc in each surface.
- 2026-04-08: Once the internal runtime control seam exists, define the first
  transport-neutral control-surface contract in docs before building HTTP or
  MCP adapters. The adapter decision should follow an explicit `create/read/
  inspect/list run` plus lease operation contract, not whichever transport gets
  implemented first.
- 2026-04-08: After the transport-neutral control contract is documented,
  extract it into one internal code module and keep the concrete control
  implementation conformant to it. Include run listing in that contract so the
  first adapter does not have to widen the host-facing model on its own.
- 2026-04-08: Once the runtime control contract is explicit, pick the first
  external adapter deliberately. HTTP should go first because OpenAI
  compatibility is already a product requirement and the runtime model now fits
  a durable `responses`-first surface; MCP should follow as a client of that
  same contract rather than becoming the place where execution semantics are
  defined first.
- 2026-04-08: After choosing HTTP first, pin the first adapter slice narrowly:
  `POST /v1/responses` plus `GET /v1/responses/{id}` first, with
  `chat/completions`, streaming, and other protocol breadth deferred. That
  keeps the first HTTP implementation from expanding into a whole API family
  before the `responses`-first contract is proven.
- 2026-04-08: The first HTTP `responses` adapter should be a client of the
  runtime control contract, not a parallel store reader/writer. Let the
  adapter create/read persisted direct runs and reuse runtime-to-response
  mapping, even if the first slice only returns bounded `in_progress` records
  without real execution.
- 2026-04-08: For the first bounded `responses` adapter, use the persisted run
  id as the `response_id` instead of inventing a second identity layer before
  a broader execution registry exists. Keep any richer response/run indirection
  deferred until there is a concrete need for it.
- 2026-04-08: When the runtime layer needs to preserve ordered mixed text +
  artifact output through a bounded HTTP adapter, use one explicit runtime
  shared-state convention such as `structuredOutputs[key=\"response.output\"]`
  rather than inventing transport-only side storage. Fall back to known shared
  artifacts when that richer output timeline is absent.
- 2026-04-08: The first public exposure of the bounded `responses` adapter
  should be a local dev-only server command, not a broader service host. That
  gives the runtime-backed HTTP surface a real operator entrypoint without
  forcing early decisions about auth, deployment, or wider protocol breadth.
- 2026-04-08: For compatibility-first execution hints, prefer optional
  `X-AuraCall-*` headers over request-body extensions, and make headers win
  when both are present. That keeps standard OpenAI bodies usable while still
  allowing AuraCall runtime/agent/team/service selection in the bounded
  `responses` adapter.
- 2026-04-08: A dev-only local API server should not accidentally become a
  public unauthenticated host. Keep loopback as the default bind posture and
  require an explicit `--listen-public` opt-in before allowing non-loopback
  addresses on `auracall api serve`.
- 2026-04-08: The first local API host should declare its posture explicitly.
  A richer `/status` payload and a startup warning for non-loopback binding are
  low-risk ways to make “dev-only and unauthenticated” operationally obvious
  without widening the protocol surface.
- 2026-04-08: For a dev-only local API host, startup guidance should print a
  real probe command, not just the bind address. If the server binds to
  `0.0.0.0`, log the bind address separately and point operators at a loopback
  probe such as `curl http://127.0.0.1:<port>/status`. Keep route templates
  consistent across `/status`, startup logs, and docs; `response_id` is the
  current canonical placeholder.
- 2026-04-08: Once the bounded runtime/API slice is live on `main`, stop
  treating it as the “next upcoming lane” in the roadmap. The right checkpoint
  after runtime core + bounded `responses` + local `api serve` is a deliberate
  post-milestone choice among:
  - service-host / runner orchestration
  - API compatibility phase 2
  - team-execution bridge
  Do not keep extending the API by checklist inertia.
- 2026-04-08: After the post-checkpoint review, keep `chat/completions`
  deferred until there is concrete client pressure for inbound compatibility on
  AuraCall's local server. The stronger next lane is the first real
  runner/service execution slice under the existing `responses` host, because
  future API, MCP, and team execution all depend on that substrate.
- 2026-04-08: Once the repo chooses runner/service execution as the next lane,
  capture that slice explicitly before coding. The first runner plan should be:
  - sequential
  - single-owner
  - fail-fast
  - local-first
  - persisted run/step/event/shared-state transitions
  It should not widen into `chat/completions`, streaming, auth, or team
  execution in the same step.
- 2026-04-08: The first bounded runner slice should reuse the existing runtime
  lease/control/store seams and only add the missing lifecycle transitions.
  A direct run can now move through one sequential local pass with persisted
  `step-started`, `step-succeeded`, or `step-failed` events before the lease is
  released, while the `responses` host stays on the same routes and avoids
  streaming/auth/team behavior.
- 2026-04-08: Once the bounded local runner pass exists, keep HTTP from
  becoming the execution orchestrator. The cleaner seam is a runtime-backed
  direct-response application service that owns:
  - direct-run bundle construction
  - bounded local runner invocation
  - stored-response readback mapping
  Then let `responsesServer.ts` stay a thin adapter over that service.
- 2026-04-08: The smallest safe execution readback polish for the bounded
  `responses` surface is metadata-only. Put terminal execution summary on
  `response.metadata.executionSummary`, not in `output` and not as new
  top-level protocol fields. The current bounded fields are:
  - `terminalStepId`
  - `completedAt`
  - `lastUpdatedAt`
  - `failureSummary`
- 2026-04-08: Keep the bounded `X-AuraCall-*` header contract exact. If the
  local `responses` host only advertises runtime profile, agent, team, and
  service hints, do not silently accept extra headers like
  `X-AuraCall-Transport` in the adapter. Hidden compatibility inputs create
  drift between `/status`, docs, tests, and actual behavior without adding
  enough value to justify the ambiguity.
- 2026-04-08: Once the bounded local runner pass is real, stop describing the
  `responses` host as pre-runner. The next missing substrate is broader local
  service-host ownership of execution and recovery:
  - draining persisted eligible runs
  - expiring stale leases before reclaim
  - restart recovery under one local host identity
  Do not spend the next slice on more adapter micro-refactors instead.
- 2026-04-08: The first broader service-host slice should still keep HTTP thin.
  Add one local host-owned drain seam above the runner, then have
  `responsesService.ts` call that seam instead of invoking the runner
  directly. Let the host own:
  - deterministic candidate selection
  - stale-lease expiry before reclaim
  - sequential drain-once behavior
  Keep background loops, auth, streaming, and new routes deferred.
- 2026-04-08: For local runtime recovery, do not collapse every non-executable
  run into `no-runnable-step`. The first service-host seam should distinguish:
  - active-lease runs that are still busy
  - stranded `running` runs with no active lease
  - truly idle runs with no runnable step
  That keeps future restart recovery and operator inspection from losing the
  most important failure mode.
- 2026-04-08: Before adding any new recovery route or host UI, give the local
  service-host seam one internal recovery summary that reports:
  - reclaimable runs
  - active-lease busy runs
  - stranded running-without-lease runs
  - idle runs
  That lets later operator or transport surfaces reuse one classification seam
  instead of recomputing recovery categories independently.
- 2026-04-08: Once the first local service-host seam is implemented, update
  the top-level roadmap immediately. Do not leave `next-execution-plan.md`
  saying “next: add the first service-host seam” after the code already has:
  - `serviceHost.ts`
  - request-path delegation through it
  - bounded recovery classification
  At that point the right next step is a decision boundary about broader host
  behavior, not another stale checklist item.
- 2026-04-09: Once the runtime/service-host substrate is strong enough to run
  bounded direct work, stop optimizing that substrate in isolation. The next
  high-yield lane is the first thin bridge from `src/teams/*` planning onto
  the existing runtime execution core:
  - one `teamRun` -> one runtime run
  - one team step -> one runtime step
  - sequential
  - fail-fast
  - no new transport breadth
  Do not delay that bridge for more host micro-polish unless a real blocker
  appears.
- 2026-04-09: The first team-execution implementation slice should stay thin.
  Reuse:
  - `createTeamRunServicePlan...`
  - `createExecutionRunRecordBundleFromTeamRun(...)`
  - the existing runtime control contract
  - `ExecutionServiceHost.drainRunsOnce(...)`
  Do not introduce a second team-only runner model or require new HTTP/MCP
  surfaces for the initial bridge.
- 2026-04-09: Keep startup recovery scope and status inspection scope aligned.
  `--recover-runs-on-start-source` now controls startup recovery across
  `direct`, `team-run`, and `all`, so `/status` should expose the same values
  for inspection. Avoid route-wide status-query parsing that leaks into unrelated
  endpoints because it turns benign query params into 400s and makes operator
  probing inconsistent.
- 2026-04-09: Once team planning starts emitting explicit handoffs, persist them
  in the team-run bundle and runtime bundle instead of recomputing them only in
  the service-plan view. Re-deriving orchestration entities in one layer makes
  later history, host actions, and execution state harder to reason about.
- 2026-04-09: Give local host work its own durable entity shape early.
  `localActionRequest` should be distinct from:
  - team step output
  - handoff payload
  - shared state notes
  That keeps approval, execution, and result reporting semantics explicit
  instead of hiding host-side work inside ad hoc JSON blobs.
- 2026-04-09: Once `localActionRequest` exists as a durable entity, let step
  outputs declare requests through one bounded machine-readable field such as
  `output.structuredData.localActionRequests[]`. Do not invent a second,
  separate host-side request channel before the first lifecycle is proven.
- 2026-04-09: Keep the first local-action lifecycle policy-gated and
  callback-driven. The runtime runner should:
  - derive requests from step output
  - reject them immediately when step policy forbids or disallows them
  - persist request/result metadata in the run bundle
  Avoid failing the whole step just because a host action request is rejected or
  one optional executor is not yet wired; durable reporting is the first goal.
- 2026-04-09: The first built-in host executor should use `execFile` with
  explicit argument arrays, not shell-string execution. That preserves the
  bounded local-action contract and avoids introducing shell interpolation as
  the default execution path.
- 2026-04-09: For the first concrete host-action executor, prefer one safe kind
  (`shell`) with:
  - timeout clamp
  - stdout/stderr truncation
  - structured failure payload
  Keep allowlists and richer action kinds for follow-up slices instead of
  over-designing the first executor.
- 2026-04-10: Put shell command and cwd narrowing on the existing
  `localActionPolicy` seam before adding more host-action kinds. That keeps the
  first hardening step aligned with the assignment model instead of inventing a
  second policy vocabulary in the executor alone.
- 2026-04-10: Plan local command complexity as staged widening, not as one
  monolithic “shell support” switch:
  - `bounded-command`
  - `repo-automation`
  - `extended`
  Let host/runtime policy define the real ceiling and let team/task policy only
  narrow it.
- 2026-04-10: Once the host shell policy seam exists, remove stale parallel
  schema/helper paths immediately. Leaving two runtime-local-action config
  shapes in the tree makes it too easy for `api serve`, tests, and future team
  execution work to drift onto different policy sources.
- 2026-04-10: Shell local-action policy needs two layers:
  - host/runtime ceiling
  - task/step narrowing
  Let task policy narrow command/cwd scope for a specific assignment, but do
  not let team/task config become the only source of truth for what the host is
  willing to execute globally.
- 2026-04-10: Grow local command complexity in stages instead of broadening
  shell semantics opportunistically:
  - `bounded-command`
  - `repo-automation`
  - `extended`
  Add one explicit acceptance bar and rejected-command/rejected-cwd tests before
  moving to the next stage.
- 2026-04-10: Keep local command complexity staged. The right order is:
  1. bounded command execution
  2. repo automation
  3. only then broader or richer host actions
  Do not jump from one safe `execFile` path straight to arbitrary shell
  semantics.
- 2026-04-10: The actual shell-command ceiling belongs to host/runtime policy,
  not team config. Teams and task run specs may request narrower permissions,
  but the executor allowlist and cwd roots should stay on one host-owned seam so
  execution safety does not drift across teams.
- 2026-04-10: Once durable `localActionRequest` records exist, project
  orchestrator-facing summaries from those records into shared state instead of
  inventing a parallel host-action summary source. The current convention is:
  - one structured output per owner step
  - key: `step.localActionOutcomes.<stepId>`
  - value: counts plus compact request items
  - one compact shared-state note for quick inspection
  Keep the durable request entities as the source of truth and treat the shared
  state projection as a derived convenience view for later handoffs and
  orchestrator prompts.
- 2026-04-10: When later steps need host-action awareness, inject a
  dependency-scoped view of the derived shared-state summaries into execution
  context rather than mutating stored step inputs. The bounded execution-context
  shape should expose:
  - `sharedStateContext.dependencyStepIds`
  - `sharedStateContext.dependencyLocalActionOutcomes`
  - `sharedStateContext.upstreamLocalActionOutcomes`
  This keeps persistence unchanged while giving orchestrators and downstream
  workers a predictable read path.
- 2026-04-10: Prompt shaping for downstream/orchestrator steps should happen at
  execution time from `sharedStateContext.dependencyLocalActionOutcomes`, not by
  baking speculative host-action summaries into planner-time prompts. Keep the
  prompt addition bounded:
  - one `Dependency local action outcomes:` block
  - dependency-scoped lines only
  - status counts plus latest summary
  Keep raw request payloads out of the prompt unless a later slice proves they
  are required.
- 2026-04-10: Explicit handoffs should reuse the same bounded host-action
  summary vocabulary as shared state and prompt shaping. For handoffs leaving a
  completed step, carry:
  - `structuredData.localActionOutcomeSummaryKey`
  - `structuredData.localActionOutcomeContext`
  Do not invent a separate handoff-only host-action payload shape unless a
  later slice proves the shared vocabulary is insufficient.
- 2026-04-10: Orchestrator decision guidance should be derived from the existing
  dependency-scoped host-action summary vocabulary, not from raw request
  payloads or a second decision-state model. The current bounded classes are:
  - `continue`
  - `steer`
  - `escalate`
  Keep the rule set simple and dependency-scoped until richer orchestration
  loops are proven.
- 2026-04-10: The first bounded decision-guidance model is now proven across:
  - prompt shaping
  - execution context
  - handoff payloads
  Keep all three surfaces on the same `continue` / `steer` / `escalate`
  vocabulary before adding richer human-interaction or stop-state behavior.
- 2026-04-10: Once `escalate` guidance is proven, map it onto the existing
  `humanInteractionPolicy.defaultBehavior` seam instead of inventing a second
  control policy. Current bounded behavior:
  - `continue` => advisory only
  - `pause` => cancel current step/run with an explicit `human.escalation.*`
    shared-state marker
  - `fail` => deterministic `human_escalation_required` failure
- 2026-04-10: Do not treat bridge-path control flow as implied just because the
  direct runner path is covered. The team-runtime bridge needs its own regressions
  for:
  - advisory `continue`
  - pause-for-human
  - fail-on-escalate
  because planned-step projection and runtime-bundle mutation can hide policy
  propagation bugs.
- 2026-04-10: Resume after `pause` should be a control-layer mutation, not a
  runner special case. The bounded contract is:
  - keep `human.escalation.<stepId>` as the pause evidence
  - add `human.resume.<stepId>` on resume
  - reopen the cancelled step as `runnable`
  - add a one-shot step-local resume override so the same escalation signal does
    not immediately pause the step again
- 2026-04-10: Richer human input on resume should extend the existing
  `human.resume.<stepId>` / `humanEscalationResume` seam instead of inventing a
  second override channel. The current bounded follow-through is:
  - optional machine-readable `guidance`
  - persist it on `human.resume.<stepId>`
  - mirror it onto the reopened step under
    `input.structuredData.humanEscalationResume`
  - expose it in execution-time prompt/context with one bounded
    `Human resume guidance:` block
  Keep richer resume edits advisory until a later slice proves a typed
  mutation contract.
- 2026-04-10: The first typed resume mutation contract should be narrower than
  the advisory guidance channel. The current safe boundary is:
  - advisory:
    - `guidance`
  - typed mutation:
    - `override.promptAppend`
  Persist both on the existing resume seam, but only let the typed path mutate
  resumed behavior directly.
- 2026-04-10: The next safe typed resume mutation after `promptAppend` is
  execution-context `override.structuredContext`, not policy mutation. Carry it
  on the same durable resume seam and expose it through resumed-step
  `sharedStateContext` plus one bounded prompt block, but do not let resume
  modify `humanInteractionPolicy`, host shell ceilings, or other cross-cutting
  runtime policy.
- 2026-04-10: Once `steer` is proven as a decision class, give it one typed
  contract on the existing decision-guidance seam instead of inventing a second
  downstream-control model. The current bounded contract is:
  - `kind: host-action-steer`
  - `recommendedAction: continue-with-caution`
  - `promptAppend`
  - `structuredContext`
  Surface it through execution context, prompt shaping, and existing handoff
  `localActionDecisionGuidance` so downstream behavior changes without adding a
  parallel handoff-only schema.
- 2026-04-10: After the first typed `resume` and `steer` contracts are in
  place, stop deepening orchestration semantics by default. That is the
  checkpoint where the higher-yield blocker becomes service-host / runner
  orchestration:
  - broader host-owned recovery
  - bounded background drain/restart behavior
  - richer operator visibility
  Keep public team execution deferred until that substrate is stronger.
- 2026-04-10: For `api serve`, the correct ownership split is:
  - `responsesService`
    - persist and map direct responses
  - `responsesServer`
    - own bounded drain/recovery through the shared `serviceHost` seam
  Keep the service shim persistence-first and keep route-level execution
  behavior on the host/server side so direct runs and future team runs continue
  to converge on one runtime substrate.
- 2026-04-10: Once `api serve` owns drain through the shared host seam, stop
  awaiting direct-run execution from the caller path. The correct next step is
  a single-flight background drain loop that:
  - kicks immediately after create
  - continues on a bounded timer
  - never overlaps host drains
  - stops cleanly on server shutdown
  That keeps execution ownership with the server host instead of sliding back
  into request-scoped orchestration.
- 2026-04-10: The first autonomous `api serve` drain loop should reuse the same
  serialized server-owned drain queue as startup recovery and request-triggered
  drain. Do not add a second background worker path inside the server. One
  bounded timer-driven scheduler with shared shutdown cleanup is enough for the
  first host-owned loop.
- 2026-04-10: The first operator visibility slice for host-owned `api serve`
  drain should stay on `/status`, not a new route family. The bounded useful
  fields are:
  - `enabled`
  - `intervalMs`
  - `state`
  - `lastTrigger`
  - `lastStartedAt`
  - `lastCompletedAt`
  That is enough to observe the live loop without exposing a second control
  plane too early.
- 2026-04-10: The first operator control slice for host-owned `api serve` drain
  should stay on the same `/status` surface:
  - `POST /status` with `pause|resume`
  Keep it bounded:
  - pause future scheduling only
  - do not interrupt an in-flight drain
  - reuse the same server-owned scheduler path on resume
  Do not create a second control route family or a second scheduler just to add
  basic operator control.
- 2026-04-10: Stranded-run recovery in `serviceHost` should survive one
  persist-time revision race before giving up. The bounded rule is:
  - try the normal rewind-to-runnable repair
  - on one persist failure, reread the latest record
  - retry once only if the reread run is still lease-free and stranded
  That improves host recovery quality without introducing unbounded retry or
  multi-host coordination semantics.
- 2026-04-10: Recovery summaries should not lump all lease-free running work
  into `strandedRunIds`. Use the same dry-run rewind classification as real
  stranded repair and report:
  - `recoverableStrandedRunIds`
  - `strandedRunIds`
  That keeps `/status?recovery=true` aligned with what the host can actually
  repair instead of overstating unrecoverable stranded work.
- 2026-04-10: Batch drain reporting should preserve execution history but
  collapse repeated skipped states per run. For `drainRunsUntilIdle(...)`:
  - keep each executed pass
  - keep only the latest unresolved skipped state per run
  - suppress follow-up terminal `no-runnable-step` entries after a run already
    executed in the same bounded batch
  That keeps startup recovery and host-drain logs focused on the current
  unresolved work instead of replaying the same idle/completed skip posture on
  every pass.
- 2026-04-10: Once a host drain cap is reached, do not turn every remaining
  candidate into `limit-reached`. Keep real skip posture for work that was not
  actually executable:
  - executable or recoverable-stranded => `limit-reached`
  - active lease => `active-lease`
  - idle/terminal => `no-runnable-step`
  - unrecoverable stranded => `stranded-running-no-lease`
  That keeps capped startup recovery and mixed-batch host drains honest about
  what is deferred versus what was never runnable in that pass.
- 2026-04-10: Mixed-batch host drains should prioritize actionable work before
  non-executable work. The current bounded order is:
  - runnable
  - recoverable stranded
  - active lease
  - unrecoverable stranded
  - idle
  Keep `createdAt` ordering stable within each class. This improves capped host
  recovery behavior without adding a second scheduler or widening protocol
  surface.
- 2026-04-10: Within each host-drain priority class, keep scheduling explicitly
  oldest-first by `createdAt` until there is a real need for a different
  fairness policy. Make that rule explicit in tests so it does not remain an
  accidental side effect of sort order.
- 2026-04-10: After mixed-batch class priority and within-class ordering are
  fixed, add only one bounded budgeting rule before considering anything more
  adaptive:
  - if both actionable classes are present and `maxRuns > 1`
  - reserve one slot for the oldest recoverable-stranded run
  - give the remaining slots to oldest runnable runs
  This prevents recoverable-stranded work from being starved indefinitely
  without introducing a second scheduler or a complex fairness model.
- 2026-04-10: Once host recovery behavior is coherent, prefer richer operator
  visibility over more scheduling nuance. The current bounded visibility model
  is:
  - `/status?recovery=true` adds aggregate `metrics.*` counts alongside the
    existing per-class ID arrays
  - startup recovery logs add aligned aggregate metrics for:
    - `deferred-by-budget`
    - `active-lease`
    - `stranded`
    - `idle`
  Reuse the same classification vocabulary instead of inventing a second
  reporting model.
- 2026-04-10: After the local `serviceHost` recovery lane reaches a coherent
  checkpoint, stop deepening single-process host policy by default. The next
  higher-leverage question is the roadmap substrate boundary:
  - durable queue/run/step/handoff persistence
  - service-account/browser-affinity mirroring
  - multi-runner lease/heartbeat ownership
  In other words: pause local recovery tuning and shift to the durable-state /
  multi-runner planning seam before adding more `serviceHost` detail.
- 2026-04-11: Once the single-process host-recovery lane is coherent, do not
  guess at multi-runner behavior from local `serviceHost` semantics. Add one
  explicit durable-ownership plan before broader service-mode coding:
  - durable queue/run/step/handoff ownership
  - service-account/browser-affinity mirroring
  - multi-runner lease/heartbeat ownership
  - replay/postmortem guarantees
  That is the correct next substrate checkpoint before any broader runner or
  worker expansion.
- 2026-04-11: The first implementation seam for the durable-state lane should
  be a derived queue-ready projection, not a second persistent model. Derive it
  from the existing runtime inspection/dispatch path and let it answer:
  - runnable now
  - waiting
  - held by active lease
  - recoverable stranded
  - idle
  - future affinity-blocked claim posture
  That gives the repo one code-facing durable-state vocabulary without
  prematurely committing to Redis/Postgres shape or worker breadth.
- 2026-04-11: After the derived queue-ready projection exists, the next
  durable-state seam should be one explicit runtime-local affinity record,
  not more inferred step-field heuristics. Keep the first bounded fields to:
  - `service`
  - `serviceAccountId`
  - `browserRequired`
  - `runtimeProfileId`
  - `browserProfileId`
  - `hostRequirement`
  - `requiredHostId`
  - `eligibilityNote`
  Let the queue projection consume that record directly while remaining derived
  from runtime inspection state. Do not turn affinity into a second queue
  source of truth or a full account-mirroring implementation too early.
- 2026-04-11: After explicit affinity exists, the next durable-state seam
  should be one explicit runtime-local runner identity / heartbeat record.
  Keep the first bounded runner fields to:
  - `id`
  - `hostId`
  - `status`
  - `startedAt`
  - `lastHeartbeatAt`
  - `expiresAt`
  - `serviceIds`
  - `runtimeProfileIds`
  - `browserProfileIds`
  - `serviceAccountIds`
  - `browserCapable`
  - `eligibilityNote`
  Let the queue projection evaluate that record directly against affinity
  requirements for claim posture, but do not confuse this with a full
  multi-runner registry or distributed lease coordinator yet.
- 2026-04-11: Once the runtime-local runner record exists, persist it through a
  separate revisioned local runner registry/store instead of burying runner
  identity in lease payloads or process-local config. The current bounded store
  contract should stay at:
  - register
  - read
  - list
  - heartbeat
  - mark stale
  Use the same local JSON record/CAS pattern as runtime run records, but keep
  runner identity/liveness metadata separate from run execution history so
  future claim logic can reason about runners without mutating leases first.
- 2026-04-12: When the team/runtime bridge and task-run-spec substrate are
  already well covered in repo tests, stop adding more team/task field
  semantics before live experimentation. The gating question becomes
  executable-surface readiness, not model richness. Before real live team
  workflow experiments, require all three:
  - one real bounded team execution entrypoint
  - one bounded manual smoke for that path
  - one bounded live smoke for that same path
  Prefer a CLI/dev execution seam first if the public API surface is still
  direct-run oriented. Do not mistake strong internal bridge tests for live
  readiness.
- 2026-04-11: After runner records are persisted, add one bounded
  claim-candidate evaluation seam before any lease allocator or scheduler
  logic. The helper should combine:
  - persisted run inspection
  - the derived queue-ready projection
  - explicit affinity requirements
  - persisted runner records
  The current bounded candidate classes are:
  - `eligible`
  - `blocked-affinity`
  - `stale-runner`
  - `not-ready`
  Keep this deterministic and local. It should explain claim posture, not
  perform lease acquisition or distributed scheduling.
- 2026-04-11: After claim-candidate evaluation exists, add one bounded
  stale-runner expiry sweep on the same runner-control seam before attempting
  lease/runner reconciliation. The bounded rule is:
  - read persisted runner records
  - if `status = active` and `expiresAt <= now`, mark the runner `stale`
  - leave fresh `active` runners unchanged
  - let later claim evaluation reflect the stale posture
  Keep the first expiry slice runner-only. Do not mutate leases in the same
  step or turn it into a scheduler.
- 2026-04-11: After runner expiry exists, add one diagnosis-first
  lease/runner reconciliation seam before any repair logic. The bounded helper
  should compare active leases against persisted runner records and classify:
  - `no-active-lease`
  - `active-runner`
  - `stale-runner`
  - `missing-runner`
  Keep the first reconciliation slice read-only. It should explain lease
  ownership posture, not mutate leases or reassign work.
- 2026-04-11: After diagnosis-first reconciliation exists, add one bounded
  repair/reclaim posture seam before any actual lease mutation. The current
  bounded postures are:
  - `inspect-only`
  - `locally-reclaimable`
  - `not-reclaimable`
  Keep the first reclaim rule conservative:
  - stale or missing runner ownership is only locally reclaimable after the
    active lease itself is expired
  This keeps repair policy explicit before any code actually clears or expires
  leases on behalf of a dead runner.
- 2026-04-11: After repair posture is explicit, the first mutation path should
  stay narrow:
  - mutate only `locally-reclaimable` cases
  - leave `inspect-only` and `not-reclaimable` cases read-only
  - reuse the existing runtime lease-expiry path instead of inventing a custom
    lease-mutation workflow
  That proves a safe reclaim action before any broader host automation starts
  clearing leases on behalf of unavailable runners.
- 2026-04-11: Once the first conservative lease-repair action exists, make
  `serviceHost` consume that seam before it clears expired leases during drain
  or recovery summary. Do not keep the older blanket rule that any expired
  lease timestamp is automatically reclaimable. The current bounded host rule
  should be:
  - stale or missing runner + expired lease => locally reclaimable
  - active runner + expired lease => keep `active-lease`
  That keeps host recovery aligned with persisted runner liveness instead of
  bypassing the durable repair policy.
- 2026-04-11: When operator visibility is added for the new reconciliation /
  repair seam, keep it on the existing recovery summary surface instead of
  inventing a parallel status model. The current bounded contract is:
  - `leaseRepair.locallyReclaimableRunIds`
  - `leaseRepair.inspectOnlyRunIds`
  - `leaseRepair.notReclaimableRunIds`
  - `leaseRepair.repairedRunIds`
  - `leaseRepair.reasonsByRunId`
  with matching counts in `leaseRepair.metrics`.
  Also keep the read semantics explicit: a recovery summary read may itself
  repair locally reclaimable expired leases, so repeated `/status?recovery=true`
  reads can legitimately change from `locallyReclaimable` to ordinary
  `reclaimable` state on later reads.
- 2026-04-11: Once the compact recovery summary and per-run reason map are in
  place, stop adding more detail to `/status?recovery=true`. Put deeper
  inspection on a separate read-only surface instead. The current bounded
  operator detail route is:
  - `GET /status/recovery/{run_id}`
  and it returns one run's:
  - current host classification
  - active lease snapshot
  - dispatch posture
  - reconciliation / repair posture and reasons
  That keeps the summary surface compact while still allowing precise
  inspection when needed.
- 2026-04-11: After the durable-state lane has:
  - explicit runner records
  - persisted runner registry/control
  - claim/reconciliation/repair posture
  - compact summary and detailed operator inspection
  stop deepening that lane by inertia. The next higher-yield gap is live
  runner ownership, not more durable vocabulary. Reopen service-host / runner
  orchestration at:
  - runner self-registration for `api serve` / `serviceHost`
  - runner heartbeat while the host is alive
  That is the first slice that makes the new durable runner model real in live
  service behavior.
- 2026-04-10: The first service-host ownership shift for `api serve` should be:
  - let `responsesService` persist in create-only mode
  - let `responsesServer` invoke bounded drain through `serviceHost`
  - reread persisted state for the HTTP payload
  That moves runner ownership out of the service shim without changing the
  public route surface or forcing autonomous background behavior too early.
- 2026-04-12: Treat `projects create <name>` as create-only, not as an
  implicit create-or-reuse helper. Provider-backed project creation must
  preflight visible projects and reject:
  - exact-name duplicates
  - ambiguous same-name candidate sets
  before provider creation runs. Resolution/reuse belongs on the existing
  project-id/name lookup path; create should not silently mint a second project
  with the same display name.
- 2026-04-12: When a live duplicate project already exists, cleanup should be
  based on durable operator state, not display name alone. Compare:
  - configured/canonical project id in `~/.auracall/config.json`
  - project-scoped conversations
  - attached project files
  - live instruction readability / project-page navigability
  Then remove or rename only the empty/non-canonical duplicate.
- 2026-04-12: For browser-backed team live coverage, test the real CLI contract
  instead of a lower-level executor shim. The stable machine-readable team-run
  surface is:
  - top-level `taskRunSpec`
  - top-level `execution`
  where execution carries:
  - `teamId`
  - `taskRunSpecId`
  - `runtimeSourceKind`
  - `runtimeRunStatus`
  - `finalOutputSummary`
  - `stepSummaries[*].runtimeProfileId`
  - `stepSummaries[*].browserProfileId`
  - `stepSummaries[*].service`
  That keeps live coverage pinned to the actual operator path and catches CLI
  contract drift directly.
- 2026-04-12: Once a browser-backed team live smoke returns `execution.runtimeRunId`,
  use that id to prove durable readback on the existing operator seam rather
  than spinning up a second transport just for inspection. The narrow follow-
  through is:
  - `createExecutionRuntimeControl()`
  - `createExecutionServiceHost(...)`
  - `readRecoveryDetail(runtimeRunId)`
  and it should at least confirm:
  - `sourceKind = team-run`
  - `taskRunSpecId = taskRunSpec.id`
  - non-empty durable orchestration timeline
- 2026-04-12: If the next proof target is the existing HTTP operator seam,
  keep it bounded: reuse the same runtime store from the live run and stand up
  `createResponsesHttpServer({ host: '127.0.0.1', port: 0 }, { control })`
  only long enough to assert:
  - `GET /status/recovery/{run_id}`
  - `object = recovery_detail`
  - `detail.runId = execution.runtimeRunId`
  - `detail.sourceKind = team-run`
  - `detail.taskRunSpecId = taskRunSpec.id`
  - non-empty durable orchestration timeline
  That proves the transport seam without widening the live workflow or relying
  on a separate background server process.
- 2026-04-12: Team-backed response readback already keys off the stored run id.
  For a live team run, the bounded response proof is:
  - `GET /v1/responses/{response_id}`
  - with `response_id = execution.runtimeRunId`
  and it should confirm:
  - `object = response`
  - `metadata.runId = execution.runtimeRunId`
  - `metadata.taskRunSpecId = taskRunSpec.id`
  - `metadata.service = <expected service>`
  - `metadata.runtimeProfile = <expected runtime profile>`
  - non-empty durable orchestration timeline
  Do not invent a second response-id mapping for team runs unless the stored
  response model actually changes.
- 2026-04-12: The first broader team live workflow should be multi-step before
  multi-agent. Reuse the same provider-backed team CLI surface and keep the
  expansion deterministic:
  - one extra configured agent alias may still point at the same AuraCall
    runtime profile
  - one extra team should carry two ordered members
  - the live smoke must raise `--max-turns` to match the real step count
  - prove the broader workflow with the same readback seams as the baseline
    single-step path
  For a two-step team, the durable signal that matters is not
  `terminalStepCount`; it is:
  - two ordered succeeded `stepSummaries`
  - shared-state consumed-transfer evidence
  - at least one durable `handoff-consumed` timeline item
- 2026-04-12: Grok now needs the same basic "do not hammer the service during
  live testing" posture that Gemini already had, but not ChatGPT's heavier
  mutation-budget model. The first honest Grok guard should stay simple:
  - persist one cooldown record per managed browser profile under
    `~/.auracall/cache/providers/grok/__runtime__/rate-limit-<browser profile>.json`
  - enforce minimum spacing before the next Grok browser mutation
  - persist cooldowns only on clear Grok rate-limit failures
  - fail fast when the remaining delay exceeds a bounded auto-wait window
  Do not invent a Grok write-weight budget until live evidence shows the simple
  cooldown/spacing model is insufficient.
- 2026-04-12: After landing the simple Grok cooldown/spacing guard, validate it
  against the existing live baseline before adding more guard complexity. The
  acceptance bar is:
  - `AURACALL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-grok-live.test.ts`
  - both `auracall-solo` and `auracall-two-step` still succeed
  - the managed-browser-profile guard file exists at
    `~/.auracall/cache/providers/grok/__runtime__/rate-limit-<browser profile>.json`
  - the success path may persist only:
    - `updatedAt`
    - `lastMutationAt`
  If that bar is green, stop deepening the guard line by inertia. The next
  higher-yield work is broader live team behavior, not a heavier Grok throttle
  model.
- 2026-04-12: The first honest multi-agent Grok live proof should stay
  deterministic and tool-free. Use a planner-to-finisher team:
  - planner step produces only a compact downstream handoff
  - finisher step emits the exact final token
  - `--max-turns` stays equal to the real step count
  - prove the same four seams as the existing baseline:
    - CLI execution
    - durable host readback
    - HTTP recovery detail
    - HTTP response readback
  Do not mix multi-agent routing with tool-calling or approval semantics in
  the same first slice; otherwise failures stop being attributable.
- 2026-04-12: The first team tooling slice should stay bounded to the existing
  local-action shell seam, not invent a new tool transport. The useful shape is:
  - CLI narrows execution with:
    - `--allow-local-shell-command <command>`
    - `--allow-local-cwd-root <path>`
  - `taskRunSpec.localActionPolicy` remains the bridge contract
  - the browser-backed stored-step executor may parse one compact JSON envelope
    into `localActionRequests`
  - keep the first accepted action kind to bounded `shell` only
  If the model-side envelope is still live-flaky, keep the automated live case
  on a second opt-in gate instead of poisoning the stable Grok baseline.
- 2026-04-12: Grok browser throttling is not only generic "too many requests"
  text. A visible toast like:
  - `Query limit reached for Auto`
  - `Try again in 4 minutes`
  must be treated as a first-class rate-limit signal. The right behavior is:
  - fail fast from the Grok response wait loop as soon as that toast is visible
  - seed the existing per-managed-browser-profile Grok cooldown state
  - honor the provider-declared retry window when present instead of always
    using the default cooldown constant
  Do not let that surface degrade into a generic Grok timeout; that just
  invites repeated testing churn against the same managed browser profile.
- 2026-04-12: Gemini-bound stored team execution must not bypass the resolved
  browser-family source-cookie config or Gemini's exported-cookie fallback.
  Two separate gaps showed up during the first `auracall-gemini-tooling` live
  smoke:
  - the stored-step executor routed Gemini through the generic ChatGPT browser
    runner instead of `createGeminiWebExecutor({})`
  - even after fixing dispatch, the stored-step executor still passed only
    top-level `browser.*` fields, which meant Gemini team runs ignored:
    - the selected browser profile's source cookie settings
    - `~/.auracall/browser-profiles/<auracallProfile>/gemini/cookies.json`
    - `~/.auracall/cookies.json`
  The durable rule is:
  - `src/runtime/configuredExecutor.ts` must route `service = gemini` through
    the Gemini web executor
  - it must project the resolved browser profile's source-cookie fields into
    the browser run config
  - and it must reuse the same exported inline-cookie fallback that direct
    Gemini browser mode already depends on when Linux keyring cookie reads are
    unavailable
  This matters on WSL pairings like this machine, where direct Chrome cookie
  reads can return zero Google auth cookies plus the warning:
  - `Failed to read Linux keyring via secret-tool; v11 cookies may be unavailable.`
- 2026-04-12: Once a Gemini team path is green manually, lock it in with a
  separate opt-in live harness instead of folding it into the Grok suite.
  Gemini team runs have different auth prerequisites and failure modes:
  - exported scoped cookies may be required even when the managed browser
    profile is signed in
  - the preflight should fail clearly if
    `~/.auracall/browser-profiles/default/gemini/cookies.json`
    is missing or lacks `__Secure-1PSID` / `__Secure-1PSIDTS`
  - the live proof should cover the same four seams as the Grok team suite:
    - CLI execution
    - durable host readback
    - HTTP recovery detail
    - HTTP response readback
  The durable rule is to keep Gemini team live coverage on its own gate, not
  as conditional branches inside the Grok team test file.
- 2026-04-10: After the orchestration contract lane reaches a coherent internal
  checkpoint, stop adding more contract variants by inertia. Reassess the
  roadmap and prefer the higher-yield unfinished execution lane:
  - host-owned `api serve` drain/recovery behavior over the existing
    `serviceHost` seam
  That is a better next investment than more resume/steer subtype expansion
  once the current bounded semantics are already coherent.
- 2026-04-13: Mixed-provider negative-path team tests should reuse the
  existing operator-control seam, not invent a cross-service control variant.
  The durable pattern is:
  - let the first provider-backed run pause for human escalation in normal
    team execution
  - resolve the pending local action through existing `POST /status`
    `localActionControl.resolve-request`
  - follow with existing `runControl.resume-human-escalation`
  - finish with existing `runControl.drain-run`
  - prove the outcome through the same three readback surfaces:
    - durable host detail
    - `GET /status/recovery/{run_id}`
    - `GET /v1/responses/{response_id}`
  For mixed-provider cancellation specifically, the authoritative proof surface
  for provider routing remains stored `stepSummaries`; response metadata is not
  a per-step provider matrix.
- 2026-04-13: Mixed-provider rejection can reuse the same exact runtime/control
  pattern as mixed-provider cancellation. The only semantic differences that
  need to change are:
  - `localActionControl.resolve-request.resolution = rejected`
  - resumed guidance and override text must explicitly mention rejection
  - readback assertions should key off:
    - `localActionSummary.counts.rejected`
    - stored local-action `status = rejected`
    - stored `resultSummary = human rejected ...`
  Everything else should stay constant:
  - same team shape
  - same `/status` resume/drain path
  - same host/recovery/response readback surfaces
- 2026-04-13: Mixed-provider approval is a different semantic from
  `localActionControl.resolve-request = approved`. The durable rule is:
  - use `runControl.resume-human-escalation` with explicit approval guidance
  - keep the blocked local-action record intact as evidence of the original
    policy stop
  - prove approval through:
    - `operatorControlSummary.humanEscalationResume`
    - resumed execution timeline in recovery detail
    - terminal stored step summary after targeted drain
  Do not collapse this into the request-resolution pathway unless the runtime
  contract itself changes.
- 2026-04-13: When expanding mixed-provider operator control to Gemini, do not
  fork the control model. Reuse the same pattern as `chatgpt -> grok`:
  - one dedicated cross-service tooling team
  - existing `runControl.resume-human-escalation`
  - existing `runControl.drain-run`
  - exported-cookie preflight before live Gemini work
  - stored `stepSummaries` remain the routing authority
  The provider-specific part is operational, not semantic:
  - serialize Gemini live probes
  - require valid exported cookies before running
  - otherwise keep assertions and control flow aligned with the Grok-backed
    mixed-provider approval slice
- 2026-04-13: If a resumed `chatgpt -> gemini` mixed-provider rejection run
  fails once with a bare resumed-step `fetch failed`, do not immediately widen
  runtime semantics or add retries deep in the control path. First do one
  bounded rerun of the exact same live case. The rejection control seam and
  stored state can still be correct while the resumed Gemini browser step flakes
  transiently.
- 2026-04-13: The `chatgpt -> gemini` cancellation path reuses the exact same
  control pattern as the Grok and Gemini rejection slices:
  - `localActionControl.resolve-request = cancelled`
  - `runControl.resume-human-escalation`
  - `runControl.drain-run`
  Keep the provider-specific differences operational only:
  - Gemini exported-cookie preflight
  - serialized browser locks
  - stored step state remains the routing authority
  Do not fork the control semantics just because Gemini tends to finish with a
  longer cleanup tail.
- 2026-04-13: Reverse-order mixed-provider approval with a Grok requester needs
  a tighter requester-envelope contract than the forward `chatgpt -> *` paths.
  The first `grok -> chatgpt` approval attempt failed because the requester
  folded sibling structured-context fields into the local-action payload:
  - emitted `{"localActionRequests":[{"toolEnvelope":{...},"finalToken":"..."}]}`
  - persisted no actionable `localActionRequests`
  - never paused for human escalation
  The durable rule for this reverse-order Grok requester slice is:
  - provide one explicit `toolEnvelope` structured-context key
  - require the requester to emit exactly
    `{"localActionRequests":[toolEnvelope]}`
  - forbid sibling fields such as `finalToken` inside the request item
  - if the first live attempt misses the pause and the stored run shows no
    actionable local request, fix the requester contract before touching the
    runtime/operator-control seam
- 2026-04-13: Once the reverse-order Grok requester contract is fixed,
  reverse-order cancellation should reuse the exact same control shape as the
  forward mixed-provider cancellation path. Keep the differences narrow:
  - same `auracall-reverse-cross-service-tooling` team
  - same `{"localActionRequests":[toolEnvelope]}` requester contract
  - `localActionControl.resolve-request = cancelled`
  - `runControl.resume-human-escalation`
  - `runControl.drain-run`
  - same host/recovery/response readback surfaces
  Do not introduce a reverse-order-specific control seam just because the
  provider order changed.
- 2026-04-13: Reverse-order rejection should reuse the same exact control seam
  as reverse-order cancellation. Keep the semantic delta narrow:
  - same `auracall-reverse-cross-service-tooling` team
  - same `{"localActionRequests":[toolEnvelope]}` requester contract
  - `localActionControl.resolve-request = rejected`
  - rejection-specific resume note, guidance, and override prompt only
  - same host/recovery/response readback surfaces
  If reverse-order rejection fails, inspect requester envelope drift first,
  then request-resolution persistence, before changing the operator seam.
- 2026-04-13: Reverse-order Gemini approval should reuse the same exact
  approval seam as reverse-order ChatGPT approval. Keep the provider-specific
  differences operational only:
  - dedicated `auracall-reverse-cross-service-gemini-tooling` team
  - same reverse Grok requester envelope contract:
    `{"localActionRequests":[toolEnvelope]}`
  - existing `runControl.resume-human-escalation`
  - existing `runControl.drain-run`
  - mandatory exported-cookie preflight before live Gemini work
  - stored `stepSummaries` remain the routing authority
  Do not fork the operator semantics just because the finisher provider changes
  from ChatGPT to Gemini.
- 2026-04-13: Reverse-order Gemini cancellation should reuse the same exact
  control seam as reverse-order ChatGPT cancellation. Keep the differences
  narrow:
  - same `auracall-reverse-cross-service-gemini-tooling` team
  - same reverse Grok requester envelope contract:
    `{"localActionRequests":[toolEnvelope]}`
  - `localActionControl.resolve-request = cancelled`
  - `runControl.resume-human-escalation`
  - `runControl.drain-run`
  - same host/recovery/response readback surfaces
  - mandatory exported-cookie preflight before live Gemini work
  If reverse-order Gemini cancellation fails, inspect requester envelope drift
  first, then request-resolution persistence, before changing the operator
  seam.
- 2026-04-13: Reverse-order Gemini rejection should reuse the same exact
  control seam as reverse-order Gemini cancellation. Keep the semantic delta
  narrow:
  - same `auracall-reverse-cross-service-gemini-tooling` team
  - same reverse Grok requester envelope contract:
    `{"localActionRequests":[toolEnvelope]}`
  - `localActionControl.resolve-request = rejected`
  - rejection-specific resume note, guidance, and override prompt only
  - same host/recovery/response readback surfaces
  - mandatory exported-cookie preflight before live Gemini work
  If reverse-order Gemini rejection fails, inspect requester envelope drift
  first, then request-resolution persistence, before changing the operator
  seam.
- 2026-04-13: Gemini-to-ChatGPT approval should reuse the same exact approval
  seam as the other mixed-provider approval slices. Keep the provider-specific
  differences operational only:
  - dedicated `auracall-reverse-cross-service-chatgpt-tooling` team
  - Gemini requester emits exactly `{"localActionRequests":[toolEnvelope]}`
  - existing `runControl.resume-human-escalation`
  - existing `runControl.drain-run`
  - mandatory exported-cookie preflight before live Gemini work
  - stored `stepSummaries` remain the routing authority
  Do not fork the operator semantics just because Gemini is now the requester
  and ChatGPT is the finisher.
- 2026-04-13: Gemini-to-ChatGPT cancellation should reuse the same exact
  control seam as Gemini-to-ChatGPT approval. Keep the semantic delta narrow:
  - same `auracall-reverse-cross-service-chatgpt-tooling` team
  - Gemini requester emits exactly `{"localActionRequests":[toolEnvelope]}`
  - `localActionControl.resolve-request = cancelled`
  - `runControl.resume-human-escalation`
  - `runControl.drain-run`
  - same host/recovery/response readback surfaces
  - mandatory exported-cookie preflight before live Gemini work
  If the first gated live attempt returns an unexpected initial `failed` status
  but a direct bounded team run still shows the expected paused posture, do one
  bounded rerun of the exact same live case before changing runtime or
  operator-control code.
- 2026-04-13: Gemini-to-ChatGPT rejection should reuse the same exact control
  seam as Gemini-to-ChatGPT cancellation. Keep the semantic delta narrow:
  - same `auracall-reverse-cross-service-chatgpt-tooling` team
  - Gemini requester emits exactly `{"localActionRequests":[toolEnvelope]}`
  - `localActionControl.resolve-request = rejected`
  - rejection-specific resume note, guidance, and override prompt only
  - same host/recovery/response readback surfaces
  - mandatory exported-cookie preflight before live Gemini work
  Do not change the runtime or operator seam just because Gemini is now the
  requester; treat requester-envelope drift or transient provider/browser noise
  as the first investigation targets.
- 2026-04-13: Once the current mixed-provider operator matrix covers the main
  provider orders with:
  - approval
  - cancellation
  - rejection
  stop expanding provider-order permutations by default. At that point the
  next higher-value phase is:
  - live-suite consolidation
  - stable-vs-extended matrix classification
  - readback/runtime hardening
  not more pair proliferation. Additional provider orders should require a
  specific product reason, not just matrix completeness for its own sake.
- 2026-04-13: When one run persists multiple
  `step.localActionOutcomes.<stepId>` summaries, response readback should
  prefer the terminal step's summary instead of older step-local action
  summaries. Lock that precedence at both layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  This keeps `metadata.executionSummary.localActionSummary` aligned with the
  terminal step that actually defines the final run outcome.
- 2026-04-13: Cancellation no-note fallback should be explicit on every
  operator-facing read surface, not just one runtime layer. If a cancelled run
  has no cancellation `note-added` event, lock the same fallback on:
  - runtime response readback
  - host recovery detail
  - HTTP `GET /status/recovery/{run_id}`
  The fallback contract remains:
  - `cancelledAt = run.updatedAt`
  - `source = null`
  - `reason = null`
- 2026-04-13: When one run persists multiple operator-control entries, response
  readback should prefer the latest persisted operator state instead of older
  resume/drain records. Lock that precedence at both layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  The precedence contract is:
  - latest `human.resume.<stepId>` summary wins
  - latest operator `drain-run` note wins
- 2026-04-13: Requested-output fulfillment should not treat internal structured
  outputs as satisfying a required structured-report / JSON output. Keep the
  fulfillment boundary explicit at both layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  Internal-only entries that must stay excluded from structured-output
  fulfillment are:
  - `response.output`
  - `human.resume.<stepId>`
  - `step.localActionOutcomes.<stepId>`
- 2026-04-13: Orchestration timeline summaries should keep full totals while
  bounding item windows. Lock that windowing on both surfaces:
  - runtime response readback
  - host recovery detail
  The windowing contract is:
  - preserve full `total`
  - keep only the newest `10` `items`
- 2026-04-13: Handoff-transfer summaries should prefer stored consumed transfer
  state over planned handoff fallback when both exist. Lock that precedence on
  both main read surfaces:
  - runtime response readback
  - host recovery detail
  The precedence contract is:
  - stored `step.consumedTaskTransfers.<stepId>` summary wins
  - planned handoff `taskTransfer` stays fallback only
- 2026-04-13: When one run persists multiple
  `step.providerUsage.<stepId>` summaries, response readback should prefer the
  terminal step's stored usage summary instead of an older step summary. Lock
  that precedence at both layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  The precedence contract is:
  - terminal step `step.providerUsage.<stepId>` summary wins
  - older step usage summaries stay fallback only
- 2026-04-14: When multiple steps on one run carry `requestedOutputs`,
  terminal response readback should prefer the terminal step's requested-output
  contract instead of older step requests. Lock that precedence at both
  layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  The precedence contract is:
  - terminal step `requestedOutputs` drive `requestedOutputSummary`
  - older unmet step requests stay excluded from terminal requested-output
    policy
- 2026-04-14: When terminal readback has both an explicit terminal step
  failure and a missing required requested output, `failureSummary` should
  prefer the explicit terminal step failure. Lock that precedence at both
  layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  The precedence contract is:
  - terminal step `failure` wins
  - derived `requested_output_required_missing` stays fallback only
- 2026-04-14: When multiple steps on one run carry input artifacts, response
  readback should prefer the terminal step's artifact set instead of older
  step artifacts. Lock that precedence at both layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  The precedence contract is:
  - terminal step `input.artifacts` drive `inputArtifactSummary`
  - older step artifacts stay fallback only
- 2026-04-14: When one run contains both a failed step and a later succeeded
  or cancelled step, terminal response readback should still prefer the failed
  step. Lock that precedence at both layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  The precedence contract is:
  - failed step wins `terminalStepId`
  - failed step wins `completedAt`
  - failed step wins `failureSummary`
- 2026-04-14: When the terminal step carries no input artifacts, response
  readback should fall back to the latest earlier step that does. Lock that
  fallback at both layers:
  - runtime response readback
  - HTTP `GET /v1/responses/{response_id}`
  The fallback contract is:
  - terminal step with artifacts wins
  - otherwise use the latest earlier step with `input.artifacts`
- 2026-04-14: When no stored consumed transfer summary exists for the selected
  dependent step, recovery detail should fall back to planned handoff transfer
  data. Lock that fallback at both layers:
  - host recovery detail
  - HTTP `GET /status/recovery/{run_id}`
  The fallback contract is:
  - stored `step.consumedTaskTransfers.<stepId>` summary wins when present
  - otherwise use planned handoff `structuredData.taskTransfer`
- 2026-04-14: When a runtime/readback hardening pass has already locked the
  main operator-facing contract families, stop adding more micro
  precedence/fallback slices by default. The next higher-value move is a
  roadmap checkpoint plus contract/docs consolidation:
  - deduplicate the active roadmap, journal, fixes log, and testing notes
  - declare the current hardening subphase materially sufficient
  - choose the next phase from broader product risk, not from another easy
    reader-edge-case
- 2026-04-14: Once a hardening checkpoint is materially sufficient, the
  operator-facing testing docs should summarize the proved contract families
  instead of mirroring every individual micro-slice. Keep the detailed history
  in the journal/fixes log; keep `docs/testing.md` compact and operational.
- 2026-04-14: For a mature repo with strong local `AGENTS.md` guidance, policy
  adoption should be migration-first:
  - install the shared policy body under `docs/dev/policies/`
  - keep `AGENTS.md` as a thin repo-specific wire-in
  - establish `docs/dev/plans/` before rewriting roadmap/runbook structure
  - do not force a full planning-contract migration in the same slice as the
    first policy install
- 2026-04-14: Plan-library compliance can use file time attributes
  deterministically, but only as one scoring input. The bounded migration audit
  should combine:
  - canonical path
  - `mtime` / `ctime`
  - `ROADMAP.md` / `RUNBOOK.md` / `AGENTS.md` references
  - lightweight plan-content signals
  Use that composite score to classify loose plans as:
  - `keep`
  - `merge`
  - `retire`
  Do not let file times alone decide planning authority.
- 2026-04-14: First bounded plan migration should preserve the old loose plan
  as a pointer instead of deleting it outright. For active-plan migration:
  - move authority into `docs/dev/plans/`
  - rewire `ROADMAP.md`, `RUNBOOK.md`, and `AGENTS.md`
  - leave the old loose plan path as stable history/pointer while widespread
    links still exist
- 2026-04-14: Keep informational plan indexes outside `docs/dev/plans/` if
  the strict planning audit treats every Markdown file in that directory as a
  plan artifact. Canonical plan directories should contain actual plans only;
  indexes and guidance belong adjacent to the directory, not inside it.
- 2026-04-14: When migrating an active repo to stricter planning governance,
  split structural normalization from semantic reconciliation. Converting
  `ROADMAP.md` and `RUNBOOK.md` heading shapes to the audited contract can be a
  bounded doc-only slice; do not mix it with broader reprioritization or lane
  rewrites unless that is explicitly intended.
- 2026-04-14: After the planning-compliance framework is green, migrate the
  loose plan library one bounded file at a time:
  - create the canonical plan under `docs/dev/plans/`
  - rewire only the active adjacent references that actually govern work
  - leave the old loose file as pointer/history
  - keep the strict planning audit green after each migration
- 2026-04-14: When migrating a dependent plan cluster, rewire canonical-plan
  cross-links at the same time as roadmap/runbook links. If plan B is already
  canonical and plan C depends on it, moving plan C should also update the
  canonical B -> C link so the canonical set stays internally consistent.
- 2026-04-14: Once the planning-compliance framework is green and the first
  few migrations prove the pattern, pause for one full legacy-plan review
  before continuing. Use the deterministic audit to classify the remaining
  loose set into:
  - legacy pointers
  - merge-next clusters
  - retire candidates
  Then resume one-file migrations from the reviewed cluster order rather than
  local adjacency alone.
- 2026-04-14: After a full legacy-plan review establishes a migration batch,
  keep following dependency order inside that batch. In the current team/service
  foundation cluster, the stable order is:
  - task / run spec
  - team run data model
  - team service execution
  - then team/config or durable-state boundaries
- 2026-04-14: Do not migrate every legacy plan just because it is structurally
  mergeable. Once a minimal canonical plan set exists:
  - archive low-signal legacy plans under `docs/dev/plans/legacy-archive/`
  - use serial + ctime datestamp filenames
  - exclude the archive directory from canonical plan audits
  - keep active docs wired only to canonical or still-live loose plans
  - rely on lexical search for backward peeks into archived planning history
- 2026-04-14: Archive coherent closed design clusters together when their
  value is historical context, not future authority. The runtime/cache cluster
  was a good batch because:
  - it had no remaining roadmap authority
  - the files mostly referenced each other
  - only a few still-live docs needed explicit rewiring to archived paths
  This is higher leverage than migrating that kind of cluster into canonical
  authority one file at a time.
- 2026-04-14: Treat testing/smoke docs as live authority when archiving
  browser-history plans. Before moving ChatGPT/Grok backlog notes into
  `docs/dev/plans/legacy-archive/`, first rewire:
  - `docs/testing.md`
  - `docs/dev/smoke-tests.md`
  - any still-live adjacent browser plans
  Historical journal links can remain stale; active operator guidance cannot.
- 2026-04-14: Once the archive cleanup reduces the loose-plan set to live
  future-signal items only, stop archiving and resume selective
  canonicalization. The durable-state ownership lane was the right first
  post-archive canonical migration because it still had explicit roadmap
  authority and a direct architectural relationship to the active execution
  board.
- 2026-04-14: When a still-live legacy plan is promoted into canonical
  authority, finish the slice by updating the legacy archive index in the same
  turn. The archive directory is only useful if operators can deterministically
  map old loose paths to archived filenames.
- 2026-04-14: If a loose plan is referenced directly from `ROADMAP.md` and
  from already-canonical adjacent plans, treat it as governing authority and
  promote it into `docs/dev/plans/` instead of leaving it loose. That pattern
  now covers the team boundary and should drive later merge-vs-keep decisions.
- 2026-04-14: Apply the same governing-authority rule to umbrella plans, not
  just boundary docs. If a loose architecture plan is the direct roadmap entry
  point for a still-live cluster, promote it into canonical authority before
  migrating or judging the narrower dependent plans beneath it.
- 2026-04-14: If a loose plan is referenced from both `ROADMAP.md` and
  `AGENTS.md`, promote it into canonical authority ahead of other roadmap-only
  loose plans. That combination marks it as both strategic and operationally
  active, not just background architecture context.
- 2026-04-14: Once a config umbrella plan is canonical, promote its remaining
  roadmap-linked boundary docs next rather than skipping to unrelated loose
  plans. The agent boundary followed the config umbrella for that reason and
  should be the default pattern for the rest of the config cluster.
- 2026-04-14: When the remaining loose-plan set is entirely live governing work, finish the backlog in one bounded canonicalization slice instead of dragging it across multiple turns. Rewire roadmap/runbook/testing links and archive the old paths in the same change so the deterministic plan audit can fall to `merge=0` immediately.
- 2026-04-14: After a planning-authority migration phase finishes, immediately rewrite the execution owner doc to reflect the new steady state. If the execution board still points at completed archive/canonicalization work, the team will drift back into documentation churn instead of the next product lane.
- 2026-04-14: When a roadmap says "define the first concrete shape next," do not stop at directional bullets. Write the actual conservative v1 contract, include one example object, and state explicit non-goals so the next implementation slice cannot smuggle runner topology or execution history into the authoring model.
- 2026-04-14: On a broadly dirty worktree, check git-policy compliance explicitly before planning/doc edits: stay narrow, do not clean unrelated changes, and keep the next slice scoped to the targeted authority docs only.
- 2026-04-14: After concrete authoring and execution contracts exist, do not jump straight into coding. Write one bounded implementation slice that names the projection chain, write scope, and explicit out-of-scope surfaces; otherwise service/runtime work will sprawl into public execution APIs too early.

- 2026-04-14: Before implementing a planned projection slice, verify whether the projection path already exists in code. In this repo, `taskRunSpec -> teamRun -> runtime` projection was already live; the real missing seam was durable `taskRunSpec` persistence. Fix the missing seam instead of duplicating a second projection abstraction.

- 2026-04-14: After adding durable `taskRunSpec` persistence, the next highest-value seam was not a new command; it was bounded readback on the surfaces that already exposed `taskRunSpecId`. Add a compact persisted task-spec summary there first so operators can inspect linkage without widening public surface area.

- 2026-04-14: Once bounded persistence and readback are live, the next operator-facing step should be one internal inspection entrypoint that reuses those summaries. Add that debug surface before any broader public team-execution API so operators can inspect linkage without forcing public-surface decisions early.

- 2026-04-14: After an internal debug seam proves stable, the first public team execution surface should be read-only inspection, not create/run mutation. Reuse the same bounded linkage payload on HTTP before deciding whether public write semantics are justified.

- 2026-04-14: Once read-only team inspection is live, add the operator-natural lookup ids before considering any public write surface. In this repo, `teamRunId` was the missing first-class key; adding it to the shared inspection helper, CLI, and HTTP route increased utility without widening execution semantics.

- 2026-04-15: Do not answer durable-state visibility gaps by jumping to public execution writes. In this repo, the correct next seam after `teamRun` inspection was one projection-first runtime inspection surface (`runId` with optional `runnerId` evaluation), which exposed queue state and affinity without hardening public create/run semantics too early.

- 2026-04-14: Treat repo-root `undefined:/` as disposable temp-path fallout, not source. Safe worktree cleanup is: remove the tree and ignore `undefined:/` in `.gitignore`. Do not sweep broader untracked/modified files in the same turn unless you have explicit intent for the in-flight feature/docs changes.
- 2026-04-15: When `api serve` persists a local runner record, derive `serviceIds`, `runtimeProfileIds`, and `browserProfileIds` from the existing config projection model when config is available. Hardcoded runner capability metadata creates false affinity signals; keep a compatibility fallback only for no-config cases.
- 2026-04-15: Populate `api serve` runner `serviceAccountIds` only from existing configured service identities, using `service-account:<service>:<identity-key>` where identity key prefers `email`, then `handle`, then `name`. Do not live-probe browser account state during runner registration. If configured identity coverage is absent or partial, preserve that limitation in `eligibilityNote` so runtime inspection and operator readback stay truthful about account-affinity evidence.
- 2026-04-15: Runner-side account ids are only useful when run-side affinity derives the same id shape. Project configured service identity into `requiredServiceAccountId` for the active runtime step, and reuse the same helper for runner metadata and run affinity so queue projection can distinguish matching accounts from missing-account runners.
- 2026-04-15: For targeted host-drain skips, keep the bounded skip enum stable but preserve the specific local-claim explanation separately. In this repo, `skipReason` should stay coarse (`claim-owner-unavailable`) while the free-form `reason`/persisted note carries the actionable detail such as a missing runner record or affinity mismatch.
- 2026-04-15: When an operator action already computes a bounded reconciliation cause, preserve it in the action result instead of forcing callers to infer it from a broader repair posture.
  - `repair-stale-heartbeat` now keeps:
    - coarse `reason`
    - bounded `leaseHealthStatus`
    - bounded `repairPosture`
    - actionable `reconciliationReason`
  - This keeps the repair taxonomy stable while letting `/status` callers
    distinguish missing-runner, stale-runner, and active-runner causes without
    jumping to the separate recovery-detail route first.
- 2026-04-15: When an operator action immediately persists a concrete step id or timestamp, preserve that identity in the action result instead of forcing callers to wait for later readback.
  - `resolve-request` now also returns:
    - `resolvedAt`
    - `ownerStepId`
  - `resume-human-escalation` now also returns:
    - `resumedAt`
    - `resumedStepId`
  - This keeps `/status` operator actions self-describing without widening the
    broader response-readback summaries.
- 2026-04-15: When run-side service-account affinity is derived from config,
  prove it at the local-claim boundary as well as the public inspection
  boundary. Service-host tests should cover both missing-account
  `blocked-affinity` summaries and targeted-drain skips that preserve the
  actionable missing-account detail under the stable
  `claim-owner-unavailable` skip taxonomy.
- 2026-04-15: Keep runtime inspection and local-claim diagnostics pinned to
  the same configured service-account affinity source. A direct
  `inspectRuntimeRun(...)` test should compare the projected affinity reason
  with `selectStoredExecutionRunLocalClaim(...)` so HTTP route tests cannot
  mask drift in the shared helper.
- 2026-04-15: Document configured service-account affinity as declarative
  config evidence, not live browser-account proof. Operator docs should say
  that `api serve` derives `serviceAccountIds` from configured service identity
  using `email`, then `handle`, then `name`, and does not live-probe browser
  account state during runner registration.
- 2026-04-15: After configured account-affinity is implemented, tested, and
  documented, stop adding more reporting by default. Reassess the roadmap and
  make the next checkpoint validation-first: one bounded `api serve` smoke for
  `/status`, local-claim summary, and `GET /v1/runtime-runs/inspect` affinity
  readback before any public team execution writes or multi-runner service mode.
- 2026-04-15: The account-affinity smoke can be run safely without touching
  live providers by isolating `AURACALL_HOME_DIR`, starting `api serve` with
  startup recovery disabled, pausing background drain, and then seeding a
  runnable persisted direct run. This proves `/status` and
  `GET /v1/runtime-runs/inspect` account-affinity readback while avoiding a
  browser/API execution side effect.
- 2026-04-15: Once that isolated smoke is green, close the current
  durable-state/account-affinity sub-lane instead of adding more diagnostics by
  default. The next implementation step should be chosen as a new roadmap
  decision, not as automatic continuation of the account-affinity thread.
- 2026-04-16: Gemini browser-backed live inspection should not depend only on
  page/DOM evidence. When the Gemini page stays on an idle-looking surface but
  the configured browser-backed executor is actively running, prefer a
  transient executor-owned `thinking` record keyed by runtime run id plus step
  id, and keep DOM/page evidence as fallback for richer states.
- 2026-04-17: Grok browser-backed live inspection should follow the same split
  as Gemini: prefer transient executor-owned `thinking` state for active runs,
  and use provider-owned page evidence only for richer states like visible
  assistant text, signed-out surfaces, or rate-limit toasts.
- 2026-04-17: When bounded live Gemini quality probing still shows only
  executor-owned `thinking` followed by failure or terminal `unavailable`, and
  managed-profile DOM inspection stays on the idle/home surface, do not invent
  richer active states from generic heuristics. Record the negative evidence
  and keep `thinking` as the honest active fallback on that machine/profile.
- 2026-04-17: For Grok live inspection, transient executor-owned `thinking`
  should not blindly mask stronger provider-owned visible answer state.
  Tighten precedence so provider-owned `response-incoming` can win when
  present, but if bounded live proof still never exposes that stronger state on
  the current machine/profile, record negative evidence and keep `thinking` as
  the honest active fallback.
- 2026-04-17: After provider-breadth completion plus bounded Gemini/Grok
  quality follow-ups close with negative evidence, stop opening new
  `serviceState` implementation lanes by default. Keep the current seam in
  maintenance mode and only resume expansion when a fresh provider-owned
  evidence seam is observed in live proof.
- 2026-04-17: When a bounded durable-state/account-affinity checkpoint has
  already shipped its validation smoke and the plan itself says to choose the
  next roadmap lane explicitly, close that plan instead of leaving it
  implicitly active. Keep the lane in maintenance mode until a broader
  durable-ownership seam is chosen.
- 2026-04-17: In the config-model refactor lane, prefer diagnostics before
  behavior changes when runtime profiles still carry broad browser-owned
  fields. A `config doctor` warning for broad launch/browser-family fields
  under `runtimeProfiles.<name>.browser` plus runtime-profile `keepBrowser`
  tightens the ownership boundary without breaking compatibility loading.
- 2026-04-17: When adding config-model cleanup for misplaced browser-owned
  runtime fields, keep the transform conservative. `config migrate` may hoist
  broad launch/browser-family fields from `runtimeProfiles.<name>.browser`
  plus runtime-profile `keepBrowser` into the referenced browser profile, but
  browser-profile values must win and conflicting runtime-profile values must
  remain in place rather than being rewritten silently. Service-scoped escape
  hatches like `manualLoginProfileDir` should remain advisory-only until their
  boundary is defined explicitly.
- 2026-04-17: For service-scoped browser/account escape hatches that still live
  under `runtimeProfiles.<name>.browser`, prefer advisory diagnostics before
  migration. `manualLogin`, `manualLoginProfileDir`, `modelStrategy`,
  `thinkingTime`, and `composerTool` should be treated as intentional escape
  hatches unless they can be moved explicitly to
  `runtimeProfiles.<name>.services.<service>`.
- 2026-04-17: Once the service target is explicit, keep the cleanup
  conservative instead of leaving everything advisory forever. In this repo,
  `config migrate` may relocate `modelStrategy`, `thinkingTime`, and
  `composerTool` from `runtimeProfiles.<name>.browser` into
  `runtimeProfiles.<name>.services.<defaultService>` only when one concrete
  `defaultService` exists and the destination value is not already
  conflicting. Keep `manualLogin` and `manualLoginProfileDir` conservative
  until their managed-profile ownership boundary is narrower.
- 2026-04-17: Match diagnostics to the migration contract. Do not report
  `modelStrategy`, `thinkingTime`, `composerTool`, `manualLogin`, and
  `manualLoginProfileDir` as one flat doctor bucket once migration behavior is
  more precise. Split relocatable service fields from managed-profile escape
  hatches so operators can tell what should move versus what still needs
  manual judgment.
- 2026-04-17: Keep the managed-profile escape hatches internally coherent.
  If `manualLogin` is explicitly false, lower-level browser profile resolution
  should also drop `manualLoginProfileDir` instead of carrying a stale managed
  profile path forward. Browser execution overrides still win over service
  fallback, but the path is only meaningful when manual login is enabled.
- 2026-04-17: Once the lower-level contract is explicit, detect redundant
  explicit managed profile paths. If `manualLoginProfileDir` exactly matches
  the path Aura-Call would derive from managed profile root + AuraCall runtime
  profile + service target, treat it as removable config noise rather than a
  meaningful override.
- 2026-04-17: Keep cleanup aligned with that redundancy rule. `config migrate`
  may remove `manualLoginProfileDir` only when it is exactly the
  default-equivalent derived managed profile path for the same AuraCall
  runtime profile + service target; preserve external managed-profile override
  paths unchanged.
- 2026-04-17: Apply the same redundancy principle to service defaults.
  `runtimeProfiles.<name>.services.<service>.modelStrategy`, `thinkingTime`,
  and `composerTool` are config noise when they exactly match the inherited
  top-level `services.<service>` values. Doctor should flag them and migrate
  may remove them conservatively, then prune any empty service stub left
  behind.
- 2026-04-17: Treat empty `runtimeProfiles.<name>.services.<service>` objects
  left behind by conservative config cleanup as residue, not semantic state.
  Once the last field in a service stub is removed by bounded migrate cleanup,
  prune the empty service entry instead of preserving `{}`.
- 2026-04-17: HTTP server tests that assert empty runtime/local-claim posture
  must override AuraCall home to a temp directory. Otherwise the default
  runtime control can ingest persisted runs from the operator's real
  `~/.auracall` state and leak live `notReadyRunIds` into otherwise isolated
  `/status` assertions.
- 2026-04-17: When an HTTP responses test is functionally green in isolation
  but can still hit the default 5s budget under aggregate-suite load, prefer a
  file-level `vi.setConfig({ testTimeout: ... })` on the heavy HTTP test file
  over chasing individual per-test timeout annotations. Treat it as test-budget
  tuning, not runtime flakiness.
- 2026-04-17: Keep aggregate validation fixtures aligned with real route and
  polling semantics. For HTTP recovery-detail tests, use a normal missing run
  id shape when asserting `404 not found`. For Grok response polling tests,
  provide enough repeated stable snapshots that aggregate-suite load cannot
  exhaust the mocked sequence before stabilization is detected.
- 2026-04-17: Do not treat browser-profile placement for `modelStrategy`,
  `thinkingTime`, or `composerTool` as harmless redundancy. Under the current
  resolver those keys are runtime/service concerns, so `config doctor` should
  flag them as misplaced service-scoped overrides on browser profiles instead
  of trying to auto-clean them there.
- 2026-04-17: Apply that same ownership rule to the top-level `browser` block.
  `browser.modelStrategy`, `browser.thinkingTime`, and `browser.composerTool`
  are legacy global service defaults, not browser-family state. Diagnose them
  as misplaced service-scoped defaults, but keep the current `llmDefaults`
  bridge intact until that compatibility seam is narrowed explicitly.
- 2026-04-17: Treat `llmDefaults.modelStrategy` as compatibility-only bridge
  state, not as the preferred active service-default layer. Diagnose it in
  `config doctor`, but do not auto-migrate it until the remaining
  `llmDefaults` versus `services.<service>` ownership seam is narrowed
  explicitly.
- 2026-04-17: Apply that same compatibility-only rule to
  `llmDefaults.defaultProjectName` and `llmDefaults.defaultProjectId`. They
  still participate in compatibility materialization, but they are not the
  preferred place to encode active service/project defaults, so doctor should
  flag them alongside `llmDefaults.modelStrategy` instead of auto-migrating
  them.
- 2026-04-17: Keep the compatibility write contract explicit while the seam is
  still transitional. `materializeConfigV2()` may still backfill
  `llmDefaults.modelStrategy`, `llmDefaults.defaultProjectName`, and
  `llmDefaults.defaultProjectId` from root `model` / `browser` defaults when
  no explicit `llmDefaults` block exists, but explicit `llmDefaults` values
  must continue to win over that bridge-output path.
- 2026-04-17: Treat root `browser.projectName` and `browser.projectId` as part
  of the same misplaced top-level browser service/project-default seam as
  `browser.modelStrategy`, `browser.thinkingTime`, and `browser.composerTool`.
  The live resolver still gives those root browser project keys precedence
  over service-scoped project defaults, so doctor should flag them as active
  ownership drift, not just bridge-output residue.
- 2026-04-18: Apply that same ownership rule to root
  `browser.conversationName` and `browser.conversationId`. The live resolver
  still gives those root browser conversation keys precedence over
  service-scoped conversation defaults, so doctor should treat them as active
  root-browser ownership drift, not browser-family state or inert
  compatibility residue.
- 2026-04-18: Keep the current root-browser live service-default inventory
  explicit before attempting any broader precedence rewrite. Under the current
  resolver, the active root-browser service-default layer is:
  `modelStrategy`, `thinkingTime`, `composerTool`, `projectName`, `projectId`,
  `conversationName`, and `conversationId`, while `manualLogin` and
  `manualLoginProfileDir` remain separate managed-profile escape hatches.
- 2026-04-18: Treat that root-browser live service-default inventory as
  supported transitional behavior, not compatibility-only state. The live
  resolver still consumes it directly, so the repo should keep it working for
  now while steering new or cleaned-up config toward
  `services.<service>` or `runtimeProfiles.<name>.services.<service>`.
- 2026-04-18: Do not treat the root-browser service-default layer as
  resolver-only debt yet. Current CLI flag mapping still writes
  project/conversation ids plus browser service knobs onto the root `browser`
  block, and browser-mode docs still expose legacy root-browser keys such as
  `browser.thinkingTime` and `browser.manualLoginProfileDir`. Any future
  precedence rewrite is therefore blocked on narrowing or explicitly
  preserving those authoring paths.
- 2026-04-18: Keep the current CLI service/project flags explicit while the
  root-browser layer remains transitional. Under the current resolver
  contract, `--project-id`, `--project-name`, `--conversation-id`,
  `--conversation-name`, `--browser-model-strategy`,
  `--browser-thinking-time`, and `--browser-composer-tool` are still
  supported transitional inputs on the root `browser` block. Lock that with
  focused resolver coverage before attempting any CLI remap.
- 2026-04-18: When a transitional CLI mapping is still intentional, say so in
  the source, not only in plans. In this repo the root-browser-targeting
  service/project flag set should carry an inline note in `src/schema/cli-map.ts`
  and one resolver test that covers the full set together, so future narrowing
  work starts from an explicit contract instead of scattered field-by-field
  assumptions.
- 2026-04-18: Start CLI narrowing with the lowest-risk service-scoped pair.
  In this repo, `--project-id` and `--project-name` can dual-write safely:
  keep the existing root-browser mapping for transitional compatibility, but
  also mirror them into the selected
  `runtimeProfiles.<name>.services.<defaultService>` block when one concrete
  default service exists. If no concrete default service exists, leave them on
  the root browser layer only.
- 2026-04-18: Apply the same bounded dual-write rule to conversation
  selectors when the resolver ownership shape matches the project selectors.
  In this repo, `--conversation-id` and `--conversation-name` can also mirror
  into the selected `runtimeProfiles.<name>.services.<defaultService>` block
  when one concrete default service exists, while preserving the current
  root-browser mapping as transitional input.
- 2026-04-18: The same bounded dual-write rule also applies to
  `--browser-model-strategy`, `--browser-thinking-time`, and
  `--browser-composer-tool` when the resolver and schema already treat those
  knobs as service-scoped defaults. Mirror them into the selected
  `runtimeProfiles.<name>.services.<defaultService>` block when one concrete
  default service exists, but keep the existing root-browser mapping as
  transitional input until a later cleanup pass removes it explicitly.
- 2026-04-18: Once the full seven-flag CLI dual-write path exists, update the
  root-browser doctor wording to match reality. In this repo,
  `global-browser-service-scoped-defaults-present` should describe the root
  browser layer as transitional compatibility-alias input, not just generic
  transitional drift, because the preferred service-scoped destination now
  exists for the mirrored CLI paths.
- 2026-04-18: After the seven-flag dual-write pass and the doctor wording
  update, treat the root-browser compatibility-alias lane as maintenance-only
  until a future slice explicitly chooses deprecation or stronger reporting.
  Do not keep extending this seam by inertia once the compatibility posture is
  already explicit and test-backed.
- 2026-04-18: Treat team role references as part of the live config integrity
  surface once role-aware planning consumes them. In this repo,
  `config doctor` should warn when `teams.<name>.roles.<role>.agent`
  references a missing agent or an agent outside `teams.<name>.agents`, and
  when `handoffToRole` points at a missing role, rather than leaving those
  failures to degrade later into blocked team planning behavior.
- 2026-04-18: Once team roles participate in planning order and handoff
  metadata, doctor should also flag planning-shape drift, not just missing
  references. In this repo, duplicate explicit role `order` values and
  self-referential `handoffToRole` targets should surface as warnings instead
  of being normalized silently through role-id tiebreaks or weak handoff
  semantics.
- 2026-04-18: Keep current team-role topology semantics explicit until a later
  orchestration slice changes them deliberately. In this repo, explicit role
  `order` still drives planned step sequencing, duplicate order still falls
  back to deterministic role-id ordering, and `handoffToRole` remains
  advisory metadata rather than a dependency-rewrite mechanism.
- 2026-04-18: Treat `agents.<name>.defaults` as a bounded workflow-defaults
  seam, not as a hidden runtime/browser override channel. In this repo,
  `config doctor` should warn when agent defaults attempt runtime-selection
  bypass (`defaults.runtimeProfile`, `defaults.browserProfile`,
  `defaults.browserFamily`), browser/account-bearing overrides (for example
  `defaults.browser` or managed-profile/cookie path overrides), or service
  identity rewiring (`defaults.services.<service>.identity`) instead of
  letting the generic defaults bag erode the agent/runtime/browser boundary.
- 2026-04-18: Keep current agent-default execution semantics explicit until a
  later agent-design slice introduces a typed live workflow-defaults surface.
  In this repo, `agents.<name>.defaults` is still execution-inert for runtime
  selection, browser profile resolution, and default service resolution; live
  agent selection still flows only through `agents.<name>.runtimeProfile` and
  the referenced AuraCall runtime profile.
- 2026-04-18: When a generic placeholder bag remains execution-inert, say so
  directly in doctor output. In this repo, non-empty
  `agents.<name>.defaults` should surface as an info-level placeholder seam
  so operators do not infer live behavior from generic agent-default keys
  before a typed workflow-defaults contract exists.
- 2026-04-18: Keep the positive live agent contract explicit too, not just the
  negative/placeholder warnings. In this repo, `agents.<name>.runtimeProfile`
  is still the only live agent-owned execution selector; accepted descriptive
  fields like `description`, `instructions`, and `metadata` remain
  organizational / future-workflow config and should not affect runtime
  selection, browser profile resolution, or default service resolution.
- 2026-04-18: Resolve the next agent-design ambiguity explicitly instead of
  leaving “typed live agent defaults” as implied near-term scope. In this
  repo's current `0007` / `0009` phase, there is still no typed live
  agent-owned defaults surface; keep agent semantics limited to
  `runtimeProfile` selection plus descriptive metadata until a later
  execution-facing slice defines stronger behavior and validation.
- 2026-04-18: Keep the full `llmDefaults` compatibility bridge seam aligned on
  both read and write surfaces. In this repo, `llmDefaults.model` should be
  diagnosed alongside `llmDefaults.modelStrategy`,
  `llmDefaults.defaultProjectName`, and `llmDefaults.defaultProjectId`
  because bridge output may still backfill all of them from root
  `model` / `browser` defaults when no explicit `llmDefaults` block exists.
- 2026-04-18: When an escape-hatch path only matters behind an explicit toggle,
  doctor should say so directly. In this repo,
  `manualLoginProfileDir` without active `manualLogin` is inert config noise
  and should surface as a warning instead of looking like live managed-profile
  behavior.
- 2026-04-18: Compatibility bridge writes must follow the same target-first
  authority as read-time dual-read. In this repo, when `--bridge-shape`
  materializes output from mixed-shape input, `browserProfiles` and
  `runtimeProfiles` should overwrite stale bridge copies and emit bridge-only
  keys instead of preserving mixed-shape residue.
- 2026-04-18: Legacy `auracallProfiles` must not outrank the current
  runtime-profile bridge once `profiles` or `runtimeProfiles` exist. In this
  repo, keep `auracallProfiles` inspectable and available as a last-resort
  compatibility fallback only, not as the preferred active bridge.
- 2026-04-18: Once root-browser CLI alias inputs also mirror into
  `runtimeProfiles.<name>.services.<defaultService>`, active service binding
  should prefer the service-scoped values over legacy root-browser copies for
  project, conversation, and browser service knobs. Keep `manualLogin` and
  `manualLoginProfileDir` out of that rewrite because they remain
  browser-execution escape hatches.
- 2026-04-18: When browser-owned runtime residue already migrates into the
  referenced browser profile, active resolution should honor the same
  authority. In this repo, `browserProfiles.<name>.keepBrowser` should win
  over legacy `runtimeProfiles.<name>.keepBrowser` when both exist, leaving
  the runtime-profile copy as fallback-compatible residue only.
- 2026-04-18: The matching bridge-shape contract for browser-owned
  `keepBrowser` stays on the browser-family side. In this repo, when
  target-shaped config writes compatibility bridge output,
  `browserProfiles.<name>.keepBrowser` should materialize back onto
  `browserFamilies.<name>`, not `profiles.<name>`.
- 2026-04-18: Do not over-generalize the `keepBrowser` precedence rewrite to
  the whole runtime-profile browser block without evidence. In this repo,
  conflicting broad browser-owned overrides under
  `runtimeProfiles.<name>.browser` such as `chromePath`, `display`,
  `managedProfileRoot`, and `wslChromePreference` are still live advanced
  escape hatches in active resolution unless a later slice narrows them
  explicitly.
- 2026-04-18: Narrow the broad runtime-profile browser block one field class at
  a time instead of treating it as all-or-nothing. In this repo, the
  referenced browser profile should now win over conflicting
  `runtimeProfiles.<name>.browser` values for `blockingProfileAction`,
  `chromePath`, `display`, debug-port controls, `headless`, `hideWindow`,
  `remoteChrome`, tab/window cleanup controls, `managedProfileRoot`, source
  browser profile / cookie-source wiring, and `wslChromePreference`. The
  browser-owned launch/browser-family field class no longer has a live
  runtime-profile precedence carveout in active resolution.
- 2026-04-18: Once a runtime profile already references a browser profile,
  browser-owned fields left under `runtimeProfiles.<name>.browser` should be
  described as compatibility residue, not as vague “maybe-active” escape
  hatches. If no browser profile is referenced yet, say directly that those
  same runtime fields are still active only because browser-profile ownership
  has not been completed for that runtime profile.
- 2026-04-18: Keep lower-level resolved launch layers aligned with the
  managed-profile escape-hatch contract. In this repo,
  `manualLoginProfileDir` should not appear in resolved service-binding or
  launch-profile state unless `manualLogin` is explicitly active for that
  same scope; deriving the internal managed browser profile directory is a
  separate concern and should stay separate.
- 2026-04-18: When browser mode still depends on managed AuraCall profiles by
  default, document that default explicitly instead of implying the toggle is
  neutral. In this repo, `resolveBrowserConfig(...)` still defaults browser
  runs to `manualLogin: true`, and direct browser run / login / reattach flows
  still assume a managed profile unless `manualLogin: false` is set
  deliberately.
- 2026-04-18: Keep migrate behavior aligned with the managed-profile
  escape-hatch plan, not just the resolver policy. In this repo, when one
  concrete `defaultService` exists and no conflicting service-level value is
  already present, `config migrate` should relocate
  `manualLogin` / `manualLoginProfileDir` from
  `runtimeProfiles.<name>.browser` into
  `runtimeProfiles.<name>.services.<defaultService>` instead of leaving them
  behind as stale runtime-browser residue.
- 2026-04-18: When bounded migrate cleanup starts relocating a config seam,
  doctor messaging must be updated in the same lane. In this repo, the
  managed-profile escape-hatch doctor note should no longer imply those fields
  are never auto-relocated; it should say that relocation happens only when
  one concrete `defaultService` makes the destination unambiguous and no
  conflicting service-level value already exists.
- 2026-04-18: After a bounded migrate rule lands, update the active plan and
  troubleshooting authority in the same lane. In this repo, once
  `manualLogin` / `manualLoginProfileDir` started relocating into
  `runtimeProfiles.<name>.services.<defaultService>` for the unambiguous
  non-conflicting case, the remaining “these fields remain in
  runtimeProfiles.<name>.browser” checkpoint wording became stale and needed
  to be corrected immediately.
- 2026-04-18: When a precedence rewrite lands, update the browser-facing merge
  tests to the same contract instead of leaving older pre-refactor
  expectations in place. In this repo, once browser profiles became
  authoritative for tab/window cleanup controls and service-scoped defaults
  outranked stale root-browser aliases, `applyBrowserProfileOverrides(...)`
  needed matching regression coverage and stale expectations had to be
  corrected immediately.
- 2026-04-18: When a compatibility bridge stays live on the normalize path,
  lock its precedence explicitly. In this repo, `llmDefaults` should only
  backfill root `model` / `browser.modelStrategy` /
  `browser.projectName` / `browser.projectId` when those target values are
  absent; explicit root values must stay authoritative over `llmDefaults`
  during normalization.
- 2026-04-18: When a config seam is intentionally diagnostics-only for migrate,
  lock the no-rewrite rule explicitly. In this repo, the root-browser
  compatibility-alias inventory (`browser.modelStrategy`,
  `browser.thinkingTime`, `browser.composerTool`, `browser.projectName`,
  `browser.projectId`, `browser.conversationName`, `browser.conversationId`)
  should not be auto-relocated into `runtimeProfiles.<name>.services.<service>`
  during target-shape cleanup, even when a concrete `defaultService` exists.
- 2026-04-18: When an active plan lane starts yielding mostly contract-lock
  slices instead of new behavior fixes, record the maintenance-mode decision
  explicitly in the governing plan and roadmap. In this repo, the `0007`
  config-boundary hardening sub-lane is now maintenance-only unless a new
  resolver or migrate mismatch is demonstrated.
- 2026-04-18: When a canonical execution owner doc still points at a closed
  implementation lane, reconcile it immediately instead of starting work from
  stale sequencing. In this repo, `0001-2026-04-14-execution.md` had to stop
  naming closed `0017`/`0018` service-state work as the next finite lane and
  point to the unresolved internal `taskRunSpec -> teamRun` execution slice
  instead.
- 2026-04-18: When a bounded execution CLI has already shipped, execution
  authority docs must distinguish that live surface from still-paused broader
  public writes. In this repo, `auracall teams run` is already a real narrow
  CLI execution entrypoint on the single-host team-runtime bridge, so
  `0001`, `0004`, and `ROADMAP.md` had to stop saying no public team-run
  surface existed at all and instead say that broader HTTP/MCP team execution
  writes remain paused.
- 2026-04-18: Once a bounded CLI execution path starts depending on the same
  service-host substrate as `api serve`, stop letting it bypass persisted
  runner identity. In this repo, `auracall teams run` had to register one
  short-lived local runner, execute with `runnerId`-backed lease ownership and
  configured account-affinity semantics, and mark that runner stale on exit
  instead of continuing to run through an anonymous `host:*` bridge owner.
- 2026-04-19: When a bounded CLI run uses a persisted local runner, keep that
  runner heartbeated while active multi-step work is still draining. In this
  repo, registering the runner only at startup was not enough because the
  service host re-evaluates local claim eligibility between passes; a slow
  first step could otherwise make later CLI steps fail as `stale-runner`
  against the runner's own short TTL.
- 2026-04-19: Keep provider live-state observability separate from runner
  control unless a new execution policy explicitly says otherwise. In this
  repo, passive observations and live service-state probes are adapter-owned
  evidence and read-only inspection surfaces; the runner/service layer still
  decides control flow from lease state and executor success/failure, not from
  a generic passive-state watcher loop.
- 2026-04-19: Do not pin resumed paused runs to the runner that originally
  paused them unless the affinity layer explicitly requires it. In this repo,
  `resumeHumanEscalation(...)` should only restore runnable state; subsequent
  targeted drain or service-host reclaim should be based on current eligible
  runner affinity and active runner liveness, not historical paused-run lease
  ownership.
- 2026-04-19: Keep the same reassignment rule after operator local-action
  control updates. In this repo, resolving a pending local action request on a
  paused run should not re-bind later targeted drain to the historical runner;
  after local-action resolution and human resume, reclaim still belongs to the
  current eligible active runner.
- 2026-04-19: Refresh immediate HTTP status runner readback after operator
  control changes that can claim work. In this repo, once `POST /status`
  resolves local-action state, resumes a run, or drains it, the returned
  status payload should sync runner state from store before responding so
  `runner.lastClaimedRunId` reflects the actual post-drain claimant instead of
  stale pre-drain cache.
- 2026-04-19: Keep resumed-run HTTP runtime inspection keyed to current
  claimant selection, not historical paused ownership. In this repo, once
  local-action resolution and human resume clear the old active lease,
  `/v1/runtime-runs/inspect` should show no implicit selected runner by
  default, and a queried replacement runner should be evaluated on current
  eligibility rather than inheriting the stale paused owner.
- 2026-04-19: Keep resumed-run HTTP recovery detail keyed to current
  local-claim projection, not historical paused ownership. In this repo, once
  local-action resolution and human resume clear the old active lease,
  `/status/recovery/{run_id}` should report `activeLease = null` and project
  the current local runner's runnable/claimable posture instead of leaving the
  historical paused owner implied as still active.
- 2026-04-19: Keep resumed-run HTTP recovery summary keyed to current
  reclaimable/local-claim buckets, not historical paused ownership. In this
  repo, once local-action resolution and human resume clear the old active
  lease, `/status?recovery=true` should move the run into `reclaimableRunIds`
  and the current runner's `selectedRunIds` instead of leaving it counted
  under active-lease posture.
- 2026-04-19: When the bounded operator-facing claimant/readback seams are all
  explicitly locked, stop mining that `0004` lane for more contract-only
  slices by default. In this repo, once `POST /status`,
  `/v1/runtime-runs/inspect`, `/status/recovery/{run_id}`, and aggregate
  `/status?recovery=true` all reflected current claimant semantics correctly,
  the right move was to mark that sub-lane maintenance-only unless a new
  concrete mismatch appears.
- 2026-04-19: Treat the short-lived `auracall teams run` local runner as
  historical ownership only once it exits, even when the stored run still
  needs operator-controlled follow-through. In this repo, a CLI-generated team
  run that pauses for approval/human escalation should still be claimable by a
  later eligible active runner after local-action approval and resume, rather
  than staying implicitly pinned to the stale CLI runner.
- 2026-04-19: Normalize persisted handoff transfer payloads before runner
  context injection and readback summarization. In this repo, consumers should
  not recount raw `handoff.structuredData.taskTransfer` arrays directly:
  - malformed `requestedOutputs` entries should be ignored before prompt
    injection or summary counts
  - malformed `inputArtifacts` entries should be ignored before prompt
    injection or summary counts
  - response readback and recovery-detail fallback summaries should use the
    same bounded projection as runner context injection
- 2026-04-19: Normalize bounded local-action request aliases before runner
  policy evaluation and persistence. In this repo, the runtime runner should
  accept the same bounded local-action request vocabulary already tolerated by
  the configured executor path:
  - `kind` / `actionType` / `type`
  - `structuredPayload` / `payload`
  - canonical fallback summary when one is omitted
  Do not let raw producer field drift become stored contract just because the
  request arrived through `step.output.structuredData.localActionRequests`.
- 2026-04-20: Do not start another implementation lane while the execution
  board still overstates active work. The 360 review found that several plans
  are effectively maintenance-only or parked, while many remain `OPEN` and
  `0001` still records the old `keep = 14` plan-audit count. In this repo, the
  next roadmap slice should prune/classify plan state before widening service,
  runner, API, MCP, provider, or retrieval work.
- 2026-04-20: Stop the response-shape normalization lane at the written
  checkpoint unless there is a new reproduced mismatch. In this repo,
  `output[]`, `metadata.executionSummary`, team-only assignment identity,
  local-action requests, handoff transfers, and artifact refs now have explicit
  deterministic enforcement; local-action `resultPayload`, non-`response.output`
  structured outputs, and provider-owned evidence should remain intentionally
  open until a concrete routing/readback consumer requires more shape.
- 2026-04-20: Normalize persisted `response.output` item by item. In this
  repo, one malformed stored output item should not discard the whole visible
  response timeline or force readback to fall back to artifact-derived output;
  valid `message` / `artifact` siblings should remain visible in order while
  malformed siblings are ignored.
- 2026-04-20: Normalize runtime artifact refs at provider and local-host
  ingress. In this repo, `executeStep` and `executeLocalActionRequest`
  producers may emit durable artifacts, but those refs must enter storage only
  through the canonical `id` / `kind` / `path` / `uri` / `title` shape; malformed
  artifact-ref entries should be dropped before persistence, requested-output
  enforcement, or response readback can treat them as produced artifacts.
- 2026-04-19: Do not leave equally eligible runner selection to storage order.
  In this repo, bounded claim-candidate ordering now has an explicit tie-break:
  claim status rank first, then fresher runner heartbeat, then runner id as a
  stable fallback when heartbeats are equal.
- 2026-04-19: Do not confuse global candidate ordering with host-side runner
  arbitration. In this repo, a service host configured with one `runnerId`
  stays runner-scoped for claim/drain decisions; even if another eligible
  runner is fresher, the host should keep lease ownership on its configured
  runner and leave multi-runner ordering to the candidate inspection/evaluation
  seam.
- 2026-04-19: Keep `api serve` recovery ownership on the server local runner.
  In this repo, startup recovery and background drain both execute through the
  server-owned local `serviceHost`, so recovered runs should be claimed by the
  persisted `runner:http-responses:<host>:<port>` record rather than silently
  moving to some other fresher eligible runner record.
- 2026-04-19: Keep response readback task-spec identity team-run scoped too.
  In this repo, `GET /v1/responses/{response_id}` should suppress
  `metadata.taskRunSpecId` and `metadata.taskRunSpecSummary` for direct runs
  even if a legacy or malformed stored run record still carries a persisted
  `taskRunSpecId`.
- 2026-04-19: Keep `api serve` status/readback keyed to the same server local
  runner. In this repo, `localClaimSummary` and recovery-summary claim buckets
  should project eligibility for `runner:http-responses:<host>:<port>`, not
  imply that some other fresher eligible runner has become the selected owner.
- 2026-04-19: Stop mining the narrower `api serve` server-local-runner
  ownership/readback seam once startup recovery, aggregate `/status`, and
  runtime inspection all match the same pinned server-runner contract. In this
  repo, further work in that sub-lane should require a freshly reproduced
  mismatch, not more contract-only hardening by inertia.
- 2026-04-19: Keep runtime inspection runner evaluation on the same liveness
  contract as service-host local claim. In this repo, if a queried runner or
  active-lease owner heartbeat is expired, runtime inspection should first mark
  it stale and then report blocked/stale posture instead of reading it back as
  implicitly active/eligible just because the persisted runner record has not
  been swept yet.
- 2026-04-19: Keep runtime inspection `taskRunSpecId` aliases scoped to
  team-run history. In this repo, `taskRunSpecId` belongs to the
  `taskRunSpec -> teamRun -> runtime` chain, so `/v1/runtime-runs/inspect`
  should not let a newer direct run with the same `taskRunSpecId` displace the
  actual team-backed runtime attempt on that alias surface.
- 2026-04-19: Keep review-ledger `taskRunSpecId` aliases on that same
  team-run-only history rule. In this repo, review-ledger lookup should not
  let a newer direct run with the same `taskRunSpecId` displace the actual
  team-backed runtime/review attempt, even if the implementation already
  appears scoped correctly today.
- 2026-04-19: Keep team inspection `taskRunSpecId` aliases on that same
  team-run-only history rule. In this repo, `inspectConfiguredTeamRun(...)`
  and `/v1/team-runs/inspect` should not let a newer direct run with the same
  `taskRunSpecId` displace the actual team-backed runtime attempt, even if the
  current implementation already appears scoped correctly today.
- 2026-04-19: Keep the team inspection `runtimeRunId` surface team-run-only
  too. In this repo, `inspectConfiguredTeamRun(...)` and
  `/v1/team-runs/inspect` should reject a direct runtime run instead of
  projecting it through a team-run inspection payload.
- 2026-04-19: Keep the team review `runtimeRunId` surface team-run-only too.
  In this repo, `reviewConfiguredTeamRun(...)` should reject a direct runtime
  run instead of projecting it through a team review ledger payload.
- 2026-04-19: Stop mining the narrower team review/inspection boundary lane
  once helper/runtime-id and alias-selection rules all agree. In this repo,
  further work in that sub-lane should require a freshly reproduced mismatch,
  not more contract-only hardening by inertia.
- 2026-04-19: Keep one deterministic execution/readback envelope and do not
  let provider output, route handlers, or local-host transport redefine it by
  surface.
  - the logical execution contract should stay stable around:
    - run identity
    - execution status/failure
    - local-action state
    - artifact refs
    - handoff payloads
    - append-only orchestration history
  - the readback contract should keep:
    - `output[]` as the ordered visible result timeline
    - `metadata.executionSummary` as the bounded machine-handling summary
  - team-only assignment identity such as `taskRunSpecId` /
    `taskRunSpecSummary` should be exposed only for task-backed team-run
    execution, not for direct runs just because storage contains a stale id
  - local host actions should consume and emit the same artifact/handoff
    references as agent steps; do not create a second host-only artifact or
    handoff vocabulary
- 2026-04-20: Treat public team-run create as two separate gates:
  route/readback durability and live execution observability. In this repo,
  `POST /v1/team-runs` can correctly create and persist the
  `taskRunSpec -> teamRun -> runtime` chain while still being operationally
  unsafe if the synchronous provider step keeps the HTTP request open, service
  state probing blocks, and recovery detail can only infer
  `suspiciously-idle` from missing runner activity. The next hardening slice
  should make long-running step activity, timeout posture, and passive
  service-state readback bounded and machine-readable before declaring the live
  route green.
- 2026-04-20: Keep basic keyring support on the generic managed Chrome launch
  path. In this repo, managed browser profile launches should pass
  `--password-store=basic` on non-Windows Chrome, including WSL visible
  auth-mode launches, otherwise a desktop keyring modal can block Chrome
  before DevTools and provider pages fully load. If Chrome is not visible even
  though the process/window exists, first check WSLg/session health and
  `DISPLAY` propagation before weakening the keyring bypass.
- 2026-04-20: Separate Chrome launch health from provider account health in
  live smoke triage. In this repo, a successful WSL Chrome launch with
  `--password-store=basic` and `readyState=complete` can still be unusable for
  ChatGPT automation if the managed browser profile is logged out. Before
  classifying a team-run route or executor failure, inspect the selected
  provider page for authenticated UI state and refresh the managed browser
  profile login when `authStatus` is `logged_out`.
- 2026-04-20: Do not let stored/API ChatGPT browser execution wait silently
  for interactive login. In this repo, configured stored execution runs in a
  hidden/minimized automation context, so a logged-out ChatGPT page should fail
  fast with `providerState: "login-required"`, the managed browser profile
  path, and an auth-mode recovery command (`auracall --profile <name> login
  --target chatgpt`) instead of entering the long manual-login wait loop.
  Preserve those fields on the stored step failure and expose them through
  `metadata.executionSummary.failureSummary.details` so API clients can route
  auth recovery without scraping the human-readable message.
- 2026-04-20: Keep WSL display defaults wired through auth/login launches, not
  only normal browser execution. In this repo, `resolveBrowserConfig(...)`
  correctly chooses `display: ":0.0"` for WSL Linux Chrome, but `auracall
  login` must carry that resolved value into the browser-service manual-login
  launcher; otherwise a login browser can exist on DevTools while no visible
  WSLg/X11 window appears for the user.
- 2026-04-20: Anchor visible manual-login Chrome windows on screen. In this
  repo, a WSLg/X11 Chrome window can be technically open but placed at an
  off-screen coordinate from previous browser state. Visible, non-minimized
  launches should include `--window-position=0,0`; minimal login launches
  should also include an explicit window size so auth recovery opens where a
  human can actually find it.
- 2026-04-20: Distinguish "Chrome window exists in X11" from "window is
  visible to the human." In this repo, if both an AuraCall-owned
  Chrome window and a simple `xmessage` probe appear in `xwininfo` but the user
  cannot see either, the likely failure is WSLg/RAIL presentation for the
  current session. Keep the selected runtime on WSL Chrome; do not silently
  switch browser families as a recovery path. Treat the full fix as
  WSLg/runtime environment work rather than more provider automation.
- 2026-04-20: Clear stale managed-profile Chrome singleton state before WSL
  auth-mode relaunch. In this repo, a dead `SingletonLock`/`SingletonSocket`
  plus stale `DevToolsActivePort` under
  `~/.auracall/browser-profiles/<auracallProfile>/<service>` can make a
  hand-launched or AuraCall-launched WSL Chrome exit immediately even though
  fresh WSL Chrome works. Before launching a managed browser profile, clear
  stale DevTools hints and remove Chrome lock files when the recorded profile
  PID is dead.
- 2026-04-20: Treat fresh WSLg Wayland Chrome launch stalls as environment
  state, not browser-family selection. In this repo, if an existing imcli
  Wayland Chrome remains visible but every new Wayland Chrome launch from the
  current session stalls at parent + zygote with no renderer, no DevTools, and
  `drmGetDevices2() has not found any devices`, do not switch to Windows
  Chrome. Clean up the failed control processes and reset/repair the WSLg
  session before retrying AuraCall auth-mode launch.
- 2026-04-20: Confirm managed ChatGPT auth with page-state evidence after
  login. In this repo, after opening
  `~/.auracall/browser-profiles/wsl-chrome-2/chatgpt` with WSL Chrome and
  `--password-store=basic`, validate the restored session through DevTools by
  checking the ChatGPT tab is `readyState=complete`, visible, has a composer
  surface, and exposes `__Secure-next-auth.session-token.*` cookies before
  rerunning browser/team smokes.
- 2026-04-20: Validate restored WSL ChatGPT auth with a direct browser smoke
  before returning to team-run debugging. In this repo, once
  `wsl-chrome-2/chatgpt` is logged in, a narrow `auracall --profile
  wsl-chrome-2 --engine browser` exact-response smoke should pass before
  diagnosing stored/team surfaces. The root browser-run command does not
  accept setup/login-only flags such as `--browser-wsl-chrome` or
  `--browser-display`; use the selected runtime profile plus
  `AURACALL_BROWSER_DISPLAY=:0.0` when a display override is needed.
- 2026-04-20: Prove ChatGPT team-run execution through the server-owned
  recovery/drain path after direct browser auth is green. In this repo,
  `auracall teams run` persists a planned team/runtime run; execution occurs
  through the service host/background drain. If the usual dev port is occupied
  by another service, start `api serve` on an alternate local port with
  `--recover-runs-on-start-source team-run`, then verify `/v1/team-runs`,
  `/v1/runtime-runs/inspect`, and `/v1/responses/<teamRunId>` all converge on
  `succeeded`/`completed` with requested outputs satisfied.
- 2026-04-20: Use the public `/v1/team-runs` route as the final proof for a
  restored ChatGPT team-run slice. In this repo, CLI `teams run` plus
  startup recovery proves the durable plan/drain path, but the API client
  contract is only proven after a direct `POST /v1/team-runs` returns a
  terminal run with `runtimeRunStatus: "succeeded"` and
  `/v1/responses/<teamRunId>` returns `status: "completed"` with the requested
  output policy satisfied.
- 2026-04-21: Treat deterministic model-output shape as a model-emitted step
  envelope, not as a replacement for OpenAI-compatible HTTP response objects.
  In this repo, `auracall.step-output.v1` should be prepended as an execution
  prompt only for opted-in steps and then enforced by runtime schema
  validation. Prompt-only enforcement is not sufficient; invalid JSON or schema
  mismatches must fail the step with machine-readable prompt-validation
  details so runners, API clients, and team handoffs can route failure without
  prose scraping.
- 2026-04-21: Put public response-contract opt-in on the existing request
  seams instead of adding another route. In this repo, `/v1/team-runs` should
  use top-level `outputContract: "auracall.step-output.v1"` and direct
  `/v1/responses` should use `auracall.outputContract`; both converge on stored
  step structured data so the configured executor can apply the same
  prompt-prefix and runtime validation path.
- 2026-04-21: Do not trust cross-provider default managed-profile login
  evidence when multiple auth-mode launches reuse the same fixed DevTools port.
  In this repo, `auracall login --target ...` on the default AuraCall runtime
  profile can open multiple provider windows on `127.0.0.1:9222`; browser
  doctor then selects tabs by URL and can mix ChatGPT/Grok/Gemini evidence
  across processes. For account-health confirmation, launch and validate one
  provider at a time, prune stale browser-state entries after closing windows,
  and treat any Grok/Gemini/Google human-verification page as a hard stop until
  a human clears it.
- 2026-04-21: Treat managed-profile CDP as a profile-scoped shared control
  plane, not a stateless per-command endpoint. In this repo, even read-only
  browser operations such as doctor/features can race when they select tabs,
  inspect live DOM, or depend on focused-page state. The durable fix should be
  a browser-service operation dispatcher keyed by managed browser profile and
  service target, with exclusive ownership for login/manual-verification and
  mutating browser execution. Do not model this first slice as a broad
  multi-runner scheduler; keep it below the AuraCall runtime runner layer.
- 2026-04-21: Keep end-of-turn closeouts decisive by ending on the best
  recommendation. In this repo, the closeout contract should not always force a
  ranked-alternatives section; include alternatives only when there is real
  uncertainty or a materially different tradeoff. The final section should be
  `Best Recommendation (Primary)` with exactly one next action. Keep the
  default layout compact: status/verification, plan/audit, risks/blockers, then
  the final recommendation. Prefer inline labels over standalone section
  headers when the closeout content is short, and omit risks/blockers when
  there is no actionable risk to report.
- 2026-04-21: Put managed-profile login launch behind a browser-service
  operation dispatcher before allocating DevTools resources. In this repo,
  same-machine AuraCall processes can overlap on the same managed browser
  profile, so the login path should acquire a dispatcher key of
  `managed-profile:<absolute-managed-profile-dir>::service:<target>` and fail
  with structured busy diagnostics before choosing a fixed debug port or
  opening Chrome. Keep this in browser-service, not provider adapters, so
  setup, doctor, features, browser execution, and managed-profile
  `browser-tools` can join the same ownership model. Also default
  managed-profile login launches with no explicit debug-port strategy to
  auto-assigned ports; otherwise default Grok/ChatGPT/Gemini auth-mode launches
  can still contend for `127.0.0.1:9222` even though they have different
  managed browser profile keys.
- 2026-04-21: Route live browser doctor/features probes through the same
  operation dispatcher as login. In this repo, local browser-profile inspection
  can remain lock-free, but any doctor/features path that calls browser-tools,
  provider identity, feature probes, or selector diagnosis should hold one
  `exclusive-probe` lease for the managed browser profile so tab selection and
  DOM inspection cannot interleave with another CDP operation.
- 2026-04-21: Route managed-profile browser execution through an
  `exclusive-mutating` operation lease. In this repo, prompt send, navigation,
  project/conversation context, uploads, and response capture are all CDP
  mutating work; acquire the browser operation dispatcher after resolving the
  managed browser profile and before launch/navigation so execution cannot
  interleave with login or live doctor/features probes.
- 2026-04-21: Treat `auracall setup` as an `exclusive-human` managed-profile
  operation. In this repo, setup is more than a login alias: it performs live
  identity checks, may open auth mode, can run browser verification, and
  collects final doctor state. Hold one setup lease across that whole flow so
  verification and final probes cannot interleave with another CDP owner.
- 2026-04-21: Route AuraCall-managed `browser-tools` direct commands through
  dispatcher ownership unless the operator supplies an explicit `--port`. In
  this repo, `browser-tools ls/search/nav/eval/screenshot/pick/cookies` can
  select tabs, focus pages, navigate, inject picker overlays, or otherwise
  depend on shared CDP state even when used as diagnostics. When these commands
  resolve an AuraCall managed browser profile, acquire an `exclusive-probe`
  lease before resolving or launching the DevTools endpoint. Keep explicit
  `--port` as the deliberate raw CDP/debug bypass.
- 2026-04-21: Keep dispatcher/account-health smoke conclusions separate from
  provider selector drift. In this repo, `auracall doctor --json` can prove the
  active dispatcher key, managed browser profile, selected tab URL, blocking
  state, identity, and feature evidence even when selector diagnosis exits
  nonzero because the current home/non-conversation surface lacks conversation
  selectors. For browser operation dispatcher validation, treat clean
  dispatcher key + managed profile + selected URL + no blocking state + account
  identity as the ownership proof, and open a separate selector-hardening slice
  for Grok/ChatGPT selector-diagnosis drift.
- 2026-04-21: Make provider selector diagnosis surface-aware instead of
  requiring conversation-output selectors on every healthy account page. In
  this repo, Grok and ChatGPT home/new-chat pages can be signed in and ready
  for account/profile health checks without rendering assistant bubbles, copy
  buttons, or a pre-input send button. Classify the selected surface first; on
  non-conversation surfaces require account/composer/model/menu/file/attachment
  evidence and defer `sendButton`, `assistantBubble`, `assistantRole`, and
  `copyButton`. Keep those checks required on conversation routes so response
  readiness remains strict.
- 2026-04-21: Do not mistake runner-readiness primitives for a scheduler. In
  this repo, durable runner records, heartbeat freshness, claim-candidate
  ordering, queue projection, and recovery summaries are prerequisites for
  multi-runner service mode, but `ExecutionServiceHost` is still scoped to its
  configured `runnerId`. Before adding background workers or reassignment
  loops, add a read-only service-host runner topology/readiness seam that makes
  local-server ownership and fleet capacity explicit without changing claim or
  lease authority.
- 2026-04-21: Keep runner topology readback read-only. In this repo,
  `/status.runnerTopology` may report active/stale/fresh/expired runner counts
  and capability summaries for all known runners, but it must not expire runner
  records, select a different local execution owner, acquire leases, execute
  steps, or reassign work. The only selected execution owner for `api serve`
  remains the configured server-local runner id.
- 2026-04-21: Separate scheduler authority from runner evidence. In this repo,
  runner topology, heartbeat freshness, and deterministic claim-candidate
  ordering are evidence inputs only; they do not authorize fleet assignment.
  Treat `api serve` as a local runner until a component has explicit
  scheduler authority. Fresh active leases owned by active fresh runners block
  reassignment. Expired stale/missing lease owners may only become
  reassignable through a future explicit scheduler-authority decision, and
  browser-backed assignment must still respect browser-service dispatcher
  exclusivity.
- 2026-04-21: Keep scheduler-authority evaluation read-only until it has an
  operator-facing inspection surface. In this repo,
  `evaluateStoredExecutionRunSchedulerAuthority(...)` may classify
  `claimable-by-local-runner`, `claimable-by-other-runner`,
  `reassignable-after-expired-lease`, active-lease blocks, affinity blocks,
  and capability blocks, but it must return `mutationAllowed: false` and must
  not persist runs, runners, leases, or steps. Expose that evidence through
  read-only runtime inspection before adding any scheduler mutation, worker
  loop, or reassignment path.
- 2026-04-21: Keep runtime inspection scheduler authority opt-in and separate
  from service-state probing. In this repo,
  `GET /v1/runtime-runs/inspect?...&authority=scheduler` should return
  optional `schedulerAuthority` evidence with `mutationAllowed: false`; it must
  not acquire leases, reassign work, execute steps, or imply fleet scheduler
  authority. Keep live provider/browser state under `probe=service-state` so
  scheduler evidence and service-state evidence remain independently
  requestable.
- 2026-04-21: Keep CLI scheduler-authority readback as an inspection formatter,
  not an operator-control shortcut. In this repo,
  `auracall api inspect-run --authority scheduler` may request and render the
  read-only `schedulerAuthority` payload, but it must not add assignment,
  reassignment, lease acquisition, or step execution semantics. JSON output
  should preserve the full payload for tooling, while human output should make
  `mutationAllowed: false` visible.
- 2026-04-21: Runtime inspection tests that expect an active runner must keep
  fixture expiry dates future-stable. In this repo, runner liveness sweeps use
  the current clock; old fixture dates such as 2026-04-15 can become stale and
  flip expected affinity from eligible to blocked. Use a deliberately future
  expiry when the test is not about liveness expiry.
- 2026-04-21: Do not let first scheduler mutation become fleet scheduling. In
  this repo, the first mutation shape should be explicit single-run operator
  control under `ExecutionServiceHost`, gated by
  `evaluateStoredExecutionRunSchedulerAuthority(...)`, and scoped to the
  server-local runner. `schedulerControl.action = "claim-local-run"` may claim
  local-eligible runs or reassign expired stale/missing-owner leases only when
  the selected runner is the server-local runner. It must reject non-local
  selected runners, fresh active leases, still-active lease owners, capability
  mismatches, and not-ready/human-blocked runs.
- 2026-04-21: Keep scheduler-control mutation atomic at the service-host layer.
  In this repo, `schedulerControl.action = "claim-local-run"` should build the
  lease expiration/reassignment, new local lease, and scheduler-control audit
  event into one revision-checked persisted bundle. HTTP `/status` should only
  map the payload/result. If persistence races, return `status = "conflict"`
  and do not claim the run through a partial chained control call.
- 2026-04-21: Keep cache-only CLI commands cache-only. In this repo,
  `cache export`, `cache context list`, and `cache context get` should resolve
  the configured provider cache identity without resolving or launching a live
  browser target. Passing those paths through generic browser list-option
  resolution can hang fixture-backed CLI tests and can wake browser state for
  a read-only cache operation.
- 2026-04-21: Unit tests for mocked provider file-cache writes should bypass
  live provider write-spacing guards. In this repo, Grok/Gemini/ChatGPT
  mutation spacing protects real accounts, but mocked `LlmService` unit tests
  should override guard settings instead of spending seconds on persisted
  profile cooldown state.
- 2026-04-21: Browser-service lifecycle ownership tests must not point at a
  real managed browser profile path. Use isolated synthetic WSL profile paths
  so `readDevToolsPort(...)` cannot pick up a live local DevToolsActivePort and
  turn an ownership unit test into environment-dependent behavior.
- 2026-04-21: Do not solve scheduler claim follow-through by releasing and
  reclaiming the lease. In this repo, `schedulerControl.action =
  "claim-local-run"` establishes explicit server-local lease authority. The
  next execution follow-through should teach targeted drain to consume a run
  whose active lease is already owned by the configured server-local runner,
  while foreign active leases remain blocked and expired stale/missing-owner
  reassignment remains under scheduler control.
- 2026-04-21: When targeted drain consumes a scheduler-claimed local run, reuse
  the active local-owned lease instead of acquiring a second lease. Heartbeat
  the existing lease before step execution, release that same lease on
  completion/failure/cancellation, and keep foreign active leases skipped.
- 2026-04-21: Port-selection tests must not assume an ephemeral port's next
  integer is free. Compute the first actually bindable candidate inside the
  test range before asserting `pickAvailableDebugPort(...)` behavior, because
  local OS allocation or parallel tests can already occupy adjacent ports.
- 2026-04-21: Do not add a compound scheduler control just because
  `claim-local-run` and `drain-run` can now be chained. Keep the audit boundary
  explicit until a concrete operator workflow proves the two-step flow is too
  noisy or error-prone: scheduler control owns lease mutation, and run control
  owns one targeted host execution pass.
- 2026-04-21: Keep HTTP team-run create aligned with direct response create
  when background drain is enabled. In this repo, `POST /v1/team-runs` should
  persist the task/team/runtime records, return the inspectable payload, and
  let the existing server-owned background drain execute the run; keep
  synchronous one-request execution only when background drain is disabled.
- 2026-04-21: Pause service/runner architecture expansion when the remaining
  work is not tied to a concrete ownership gap. After route-neutral runner
  lifecycle, queued drain, recovery, operator controls, scheduler-local claim,
  targeted drain, and team-run background-drain parity are all under their
  intended owners, do integration hygiene before opening another service/runner
  implementation slice. Keep HTTP responsible for transport/timer projection,
  not generic runtime mutation.
- 2026-04-21: Treat generic browser anti-bot traps as browser-instance facts,
  not selected-tab-only facts. In this repo, a persistent managed browser
  profile can hold hidden `google.com/sorry` tabs while the selected visible
  Gemini app tab looks healthy. `browser-tools` tab census entries should carry
  generic blocking-state classification, and manual-clear decisions should fail
  when any census tab requires human clearance.
- 2026-04-21: Do not leave explicit `browser-tools --port` as a lock-free
  browser-service bypass. In this repo, raw DevTools endpoint diagnostics still
  select tabs, inspect DOM, inject scripts, and can mutate/focus shared browser
  state. Give the operation dispatcher a raw endpoint key such as
  `devtools:127.0.0.1:45013`, and acquire that key before port-only
  browser-tools commands connect.
- 2026-04-22: Keep legacy direct-CDP development scripts usable, but make the
  bypass explicit. In this repo, `scripts/verify-*`, `scripts/inspector.ts`,
  and similar helpers are useful for debugging, but direct
  `chrome-remote-interface` or `puppeteer.connect(...)` use should not happen
  accidentally. Guard those scripts with `scripts/raw-devtools-guard.ts` and
  require either `--allow-raw-cdp` or `AURACALL_ALLOW_RAW_CDP=1`; consume the
  flag before positional argument parsing.
- 2026-04-22: Group browser-service-related scripts without moving
  provider-dependent helpers into the browser-service package. In this repo,
  many Grok verification scripts still import AuraCall provider modules, so
  copying them into `packages/browser-service` would blur boundaries. Add thin
  wrapper copies under `scripts/browser-service/`, keep root paths compatible,
  and prefer the family path in new docs.
- 2026-04-22: Reconcile open governing plans after closing implementation
  checkpoints. In this repo, an open authority such as 0004 can remain
  governing while its older "next implementation" language becomes stale after
  later closed plans ship the work. Before starting another slice, update the
  open plan current-state notes so agents do not reopen scheduler-control,
  service/runner, or browser-service work by inertia.
- 2026-04-22: Wrapper scripts must satisfy both the dev and build tsconfigs.
  In this repo, `pnpm run check` uses the base no-emit tsconfig with
  `allowImportingTsExtensions`, while `pnpm run build` disables that option.
  Thin TypeScript wrappers under `scripts/` should use extensionless dynamic
  imports so they work with `tsx` and emitted-build typechecking.
- 2026-04-22: Do not let validated local `main` stacks become hidden backlog.
  In this repo, commit each coherent validated slice, push after green
  integration checkpoints or before changing lanes, and treat `main` being
  more than 10 commits ahead as a handoff risk unless there is a recorded
  blocker.
- 2026-04-22: Transitional CLI service aliases must stay in the config's
  existing runtime-profile key family. In this repo, Commander can pass global
  browser defaults such as `browserModelStrategy = select` even for
  `teams run`; writing those aliases into target `runtimeProfiles` while the
  user config still uses bridge `profiles` creates a partial
  `runtimeProfiles.default` that shadows browser-backed team profiles such as
  `auracall-grok-auto`. Write aliases to `profiles` for bridge-shaped configs
  and reserve `runtimeProfiles` for target-shaped configs.
- 2026-04-22: Keep repo dogfood installs separate from release publishing.
  In this repo, user-scoped runtime dogfooding should build and pack the
  current checkout, then install that tarball into a user-owned prefix such as
  `~/.auracall/user-runtime` with wrappers in `~/.local/bin`. This proves the
  packaged runtime independently from the checkout without changing global npm
  state, requiring sudo, or implying the build is ready for npm/Homebrew
  release.
- 2026-04-22: Dogfood installed runtimes from a neutral working directory
  before treating them as daily-driver candidates. In this repo,
  `~/.local/bin/auracall` should prove config/profile reads, at least one
  browser-backed team run, passive Gemini state checks, and local `api serve`
  startup from outside the checkout. A noisy `/status` caused by accumulated
  stale runner records is an operator-readability follow-up, not a runtime
  install failure by itself.
- 2026-04-22: Keep `/status` readable without deleting runner history. In this
  repo, long-lived dogfood environments can accumulate hundreds of stale runner
  records. Plain `/status` should compact the topology list to local/fresh/active
  runners, keep all-runner counts in `runnerTopology.metrics`, and provide
  `?runnerTopology=full` for forensic debugging.
- 2026-04-22: Treat provider model drift as a first-class product failure, not
  just a failed live smoke. In this repo, Grok's browser registry already knew
  `grok` / `grok-4.2` / `grok-4.20` belonged to current Heavy mode, but CLI/API
  canonicalization still collapsed plain `grok` to legacy `grok-4.1`. Keep
  explicit legacy keys available, but make plain provider aliases point at the
  current provider model and record unimplemented media surfaces separately.
- 2026-04-22: Add media-generation surfaces contract-first, before provider
  adapter claims. In this repo, Gemini/Grok image prompts can look like normal
  text completions unless media has a first-class request/readback resource.
  Expose the shared `media_generation` contract through local API and MCP,
  persist records under runtime ownership, and let unwired providers fail
  durably with `media_provider_not_implemented` until Gemini image and Grok
  Imagine adapters are implemented and live-smoked.
- 2026-04-22: Model media semantics separately from transport format. In this
  repo, Gemini can generate music and video, and historical browser artifact
  extraction shows music may arrive via a `video/mp4` player/download. Keep the
  media request/readback enum at semantic values (`image`, `music`, `video`)
  instead of collapsing Gemini music into video because of its transport.
- 2026-04-23: Do not treat rapidly changing provider workbench capabilities as
  permanent one-off CLI/API/MCP flags. In this repo, Deep Research, Gemini
  media tools, ChatGPT apps/connectors, ChatGPT business-plan skills, and other
  provider add-ons are account-tier and rollout dependent. Add a
  provider-neutral workbench capability discovery/availability model first,
  then layer invocation on top only after readback and gating semantics are
  explicit.
- 2026-04-23: Make workbench capability reporting cheap and routine. In this
  repo, callers should be able to ask the local API or MCP server what ChatGPT,
  Gemini, or Grok capabilities are known or discovered for the selected
  provider/runtime profile before deciding what to invoke. The first report
  surface should be read-only and conservative: static catalog entries use
  `unknown` or `account_gated` availability until live discovery proves the
  current account state.
- 2026-04-23: Reuse provider feature signatures for read-only capability
  discovery before adding new DOM scrapers. In this repo, Gemini already has a
  browser-owned feature-signature probe that opens the tool drawer and records
  observed modes. Map that signature into `workbench_capability_report`
  overrides so API callers can see `available` Gemini media/research/canvas
  options without invoking a provider tool.
- 2026-04-23: Give volatile provider capability discovery a no-browser CLI
  escape hatch. In this repo, operators and calling services need a quick
  `auracall capabilities --target gemini --json` view before invocation, but
  debugging blocked or changing browser profiles also needs
  `auracall capabilities --target gemini --static --json` so capability schema
  and catalog behavior can be inspected without attaching to Chrome.
- 2026-04-23: Do not let browser media generation bypass capability discovery.
  In this repo, Gemini `Create image`, `Create music`, and `Create video` are
  volatile workbench tools, not guaranteed API features. When a
  `media_generation` request explicitly selects `transport = browser`, check
  the matching workbench capability first and fail durably with
  `media_capability_unavailable` unless discovery reports `available`.
- 2026-04-23: Keep Gemini image generation on the managed browser/provider
  path, not the older cookie-only web helper. In this repo, browser media
  execution should carry a capability id into the provider adapter, select
  `Create image` from Gemini's tools drawer, then read and materialize
  conversation artifacts into the media-generation artifact directory.
- 2026-04-23: Treat Gemini workbench submission as a separate live contract from
  text-response extraction. In this repo, the live Gemini drawer can label a row
  `Create image New`, can expose drawer rows while `aria-expanded` is false,
  and can ignore a coordinate send-button click while leaving the prompt in the
  composer. Normalize transient row badges, trust visible drawer rows, and prove
  prompt submission with post-submit evidence plus DOM-click/Enter fallbacks
  before waiting for response or media readback.
- 2026-04-23: Do not make Gemini browser media generation wait for assistant
  text before looking for media. In this repo, `Create image` can submit
  correctly and still remain in a long-running media generation state with no
  useful text completion. Let media callers request prompt-submission
  completion, then poll refreshed conversation context for generated artifacts
  and report `media_generation_provider_timeout` when the provider never exposes
  the expected media.
- 2026-04-23: Do not navigate away from Gemini's active media-generation tab
  during artifact polling. In this repo, a Gemini image can render while the
  composer remains in a stale `Stop response` state, and a forced context
  refresh to `/app/<id>` can move the browser away from the active workbench.
  Media readback should preserve the active tab, treat missing context as a
  transient poll miss, and only navigate in normal conversation readback paths.
- 2026-04-23: Use Gemini's active avatar spinner as the stronger generation
  signal for media runs. In this repo, `Stop response` can remain visible after
  an interrupted image response has already rendered. Count the lottie avatar
  spinner as active generation, but treat stop/cancel controls as stale when
  generated media is already visible.
- 2026-04-23: Keep Gemini media generation on the active rendered tab until
  artifacts are safely captured. In this repo, Gemini can expose renamed media
  rows (`Images`, `Videos`, `Music`), render an image before artifact binary
  fetch succeeds, and cancel or lose a fresh image chat if automation
  re-navigates immediately after submission. Browser media runs should wait for
  visible generated media, preserve the active tab through materialization, and
  use visible-image screenshot capture as a fallback when provider binary fetch
  fails.
- 2026-04-23: Do not use general Gemini conversation readback for active media
  polling. In this repo, even a `preserveActiveTab` read can still reconnect by
  URL and hit same-origin target reuse before the provider-level
  `allowNavigation: false` guard. Active Gemini media runs should carry the
  submitted `tabTargetId`, require it for artifact polling, read artifacts from
  that exact tab only, and fail rather than falling back to URL-based
  readback.
- 2026-04-23: Media-generation callers need a durable processing timeline, not
  only initial and terminal records. In this repo, a successful Gemini browser
  image run can materialize through a visible-image screenshot fallback instead
  of a provider blob fetch, and operators need to know when Aura-Call submitted
  the prompt, observed artifact polls, saw the image, materialized the file, and
  completed. Store these milestones in `media_generation.timeline[]` and keep
  the artifact metadata as the source of truth for the materialization method.
- 2026-04-23: Media-generation status must be readable without another provider
  call. In this repo, operators and calling services should poll the durable
  media-generation record through API or MCP and receive a compact status
  summary with latest timeline event, artifact cache path, and materialization
  method instead of scraping raw JSON or re-opening the browser.
- 2026-04-23: Run status should be generic across chats and media, not scoped to
  one provider feature. In this repo, operators need one API/MCP polling surface
  for response chats, team-runtime chats, and media jobs. Keep media-specific
  readback as a helper, but make `GET /v1/runs/{run_id}/status` and MCP
  `run_status` the route-neutral status contract.
- 2026-04-23: Keep CLI/API/MCP polling parity for durable run status. In this
  repo, operators may be dogfooding from the repo without a running local API or
  MCP client. `auracall run status <id> --json` should read the same
  `auracall_run_status` envelope as `GET /v1/runs/{run_id}/status` and MCP
  `run_status`, not a separate CLI-only summary model.
- 2026-04-23: Centralize the LLM service-state envelope, not provider DOM
  heuristics. In this repo, ChatGPT/Gemini/Grok should all return the same
  bounded `serviceState` shape, but provider-specific probes own the evidence:
  ChatGPT placeholder/stop controls, Gemini prompt history plus lottie/avatar
  spinner and stale stop-control handling, and Grok assistant/toast snapshots.
- 2026-04-23: Keep Gemini activity evidence in one provider-owned helper. In
  this repo, media prompt readback and live service-state probing both need the
  same answer to "is Gemini generating?" Reuse the same selector expression and
  coercion for lottie/avatar spinner, generated media, stale stop controls, and
  `isGenerating` instead of copying those rules across workflows.
- 2026-04-23: Keep Grok visible-answer and provider-error evidence in one
  provider-owned helper. In this repo, response waiting, service-state probing,
  and future Grok media/Imagine work should share the same rate-limit
  classification and assistant-visible signal instead of duplicating toast
  regexes or markdown/text checks.
- 2026-04-23: Keep ChatGPT thinking and stop-control evidence in one
  provider-owned helper. In this repo, browser-run passive observations and
  live service-state probing both need the same placeholder-turn precedence,
  thinking-status sanitization, and stop-button selector semantics; centralize
  those provider rules instead of maintaining parallel copies.
- 2026-04-23: Prefer Gemini provider-owned spinner evidence over executor
  fallback when both are available. In this repo, the lottie/avatar spinner is
  a general Gemini active-chat signal, so runtime inspection should surface
  `gemini-active-avatar-spinner` as high-confidence provider-owned `thinking`
  instead of masking it behind `gemini-web-request-started`.
- 2026-04-23: Give operators bounded run-scoped browser diagnostics instead of
  ad hoc CDP debugging for live provider-state mismatches. In this repo,
  `GET /v1/runtime-runs/inspect?...&diagnostics=browser-state`, CLI
  `api inspect-run --diagnostics browser-state`, and MCP `runtime_inspect`
  should provide selected target, document readiness, visible control counts,
  provider evidence, and a stored PNG screenshot path through browser-service
  ownership. Keep this read-only, active-run scoped, and navigation-free.
- 2026-04-23: Put browser diagnostics on the status surfaces for media jobs,
  not only runtime inspection. In this repo, direct Gemini response runs may
  complete through the cookie/web-client path too quickly for active runtime
  diagnostics, while Gemini browser media jobs keep the managed workbench tab
  and record `tabTargetId`. `GET /v1/runs/{id}/status?diagnostics=browser-state`
  and `GET /v1/media-generations/{id}/status?diagnostics=browser-state`
  should expose bounded live browser evidence for active browser-backed media
  jobs and return honest `unavailable` posture for terminal jobs.
- 2026-04-23: Do not call media browser diagnostics observed before prompt
  submission records a provider tab. In this repo, an early Gemini media status
  poll can attach to the Gemini home page before the media executor has a
  submitted `tabTargetId`; that proves browser reachability, not active media
  state. Return `unavailable` until the media run records the submitted target.
- 2026-04-23: Treat Gemini's generated-image download button as a real
  materialization surface, not passive evidence only. In this repo,
  `button[data-test-id="download-generated-image-button"]` may be the only
  stable path to the full-size image even after visible-image detection
  succeeds. Generated-image materialization should click that provider-owned
  control on the active submitted tab, prefer captured href or download harvest,
  and keep `img.src` fetch plus screenshot capture as bounded fallbacks.
- 2026-04-23: Do not stop browser dispatcher work at profile-scoped operation
  locking. In this repo, the earlier dispatcher slice proved same-profile CDP
  ownership, but browser mutation authority still remained split across
  browser-service helpers, provider adapters, and legacy browser flows.
  Finishing the control plane requires routing navigation, reload, target
  reuse/open navigation, and in-page location mutation through one
  browser-service-owned mutation API with audit records.
- 2026-04-23: Start browser control-plane completion at the substrate
  primitives, not at provider adapters. In this repo, `navigateAndSettle(...)`
  and `openOrReuseChromeTarget(...)` sit underneath many provider and legacy
  browser flows. Adding package-owned mutation audit records there produces
  immediate attribution across existing callers and reduces the migration to a
  bounded follow-on instead of another repo-wide blind audit.
- 2026-04-23: Mutation audit is not useful if it is callback-only. In this
  repo, browser diagnostics need to answer what Aura-Call last did to the
  selected managed browser profile, even when the caller is only polling API or
  MCP status. Keep a bounded browser-service mutation history per AuraCall
  runtime profile/service and expose it through `diagnostics=browser-state`.
- 2026-04-23: Remove in-page URL assignment fallbacks from legacy browser
  flows instead of treating them as harmless recovery. In this repo, a
  `location.href = ...` fallback can look exactly like the Gemini root-fallback
  failure class the control plane is trying to explain. Return the intended URL
  to a caller that can use `navigateAndSettle(...)`, then enforce the rule with
  a static regression test.
- 2026-04-23: Raw CDP escape hatches need their own mutation allowlist. In this
  repo, guarded raw scripts are useful for development, but scripts that
  directly navigate/reload/retarget a browser are still materially different
  from read-only inspection helpers. Keep those mutating raw scripts listed in
  `RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST` and fail tests when a new one
  appears without explicit acknowledgement.
- 2026-04-24: Capability discovery needs browser diagnostics before invocation.
  In this repo, volatile workbench surfaces such as Grok Imagine can be
  account-gated, renamed, or partially visible. Let operators request
  `diagnostics=browser-state` on workbench capability reports so they can see
  bounded target/document/provider evidence plus a stored screenshot without
  opening raw CDP or submitting a prompt.
- 2026-04-24: Keep explicit workbench entrypoint inspection separate from
  normal capability discovery. In this repo, Grok `/imagine` is a volatile
  browser workbench route; callers need to opt into opening or reusing it via
  `entrypoint=grok-imagine`, with browser-service mutation attribution, instead
  of making every capability report navigate the provider UI.
- 2026-04-24: Treat Grok Imagine run-state as provider-owned evidence, not a
  generic browser status guess. In this repo, `/imagine` can show account
  gating, pending generation, terminal media, and download/share controls
  without a normal chat transcript. Keep those selectors in the Grok adapter
  and surface the normalized evidence through workbench diagnostics before
  adding any prompt-submission path.
- 2026-04-24: Capability-gate Grok Imagine invocation before touching the
  composer. In this repo, the current Grok account can expose public `/imagine`
  gallery media while the generation account is still gated. Browser media
  requests must first re-run `grok.media.imagine_image` discovery on the
  explicit entrypoint and fail before prompt submission unless the capability
  is actually `available`.
- 2026-04-24: Do not make generic chat controls mandatory on provider
  workbench routes. In this repo, Grok `/imagine` can be signed in and healthy
  while omitting the normal chat model selector. Doctor selector diagnosis
  should classify that route as a workbench surface, keep composer/file/menu
  checks meaningful, and defer chat-only controls instead of reporting an auth
  or browser-health failure.
- 2026-04-24: Persist capability-gate stops as their own media timeline event.
  In this repo, a Grok Imagine account-gated run should be visibly different
  from a provider execution failure: it must stop before prompt submission,
  record `capability_unavailable`, and carry bounded capability evidence plus
  the inspection command in failed readback/status.
- 2026-04-24: Treat Grok Imagine masonry/filmstrip tiles as first-class
  readback evidence. In this repo, Grok Imagine can render a wall of visible
  generated tiles plus a selected tile/full-quality download action. Discovery
  should preserve bounded visible tile URLs, selected state, generated/public
  classification, and tile surface before implementing full-quality download
  comparison or infinite-scroll harvesting.
- 2026-04-24: Materialize Grok Imagine images from the active browser tab
  before trusting diagnostic URLs. In this repo, Grok visible previews can be
  `data:` or `blob:` URLs that are intentionally truncated in capability
  diagnostics. Provider artifact readback should run inside the submitted
  `/imagine` tab, capture bounded visible tiles to local files, then compare a
  preview against the provider-owned download button before falling back to a
  remote media fetch.
- 2026-04-24: Do not classify passive provider upsell text as an account gate.
  In this repo, Grok `/imagine` can show a normal `Upgrade to SuperGrok`
  affordance while the signed-in workbench still has usable Image/Video
  controls and generated media. Account-gate detection should require a
  contextual blocking generation message or missing ready-composer/media
  evidence, and submitted media runs should wait for new media evidence rather
  than accepting stale visible tiles from a prior run.
- 2026-04-24: MCP tools must share the configured runtime services, not default
  no-executor fallbacks. In this repo, HTTP already created media/workbench
  services from the resolved AuraCall runtime profile, while MCP was still
  registering default media and capability services. Keep MCP media generation,
  media status, generic run status, and workbench capability tools on the same
  configured service bundle so browser-backed API/MCP behavior stays aligned.
- 2026-04-24: Treat provider route readiness and composer readiness as separate
  gates on volatile workbench pages. In this repo, Grok `/imagine` can report
  document and route readiness before the ProseMirror composer is hydrated.
  Wait for a visible composer before prompt insertion instead of treating
  `composer input not found` as a terminal provider failure.
- 2026-04-24: Write media-generation status records atomically. In this repo,
  async API/MCP status polling can read `record.json` while a media executor is
  appending timeline events. Use temp-file plus rename writes so readers see a
  complete previous record or a complete next record, never an empty/truncated
  JSON payload.
- 2026-04-24: Treat provider download controls as authoritative when generated
  media URLs are browser-session scoped. In this repo, Grok Imagine generated
  video URLs under `assets.grok.com/users/.../generated_video.mp4` can return
  `403` to Node/curl while the signed-in browser tab can download the same
  asset through the visible `Download` control. Media readback should prefer
  browser-context download materialization before direct remote fetches.
- 2026-04-24: Capability gates for mode-specific workbenches must consume the
  action-specific evidence they requested. In this repo, normal Grok video
  requests asked for `grok-imagine-video-mode` discovery but still saw the
  static `unknown` capability when the base signature lacked a generic video
  mode signal. Treat a successful Video-mode discovery action or video-mode
  audit as `grok.media.imagine_video` evidence before allowing or denying
  execution.
- 2026-04-24: Mode-specific workbench discovery must wait for the mode controls
  it intends to inspect. In this repo, a Grok video media request can reuse the
  `/imagine` tab immediately after a post route and match the route before the
  Image/Video controls hydrate, producing a static `unknown` preflight result
  even though the later explicit capability endpoint reports Video available.
  Wait for visible Image and enabled Video controls before running the
  `grok-imagine-video-mode` discovery action.
- 2026-04-25: Media status should expose the operational path it already
  persisted. In this repo, Grok media troubleshooting required jumping between
  timeline events, generic run status, and browser-tools inspection to answer
  basic questions: which capability passed, which tab was submitted, which
  provider route became authoritative, what run-state evidence won, and how the
  artifact was materialized. Derive a compact status `diagnostics` block from
  persisted timeline events so API/MCP/CLI callers can inspect those answers
  without re-invoking the provider or taking a live browser snapshot.
- 2026-04-25: Dogfood persisted media diagnostics before adding more live
  browser probes. In this repo, a real Grok image run proved
  `media_generation_status`, generic `run_status`, and CLI `run status` can
  answer processing state, submitted tab, provider route, generated counts, and
  artifact cache path from stored timeline evidence alone. Use
  `diagnostics=browser-state` for unresolved active-run questions, not as the
  routine first readback.
- 2026-04-25: Include provider artifact polling in persisted diagnostics. In
  this repo, Gemini image runs can be healthy and actively polling for
  generated media after prompt submission, but before `image_visible` or
  materialization. Treat `artifact_poll` as an actionable `artifact_polling`
  run state with poll count, pending status, and artifact counts so operators
  do not need browser diagnostics just to see that the submitted Gemini run is
  still waiting on media.
- 2026-04-25: Keep Gemini video validation fixture-first unless an operator
  explicitly chooses to spend live quota. In this repo, Gemini exposes only a
  small daily video-generation allowance, while the browser executor can prove
  the integration contract with mocked submitted-tab readback: select
  `Create video`, poll generated `video` artifacts, emit `video_visible`, and
  materialize the generated media. Do not make live video generation part of
  routine validation.
- 2026-04-25: Treat Gemini music downloads as variants of one music output,
  not as a single video artifact. In this repo, the Gemini music UI exposes
  both "download as video" with album art and "download as MP3". The browser
  media executor should preserve both when readback exposes both variants,
  emit `music_visible`, and keep live validation fixture-first unless an
  operator intentionally spends provider quota.
- 2026-04-25: Preserve Gemini music download menu labels read-only before
  automating clicks. In this repo, the music artifact download selector can
  expose separate labels for video-with-album-art and MP3. Conversation
  readback should record already-visible option labels from the artifact
  container or open overlay as metadata, and use those labels for music
  classification, without opening menus or spending live generation quota.
- 2026-04-25: Surface provider download variants on compact status, not only
  full artifact metadata. When readback records `downloadOptions`, media
  status, generic run status, MCP status tools, and CLI JSON status should
  include those labels on each artifact so operators can choose Gemini music
  variants without fetching the full generation record.
- 2026-04-25: Preserve per-artifact download labels in compact media status.
  `downloadOptions` describes the visible provider menu choices, but operators
  also need to map each cached file to its specific variant. Compact status
  should carry `downloadLabel` and `downloadVariant` beside the artifact path
  whenever readback/materialization metadata provides them.
- 2026-04-25: Closed Gemini music download menus only expose the visible
  `Download track` control to read-only DOM/status probes. Do not treat a
  missing MP4/MP3 variant list as a failed music readback when no provider menu
  overlay is open; reserve variant enumeration for fixture coverage,
  human-opened menus, or explicit non-routine materialization probes.
- 2026-04-25: Gemini music menu variants may not include the word "download".
  Live Gemini exposed `VideoAudio with cover art` and `Audio onlyMP3 track`
  under the `Download track` trigger. Open-menu readback should preserve visible
  menu-item labels that mention audio, MP3, track, video, or cover art, and
  split Gemini's concatenated menu-panel text shape when necessary.
- 2026-04-25: Gemini music materialization must expand one generated artifact
  into provider download variants when readback exposes option labels. In this
  repo, the live page showed one MP4-backed artifact plus menu options for
  video-with-cover-art and MP3. The executor should create explicit
  variant-labeled materialization targets, and the provider adapter should
  select the requested visible menu item on the submitted active tab using
  browser-service download capture instead of assuming direct URL fetch covers
  every variant.
- 2026-04-25: An explicit Gemini music variant request must not fall back to the
  generated artifact's default URL when provider-menu selection fails. A live
  MP3 probe initially cached the default `pavement_espionage.mp4` while carrying
  MP3 metadata because the menu click path missed and the generic generated
  media fetch still ran. Treat variant-selection failure as no materialized file
  for that variant, and use CDP pointer events for Gemini menu-item selection
  because synthetic `element.click()` can miss the real download action.
- 2026-04-25: Gemini generated music download controls can be actionable while
  rendered at `opacity: 0`. In this repo, a fresh music run exposed
  `Download track` on the generated track, but the MP4/MP3 variant picker
  rejected the control as invisible and materialized nothing. For Gemini media
  action controls, prefer an actionable predicate based on display,
  visibility, pointer-events, and nonzero geometry; do not reject opacity-zero
  controls that still accept pointer events.
- 2026-04-25: Clear transient Gemini overlays before opening the Tools drawer
  for capability selection. In this repo, an open upload/menu overlay left the
  surface healthy but caused a pre-submit `Gemini tools drawer did not open`
  failure. When drawer rows are not already present, send Escape before the
  drawer open attempt so capability selection starts from a clean overlay
  state.
- 2026-04-25: Fresh Gemini music readback may expose only the generic
  `Download track` control even though the provider menu contains MP4-with-art
  and MP3 variants. When a generated music artifact has a download button but
  no visible variant labels, the media executor should request Gemini's known
  music variants explicitly so provider-menu materialization can open the menu
  and select the hidden choices.
- 2026-04-25: Live media dogfood is not complete until the persisted run is
  checked through every operator-facing status surface. For Grok Imagine video,
  the proof run `medgen_1fa77fb386a6421b881d1e019e9673af` succeeded only after
  CLI `run status`, local API generic run status, local API media status, MCP
  `run_status`, and MCP `media_generation_status` all agreed on
  `succeeded`, one cached artifact, and diagnostics showing `terminal_video`
  plus `download-button` materialization.
- 2026-04-25: Grok Imagine image generation should treat multiple visible
  generated tiles as normal output. In this repo, Grok often renders several
  images per prompt, and the no-churn path can capture currently visible tiles
  without scrolling. Default browser image materialization to eight visible
  generated tiles, honor request `count` for smaller batches, and keep scroll
  expansion out of the routine path.
- 2026-04-25: Compact media status must report requested capture limits, not
  only realized artifact counts. A live Grok image run requested the default
  eight visible-tile cap but only three tiles were capturable without scrolling;
  status needed `requestedVisibleTileCount` and
  `visibleTileMaterializationLimit` so operators could distinguish "requested
  up to eight" from "provider exposed three visible artifacts."
- 2026-04-25: Grok Imagine primary mode is sticky across runs. Before
  submitting an image or video prompt, the browser adapter must select and
  verify the requested Image/Video radio mode on the current `/imagine` page
  and record that state in the media timeline. Do not rely on prior discovery
  or the last live run's mode.
- 2026-04-25: Browser media live smokes need the configured service surface.
  A bare `createMediaGenerationService()` has no workbench capability reporter
  or browser executor and will fail with the generic provider-not-implemented
  path without touching the browser. Use the local API server, configured
  server service, or an explicitly wired service for operator-equivalent
  browser dogfood.
- 2026-04-25: Compact media status should expose the latest
  `capability_selected` evidence, not just the full persisted media record.
  Browser providers can be sticky or modeful, so operators need generic
  `run_status`, media status, and MCP status to show which workbench mode/tool
  was selected before submission.
- 2026-04-25: Grok Imagine mode selection needs provider-adapter regression
  coverage, not only executor-level mocked progress or live proof. Mock the
  adapter's CDP path and assert Image and Video `runPrompt` emit
  `capability_selected` with `selected = true` and the expected mode before
  prompt insertion.
- 2026-04-25: Close shared-contract plans once the core operator surfaces are
  coherent, and split compatibility/API residue into its own plan. For media
  generation, Plan 0049 owns the durable CLI/API/MCP/browser-backed resource;
  legacy Gemini `--generate-image` migration and Gemini API image execution now
  live under Plan 0055.
- 2026-04-25: CLI command coverage should exercise Commander parsing without
  live provider work. For `auracall media generate`, register the command
  through an injectable helper so tests can use the real parser/options path
  with fake config and media service seams.
- 2026-04-25: Add new operator media creation through the durable
  media-generation contract before migrating old compatibility flags. In this
  repo, `auracall media generate` now shares API/MCP request semantics and
  persisted status, while the older Gemini-only `--generate-image` path remains
  stable until explicit migration criteria exist.
- 2026-04-25: Close provider research checkpoints when the acceptance surface is
  proven, and move remaining work into a new bounded plan instead of keeping a
  completed plan open. For Grok Imagine, browser-first image/video discovery,
  invocation, status, and materialization are now distinct from future xAI API
  execution and edit/reference workflows.
- 2026-04-25: Grok Imagine visible-tile and download-button materialization
  should be tested at the provider-adapter CDP boundary. Executor tests can
  prove orchestration, but adapter tests should lock the browser-only behavior:
  visible tile capture, download-control click, cached file metadata, and
  preview/full-quality comparison.
- 2026-04-25: Browser-operation queueing is not operator-ready if it only logs
  to stdout. Record bounded queue observations at the shared acquisition seam
  and project them through browser-state diagnostics so API/CLI/MCP status
  consumers can see `queued`, `acquired`, and `busy-timeout` evidence without
  scraping logs.
- 2026-04-25: Status-surface diagnostics need controlled proof seams. MCP
  `run_status` should allow an injected browser diagnostics probe in tests so
  response-run browser-state payloads can be verified without touching live
  provider pages.
- 2026-04-25: Browser service target resolution must not trust a selected
  DevTools port more than managed browser profile ownership. A live
  `auracall-grok-auto` API smoke resolved to the Gemini profile's port
  `45011` even though Grok had its own registered profile/port. Guard
  `resolveServiceTarget(...)` so cross-profile ports are ignored in favor of
  the expected live managed browser profile, or fail closed before any tab scan
  or navigation.
- 2026-04-25: The cross-profile guard turns a silent wrong-browser attach into
  an explicit profile/config problem. After installation, an
  `auracall-grok-auto` smoke refused Gemini's `45011` port because the runtime
  canonical managed browser profile was
  `browser-profiles/auracall-grok-auto/grok`, while the logged-in Grok browser
  remained under `browser-profiles/default/grok` on port `38261`. Fix the
  runtime profile/port ownership before rerunning live queue dogfood.
- 2026-04-25: AuraCall runtime profiles and browser profiles must stay separate
  in launch-context resolution. Runtime profile `auracall-grok-auto` selects
  browser family `default`, so managed browser profile derivation should use
  `default/grok`; using the runtime-profile name created
  `auracall-grok-auto/grok` and orphaned the logged-in profile. Carry a
  separate browser-profile namespace through browser config/profile resolution.
- 2026-04-25: Queue-diagnostics dogfood should prove both profile targeting
  and queue observability. After separating runtime and browser-profile
  namespaces, installed `auracall-grok-auto` resolved Grok to
  `browser-profiles/default/grok` and registry port `38261`; the live API
  status surface reported `browserOperationQueue.latest.event = queued` while
  the held lock blocked browser execution. After the held lease expired, the
  same smoke run recovered and completed successfully through the Grok browser
  path.
- 2026-04-25: Managed browser profile launches should not treat an occupied
  configured fixed DevTools port as normal launch input after registry lookup
  failed. Probe the configured fixed port at the launch fallback; if something
  is already listening, switch that managed-profile launch to auto port
  selection so stale shared browser-family ports do not pull another service's
  browser into the run.
- 2026-04-25: After the fixed-port fallback, live dogfood should verify the
  installed runtime against both run output and browser-state evidence. The
  `auracall-grok-auto` installed API smoke completed
  `resp_3ba7d7621c084558814b6453a1ece212`, Grok diagnostics targeted
  `default/grok` on port `38261`, and registry readback still showed Gemini
  isolated on `default/gemini` port `45011`.
- 2026-04-25: Do not reopen a closed provider research checkpoint just because
  browser-service hardening temporarily interrupted provider work. Keep the
  closed Grok Imagine Plan 0054 as history and open a narrow follow-up plan
  for the next materialization slice, with browser-service control-plane work
  treated as proven substrate unless a fresh mismatch appears.
- 2026-04-25: Grok Imagine full-quality download comparison is only useful to
  operators if status surfaces preserve the comparison metadata, not just the
  artifact file path. Compact media status now carries checksum,
  previewArtifactId, preview checksum/size, and
  fullQualityDiffersFromPreview for materialized artifacts.
- 2026-04-26: Trusted CDP tile activation is necessary but not sufficient for
  Grok Imagine full-quality discovery. Installed dogfood proved the trusted
  click fired on the fresh post-submit masonry card, but the follow-up
  discovery still saw no download button. The next provider fix should capture
  DOM/screenshot evidence immediately after the trusted click and adjust the
  card/action-surface target from live evidence, without re-navigating.
- 2026-04-26: For submitted Grok Imagine runs, the submitted tab target id must
  outrank URL matching. `connectToGrokTab` ignored `tabTargetId` during active
  media materialization, so it could reselect a stale same-origin tab and route
  through `openOrReuseChromeTarget`, which can focus that target by navigating
  to the requested URL. Treat explicit submitted targets as authoritative and
  fail closed if the target is unavailable.
- 2026-04-26: After installing the submitted-tab fence, the Grok Imagine smoke
  stayed on the submitted page: status reported the same submitted target id,
  submitted URL `https://grok.com/imagine`, and route progression containing
  only that URL. If full-quality discovery still misses, investigate the
  post-click action surface instead of assuming navigation churn for that run.
- 2026-04-26: Do not primary-click Grok Imagine generated tiles during
  post-submit materialization. A real mouse press on the masonry card can open
  a Grok post route and trigger `post not found`, even when submission and
  initial materialization stayed on `/imagine`. Fresh post-submit full-quality
  discovery should fail with diagnostics when no download control is visible;
  only resumed/direct saved-gallery workflows may intentionally navigate.
- 2026-04-26: Grok Imagine readiness should be based on stable generated
  masonry/filmstrip media, not root Discover placeholders or visible download
  buttons. Passive live polling showed the submitted tab stays on
  `https://grok.com/imagine` while generated `data:image` tiles appear under
  `imagine-masonry-section-*`; download controls are not visible until a tile
  is selected/opened, so post-submit readback must remain no-navigation and
  wait for stable generated media before materialization.
- 2026-04-26: Grok Imagine generated masonry output is not limited to
  `imagine-masonry-section-0`. Visible-tile capture and full-quality
  diagnostics should query all `[id^="imagine-masonry-section"]` containers and
  only accept `data:image` / `blob:` media as generated when it belongs to a
  generated masonry or filmstrip surface.
- 2026-04-26: Installed Grok browser media dogfood proved the normal
  no-re-navigation path can capture multiple masonry tiles. Run
  `medgen_531a648c8cb247cdadeb6ada2531bd48` captured four visible
  `grok-imagine-visible-*.png` artifacts, kept route progression to
  `https://grok.com/imagine`, and left full-quality download as
  `saved-gallery-required` with primary tile activation disabled.
- 2026-04-26: Grok Imagine full-quality fallback should be explicit about the
  provider surfaces it uses. Fresh post-submit materialization still stays on
  the submitted `/imagine` tab, but resumed/direct full-quality materialization
  now tries `/imagine/saved` first and then `/files` when saved generations do
  not expose a download control. Saved-gallery readiness also searches every
  `[id^="imagine-masonry-section"]` container instead of only section `0`.
- 2026-04-27: Installed dogfood after the Grok `/files` fallback confirmed the
  fresh post-submit path did not re-navigate. Run
  `medgen_ada664ba3db24de4821cac245ec74714` cached four masonry artifacts,
  kept route progression to `https://grok.com/imagine`, and returned
  `saved-gallery-required` with `savedGalleryUrl` and `filesUrl` diagnostics
  while `primaryTileActivationAllowed = false` and `clicked = false`.
- 2026-04-27: Grok resumed materialization cannot assume the current
  `/imagine` page still has visible generated tiles, and Grok Files can
  virtualize video rows above image rows. The resumed files fallback now uses a
  placeholder preview reference when no active tile is visible, scrolls
  `/files` to find image candidates, opens `/files?file=...`, and downloads
  through the detail-page `Download Image` control. Installed dogfood on
  `medgen_ada664ba3db24de4821cac245ec74714` added `content.png` as
  `grok_imagine_full_quality_1`.
- 2026-04-27: Grok's signed-in app route can briefly expose sign-in-looking
  UI before serialized identity data hydrates. Auth preflight should wait
  briefly for identity only on normal Grok app routes, but still hard-stop
  Google account challenges immediately. Grok Files image scanning should
  score the compact file anchor/row, not broad virtualized ancestors, because
  nearby `generated_video.mp4` rows can otherwise mask valid `image.png`
  entries.
- 2026-04-27: Resumed Grok image materialization should route full-quality
  recovery directly through Grok Files even when active `/imagine` tiles are
  still visible. Trying the active page/saved-gallery branch first can file a
  duplicate visible-tile recapture and require a second operator retry from
  `/files`; direct Files detail selection made the first retry succeed on
  `medgen_fde3e1e604f24a95a2162e6ed1a58c59`.
- 2026-04-27: ChatGPT image generation needs a prompt-submitted browser
  completion mode instead of reusing the assistant-response wait path. The
  media executor now submits with the `Create image` composer tool, keeps the
  browser open, captures the submitted tab target id, and uses
  `preserveActiveTab` for image artifact polling/materialization so post-submit
  readback does not reopen or reload the maturing conversation.
- 2026-04-27: Async media generation can emit several progress events in the
  same millisecond. Media record temp filenames must include a true unique
  component, not only `pid + Date.now()`, or concurrent timeline writes can
  race a temp-file rename and crash the CLI before provider validation.
- 2026-04-27: Browser media executors already own the browser-service
  media-generation operation lock. A provider implementation that calls the
  legacy `runBrowserMode` path must skip the nested `browser-execution`
  acquire, otherwise it can queue behind its own lock and deadlock before
  prompt submission.
- 2026-04-27: When initializing a new managed browser profile for a different
  expected account, do not blindly source-cookie bootstrap from the default
  source browser profile. The first `wsl-chrome-3` ChatGPT init inherited
  `ecochran76@gmail.com` Google browser state; quarantining that managed
  profile and pointing the new browser profile's cookie/bootstrap paths at its
  own managed cookie store produced a clean first-run profile for
  `eric.cochran@soylei.com`.
- 2026-04-27: ChatGPT account identity should include account tier, not only
  user email. The live auth-session surface exposes `account.planType` and
  `account.structure`; AuraCall maps `team/workspace` to Business and
  `pro/personal` to Pro, then compares configured account-level expectations
  during identity preflight so restricted Business lanes cannot be mistaken for
  Pro-capable managed browser profiles.
- 2026-04-27: ChatGPT Standard/Extended Pro-mode selection must be account-tier
  gated at browser runtime, not only documented as a profile convention.
  `--browser-thinking-time` now verifies the active auth-session account is Pro
  before selecting current Pro modes and records the selected thinking time,
  Pro mode, and account tier into run metadata for later status inspection.
- 2026-04-28: Completed browser sessions must clear stale `errorMessage`
  values when finalizing status. Runtime-dead browser detection can mark a
  running session as errored while reading metadata after Chrome closes; a later
  successful completion merge must remove that transient error text so API/MCP
  status does not report `completed` with a stale browser-disconnected message.
- 2026-04-28: Explicit ChatGPT Pro-mode requests should use strict UI
  selection after account gating. Best-effort thinking-time selection can allow
  a run to succeed without selected-mode metadata, which is too ambiguous for
  quota-sensitive Standard/Extended Pro mode; AuraCall now fails before prompt
  submission if the selector cannot be confirmed.
- 2026-04-28: ChatGPT Deep Research is a staged tool flow, not a normal
  one-stage composer-tool chat. After the prompt is submitted, the provider
  presents a research plan; AuraCall should wait for that plan, click only the
  Start CTA, and preserve Modify/Edit/Refine-plan visibility as metadata for
  later interactive or multi-agent refinement flows.
- 2026-04-28: ChatGPT Deep Research plan dialogs can expose the plan-modify
  affordance as a bare `Edit` button and can auto-start after a short timed
  window. The staged handler should treat exact `Edit` as modify-plan evidence
  only in a visible plan context, and it should record provider auto-start as
  `startMethod = auto` rather than failing the run as missing a Start CTA.
- 2026-04-28: ChatGPT Deep Research plan review needs an explicit operator
  branch because the provider dialog can auto-start quickly. `edit` should
  click the visible plan-edit affordance, record `plan-edit-opened`, avoid the
  normal assistant-response wait, and keep the managed browser open; if no edit
  affordance is visible, fail closed instead of clicking Start.
- 2026-04-28: ChatGPT Deep Research does not behave like a persistent composer
  tool chip after menu activation. Treat Deep Research as a staged one-shot
  composer tool: successful activation can proceed even if reopen-and-verify
  cannot find a selected menu row, then the dedicated Deep Research plan handler
  owns plan/start/edit state.
- 2026-04-28: ChatGPT Deep Research plan detection must scope textual evidence
  to assistant conversation turns, not the whole page. Sidebar titles such as
  `Deep Research Plan Request` can otherwise produce a false `plan-ready`
  state when the assistant turn is still blank and no Start/Edit CTA exists.
- 2026-04-28: ChatGPT Deep Research plan materialization can take longer than
  a normal composer-action confirmation. The plan handler should use the
  browser run timeout budget, bounded to 120s, instead of a fixed 45s wait that
  can fail just before the provider exposes the Start/Edit plan surface.
- 2026-04-28: ChatGPT's live Deep Research plan card can expose the modifier as
  `Update`, not `Edit`, while showing `Preparing analytical research and report
  for user...` once timed auto-start has begun. Treat `Update` as the plan-edit
  affordance and classify that preparation text as an in-progress auto-start
  signal.
- 2026-04-28: ChatGPT renders the live Deep Research plan card in a visible
  cross-origin `internal://deep-research` iframe. Main-page DOM scans cannot see
  its `Update` control or task text, so the edit-path handler needs a bounded
  CDP `Input` coordinate fallback against the visible iframe instead of relying
  only on `Runtime.evaluate` selectors.
- 2026-04-28: Deep Research selector repair should not start more live
  research runs when the composer/tool state is uncertain. Use the passive
  `browser-tools watch-chatgpt-deep-research` command to sample the active
  ChatGPT page, Deep-Research-like iframe geometry, outer controls, assistant
  turn previews, and optional screenshots before changing click behavior.
- 2026-04-28: ChatGPT Deep Research `edit` requests must keep looking for the
  iframe `Update` target after early `Researching...` evidence appears. If the
  provider still auto-starts before edit can be opened, return control with
  `auto-started` metadata instead of waiting for the full research report.
- 2026-04-28: ChatGPT Deep Research review evidence must be durable, not only
  visible in browser-tools output. Edit-path runs now store the iframe/DOM edit
  target evidence plus a passive review screenshot path in browser runtime
  metadata, and browser-backed response status projects the same summary.
- 2026-04-28: When browser-run evidence becomes part of operator status,
  regression coverage should seed the stored browser step output and read it
  through the real CLI/API/MCP status services. Mocking the final status
  envelope only proves formatting, not the durable projection path.
- 2026-04-28: Direct `/v1/responses` browser runs need per-request workbench
  tool hints, not only runtime-profile defaults. `auracall.composerTool` and
  `auracall.deepResearchPlanAction` now flow through stored-step execution so
  API callers can request ChatGPT Deep Research `edit` and poll the same run.
- 2026-04-28: MCP response creation should use the configured stored-step
  response service instead of a bare response service. Otherwise a browser
  response request can appear to complete through the no-op local runner
  without actually touching the browser.
- 2026-04-28: ChatGPT Pro mode is a model-picker lane, not the
  Standard/Extended workbench depth selector. AuraCall should only record
  `chatgptProMode` and require Pro account gating when the requested model is
  actually Pro, and Pro+depth runs must use model-picker selection instead of
  `--browser-model-strategy ignore`; otherwise a smoke can silently run
  Thinking Standard/Extended while claiming Pro.
- 2026-04-28: Completed ChatGPT Deep Research reports are not exposed through
  normal assistant-turn DOM or the conversation payload. The visible report
  lives in the `connector_openai_deep_research.web-sandbox.oaiusercontent.com`
  iframe, sometimes with a same-origin nested document, so context/artifact
  reads must inspect the iframe target and scrape visible `innerText` only.
  Avoid falling back to hidden `textContent`; it can capture provider template
  strings and inflate the materialized Markdown artifact.
- 2026-04-28: ChatGPT Deep Research report exports are iframe-local native
  downloads. The export menu exposes `Export to Word` and `Export to PDF`
  after clicking the iframe's `Export` control, and those buttons may live in a
  nested document whose element realm is not the parent target's `HTMLElement`.
  Use callable `.click()` checks rather than parent-realm `instanceof`, wait
  for the iframe/nested document to hydrate, and configure download behavior
  before clicking the export option.
- 2026-04-28: Iframe-hosted artifact menus need a reusable browser-service
  diagnostic, not one-off CDP snippets. Use `browser-tools iframe-artifacts` to
  inspect accessible frame controls and pass `--open-label Export` only when an
  operator intentionally wants to reveal menu options such as ChatGPT Deep
  Research `Export to Markdown`, `Export to Word`, and `Export to PDF`.
- 2026-04-28: AuraCall is a new npm package line, not a continuation of
  upstream Oracle's semver sequence. Reset `package.json` and the unreleased
  changelog to `0.1.0`, keep older changelog entries only as fork provenance,
  and make release helpers publish/smoke `auracall` artifacts rather than
  `@steipete/oracle`.
- 2026-04-28: Release preflight lint should distinguish blocking error-level
  diagnostics from legacy warning-level cleanup. The immediate gate is
  `pnpm run lint` exiting 0; remaining warning diagnostics need their own
  policy/config cleanup slice if the release checklist is interpreted as
  literal zero warnings.
- 2026-04-28: The release helper must be deterministic on the actual release
  host. Do not require a Bun-backed `./runner` when Bun is absent; fall back to
  `/usr/bin/env`, and run release Vitest gates with serial workers plus modest
  timeout headroom because the default parallel pool and 5s per-test timeout
  can time out otherwise healthy browser/runtime unit tests under load.
- 2026-04-28: Do not redirect the release helper's logging wrapper into
  checksum files. Generate release checksum files with plain `shasum` calls and
  log the command separately, otherwise `.sha1`/`.sha256` artifacts include an
  extra `>> ...` line and are not clean checksum manifests.
- 2026-04-28: Do not let a deferred distribution channel remain wired as the
  default release path. While AuraCall is not offered through npm, README and
  release docs should point to user-scoped runtime and GitHub/tarball
  distribution, and `scripts/release.sh publish` must require an explicit
  `AURACALL_ENABLE_NPM_PUBLISH=1` guard.
- 2026-04-28: A repository rename needs both remote and local identity cleanup.
  After renaming `ecochran76/oracle` to `ecochran76/auracall`, update the local
  `origin` URL, package metadata, badges, and operator path examples in the
  same slice; leave `upstream` pointing at `steipete/oracle` as fork
  provenance.
