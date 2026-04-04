# Gemini Native Upload Investigation

## Purpose

Capture the live Gemini web upload surface that the current `src/gemini-web/*`
client does not use directly, so the next investigation slice can compare a
known-working browser-native upload against Aura-Call's raw
`content-push.googleapis.com/upload` + `StreamGenerate` flow.

This note is intentionally narrow:

- it does not claim the native upload path is implemented in Aura-Call
- it does not redefine the current Gemini web client architecture
- it exists so the next protocol-inspection slice starts from the real UI
  surface instead of rediscovering selectors from scratch

## Current live DOM anchors

Observed on 2026-04-04 from the Gemini page:

### 1. Composer add button

The `+` affordance currently exposes a touch-target span:

- selector clue:
  - `span.mat-mdc-button-touch-target`

This is likely not stable enough alone to drive automation, but it is a useful
anchor when inspecting the surrounding trigger button in DevTools.

### 2. Upload menu item

The current native upload item is exposed as:

- role:
  - `button[role="menuitem"]`
- stable-looking test id:
  - `[data-test-id="local-images-files-uploader-button"]`
- current semantics:
  - `aria-label="Upload files. Documents, data, code files"`
- current icon marker:
  - `[data-test-id="local-images-files-uploader-icon"]`

This is the strongest current picker trigger for native Gemini uploads.

### 3. Uploaded file preview chip

After native picker selection, Gemini currently shows a preview chip:

- stable-looking root:
  - `[data-test-id="file-preview"]`
- name field:
  - `[data-test-id="file-name"]`
- remove button:
  - `[data-test-id="cancel-button"]`

Current observed semantics:

- the chip can appear with:
  - an "Unknown" file type
  - an octet-stream icon
- that means:
  - visible chip presence alone is not enough to prove the later model request
    will materialize a response body

## Why this matters

Current Gemini forced-upload evidence on `wsl-chrome-2 -> gemini` is:

- Aura-Call reaches the real attachment path
- Gemini accepts the attachment request
- the later `StreamGenerate` response can still end as control-only:
  - `wrb.fr`
  - `di`
  - `af.httprm`
- no candidate response body materializes

So the next useful question is not "does Gemini have an upload button?" It is:

- what network/request shape does Gemini's own browser-native upload flow emit
  after:
  - upload menu open
  - file dialog selection
  - preview chip appearance
  - prompt submit

## Recommended next inspection slice

1. Use the live Gemini page on `wsl-chrome-2`.
2. Trigger native upload from:
   - `[data-test-id="local-images-files-uploader-button"]`
3. Confirm chip appearance from:
   - `[data-test-id="file-preview"]`
   - `[data-test-id="file-name"]`
4. Capture the real follow-on request sequence:
   - upload request
   - any metadata/finalize request
   - `StreamGenerate`
5. Compare that sequence against Aura-Call's current raw client flow.

## Explicit non-goals

- do not add Gemini DOM upload automation yet
- do not treat the preview chip as proof that the protocol gap is solved
- do not widen this into a general Gemini browser rewrite
