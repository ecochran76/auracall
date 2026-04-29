# Gemini Integration

Aura-Call supports Gemini in two distinct ways:

1. **Gemini API mode** (`--engine api`) via `GEMINI_API_KEY`
2. **Gemini web (cookie) mode** (`--engine browser`) via your signed-in Chrome cookies at `gemini.google.com` (no API key required)

## Supported feature matrix

This matrix is the current intended support baseline. It separates what is
implemented from what is merely plausible.

| Capability | Gemini API | Gemini web/browser | Notes |
| --- | --- | --- | --- |
| Text generation | Supported | Supported | Core happy path on both surfaces. |
| Streaming text | Supported | N/A | API adapter supports streaming; Gemini web executor returns a completed browser result. |
| Attachments/files | Not first-class today | Partially supported | Web path supports Aura-Call file input. Current live proof includes inline bundling, direct chat upload-chip reads/fetches for the proven surfaces, and Gem knowledge file CRUD. Account-level Gemini files are still not implemented. |
| YouTube input | Not documented | Supported | Web executor has an explicit `--youtube` flow. |
| Generate image | Supported through `auracall media generate --provider gemini --type image --transport api` with `GEMINI_API_KEY` | Supported | API path uses Gemini API Imagen `models.generateImages`; web/browser path supports durable media generation and legacy `--generate-image`. |
| Edit image | Not documented | Supported | Web/browser path supports `--edit-image`. |
| Search/tooling | Partially supported | Not documented | API maps `web_search_preview` to Gemini `googleSearch`; broader Gemini-side search is not yet a committed product surface. |
| Gem URL targeting | N/A | Supported | Via `--gemini-url` or the selected AuraCall runtime profile's `services.gemini.url`. |
| Gem/project listing | N/A | Supported | `auracall projects --target gemini` now lists live Gemini Gem rows through the generic browser provider path. |
| Gem/project create | N/A | Supported | `auracall projects create --target gemini <name>` now drives the native Gemini Gem create flow. |
| Gem/project rename | N/A | Supported | `auracall projects rename --target gemini <id> <name>` now uses the native Gemini edit page and verifies the persisted name there. |
| Gem/project delete | N/A | Supported | `auracall projects remove --target gemini <id>` now drives the native Gemini Gem delete flow from the direct `/gem/<id>` page and verifies absence from a refreshed Gem manager list. |
| Gem/project files add/list/remove | N/A | Supported | `auracall projects files add|list|remove --target gemini <id>` now drives Gemini Gem knowledge file CRUD through the native edit page and verifies persisted rows on fresh reads. |
| Conversation listing | N/A | Supported | `auracall conversations --target gemini` now lists live Gemini chats through the generic browser provider path. |
| Conversation context read | N/A | Partially supported | `auracall conversations context get --target gemini <id>` now reads canonical `messages[]`, visible sent `files[]`, visible generated-image `artifacts[]`, visible generated music/video `artifacts[]`, visible Canvas document `artifacts[]`, and visible Deep Research document `artifacts[]` from the direct `/app/<id>` page and writes them through the shared cache contract; Gemini `sources[]` and broader artifact coverage beyond the proven image/music/video/canvas/deep-research surfaces are still pending. |
| Conversation artifact fetch | N/A | Partially supported | `auracall conversations artifacts fetch --target gemini <id>` now materializes proven Gemini conversation artifacts into the local cache for canvas documents (`.txt`), Deep Research documents (`.txt`), generated video media (`.mp4`), and generated music media variants including MP4-with-art and MP3 when the provider menu exposes those options. Deep Research fetch prefers the live `Share & Export -> Copy contents` path when the export menu is automatable and otherwise falls back to the visible immersive-panel document text on the same `/app/<id>` page; broader artifact fetch coverage beyond the proven image/music/video/canvas/deep-research surfaces is still pending. |
| Conversation files list | N/A | Supported | `auracall conversations files list --target gemini <id>` now reads visible sent upload chips from the direct `/app/<id>` page through the shared conversation-context fallback. |
| Conversation files fetch | N/A | Partially supported | `auracall conversations files fetch --target gemini <id>` now materializes visible chat-uploaded files from the direct `/app/<id>` page, including text-file chips and uploaded-image chips, with browser-native fallback capture for visible uploaded-image previews when signed media URLs are not directly fetchable; broader file-fetch coverage beyond those currently exposed chat surfaces is still pending. |
| Account-level files | N/A | Not supported | Shared CLI/service seams exist, but Gemini does not yet expose a wired provider implementation for `account-files list|add|remove`. Gemini `My stuff` is treated as a conversation/artifact link index, not an account-file CRUD surface. |
| Conversation rename | N/A | Supported | `auracall rename --target gemini <id> <name>` now drives the native Gemini conversation rename dialog from the direct `/app/<id>` page and verifies the renamed row on a fresh root list read. |
| Conversation delete | N/A | Supported | `auracall delete --target gemini <id>` now drives the native Gemini conversation delete flow from the direct `/app/<id>` page and verifies absence from a refreshed conversation list. |
| Cache/operator tooling | N/A | Partially supported | `auracall cache --provider gemini`, `auracall cache export --provider gemini ...`, `auracall cache context list|get --provider gemini`, `auracall cache search --provider gemini`, `auracall cache sources list --provider gemini`, `auracall cache artifacts list --provider gemini`, and `auracall cache files list|resolve --provider gemini` now operate on Gemini cache data; semantic search and some maintenance/reporting depth are still being aligned on the same provider cache surface. |
| Cookie/login flow | N/A | Supported | Via `auracall login --target gemini` and cookie export fallback. |
| Browser doctor | N/A | Partially supported | `auracall doctor --target gemini` now reports the live signed-in account plus detected Gemini feature/drawer signature when a managed browser instance is alive. It also exits nonzero and gives manual-clear guidance if the selected managed Gemini page is blocked by `google.com/sorry`, CAPTCHA, reCAPTCHA, Cloudflare, or a similar human-verification surface. Full live selector diagnosis is still not implemented there, but `browser-tools search` can now do structured live DOM discovery against the same managed Gemini page. |
| Browser feature discovery | N/A | Supported | `auracall features --target gemini --json` now emits a versioned `auracall.browser-features` contract backed by browser-service `uiList` evidence from the live Gemini `Tools` drawer. |
| Browser feature snapshot/diff | N/A | Supported | `auracall features snapshot --target gemini --json` now saves live feature contracts under `~/.auracall/feature-snapshots/<auracallProfile>/gemini/`, and `auracall features diff --target gemini --json` compares the current live Gemini surface against the latest saved snapshot. |
| Session/provenance alignment | Shared Aura-Call semantics apply | Shared Aura-Call semantics apply | This is the next likely alignment area if a concrete gap is found. |

