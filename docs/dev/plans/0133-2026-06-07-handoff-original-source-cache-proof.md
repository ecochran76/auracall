# Handoff Original Source Cache Proof Plan | 0133-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Continue Plan 0114 after Plan 0132 proved live ChatGPT target mutation against
the SoyLei ChatGPT Pro runtime profile. This slice uses the original requested
ChatGPT Business source ref and proves that AuraCall can cache or import the
source conversation context, user uploads, and LLM artifacts before preparing a
handoff packet for the SoyLei target.

Source ref:
`https://chatgpt.com/g/g-p-687f9c5cc35c8191a25e6127785b86f8/`

The source runtime profile is `default`, bound to the `ecochran76 | Business`
ChatGPT tenant. The target runtime profile is `wsl-chrome-3`, bound to the
SoyLei ChatGPT Pro tenant.

## Current State

- Plan 0132 proved that approved selected files can be attached and submitted
  into a live SoyLei ChatGPT Pro target conversation with
  `--target-adapter chatgpt-browser`.
- The source ref is provider-native and may represent a GPT/project-like URL
  instead of a normal `/c/<conversation-id>` conversation URL, so this plan
  treats source completeness as a required gate before any target submit.
- The default ChatGPT source identity smoke passed for
  `ecochran76@gmail.com`, Business/team/workspace, preflight `ok=true`.
- Live read-only DOM inspection of the source ref loaded the SoyLei project in
  the Cochran Group Business workspace and found `Chats` and `Sources` tabs
  plus concrete visible project conversation URLs.
- Direct `handoff prepare --source-materialization-create` with the project
  URL failed HTTP 400 because the project URL is not a direct conversation
  materialization source.
- Broad source materialization job
  `hmj_aadb916b43404416b222a674696d6d95` for 10 visible project
  conversations failed at the `180000ms` stale-running threshold.
- Narrowed source materialization job
  `hmj_8753bada894844368b1c14c769849ac9` for the first visible project
  conversation initially remained queued at packet preparation/status readback
  because the earlier broad provider work was still alive in-process even
  after storage readback marked the job failed.
- Restarting `auracall-api.service` recovered the queued narrowed job through
  startup recovery; the job then ran and completed as `skipped` after finding
  five conversation files but failing all downloads with `tile_not_found`.
- ChatGPT conversation file download now falls back to the authenticated
  provider-file endpoint used by account-library download. A forced retry
  `hmj_443eb4120d354f3e808335fd127e78bd` changed the first five failures from
  `tile_not_found` to provider HTTP 404 evidence.
- A widened forced retry `hmj_f920baa4cb004d9682d0f27237e2882a` over the
  first visible project conversation completed `succeeded` with
  `conversations=1`, `materialized=1`, `duplicateAliases=1`, and `failed=14`.
  The materialized source file is `2026-05-26 Fresh Roof Sample.docx`
  (`21637649` bytes,
  `3f39f1a7497eb46a74515871a84cbd3e6fb3b71fd9ffe368a714d9f6f20484f3`).
- Handoff analysis selection now dedupes local source files by checksum/path so
  duplicate provider aliases do not cause duplicate target uploads.
- Existing source cache evidence includes a hydrated context for conversation
  `69a3ad88-b4f4-8331-8574-c8cae0ac5806` with `15` messages, `16`
  conversation files, `23` source refs, and `1` artifact, plus a current
  `file-fetch-manifest.json` with one materialized source asset, one duplicate
  alias, and fourteen provider-unavailable source file refs.
- The regenerated packet `plan0133-original-source-cache-proof` exists under
  `/tmp/auracall-plan0133-source-proof/handoffs` with source completeness
  `partial`, `messageCount=15`, package digest
  `0b903f5a67f1dd79f21066db45a72905ba65822f7ba60261da75633932748565`,
  selected source files deduped to the Fresh Roof DOCX plus the project index,
  provider-file 404s classified as deterministic source omissions, and stale
  retryable source omissions deduped behind newer terminal evidence.
- The SoyLei ChatGPT Pro target handoff completed through
  `--target-adapter chatgpt-browser`: upload result `status=uploaded`
  (`uploadedFileCount=2`, `failedFileCount=0`), submit result
  `status=submitted`, and target readback `status=readback_cached`.
- Target conversation:
  `https://chatgpt.com/c/6a250296-65d4-83ea-930b-c5658ed7435a`.

## Scope

- Verify the default ChatGPT Business source identity before source browser
  work.
- Attempt a bounded source cache/materialization or import for the original
  source ref.
