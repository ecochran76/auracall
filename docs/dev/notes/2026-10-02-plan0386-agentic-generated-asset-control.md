# Plan 0386 agentic generated-asset control

Date: 2026-10-02
AuraCall runtime profile: `wsl-chrome-3`
Browser profile: `wsl-chrome-3`
Provider: ChatGPT
Conversation: `6ab6d340-89e4-83ea-9990-d8fb278993e6`

## Bounded interaction

- Launched the exact AuraCall-managed browser profile through `auracall login`.
- Navigated first to the newest Bailey branch, which had no visible asset
  controls, then once to the root Bailey conversation. No reload or prompt was
  issued.
- The root conversation exposed 13 visible file-related controls. Generated
  assets included:
  - `Open preview of Bailey_Project_Timeline.pptx`
  - `Open preview of Cochran_FY27_Bailey_With_Figures.docx`
  - `Download Bailey_FY27_Proposal_With_Figures.zip`
  - `Open preview of Bailey_FY27_Proposal_With_Figures.docx`
- The generated controls were descendants of role-bearing roots such as
  `data-content-search-unit-key="fallback-turn-4:2:assistant"`; there was no
  separate `data-message-author-role` ancestor required for classification.
- The direct ZIP control was a visible `span[role="button"]` with
  `data-file-reference="true"`, `tabindex="0"`, and the exact filename in its
  `aria-label`.

## Materialization result

An initial DOM `HTMLElement.click()` produced no browser download. One trusted
CDP pointer sequence against the same uniquely matched control emitted a single
`Browser.downloadWillBegin` event followed by a completed
`Browser.downloadProgress` event.

- Filename: `Bailey_FY27_Proposal_With_Figures.zip`
- Size: `1,721,645` bytes
- SHA-256: `c463e95ddac8fc739d5f5865986d63a33add63ff87696ec57a06be43bf8a46dc`
- Type: ZIP archive
- Archive validation: `unzip -t` passed and found
  `Bailey_FY27_Proposal_With_Figures.docx`

The materialized file remains outside the repository in the private temporary
directory used for the acceptance control. No proposal contents were copied
into repository evidence.

## Code comparison

The current discovery and tag paths match the observed surface after the
selector-self repair: they accept filename-bearing `Download ...` controls and
derive the assistant role from the selected search-unit root itself. The final
activation path did not match the live surface: it used untrusted
`target.click()`, while the successful live control required a trusted CDP
pointer sequence.

Source now resolves the tagged control's visible center and dispatches
`mouseMoved`, `mousePressed`, and `mouseReleased` through CDP. The focused
regression executes that helper and asserts the complete pointer sequence; it
does not use the former string-presence assertion as proof of activation.

## Safety and cleanup

- The passive watcher followed dynamic DevTools port `57177`.
- No rate-limit, CAPTCHA, or human-verification hard stop was observed.
- Chrome was closed by its exact verified PID after the port-based helper could
  not resolve a launch recorded as `--remote-debugging-port=0`.
- Final state: no exact-profile Chrome process, no listener on `57177`, zero
  non-released tab leases, scheduler still paused, watcher still active.

This proves one agentic generated-asset materialization and identifies the next
product defect. It does not by itself satisfy Gate D's installed product-path
acceptance; the trusted-pointer repair still requires canonical integration,
installation, and one separately bounded installed product control.
