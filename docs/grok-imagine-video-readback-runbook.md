# Grok Imagine Video Readback Probe Runbook

Use this probe only to inspect a Grok Imagine video generation that a human
already submitted in the managed Grok browser tab. It validates Aura-Call
status sensing, terminal video readback, and artifact caching without letting
Aura-Call click Video Submit.

## Guardrails

- The human operator selects Video mode and submits the prompt manually.
- Aura-Call attaches to the existing tab only.
- The diagnostic request must include `grokVideoReadbackProbe = true` and
  both `grokVideoReadbackTabTargetId` and
  `grokVideoReadbackDevtoolsPort`.
- The readback probe must not submit, navigate, reload, or open/reuse the
  Grok Imagine entrypoint.
- Stop after one bounded run. If an account gate, rate limit, bot guard, or
  human-verification page appears, leave the browser open for manual
  inspection and do not retry automation against the same tab.

## Prerequisites

Start the local API server against the intended AuraCall runtime profile:

```bash
pnpm tsx bin/auracall.ts api serve --port 8080
```

Open the managed Grok browser profile, go to `https://grok.com/imagine`, select
Video mode, enter the real test prompt, and click Submit manually. Keep that
tab open until the probe finishes.

## Find The Existing Tab

Prefer the tab id from DevTools inspection:

```bash
pnpm tsx scripts/browser-tools.ts --browser-target grok inspect --json
```

Find the Chrome session for the managed Grok browser profile and copy the tab
`id`, the session `port`, and the tab `url` for the submitted
`grok.com/imagine` tab. If there are multiple Imagine tabs, close extras or
use the exact tab id for the submitted run.

Optional bounded sanity check:

```bash
pnpm tsx scripts/browser-tools.ts --browser-target grok doctor --url-contains grok.com/imagine --json
```

## Start The Probe

Submit an async media-generation request that carries the existing tab id:

```bash
curl -s 'http://127.0.0.1:8080/v1/media-generations?wait=false' \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "grok",
    "mediaType": "video",
    "transport": "browser",
    "prompt": "manual Grok Imagine video readback probe only; do not submit",
    "metadata": {
      "grokVideoReadbackProbe": true,
      "grokVideoReadbackTabTargetId": "<TARGET_ID>",
      "grokVideoReadbackDevtoolsPort": <DEVTOOLS_PORT>,
      "grokVideoReadbackDevtoolsHost": "127.0.0.1",
      "grokVideoReadbackTabUrl": "<CURRENT_TAB_URL>",
      "artifactPollIntervalMs": 1000,
      "timeoutMs": 300000
    }
  }'
```

Poll either status surface with the returned `id`:

```bash
curl -s http://127.0.0.1:8080/v1/media-generations/<ID>/status
curl -s http://127.0.0.1:8080/v1/runs/<ID>/status
```

## Expected Evidence

The timeline should include `executor_started`, `capability_selected`,
`composer_ready`, repeated `run_state_observed` events, then either
`video_visible` and `artifact_materialized` before `completed`, or a specific
terminal failure. It should not include `capability_discovered` because this
diagnostic path bypasses capability preflight to avoid entrypoint discovery or
mode-audit side effects.

Successful readback should cache a `video/mp4` artifact under
`~/.auracall/runtime/media-generations/<ID>/artifacts` and both status
surfaces should agree on terminal status, last event, artifact count, and
cached artifact path. The cache path should prefer Grok's selected-media
download control (`aria-label = "Download"`) because generated
`assets.grok.com/users/.../generated_video.mp4` URLs can return `403` to
non-browser fetches even when the signed-in browser can download the file.

Expected failure classes:

- `media_generation_no_generated_output`: only public/template video evidence
  was visible.
- `media_generation_artifact_materialization_failed`: terminal generated
  video evidence appeared but neither the selected-media download control nor
  the direct asset URL produced a local artifact.
- `media_generation_provider_timeout`: no terminal generated video appeared
  before timeout.
- `media_generation_provider_blocked`: Grok exposed account, safety, rate
  limit, or blocked-state evidence.

## Cleanup

Stop only the local API server. Leave the browser tab open when diagnosing a
failed probe so the DOM and viewport still match the recorded status evidence.
