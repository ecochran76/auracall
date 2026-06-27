# Handoff Attachment ZIP Packaging Plan | 0144-2026-06-26

State: CLOSED
Lane: P01

## Purpose

Make handoff target attachment packaging provider-neutral and config-driven so
large attachment sets do not exceed service attachment-count limits. The default
policy starts enabled for every handoff target service: upload selected files
individually through ten attachments, and package eleven or more selected files
into one ZIP attachment.

This is a hard default policy, not a ChatGPT-specific workaround. Service
adapters should receive the already-packaged upload manifest and should not
duplicate attachment-count logic.

## Current State

- Handoff target package assembly already copies selected source files into
  `target/selected-files/` and writes a target upload manifest.
- ChatGPT browser handoff upload currently stages the selected packet files as
  prompt attachments, and submit sends those attachments with the primer and
  compact context.
- Recent live handoffs stayed under the attachment-count threshold, so no ZIP
  was required.
- The operator rule is now explicit: if more than ten files need to be uploaded
  to ChatGPT, they should be uploaded as a ZIP, and the target chat
  instructions should say the ZIP must be inflated as part of the requested
  analysis.
- The needed behavior is broader than ChatGPT because attachment-count limits
  are a target packaging concern shared by all provider adapters.

## Scope

- Add a typed handoff attachment packaging config with defaults:
  - `enabled: true`
  - `zipWhenFileCountExceeds: 10`
- Resolve the policy once during handoff prepare/target package assembly,
  applying the default to all target services.
- Package selected files into one deterministic ZIP when the selected upload
  item count is greater than the configured limit.
- Keep ten or fewer selected files as individual upload manifest entries.
- Preserve original selected-file metadata in target package artifacts so
  operators and target instructions can see what the ZIP contains.
- Make the target primer/submission instructions explicitly mention ZIP
  inflation when ZIP mode is active.
- Keep provider adapters consuming the target upload manifest without
  provider-specific ZIP branching.
- Cover the behavior with focused handoff package tests and config-resolution
  tests.
- Update user-facing and durable docs for the new default policy and config
  knobs.

## Non-Goals

- Do not add ChatGPT-only attachment-count heuristics.
- Do not change source materialization, source selection, or file-searcher
  fallback semantics.
- Do not ZIP files when the selected upload count is exactly ten.
- Do not combine upload and submit approval gates.
- Do not rely on the host `zip` binary or non-deterministic archive metadata
  for package digest inputs.
- Do not rewrite existing handoff packets in place.

## Architecture Plan

### Config Contract

Introduce a small config object under the handoff config surface:

```json
{
  "handoff": {
    "attachmentPackaging": {
      "enabled": true,
      "zipWhenFileCountExceeds": 10
    }
  }
}
```

The first implementation should make this global default apply to every target
service. If the existing config model has a clean service-override seam, add a
service-level override in the same typed shape. If not, keep the first slice
global and document that service-specific overrides are a later compatibility
extension.

Validation rules:

- `enabled` defaults to `true`.
- `zipWhenFileCountExceeds` defaults to `10`.
- values below `1` fail config validation.
- omitted config preserves the default policy.

### Target Package Assembly

Apply the rule inside the provider-neutral target package builder after
selected files have been resolved, copied, deduped, and recovered, but before
upload approval digest calculation.

When ZIP mode is inactive:

- keep the current upload manifest shape and selected-file entries.

When ZIP mode is active:

- write one deterministic ZIP under the target package, for example
  `target/selected-files/handoff-attachments.zip`;
- replace upload manifest entries with a single ZIP upload item;
- write packaging metadata that records:
  - mode: `individual` or `zip`
  - enabled policy and threshold
  - original selected-file count
  - emitted upload item count
  - ZIP packet path, size, and checksum
  - original selected-file names, packet paths, sizes, MIME types, checksums,
    source manifest item ids, and recovery metadata when present.

The ZIP must be deterministic:

- stable entry order;
- packet-relative entry names only;
- normalized path separators;
- fixed archive timestamps and permissions where the ZIP library allows it;
- stable compression settings;
- checksum over the emitted ZIP bytes.

The implementation uses an in-process deterministic ZIP writer with fixed
metadata rather than shelling out to the system `zip` command.

### Target Instructions

When ZIP mode is active, append a concise provider-neutral instruction to the
target primer/submission plan:

> One uploaded attachment is a ZIP archive containing the selected source
> files. Before analysis, inspect or extract the ZIP and treat the contained
> files as the handoff's selected attachments.

Keep the instruction conditional so ordinary handoffs with ten or fewer
attachments do not mention ZIP files.

### Adapter Boundary

Provider adapters should keep using the target upload manifest as their only
attachment list. This means:

- ChatGPT browser prompt attachments receive one ZIP file when ZIP mode is
  active.
- Gemini, Grok, and future target adapters inherit the same behavior without
  service-specific count logic.
- Adapter code may report provider upload failures normally, but should not
  re-expand or repackage selected files.

## Parallel Work Tracks

