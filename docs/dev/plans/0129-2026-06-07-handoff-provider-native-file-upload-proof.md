# Handoff Provider-Native File Upload Proof Plan | 0129-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Continue Plan 0114 after Plan 0128 installed provider-native submit/readback.
The next bounded proof is target-side selected file transfer behind the same
adapter contract, with host-owned approvals, package digests, retry evidence,
and replay artifacts still controlled by the handoff service.

This slice proves the provider-native upload runner seam. A live ChatGPT,
Gemini, or Grok browser/API implementation remains a later provider-specific
adapter slice.

## Current State

- `recover-live` executes the current approved resume-plan action through a
  `HandoffTargetAdapter`.
- `createProviderNativeHandoffTargetAdapter(...)` can submit the target primer
  and compact context through a provider-native prompt runner.
- Upload still delegates to the deterministic packet adapter, so provider file
  ids are not yet supplied by a native upload path.

## Scope

- Add provider-native upload runner input/result contracts.
- Let `createProviderNativeHandoffTargetAdapter(...)` accept an optional upload
  runner.
- Pass selected upload-manifest files to the upload runner with packet-relative
  paths, absolute paths, file metadata, and the package digest.
- Validate native upload results against the upload manifest.
- Persist native provider file ids in `target/upload-result.json`.
- Persist native upload failures as explicit retryable failure rows.
- Fail closed before submit approval and submit when the target upload result
  has failed.
- Prove successful native upload -> submit/readback and failed native upload
  retry gating with fixture tests.

## Non-Goals

- Do not automate a live browser or provider API upload in this slice.
- Do not add provider-specific selectors to `src/handoff/service.ts`.
- Do not combine upload and submit approvals.
- Do not change source materialization or analysis selection behavior.

## Definition Of Done

Plan 0129 closes as **Handoff Provider-Native File Upload Proof Installed**
when a provider-native upload runner can transfer selected target package files
behind `recover-live`, successful provider file ids flow into the approved
submit step, failed upload rows are replayable and retryable, and submit
approval remains blocked after failed upload evidence.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts tests/http.handoffOperator.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, HTTP, console, and
  tests
- `pnpm run console:build`
- `pnpm run plans:audit -- --keep 129`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Provider-Native File Upload Proof Installed**. Provider
native target upload is now adapter-backed at the runner-contract level, with
live provider/browser upload implementation deferred to a later provider
adapter slice.
