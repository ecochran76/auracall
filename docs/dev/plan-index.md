# Canonical Plan Index

Use `docs/dev/plans/` for bounded active plan artifacts.

Current contract:
- keep long-range priority in `ROADMAP.md`
- keep turn-by-turn execution history in `RUNBOOK.md`
- keep bounded actionable plans in `docs/dev/plans/`
- keep low-signal historical plans in `docs/dev/plans/legacy-archive/`

Filename shape:
- prefer `0001-YYYY-MM-DD-plan-slug.md`

Plan state:
- `PLANNED`
- `OPEN`
- `CLOSED`
- `CANCELLED`

This index is informational only. Existing loose plan files under `docs/dev/`
should either be:
- promoted into canonical authority only when they still carry future dev signal
- archived under `docs/dev/plans/legacy-archive/` when they are historical only

Current canonical active execution plan:
- `docs/dev/plans/0001-2026-04-14-execution.md`
- `docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md`
- `docs/dev/plans/0006-2026-04-14-team-config-boundary.md`
- `docs/dev/plans/0007-2026-04-14-config-model-refactor.md`
- `docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md`
- `docs/dev/plans/0009-2026-04-14-agent-config-boundary.md`
- `docs/dev/plans/0010-2026-04-14-service-volatility-chatgpt.md`
- `docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md`
- `docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md`
- `docs/dev/plans/0013-2026-04-14-gemini-completion.md`
- `docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md`

Audit helper:
- `pnpm run plans:audit`
- `pnpm run plans:audit -- --json`

Legacy archive:
- use serial + ctime datestamp filenames
- treat archived files as searchable background, not active authority
