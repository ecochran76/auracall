# OpenAI-Compatible Endpoints

Oracle uses the official OpenAI Node.js SDK, which allows it to connect to any API that adheres to the OpenAI API specification. This includes:

- Official OpenAI API
- Azure OpenAI Service
- Local inference servers (e.g., vLLM, Ollama)
- Proxy servers (e.g., LiteLLM)

## AuraCall local compatibility server

AuraCall now has a bounded local development server for the first
OpenAI-compatible runtime surfaces:

```bash
auracall api serve --port 8080
```

Non-loopback bind is blocked by default. To opt into an unauthenticated public
bind intentionally:

```bash
auracall api serve --host 0.0.0.0 --listen-public --port 8080
```

Current endpoints:

- `GET /status`
- `GET /v1/models`
- `POST /v1/responses`
- `GET /v1/responses/{response_id}`

Current limits:

- loopback by default; non-loopback requires `--listen-public`
- runtime-backed create/read only
- `/status` reports explicit development posture, route surface, and
  unauthenticated/local-only state, including the current AuraCall version
- optional `X-AuraCall-*` headers for execution hints:
  - `X-AuraCall-Runtime-Profile`
  - `X-AuraCall-Agent`
  - `X-AuraCall-Team`
  - `X-AuraCall-Service`
- no auth
- no streaming/SSE
- no `POST /v1/chat/completions` adapter yet
- non-loopback host binding is still unauthenticated and warned as unsafe

This server is intended as the first local compatibility surface, not yet a
full production API layer.

Minimal local smoke:

```bash
# terminal 1
auracall api serve --port 8080

# terminal 2
curl http://127.0.0.1:8080/status

curl -s http://127.0.0.1:8080/v1/responses \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.2","input":"Reply exactly with: local api smoke"}'

curl http://127.0.0.1:8080/v1/responses/<response_id>
```

## Azure OpenAI

To use Azure OpenAI, point Oracle at your Azure resource and supply the Azure key:

```bash
export AZURE_OPENAI_ENDPOINT="https://your-resource-name.openai.azure.com/"
export AZURE_OPENAI_API_KEY="your-azure-api-key"
export AZURE_OPENAI_API_VERSION="2024-02-15-preview"
```

Key lookup for GPT-family models when an Azure endpoint is set:
- First looks for `AZURE_OPENAI_API_KEY`.
- Falls back to `OPENAI_API_KEY` if the Azure key is missing.

Without an Azure endpoint, Oracle keeps using `OPENAI_API_KEY` as before.

### CLI Configuration

You can also pass the Azure settings via CLI flags (env for the key is still recommended):

```bash
oracle --azure-endpoint https://... --azure-deployment my-deployment-name --azure-api-version 2024-02-15-preview
```

## Custom Base URLs (LiteLLM, Localhost)

For other compatible services that use the standard OpenAI protocol but a different URL:

```bash
oracle --base-url http://localhost:4000
```

Or via `config.json`:

```json
{
  "apiBaseUrl": "http://localhost:4000"
}
```

## Model aliases

Oracle keeps a stable CLI-facing model set, but some names are aliases for the concrete API model ids it sends:

- `gpt-5.1-pro` → `gpt-5.2-pro` (API)
- generic `pro` labels/defaults resolve to `gpt-5.1-pro` first, so operator-facing config does not need to pin a dated concrete Pro id

Notes:
- `gpt-5.1-pro` is a **CLI alias** for “the current Pro API model” — OpenAI’s API uses `gpt-5.2-pro`.
- If you want the classic Pro tier explicitly, use `gpt-5-pro`.

### Browser engine vs API base URLs

`--base-url` / `apiBaseUrl` only affect API runs. For browser automation, use `--chatgpt-url` (or `browser.chatgptUrl` in config) to point Chrome at a specific ChatGPT workspace/folder such as `https://chatgpt.com/g/.../project`.

### Example: LiteLLM

[LiteLLM](https://docs.litellm.ai/) allows you to use Azure, Anthropic, VertexAI, and more using the OpenAI format.

1. Start LiteLLM:
   ```bash
   litellm --model azure/gpt-4-turbo
   ```
2. Connect Oracle:
   ```bash
   oracle --base-url http://localhost:4000
   ```

## OpenRouter

Oracle can also talk to OpenRouter (Responses API compatible) with any model id:

```bash
export OPENROUTER_API_KEY="sk-or-..."
oracle --model minimax/minimax-m2 --prompt "Summarize the notes"
```

 - If `OPENROUTER_API_KEY` is set and no provider-specific key is available for the chosen model, Oracle defaults the base URL to `https://openrouter.ai/api/v1`.
 - You can still set `--base-url` explicitly; if it points at OpenRouter (with or without a trailing `/responses`), Oracle will use `OPENROUTER_API_KEY` and forward optional attribution headers (`OPENROUTER_REFERER` / `OPENROUTER_TITLE`).
- Multi-model runs accept OpenRouter ids alongside built-in ones. See `docs/openrouter.md` for details.
