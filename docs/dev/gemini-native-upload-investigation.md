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

## 2026-04-04 live comparison result

One direct Puppeteer/CDP capture against the live `wsl-chrome-2 -> gemini`
page established the following:

- the native Gemini upload trigger path did work through the menu item:
  - `triggerPath = "menu-item"`
- after chooser acceptance, the page did not expose the expected
  `[data-test-id="file-preview"]` root
- but the later send path still used an attachment-backed `StreamGenerate`
  request

Most important difference from Aura-Call's raw client:

- the browser-native `StreamGenerate` `f.req` payload is much richer than the
  current raw client payload
- the attachment entry was observed in a shape like:
  - `[[uploadToken, 1, null, "image/png"], "gemini-wsl2-upload-proof.png", null, null, null, null, null, null, [0]]`
- and that payload sat inside a larger request envelope with additional arrays,
  locale data, and opaque session/request metadata

Observed raw response body from the browser-native send:

- still control-framed rather than a materialized candidate body:
  - `wrb.fr`
  - `di`
  - `af.httprm`
  - `e`

Implications:

- Aura-Call's current raw Gemini client is almost certainly under-specifying
  the request envelope, not just the attachment tuple
- the next fix should not be another tiny tuple tweak in isolation
- the next useful protocol step is to diff:
  - the native browser `f.req` envelope
  - the raw Aura-Call `f.req` envelope
  and identify the minimum required missing structure

## 2026-04-04 follow-up capture result

A broader live network capture against the same `wsl-chrome-2 -> gemini`
native upload flow answered the next immediate question: Gemini does not stop
at one attachment-backed `StreamGenerate` request.

Observed request sequence after native send:

1. pre-send `batchexecute?rpcids=ESY5D`
2. attachment-backed `StreamGenerate`
3. follow-up `batchexecute?rpcids=PCck7e`

Observed details:

- the first `batchexecute` returned only control frames with:
  - `wrb.fr`
  - `di`
  - `af.httprm`
- the attachment-backed `StreamGenerate` returned:
  - one `wrb.fr` body containing a generated run/message id payload
  - a second `wrb.fr` body with `[13]`
  - then the same control-frame terminators
- Gemini then immediately issued a second `batchexecute` with:
  - `rpcids=PCck7e`
  which also returned only control frames in this capture

Additional live signal from that same run:

- Gemini emitted a `jserror` request saying:
  - `You already uploaded a file named gemini-wsl2-upload-proof.png`
- so duplicate-file state on the page can also influence later upload
  experiments if the live tab is reused carelessly

What this changes:

- the protocol gap is no longer just:
  - `upload` + `StreamGenerate`
- the native page performs a broader request sequence after send
- a raw-client fix that only tweaks the `StreamGenerate` attachment tuple or
  even only its outer `f.req` envelope is still likely incomplete

Next useful investigation:

- capture and decode the native `PCck7e` request payload
- determine whether it is required for attachment runs to materialize a usable
  response body
- only then decide whether Aura-Call should:
  - emulate more of the native sequence, or
  - take a different browser-driven upload path

## 2026-04-04 payload-capture follow-up

Several deeper live capture attempts tried to move from:

- request-sequence observation

to:

- decoding the later request payloads themselves

What was tried against the live `wsl-chrome-2 -> gemini` page:

- Puppeteer page-level `request` capture
- CDP `Network.getRequestPostData`
- CDP `Fetch.requestPaused`
- both on:
  - a reused live Gemini tab
  - a fresh Gemini tab

Result:

- all of those body-oriented captures consistently surfaced only the early:
  - `batchexecute?rpcids=ESY5D`
- they did not expose decodable request bodies for the later:
  - attachment-backed `StreamGenerate`
  - follow-up `batchexecute?rpcids=PCck7e`

What that implies:

- the earlier request-sequence evidence is still real:
  - the native page does issue `StreamGenerate` and `PCck7e`
- but those later requests are not currently reachable as ordinary page-target
  POST bodies through the same capture techniques that were sufficient for
  `ESY5D`
- this is now evidence that the remaining protocol gap may involve:
  - a different CDP target or session boundary
  - service-worker or internal request mediation
  - or a browser-native path that is no longer practical to mirror from the
    current raw-client architecture

Updated next step:

- do not spend another slice on small `f.req` tweaks without broader evidence
- if native upload parity stays the goal, the next honest investigation is:
  - browser-wide target/session capture for the later Gemini requests
- otherwise, treat this as a signal that native Gemini attachments may need a
  browser-driven execution path rather than more raw-client emulation

## Explicit non-goals

- do not add Gemini DOM upload automation yet
- do not treat the preview chip as proof that the protocol gap is solved
- do not widen this into a general Gemini browser rewrite
