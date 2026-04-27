# Grok 4.20 (xAI) Support

Status: **Maintenance** (April 2026)
Owner: Aura-Call CLI

- Current model key: `grok-4.20` (mapped to API id `grok-4.20-reasoning`). Alias: `grok`.
- Legacy model key: `grok-4.1` remains accepted when explicitly requested.
- Endpoint: defaults to `https://api.x.ai/v1` or `XAI_BASE_URL`. Uses the OpenAI **Responses API** surface.
- Auth: `XAI_API_KEY`.
- Background runs: **not supported** by the Grok API (requests with `background: true` are rejected). Aura-Call forces foreground streaming even if `--background` is set.
- Search tools: Grok expects `web_search`; OpenAI’s `web_search_preview` is not accepted.
- Context: 2M token context for the current Grok 4.20 family.
- Grok Imagine image/video generation is a separate API surface. Aura-Call has
  browser-backed Grok Imagine image generation and controlled browser-backed
  Grok Imagine video generation with status polling and MP4 artifact caching.
  Fresh image submissions stay on the submitted `/imagine` tab until generated
  masonry/filmstrip media is stable and visible tiles are cached. Resumed or
  direct full-quality materialization may then use the provider's saved
  generations (`/imagine/saved`) and files (`/files`) surfaces to find a
  download control. Operators can rerun that resumed path against an existing
  durable image run with:
  `auracall media materialize <media_generation_id> --count 1 --json`.
  Use `docs/grok-imagine-video-readback-runbook.md` only for the diagnostic
  existing-tab video readback probe.

## Browser Automation

Aura-Call supports full browser automation for Grok, including manual login persistence, project switching, and conversation management.

### Setup & Login

1.  **Initial Login:**
    ```bash
    auracall setup --target grok
    ```
    This launches the Aura-Call-managed Grok profile, prompts for sign-in when needed, and verifies it with a real browser run. Aura-Call keeps the session in its managed profile store under `~/.auracall/browser-profiles/<auracallProfile>/grok`, bootstraps that profile from your configured Chrome profile on first use, and will refresh it on later `login`/`setup` runs when the source Chrome cookies are newer.

2.  **Running Queries:**
    ```bash
    auracall "Analyze this code" --engine browser --model grok
    ```
    Aura-Call will reuse the manual profile cookies to authenticate automatically.

### Advanced Features

-   **Model Switching:**
    Switch between Grok modes using the label override. The browser picker labels are now driven by the Grok service registry (`Auto`, `Fast`, `Expert`, `Heavy`) instead of being hard-coded in the selector logic:
    ```bash
    auracall "Quick question" --engine browser --model grok --browser-model-label Fast
    ```
    Legacy aliases are normalized through the service registry, so older values like `Grok 4.1 Thinking` resolve to the closest current picker entry while plain `grok` targets the current Grok 4.20 browser mode.

-   **Project / Conversation Management:**
    List your available projects and conversations to find IDs:
    ```bash
    auracall projects --target grok
    auracall conversations --target grok --refresh --include-history
    ```
    Manage project files:
    ```bash
    auracall projects files list <id> --target grok
    auracall projects files add <id> -f path/to/file --target grok
    auracall projects files remove <id> <file-name> --target grok
    ```

-   **Targeting Specific Projects:**
    Run a query within a specific project context (overrides config defaults):
    ```bash
    auracall "Contextual question" --engine browser --model grok --project-id <id>
    ```

### Troubleshooting

-   **Session Not Persisting:** Ensure you have run `auracall setup --target grok` or `auracall login --target grok` once. Aura-Call reuses the persistent managed profile at `~/.auracall/browser-profiles/<auracallProfile>/grok` by default (override with `AURACALL_BROWSER_PROFILE_DIR` or `browser.manualLoginProfileDir`). If you re-log the source Chrome profile and need Aura-Call to pick up that newer auth state, rerun `auracall setup --target grok`; add `--force-reseed-managed-profile` to rebuild the managed profile immediately from the source profile.
-   **Wrong Project Loaded:** If `auracall.config.json` has a default `grokUrl`, it might override your intent. Use `--project-id` explicitly to force navigation to the correct workspace.
-   **Empty Conversation List:** If `auracall conversations` returns an empty list:
    -   Ensure the browser window is not stuck. The scraper attempts to toggle the menu and close the history dialog automatically.
    -   Try running with `--refresh` to force a re-scrape.
    -   Check if the UI has changed; the scraper relies on `role="option"` and `data-value` attributes.
-   **No Window on Linux:** Aura-Call launches a headful Chrome for manual login/listing. If you do not see a window, ensure `DISPLAY` is set (Aura-Call normalizes `DISPLAY=0`/`0.0` to `:0.0`).