Deliberately not implied by this matrix:

- parity between Gemini API and Gemini web on every modality
- provider-side search beyond the current API tool mapping
- a broad rewrite onto the newest ChatGPT/Grok browser-service/provider seams

Current closure note:
- The Gemini conversation-artifact lane is closed for now at the currently
  proven surfaces:
  - image
  - music
  - video
  - canvas
  - Deep Research document
- New Gemini artifact/file work should only reopen when the live DOM proves a
  new stable surface or a regression appears on one of those existing
  surfaces.

## Usage (API)

1. **Get an API Key:** Obtain a key from [Google AI Studio](https://aistudio.google.com/).
2. **Set Environment Variable:** Export the key as `GEMINI_API_KEY`.
   ```bash
   export GEMINI_API_KEY="your-google-api-key"
   ```
3. **Run Aura-Call:** Use the `--model` (or `-m`) flag to select Gemini.
   ```bash
   auracall --engine api --model gemini --prompt "Explain quantum entanglement"
   ```
   You can also use the explicit model ID:
   ```bash
   auracall --engine api --model gemini-3-pro --prompt "..."
   ```

## Usage (Gemini web / cookies)

Gemini web mode is a cookie-based client for `gemini.google.com`. It does **not** use `GEMINI_API_KEY` and does **not** drive ChatGPT.

Prereqs:
- Chrome installed.
- Signed into `gemini.google.com` in the Chrome profile Aura-Call uses (default: `Default` profile).
- Target a specific Gem with `--gemini-url "https://gemini.google.com/gem/<id>"` or the selected AuraCall runtime profile's `services.gemini.url` in config.
- If cookies are missing, run `auracall login --target gemini` to open the same profile for sign-in.
- If Chrome cookies are locked (common on Windows) or Linux keyring decryption fails, run `auracall login --target gemini --export-cookies` to save cookies to the selected managed Gemini browser profile first:
  - `~/.auracall/browser-profiles/<auracallProfile>/gemini/cookies.json`
  - Aura-Call still mirrors that export to `~/.auracall/cookies.json` as a compatibility fallback.
- Local managed browser-profile inspection is available via:
  - `auracall doctor --target gemini --local-only`
- Live Gemini feature discovery is available via:
  - `auracall features --target gemini --json`
  - `auracall features snapshot --target gemini --json`
  - `auracall features diff --target gemini --json`
- These feature commands now stop early and exit nonzero if the selected
  managed Gemini page is on a blocking surface that requires human clearance.
- Full live Gemini UI selector diagnosis is not implemented in `auracall doctor` yet.

Primary config shape example:
```json5
{
  version: 3,
  defaultRuntimeProfile: "gemini-default",
  browserProfiles: {
    default: {
      sourceProfileName: "Default",
      managedProfileRoot: "/home/me/.auracall/browser-profiles",
    },
  },
  runtimeProfiles: {
    "gemini-default": {
      browserProfile: "default",
      engine: "browser",
      defaultService: "gemini",
      services: {
        gemini: {
          url: "https://gemini.google.com/gem/<id>",
        },
      },
    },
  },
}
```

Compatibility note:
- Aura-Call still accepts the older `browser.geminiUrl` config key on reads.
- Prefer `runtimeProfiles.<name>.services.gemini.url` in new configs so Gemini
  URL targeting stays attached to the selected AuraCall runtime profile instead
  of a browser-global field.

Examples:
```bash
# Text run
auracall --engine browser --model gemini-3-pro --prompt "Say OK."

# Discover live Gemini tools/toggles on the managed browser session
auracall features --target gemini --json

# Save a live Gemini feature snapshot, then diff against the latest snapshot
auracall features snapshot --target gemini --json
auracall features diff --target gemini --json

# Preferred durable image generation path
auracall media generate --provider gemini --type image \
  --prompt "a cute robot holding a banana" --json

# Gemini API image generation path (requires GEMINI_API_KEY)
auracall media generate --provider gemini --type image --transport api \
  --prompt "a cute robot holding a banana" --count 1 --aspect-ratio 1:1 --json

# Legacy compatibility shortcut (writes one output file directly)
auracall --engine browser --model gemini-3-pro \
  --prompt "a cute robot holding a banana" \
  --generate-image out.jpg --aspect 1:1

# Edit an image (input via --edit-image, output via --output)
auracall --engine browser --model gemini-3-pro \
  --prompt "add sunglasses" \
  --edit-image in.png --output out.jpg
```

Notes:
- If your logged-in Gemini account can’t access “Pro”, Aura-Call will auto-fallback to a supported model for web runs (and logs the fallback in verbose mode).
- This path runs fully in Node/TypeScript (no Python/venv dependency).
- Use `auracall media generate` for new image/music/video automation when you
  need durable ids, status polling, timeline evidence, and cached artifacts.
  Add `--transport api` for Gemini API image generation through
  `GEMINI_API_KEY`; the default API image model is Imagen
  `imagen-4.0-generate-001`, with `--model` available for current Google model
  ids. Provider API media access is parked for current dogfooding; use browser
  media paths unless intentionally validating the API path.
  `--generate-image <file>` is retained as a Gemini-only compatibility
  shortcut for direct one-file browser image saves.
- `--browser-model-strategy` only affects ChatGPT automation; Gemini web always uses the explicit Gemini model ID.
- Linux: Gemini web mode decrypts Chrome cookies via `secret-tool` (libsecret). If you see `Failed to read Linux keyring via secret-tool`, install `libsecret-tools` or pass inline cookies with `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/cookies.json`.
- Linux: Gemini web mode decrypts Chrome cookies via `secret-tool` (libsecret). If you see `Failed to read Linux keyring via secret-tool`, install `libsecret-tools` or prefer the runtime-profile-scoped export file:
  - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/<auracallProfile>/gemini/cookies.json`
- `auracall login --target gemini --export-cookies` now fails fast if the opened Gemini page still shows a visible signed-out `Sign in` state, instead of waiting for cookies indefinitely.
- On Gemini specifically, Aura-Call will also try one bounded recovery click on a visible `Sign in` CTA before failing, which is enough on some already-authenticated Chrome profiles to complete the Google handoff and export cookies successfully.
- If Gemini shows `google.com/sorry`, CAPTCHA, reCAPTCHA, or similar
  human-verification state, stop automated retries on that managed browser
  profile. Until captcha automation exists, a human must clear that page
  before Aura-Call should resume Gemini automation on that session.
- `auracall login --target gemini`, `auracall setup --target gemini`,
  `auracall doctor --target gemini`, `auracall features --target gemini`, and
  the shared browser-run path now all surface that blocking state explicitly
  and stop early instead of treating it as an ordinary page.
- For `--file` inputs in Gemini browser mode, Aura-Call may satisfy the request by pasting file contents inline instead of using the real Gemini attachment transport. Treat inline-bundled file proofs as valid Aura-Call file-input proofs, but not as native Gemini upload proofs.
- On Gemini specifically, `--browser-attachments always` now routes ordinary
  attachment-backed browser runs through the live Gemini page itself rather
  than the earlier raw Gemini upload protocol path.
- Current live proof on `wsl-chrome-2`:
  - real upload-mode text-file proof is green and returned the exact uploaded
    contents
- Current Gemini Gem CRUD checkpoint on `wsl-chrome-2`:
  - `auracall projects create --target gemini <name>` is live through the
    native `/gems/create -> /gems/edit/<id>` flow
  - first disposable live proof:
    - `AuraCall Gemini Gem CRUD Proof 2026-04-04 1854`
  - `auracall projects rename --target gemini <id> <name>` is now also live
    through the native `/gems/edit/<id>` flow
  - `auracall projects remove --target gemini <id>` is now also live through
    the native direct `/gem/<id>` delete flow
  - disposable live delete proof:
    - created `AuraCall Gemini Gem Delete Proof 2026-04-04 1935`
    - resolved id `525572997076`
    - removed it with `projects remove --target gemini`
    - refreshed Gem list no longer included that id
- Current Gemini conversation/cache checkpoint on `wsl-chrome-2`:
  - `auracall conversations --target gemini` is live again on the generic
    browser provider path
  - `auracall conversations context get --target gemini <id> --json-only` is
    now live for canonical `messages[]`, visible sent `files[]`, and visible
    generated `artifacts[]` through the direct `/app/<id>` page read path:
    - generated images
    - generated music tracks
    - generated videos
    - canvas documents
    - Deep Research documents
  - `auracall conversations files list --target gemini <id>` is now also live
    for visible sent uploads on the same direct chat-page surface
  - `auracall conversations files fetch --target gemini <id>` is now also live
    for:
    - visible text-file upload chips
    - visible uploaded-image chips
    - multi-upload direct chat proof:
      - `ab30a4a92e4b65a9` now returns exactly two visible uploads across
        `context get`, `files list`, and `files fetch`:
        - `uploaded-image-1`
        - `AGENTS.md`
    - current live uploaded-image proof on `default`:
      - `auracall conversations context get ab30a4a92e4b65a9 --target gemini --profile default --json-only`
        - returns one visible uploaded-image file in `files[]`
      - `auracall conversations files list ab30a4a92e4b65a9 --target gemini --profile default`
        - returns:
          - `gemini-conversation-file:ab30a4a92e4b65a9:0:uploaded-image-1`
      - `auracall conversations files fetch ab30a4a92e4b65a9 --target gemini --profile default --verbose`
        - materializes:
          - `uploaded-image-1`
    - implementation note:
      - Gemini user-turn upload chips should be treated as clickable button
        hosts under `user-query`, not separate text-file vs image-only selector
        families
  - `auracall rename --target gemini <id> <name>` is now also live through the
    native `/app/<id>` conversation actions menu and rename dialog
  - Gemini conversation cache identity now falls back to the managed browser
    profile's Google-account state when a live page label is unavailable
  - live cache files now write under:
    - `~/.auracall/cache/providers/gemini/ecochran76@gmail.com/`
  - current live Canvas proof on `default`:
    - `auracall conversations context get 59b6f9ac9e510adc --target gemini --profile default --refresh --json-only`
    - returns:
      - `kind = "canvas"`
      - `uri = "gemini://canvas/59b6f9ac9e510adc"`
      - `metadata.contentText`
      - `metadata.createdAt`
      - `metadata.hasShareButton = true`
      - `metadata.hasPrintButton = true`
  - Gemini artifact fetch is now also live for the currently proven surfaces:
    - `auracall conversations artifacts fetch 59b6f9ac9e510adc --target gemini --profile default`
      - materializes `AuraCall Canvas Route Probe.txt`
    - `auracall conversations artifacts fetch 06ebd4699b387019 --target gemini --profile default`
      - materializes `Researching FreshRoof Soy Technology Claims.txt`
    - `auracall conversations artifacts fetch 8e8e58b57ae544ea --target gemini --profile default`
      - materializes `before_the_tide_returns.mp4`
    - `auracall conversations artifacts fetch 23340d1698de29b8 --target gemini --profile default`
      - materializes `video.mp4`
    - current Deep Research boundary:
      - AuraCall now surfaces Deep Research results as first-class Gemini
        `document` artifacts
      - fetch prefers the native `Share & Export -> Copy contents` path
      - if that export menu item is not reachable on the live page, fetch
        falls back to the visible immersive-panel document text
- Gemini cache operator entry points now also accept provider `gemini`:
  - `auracall cache --provider gemini`
  - `auracall cache export --provider gemini --scope ...`
- Gemini browser doctor is now useful beyond local file inspection:
  - `auracall doctor --target gemini --json`
  - returns:
    - local managed-profile state
    - live signed-in account identity when a managed Gemini session is alive
    - `featureStatus` with a normalized Gemini feature signature for detected
      drawer/composer surfaces
    - first-class blocking-state classification when the selected Gemini page
      is on `google.com/sorry`, CAPTCHA, reCAPTCHA, Cloudflare, or another
      human-verification surface
  - current boundary:
    - this is a feature/discovery seam, not full live selector diagnosis
    - package-owned live DOM discovery is available through:
      - `pnpm tsx scripts/browser-tools.ts --auracall-profile <name> --browser-target gemini search ...`
    - current live `default` proofs through `browser-tools search`:
      - `Tools` opener via `--class-includes toolbox-drawer-button --text Tools`
      - drawer rows via `--class-includes toolbox-drawer-item-list-button --role menuitemcheckbox`
      - `Personal Intelligence` via `--aria-label "Personal Intelligence" --role switch`
- The earlier raw Gemini upload protocol investigation is still preserved in:
  - [gemini-native-upload-investigation.md](/home/ecochran76/workspace.local/auracall/docs/dev/gemini-native-upload-investigation.md)
  - but it is now background context, not the default path for ordinary Gemini
    browser uploads

## Implementation details

### Gemini API adapter

- `src/oracle/gemini.ts` — adapter using `@google/genai` that returns a `ClientLike`.
  - Model IDs: `gemini-3-pro` maps to the provider ID (currently `gemini-3-pro-preview`).
  - Request mapping: `OracleRequestBody` → Gemini request; `web_search_preview` maps to Gemini search tooling.
  - Response mapping: Gemini responses → `OracleResponse`.
  - Streaming: wraps Gemini’s async iterator as `ResponseStreamLike`.
- `src/oracle/run.ts` — selects `GEMINI_API_KEY` vs `OPENAI_API_KEY` based on model prefix.
- `src/oracle/config.ts` / `src/oracle/types.ts` — model config + `ModelName`.

### Gemini web client (cookie-based)

- `src/gemini-web/client.ts` — talks to `gemini.google.com` and downloads generated images via authenticated `gg-dl` redirects.
- `src/gemini-web/executor.ts` — browser-engine executor for Gemini (loads Chrome cookies and runs the web client).

## Testing

- Unit/regression: `pnpm vitest run tests/gemini.test.ts tests/gemini-web`
- Live (API): `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/gemini-live.test.ts`
- Live (Gemini web/cookies): `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/gemini-web-live.test.ts`

Current intended live-proof surfaces for Gemini web:

- text
- attachment
- YouTube
- generate-image
- edit-image

If a Gemini gap is discovered, first decide whether it is:

- a true capability gap
- a proof/documentation gap
- or an architecture-alignment gap with shared Aura-Call browser/runtime
  semantics
