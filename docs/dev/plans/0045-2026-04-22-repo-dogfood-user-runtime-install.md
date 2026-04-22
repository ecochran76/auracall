# Repo Dogfood And User Runtime Install | 0045-2026-04-22

State: CLOSED
Lane: P01

## Scope

Run one bounded repo-based dogfood pass after the team-run resolver fix, then
cut a user-scoped install command so day-to-day usage can run independently of
the repo checkout.

## Current State

- Repo dogfood from the checkout passed the normal operator surfaces:
  - config/profile resolution
  - recent session listing
  - Grok and ChatGPT browser doctors
  - Gemini local managed-profile doctor
  - local API server status
  - HTTP `POST /v1/team-runs` plus `/v1/responses/{id}` readback
- The HTTP team-run create/readback path queued behind earlier recoverable team
  runs, then completed successfully with the expected output.
- There was no need to reopen service/runner architecture.

## Change

- Added `pnpm run install:user-runtime`.
- Added `scripts/install-user-runtime.ts`:
  - builds the checkout
  - packs it with `npm pack`
  - installs the tarball under `~/.auracall/user-runtime`
  - writes user-owned wrappers to `~/.local/bin/auracall` and
    `~/.local/bin/auracall-mcp`
  - supports `--prefix`, `--bin-dir`, `--skip-build`, and `--dry-run`
- Added `docs/user-scoped-runtime.md`.
- Linked the repo dogfood install path from `README.md`.

## Acceptance Criteria

- Repo dogfood confirms the current checkout remains usable before installing
  a separate runtime.
- The install command creates an independent package copy under user-owned
  paths without requiring global npm state or sudo.
- Installed `auracall` can read the existing `~/.auracall` config/runtime
  state.
- Documentation explains what is installed and what state remains shared.

## Validation

- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts config show --team auracall-solo --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts profile list --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts status --hours 2 --limit 5`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 pnpm tsx bin/auracall.ts doctor --target grok --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 pnpm tsx bin/auracall.ts doctor --target chatgpt --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 pnpm tsx bin/auracall.ts doctor --target gemini --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 pnpm tsx bin/auracall.ts api serve --port 8098`
- `curl http://127.0.0.1:8098/status`
- `curl http://127.0.0.1:8098/v1/team-runs ...`
- `curl http://127.0.0.1:8098/v1/responses/teamrun_...`
- `pnpm run install:user-runtime -- --dry-run --skip-build --prefix /tmp/auracall-user-runtime-dry --bin-dir /tmp/auracall-user-runtime-bin`
- `pnpm run install:user-runtime`
- `~/.local/bin/auracall --version`
- `~/.local/bin/auracall config show --team auracall-solo --json`
- `pnpm run check`
- `pnpm test`
- `pnpm run test:mcp`
- `pnpm run plans:audit -- --keep 45`
- `git diff --check`
