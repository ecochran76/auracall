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
| Attachments/files | Not first-class today | Partially supported | Web path supports Aura-Call file input; current live proof includes inline file bundling. Real Gemini attachment transport still needs hardening on at least one second browser pairing. |
| YouTube input | Not documented | Supported | Web executor has an explicit `--youtube` flow. |
| Generate image | Not documented | Supported | Web/browser path supports `--generate-image`. |
| Edit image | Not documented | Supported | Web/browser path supports `--edit-image`. |
| Search/tooling | Partially supported | Not documented | API maps `web_search_preview` to Gemini `googleSearch`; broader Gemini-side search is not yet a committed product surface. |
| Gem URL targeting | N/A | Supported | Via `--gemini-url` or the selected AuraCall runtime profile's `services.gemini.url`. |
| Cookie/login flow | N/A | Supported | Via `auracall login --target gemini` and cookie export fallback. |
| Browser doctor | N/A | Local-only supported | Use `auracall doctor --target gemini --local-only`; full live selector diagnosis is not implemented. |
| Session/provenance alignment | Shared Aura-Call semantics apply | Shared Aura-Call semantics apply | This is the next likely alignment area if a concrete gap is found. |

Deliberately not implied by this matrix:

- parity between Gemini API and Gemini web on every modality
- provider-side search beyond the current API tool mapping
- a broad rewrite onto the newest ChatGPT/Grok browser-service/provider seams

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

# Generate an image (writes an output file)
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
- `--browser-model-strategy` only affects ChatGPT automation; Gemini web always uses the explicit Gemini model ID.
- Linux: Gemini web mode decrypts Chrome cookies via `secret-tool` (libsecret). If you see `Failed to read Linux keyring via secret-tool`, install `libsecret-tools` or pass inline cookies with `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/cookies.json`.
- Linux: Gemini web mode decrypts Chrome cookies via `secret-tool` (libsecret). If you see `Failed to read Linux keyring via secret-tool`, install `libsecret-tools` or prefer the runtime-profile-scoped export file:
  - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/<auracallProfile>/gemini/cookies.json`
- `auracall login --target gemini --export-cookies` now fails fast if the opened Gemini page still shows a visible signed-out `Sign in` state, instead of waiting for cookies indefinitely.
- On Gemini specifically, Aura-Call will also try one bounded recovery click on a visible `Sign in` CTA before failing, which is enough on some already-authenticated Chrome profiles to complete the Google handoff and export cookies successfully.
- For `--file` inputs in Gemini browser mode, Aura-Call may satisfy the request by pasting file contents inline instead of using the real Gemini attachment transport. Treat inline-bundled file proofs as valid Aura-Call file-input proofs, but not as native Gemini upload proofs.
- On `wsl-chrome-2`, forcing real attachment mode with `--browser-attachments always` currently reaches the attachment path but is not yet reliable:
  - uploaded text-file proof returned `[NO CONTENT FOUND]`
  - uploaded image proof first said the image did not come through
  - after MIME and attachment-metadata fixes, the latest forced-upload image
    proof now fails explicitly with:
    - `Gemini accepted the attachment request but returned control frames only and never materialized a response body.`
  - repeating the same direct attachment request did not turn that control-only
    response into a real body later

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
