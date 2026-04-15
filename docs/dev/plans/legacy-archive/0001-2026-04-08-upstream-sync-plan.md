# Upstream Sync Plan

Date: 2026-03-18

This plan treats Oracle as a long-lived fork of `upstream/main`, not a branch that should be fully rebased. Since merge-base `2408811f` (`v0.8.4`), local `main` is `209` commits ahead and `88` commits behind. Both sides heavily modify the same core surfaces (`bin/auracall.ts`, browser runtime/config/session plumbing), but the product direction has diverged:

- Oracle direction: local browser automation, account backup/cache, conversation/project CRUD, bidirectional file transfer, and provider-specific automation.
- Upstream direction: supported-service offload for coding agents, bridge/MCP workflows, session follow-ups, and provider DOM integration for ChatGPT/Gemini.

## Recommendation

Do not attempt a full `git rebase upstream/main`.

Use a periodic sync branch and import upstream by topic:

1. Browser/session reliability fixes that preserve Oracle’s architecture.
2. API/model-routing fixes that are product-neutral.
3. Tooling/test/dependency updates if they do not force large mechanical rewrites.

Skip or defer upstream work that assumes the bridge/MCP/offload product model.

## Execution model

For each batch:

1. Create a work branch from local `main`.
2. Cherry-pick or manually port the selected upstream commits.
3. Resolve conflicts in favor of Oracle architecture:
   - keep `src/browser/llmService/*`
   - keep `src/browser/providers/grokAdapter.ts`
   - keep `packages/browser-service/*`
   - keep Oracle’s provider/cache/CRUD CLI surfaces
4. Run targeted tests.
5. Merge the batch back into `main`.

Suggested branch names:

- `sync/upstream-browser-reliability`
- `sync/upstream-api-routing`
- `sync/upstream-tooling`

## Batch 1: Import soon

These are the best candidates because they improve shared runtime behavior without demanding adoption of upstream’s product model.

### 1. Browser response capture and polling stability

Import by cherry-pick or manual port:

- `84fd90ff` `fix(browser): increase stability thresholds for long streaming responses`
- `80005067` `fix: refine browser response capture`
- `75d09743` `fix: abort polling loop when evaluation wins race condition`
- `d5cec98d` `fix: ensure browser-side observer/interval cleanup on all exit paths`
- `6e48e1ee` `fix: close browser tabs after successful response capture`
- `45901a03` `fix(browser): resolve TDZ crash in markdown fallback extractor`
- `f18f8274` `fix: make browser response poller abort-safe`

Why:

- Oracle still depends on browser response extraction and long-running session stability.
- These fixes improve correctness in the shared browser-response path.

Expected conflicts:

- `src/browser/actions/assistantResponse.ts`
- `src/browser/index.ts`

Preferred method:

- Manual port, not raw cherry-pick, because Oracle has already changed these files substantially.

Status:

- Partially imported on `sync/upstream-browser-reliability`: ported the remaining watchdog abort + long-answer stability threshold delta into `src/browser/actions/assistantResponse.ts` and covered it with targeted tests.

### 2. Browser session persistence / reattach hardening

Import by manual port first, cherry-pick only if conflicts are manageable:

- `ff81f46d` `Add browser auto-reattach and shared Chrome safety`
- `8f20497b` `fix: harden browser auto-reattach`
- `1d7347cb` `fix(browser): retain manual-login disconnect sessions`
- `11d9dee9` `fix(browser): preserve cloudflare challenge sessions`

Why:

- Oracle’s browser-centric workflows benefit directly from stronger reattach semantics.
- Cloudflare/manual-login survival aligns with Oracle’s real-world usage.

Expected conflicts:

- `src/browser/index.ts`
- `src/browser/profileState.ts`
- `src/browser/chromeLifecycle.ts`
- `src/cli/sessionRunner.ts`
- `src/sessionManager.ts`

Preferred method:

- Port concepts into Oracle’s browser-service/session architecture instead of trying to preserve upstream structure verbatim.

Status:

- Partially imported on `sync/upstream-browser-reliability`: Cloudflare challenge preservation is now in local ChatGPT and Grok browser paths, with preserved runtime metadata on session errors. Remaining work, if any, is narrower reattach/manual-login behavior review.
- Additional import completed on `sync/upstream-browser-reliability`: restored upstream-hardened prompt commit detection (`verifyPromptCommitted`) so fallback commit signals require a new turn and missing baselines are re-read from the DOM.

### 3. Gemini upload correctness

Import:

- `120cb89a` `fix(gemini-web): add MIME type for file uploads to enable image analysis`
- `a791643e` follow-up confirmation commit

Why:

- Low-scope fix.
- Useful if Gemini remains part of the supported account/backup surface.

Expected conflicts:

- `src/gemini-web/client.ts`

Preferred method:

- Cherry-pick is reasonable.

### 4. Provider-qualified model id handling

Import:

- `4421adfa` `fix(cli): preserve provider-qualified model ids`

Why:

- Small and product-neutral.
- Helps if Oracle continues to support multiple routed providers.

Expected conflicts:

- `bin/auracall.ts`
- `src/cli/options.ts`

Preferred method:

- Manual port; file overlap is high.

## Batch 2: Import selectively after Batch 1

These are likely useful, but only if they fit Oracle’s current roadmap after the reliability batch lands cleanly.

