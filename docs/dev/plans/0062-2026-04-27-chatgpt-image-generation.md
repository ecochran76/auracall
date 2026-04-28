# ChatGPT Image Generation | 0062-2026-04-27

State: OPEN
Lane: P01

## Scope

Add a browser-first ChatGPT image generation path to the durable
media-generation contract without weakening the submitted-tab no-navigation
rules learned from Gemini and Grok.

## Current State

- ChatGPT generated-image artifact extraction is green for existing
  conversations: conversation context can expose `image_asset_pointer`
  artifacts, and `conversations artifacts fetch` can materialize generated
  PNGs.
- ChatGPT is not yet green as a first-class `POST /v1/media-generations` /
  MCP media-generation provider.
- The first code audit found one impatient re-navigation point in ChatGPT
  readback: backend payload capture retried by reloading the conversation tab
  after direct fetch failed. That is acceptable for mature read-only
  conversation reads, but unsafe for post-submit media readback.
- The ChatGPT adapter now treats `preserveActiveTab` as authoritative for that
  payload-capture path: direct backend fetch may run, but reload/network-capture
  fallback is skipped and blocking-surface recovery reload is skipped.

## Target Contract

- ChatGPT image generation must use the existing media-generation resource:
  CLI/local API/MCP creation, durable run id, timeline, artifacts, and generic
  run status.
- The browser executor must submit through the managed ChatGPT browser path,
  record the submitted tab target id, and keep readback/materialization scoped
  to that tab.
- Post-submit polling must be passive: no route reload, no conversation
  re-open, no service target fallback, and no URL-based recovery while the
  generated image is still maturing.
- Materialization should reuse the proven ChatGPT generated-image artifact
  path once the active tab exposes image artifacts.

## Non-Goals

- No provider API media access.
- No ChatGPT video, editing, apps, skills, or Deep Research invocation.
- No automatic clicking of ChatGPT `Answer now`.
- No broad ChatGPT CRUD acceptance rerun unless this slice touches those
  surfaces.

## Acceptance Criteria

- [x] Schema and capability mapping allow `provider = chatgpt`, `mediaType =
  image`, `transport = browser` without enabling unsupported media types.
- [x] ChatGPT browser media executor submits one image prompt and records
  `prompt_submitted` with `conversationId`, `tabTargetId`, and URL.
- [x] Active-tab polling can detect generated image artifacts without
  navigation/reload after submission.
- [x] Materialization caches at least one generated image artifact under the
  media-generation artifact directory.
- [x] Unit coverage proves `preserveActiveTab` forbids ChatGPT payload reload
  during readback.
- [ ] Unit coverage proves `preserveActiveTab` forbids blocking-surface reload
  recovery during readback/materialization.
- [ ] One supervised live smoke proves the end-to-end path only after the
  no-navigation unit path is green.

## Live Smoke Notes

- 2026-04-27 installed-runtime smoke reached the durable run-status surface
  but stopped before ChatGPT prompt submission because the default managed
  ChatGPT browser profile was not authenticated. Evidence:
  `medgen_97cfdcce88c2426991485eb7045d86d3` stayed `running` with last event
  `submit_path_observed` and provider message `Manual login mode: please sign
  into chatgpt.com in the opened Chrome window; waiting for session to
  appear...`.
- The same smoke exposed two local defects before provider submission:
  collision-prone media record temp files and nested browser-operation
  self-deadlock. Both are fixed and covered by unit tests.

## Validation Plan

- Targeted unit tests:
  - `tests/browser/chatgptAdapter.test.ts`
  - new or extended ChatGPT media executor tests
- Integration tests:
  - media service/API/MCP schema tests for `chatgpt` image request acceptance
    and unsupported type rejection
- Manual/live:
  - one serialized browser smoke with `--browser-keep-browser --verbose`
  - status polling during the run to confirm patient active-tab readback