- Config and docs can proceed in parallel with the package-builder test design.
- ZIP writer selection and deterministic-archive proof can proceed before
  provider-adapter validation because the adapter boundary should remain
  unchanged.
- README/config docs can be drafted once the config key names are fixed.

## Critical Path

1. Add the typed config contract and defaults.
2. Add deterministic ZIP generation and packaging metadata in target package
   assembly.
3. Bind package digest and upload approval to the emitted upload manifest and
   packaging metadata.
4. Add conditional target-primer/submission-plan instructions for ZIP mode.
5. Prove the provider adapter boundary receives the packaged manifest without
   service-specific branching.
6. Update docs and validation evidence.

## Acceptance Criteria

- [x] With default config and ten selected files, the target upload manifest
  contains ten individual upload items.
- [x] With default config and eleven selected files, the target upload manifest
  contains one ZIP upload item.
- [x] The ZIP contains all original selected files exactly once, with stable
  packet-relative entry names and deterministic output across repeated runs.
- [x] The target package records original selected-file metadata alongside the
  emitted upload manifest.
- [x] ZIP mode adds target instructions telling the receiving chat to inspect
  or extract the ZIP before analysis.
- [x] Disabling `handoff.attachmentPackaging.enabled` preserves individual
  upload entries even above ten files.
- [x] Changing `zipWhenFileCountExceeds` changes the threshold without adapter
  code changes.
- [x] Existing handoff upload/submit approval digest behavior invalidates stale
  approvals when ZIP packaging changes the target package.
- [x] Provider adapters do not implement their own attachment-count ZIP rules.
- [x] User-facing config and handoff docs describe the default policy and
  override.

## Implementation Result

- Added typed config support for `handoff.attachmentPackaging.enabled` and
  `handoff.attachmentPackaging.zipWhenFileCountExceeds`.
- Applied the packaging rule in provider-neutral handoff target package
  assembly before package digest and approval evidence are written.
- Added target package/upload manifest `attachmentPackaging` metadata that
  records original selected files, emitted upload item count, and ZIP checksum
  metadata.
- Added deterministic in-process ZIP generation for ZIP mode and wrote the ZIP
  under `target/selected-files/handoff-attachments.zip`.
- Kept provider adapters unchanged: upload/submit paths consume the emitted
  `target/upload-manifest.json` items.
- Added conditional primer text instructing target chats to inspect or extract
  the ZIP before analysis.
- Updated README, configuration docs, dev journal, and fixes log.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts`
- focused config/schema tests for `handoff.attachmentPackaging`
- focused target-package tests for ten-file individual mode, eleven-file ZIP
  mode, disabled mode, threshold override, packaging metadata, and deterministic
  ZIP output
- `pnpm exec biome lint` on changed source, docs-adjacent tests, and config
  files
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run plans:audit -- --keep 144`
- `git diff --check`

Validation evidence:

- `pnpm vitest run tests/cli/handoffCommand.test.ts -t "handoff attachment|ten selected|eleven selected|disabled by config|threshold overrides"`:
  passed with `4` ZIP-focused tests.
- `pnpm vitest run tests/cli/handoffCommand.test.ts --testTimeout 15000`:
  passed with `42` tests.
- Live SoyLei ChatGPT Pro Extended root proof:
  - prepared packet
    `/tmp/auracall-plan0144-live-zip-proof/handoffs/plan0144-live-zip-proof`
    with `projectRef=null`, `conversationRef=null`, and
    `modelSelector=chatgpt:pro-extended`;
  - default packaging selected ZIP mode for `11` selected files, emitted one
    upload item, and wrote `target/selected-files/handoff-attachments.zip`
    with SHA-256
    `40f1ac5352d1928b820fab8934927f52a1461badcb30123f6e82a2485936b6dc`;
  - `handoff recover-live` upload recovery reported one uploaded file and zero
    failed files;
  - `handoff recover-live` submit recovery completed the root chat at
    `https://chatgpt.com/c/6a3f1652-2490-83ea-add0-0a900e6d55bc`;
  - readback cache
    `/tmp/auracall-plan0144-live-zip-proof/handoffs/plan0144-live-zip-proof/target/chatgpt-context-readback.json`
    recorded one `application/zip` file named `handoff-attachments.zip`, and
    the assistant response stated it inspected and extracted the ZIP and listed
    all `PLAN0144_ZIP_PROOF_01` through `PLAN0144_ZIP_PROOF_11` markers.

## Definition Of Done

Plan 0144 closes as **Handoff Attachment ZIP Packaging Installed** when the
default all-service handoff target packaging policy emits one deterministic ZIP
for more than ten selected attachments, records enough metadata for audit and
repair, instructs the target chat to inspect or extract the ZIP, and targeted
validation proves the behavior without provider-specific attachment-count
logic.

Closeout: **Handoff Attachment ZIP Packaging Installed**.

## Follow-Up Boundary

- Service-specific thresholds or disablement can be added only if real provider
  limits require them and the config model has a clean override seam.
- A future size-based ZIP or split-ZIP policy is out of scope until a provider
  file-size limit is hit in live evidence.