### 5. Custom base URL / OpenRouter routing correctness

Import:

- `b51a347a` `fix: route Gemini/Claude through OpenRouter when using OpenRouter base URL`
- `188ac572` `fix: route all models through chat/completions adapter for any custom base URL`

Why:

- Product-neutral API correctness.
- Worth having if Oracle keeps API mode broad and configurable.

Expected conflicts:

- `src/oracle/client.ts`

Preferred method:

- Cherry-pick or manual port depending on local API changes at import time.

### 6. Long-run flags and configurable timeouts

Evaluate:

- `cf442c54` `Add long-run flags and configurable timeouts`

Why:

- Potentially useful for long browser or provider jobs.
- But this touches CLI and session semantics already modified locally.

Expected conflicts:

- `bin/auracall.ts`
- `src/sessionManager.ts`
- Oracle run/session option plumbing

Preferred method:

- Manual port only if current Oracle UX still lacks the needed timeout controls.

### 7. Browser model-selection stabilization

Evaluate:

- `a870f274` `fix: stabilize browser model selection`

Why:

- Could help shared UI automation.
- Local branch already did substantial model-picker work, especially for Grok.

Expected conflicts:

- `src/browser/actions/modelSelection.ts`
- `src/browser/index.ts`

Preferred method:

- Inspect and port any provider-agnostic selector/wait improvements only.

### 8. Gemini deep-think browser flow

Evaluate:

- `158c3e8b`
- `2cc50d10`
- `11dbffab`
- `5be5f069`
- `15e95417`
- `cbd6aa11`

Why:

- These commits are useful only if Oracle wants to keep investing in Gemini browser execution as a first-class target.
- The architectural shape overlaps heavily with Oracle’s own provider abstraction work.

Expected conflicts:

- `src/browser/index.ts`
- `src/gemini-web/executor.ts`
- `src/cli/browserConfig.ts`
- provider registration files

Preferred method:

- Treat as a feature-port project, not a sync chore.

## Batch 3: Defer or skip

These are the areas where product divergence is large enough that upstream changes are more likely to create maintenance cost than value.

### 9. Bridge / MCP host workflow

Defer or skip:

- `184e9949` `Bridge workflow + MCP browser controls`
- `0692dcce` `feat: isolated browser tabs for parallel MCP sessions`
- `8fb72e6a` `fix(mcp): honor browser config in consult`

Why:

- These assume upstream’s “Oracle as agent offload substrate” direction.
- Oracle’s local fork is centered on account automation, backup, and CRUD.

Possible exception:

- If you later want Oracle to expose its local backup/CRUD engine through MCP, revisit this area then and integrate intentionally rather than opportunistically.

### 10. Follow-up lineage / session tree UX

Defer:

- `2202c337`
- `c2f83384`
- `4828cbff`
- `9d8a3473`
- `3711a00d`
- `1fcf9d26`
- `76301292`
- `92e7dbb3`

Why:

- Potentially useful, but CLI/session surfaces have diverged heavily.
- This is not a low-risk sync target.

Recommendation:

- Re-implement the useful ideas later on top of Oracle’s own session model if follow-up chains become important.

### 11. Large formatting/tooling migration

Defer:

- `b76640dc` `chore: migrate from biome to oxlint and oxfmt`

Why:

- Large mechanical diff with broad file churn.
- Makes future upstream diffing cleaner only if Oracle also wants the same tooling stack.
- Bad first sync target while architecture is still moving.

Recommendation:

- Handle as an intentional standalone migration, not inside an upstream sync batch.

## Conflict hotspots

Expect repeated conflicts in these files:

- `bin/auracall.ts`
- `src/browser/index.ts`
- `src/browser/config.ts`
- `src/browser/chromeLifecycle.ts`
- `src/browser/profileState.ts`
- `src/browser/actions/assistantResponse.ts`
- `src/browser/actions/modelSelection.ts`
- `src/cli/sessionRunner.ts`
- `src/sessionManager.ts`
- `src/gemini-web/executor.ts`

When conflicts occur, preserve Oracle’s architecture around:

- `src/browser/llmService/llmService.ts`
- `src/browser/providers/cache.ts`
- `src/browser/providers/grokAdapter.ts`
- `packages/browser-service/*`

## Suggested order of work

1. Batch 1.1 browser response capture fixes.
2. Batch 1.2 reattach/manual-login/cloudflare fixes.
3. Batch 1.3 Gemini MIME upload fix.
4. Batch 1.4 provider-qualified model id fix.
5. Re-run browser and session tests.
6. Decide whether Batch 2.5 and 2.6 are still valuable.
7. Revisit Batch 2.8 only if Gemini browser mode remains strategically important.

## Test checklist per batch

Run at minimum:

- `pnpm test`
- `pnpm run check`
- `pnpm test:browser` when browser/session code changes
- targeted live tests only when the imported area requires it

High-priority targeted checks:

- browser response capture and markdown preservation
- reattach after detach/manual-login disconnect
- cloudflare/manual-login survival
- Grok project/conversation CRUD still working
- cache export and context retrieval still working

## Bottom line

The right sync strategy is not “get back onto upstream.” It is:

- keep Oracle’s architecture
- import upstream reliability fixes aggressively
- import upstream API correctness fixes selectively
- ignore upstream bridge/follow-up product work unless Oracle’s roadmap changes
