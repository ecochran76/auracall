# ChatGPT Polish Plan

Goal: preserve the now-green ChatGPT browser MVP while making the validation and artifact paths cheaper to rerun and easier to operate on a throttled account.

Companion plan:
- reliability/bad-state hardening is tracked in
  [0020-2026-04-08-chatgpt-hardening-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/legacy-archive/0020-2026-04-08-chatgpt-hardening-plan.md)

Status:
- MVP is complete on the authenticated managed WSL Chrome path.
- The active work is polish, not new core surface coverage.
- The canonical live validator is `scripts/chatgpt-acceptance.ts`.

## Priorities

### 1. Freeze the green bar

- Keep the phased ChatGPT acceptance runner as the canonical bar:
  - `project`
  - `project-chat`
  - `root-base`
  - `root-followups`
  - `cleanup`
- Prefer phased validation over one dense full burst on this account.
- Treat the current non-Pro managed WSL profile as the authoritative smoke environment.

Definition of done:
- one current runbook exists
- one current acceptance transcript path exists
- docs stop describing already-closed MVP items as pending

### 2. Acceptance harness polish

- Keep `--state-file <path>` as the canonical way to persist phase state.
- Keep `--resume <path>` as the canonical way to continue from an earlier phase without manual id copying.
- Reuse the same suffix and disposable naming across resumed phases so logs and artifacts stay coherent.
- Print guard state before each phase and preserve the prior recorded failure in resume logs.
- Fail with short, operator-meaningful classifications where possible:
  - `rate_limited`
  - `ui_drift`
  - `verification_timeout`
  - `stale_response`

Definition of done:
- the harness help text, docs, and actual behavior all match
- the recommended rerun path is state-file based instead of ad hoc copy/paste

### 3. Artifact polish

Keep the required artifact smoke set small and representative:
- image chat
- spreadsheet/table chat
- DOCX + canvas chat

Treat the large vibe-coding chat as a manual soak only:
- good for breadth
- too noisy/slow for the required bar

Near-term artifact follow-ups:
- completed on 2026-03-30: add a stable resolver for spreadsheet-like markdown `sandbox:/...xlsx` downloads by falling back to the embedded spreadsheet card's header download button when no filename-matching behavior button exists
- completed on 2026-03-30: write a lightweight artifact fetch manifest per conversation (`artifact-fetch-manifest.json`) so materialized files are easier to inspect and retry without changing the existing `conversation-attachments/<id>/manifest.json` schema
- completed on 2026-03-30: re-prove serialized full-context ingestion plus artifact fetch on a small representative chat set (image, DOCX + canvas, spreadsheet workbook) instead of relying only on isolated artifact fetches
- remaining: keep the required artifact smoke set small and treat the large vibe-coding chat as manual soak coverage only

Definition of done:
- required artifact smokes are explicit
- heavy bundle chats are clearly marked as optional soak coverage

### 4. Rate-limit and reliability polish

- Keep the adaptive weighted guard for this account:
  - lighter actions like rename/instructions are cheaper than create/upload/browser-send
  - every successful write opens a post-commit quiet period before the next refresh-heavy or mutating step
  - that quiet period starts around 12-18 seconds and lengthens as more weighted activity lands in the rolling window
- Preserve the visible rate-limit modal guard on existing-conversation runs.
- completed on 2026-03-30: add adapter-level visible rate-limit modal recovery for `conversations context get` and `conversations artifacts fetch`, so ChatGPT read/materialization flows dismiss the modal, pause about 15 seconds, and retry once before escalating to the persisted cooldown guard
- Continue aborting long cooldown waits instead of sleeping through them in the acceptance harness.
- Prefer short, resumable reruns over automatic long-lived retries.

Definition of done:
- the harness never silently reuses stale assistant turns
- the runner never parks for multi-minute cooldowns

### 5. Docs and cleanup

Update the durable docs together:
- `docs/testing.md`
- `docs/dev/smoke-tests.md`
- `docs/dev/plans/legacy-archive/0019-2026-04-08-chatgpt-conversation-surface-plan.md`
- `docs/dev/dev-journal.md`
- `docs/dev-fixes-log.md`

Keep the repo tidy after polish work:
- remove temporary scratch artifacts like `undefined:/`
- keep the ChatGPT notes aligned on “MVP complete, polish active”

## Recommended operator workflow

Create a state file once:

```sh
export CHATGPT_STATE=docs/dev/tmp/chatgpt-acceptance-state.json
```

Then run phases like this:

```sh
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 \
pnpm tsx scripts/chatgpt-acceptance.ts --phase project --state-file "$CHATGPT_STATE"

DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 \
pnpm tsx scripts/chatgpt-acceptance.ts --phase project-chat --resume "$CHATGPT_STATE"

DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 \
pnpm tsx scripts/chatgpt-acceptance.ts --phase root-base --resume "$CHATGPT_STATE"

DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 \
pnpm tsx scripts/chatgpt-acceptance.ts --phase root-followups --resume "$CHATGPT_STATE"

DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 \
pnpm tsx scripts/chatgpt-acceptance.ts --phase cleanup --resume "$CHATGPT_STATE"
```

## Non-goals for polish

Do not block polish completion on:
- Pro validation on this account
- share-page parity
- every possible future artifact subtype
- turning the large vibe-coding chat into a routine required smoke

Those are optional follow-up work, not required to keep the MVP healthy.