- Persist the source materialization job evidence in the handoff packet.
- Build a dry-run handoff packet targeting SoyLei ChatGPT Pro with selected
  artifacts and compact context.
- Inspect source completeness, omissions, selected files, and analysis output.
- Approve and recover the SoyLei target only if the source packet proves
  enough real context and files to be useful.

## Non-Goals

- Do not claim a 1:1 ChatGPT conversation copy.
- Do not submit an empty, synthetic, or materially incomplete packet into the
  SoyLei target.
- Do not bypass upload or submit approvals.
- Do not retry through captcha, human-verification, suspicious provider guard
  pages, or ChatGPT `Answer now` surfaces.
- Do not make the source URL shape a ChatGPT-only product boundary; keep the
  handoff machinery provider-neutral.

## Definition Of Done

Plan 0133 closes as **Original Source Cache Proof Installed** when the original
source ref has either:

- produced a handoff packet with real cached/imported source context, selected
  source artifacts/files, omissions evidence, and a completed SoyLei target
  submission/readback; or
- produced enough deterministic blocker evidence to explain why the source ref
  cannot currently be materialized, with the next repair slice identified.

## Validation Plan

- `pnpm tsx bin/auracall.ts --profile default profile identity-smoke --target chatgpt --json`
- `pnpm tsx bin/auracall.ts api status --json --timeout-ms 20000`
- `pnpm tsx bin/auracall.ts --profile default handoff prepare ... --source-materialization-create --dry-run --json`
- `pnpm tsx bin/auracall.ts handoff status plan0133-original-source-cache-proof --json`
- If source completeness is adequate:
  - `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff approve-upload ... --json`
  - `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff recover-live ... --target-adapter chatgpt-browser --json`
  - `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff approve-submit ... --json`
  - `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff recover-live ... --target-adapter chatgpt-browser --json`
- `pnpm run plans:audit -- --keep 133`
- `git diff --check`

## Exit Criteria

Closed as **Original Source Cache Proof Installed**. The original project ref
produced a packet with real cached source context, selected source files,
omissions evidence, and a completed SoyLei target submission/readback. Source
completeness remains `partial` because the original ChatGPT provider no longer
serves several historical file refs, but the target handoff includes the full
cached conversation context and the selected materialized source DOCX.

Completion evidence:

- packet digest:
  `ff8598665a6d412d09a48b174cfde2ca49348604b2954fd528c4e281f7f92067`
- package digest:
  `0b903f5a67f1dd79f21066db45a72905ba65822f7ba60261da75633932748565`
- source completeness: `partial`, `messageCount=15`,
  `localMaterializedCount=3`, `omissionCount=17`,
  `retryableOmissionCount=0`
- selected files: `hmj_f920baa4cb004d9682d0f27237e2882a:entry_15` and
  `plan0133_soylei_project_index`
- source materialization jobs:
  - `hmj_aadb916b43404416b222a674696d6d95`: `failed`
  - `hmj_8753bada894844368b1c14c769849ac9`: `skipped`, with
    `conversations=1`, `materialized=0`, `failed=5`, manifest path
    `/home/ecochran76/.auracall/cache/providers/chatgpt/ecochran76@gmail.com/conversation-attachments/69a3ad88-b4f4-8331-8574-c8cae0ac5806/file-fetch-manifest.json`
  - `hmj_443eb4120d354f3e808335fd127e78bd`: `skipped`, with
    `conversations=1`, `materialized=0`, `failed=5`, direct-download HTTP 404
    evidence after the adapter fallback install
  - `hmj_f920baa4cb004d9682d0f27237e2882a`: `succeeded`, with
    `conversations=1`, `materialized=1`, `duplicateAliases=1`, `failed=14`
- target upload: `status=uploaded`, `uploadedFileCount=2`,
  `failedFileCount=0`
- target submit: `status=submitted`, `submitAttemptCount=1`,
  `targetConversationRef=https://chatgpt.com/c/6a250296-65d4-83ea-930b-c5658ed7435a`
- target readback: `status=readback_cached`, `responseExcerpt="Submitted 2
  selected attachment(s) through ChatGPT browser mode."`
- handoff status: effective `status=complete`, retained packet
  `run.status=preview_ready`

## Next Repair Slice

- Add project/Sources-tab file materialization so source-level uploads can be
  selected directly, not only represented by the project index.
- Plan 0134 closed the stale in-process provider-work queue blocker. Readback
  stale recovery now detaches the queue slot and late provider completions do
  not overwrite the terminal stale record.
