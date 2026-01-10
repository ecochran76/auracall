# Grok 4.1 (xAI) Support

Status: **Stable** (January 2026)
Owner: Oracle CLI

- Model key: `grok-4.1` (mapped to API id `grok-4-1-fast-reasoning`). Alias: `grok`.
- Endpoint: defaults to `https://api.x.ai/v1` or `XAI_BASE_URL`. Uses the OpenAI **Responses API** surface.
- Auth: `XAI_API_KEY`.
- Background runs: **not supported** by the Grok API (requests with `background: true` are rejected). Oracle forces foreground streaming even if `--background` is set.
- Search tools: Grok expects `web_search`; OpenAI’s `web_search_preview` is not accepted.
- Pricing (preview): $0.20 / 1M input tokens, $0.50 / 1M output tokens; 2M token context.

## Browser Automation

Oracle supports full browser automation for Grok, including manual login persistence, project switching, and conversation management.

### Setup & Login

1.  **Initial Login:**
    ```bash
    oracle --browser-manual-login --model grok
    ```
    This launches a dedicated Chrome instance. Log in to your xAI account. The session (cookies) will be saved to `~/.oracle/browser-profile`.

2.  **Running Queries:**
    ```bash
    oracle "Analyze this code" --engine browser --model grok
    ```
    Oracle will reuse the manual profile cookies to authenticate automatically.

### Advanced Features

-   **Model Switching:**
    Switch between Grok modes (e.g., "Fast", "Grok 4.1 Thinking") using the label override:
    ```bash
    oracle "Quick question" --engine browser --model grok --browser-model-label Fast
    ```

-   **Project / Conversation Management:**
    List your available projects and conversations to find IDs:
    ```bash
    oracle projects --target grok
    oracle conversations --target grok --refresh --include-history
    ```

-   **Targeting Specific Projects:**
    Run a query within a specific project context (overrides config defaults):
    ```bash
    oracle "Contextual question" --engine browser --model grok --project-id <id>
    ```

### Troubleshooting

-   **Session Not Persisting:** Ensure you have run the manual login step once. Oracle reuses the persistent profile at `~/.oracle/browser-profile` (override with `ORACLE_BROWSER_PROFILE_DIR`).
-   **Wrong Project Loaded:** If `oracle.config.json` has a default `grokUrl`, it might override your intent. Use `--project-id` explicitly to force navigation to the correct workspace.
-   **Empty Conversation List:** If `oracle conversations` returns an empty list:
    -   Ensure the browser window is not stuck. The scraper attempts to toggle the menu and close the history dialog automatically.
    -   Try running with `--refresh` to force a re-scrape.
    -   Check if the UI has changed; the scraper relies on `role="option"` and `data-value` attributes.
-   **No Window on Linux:** Oracle launches a headful Chrome for manual login/listing. If you do not see a window, ensure `DISPLAY` is set (Oracle normalizes `DISPLAY=0`/`0.0` to `:0.0`).
