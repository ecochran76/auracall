# Installed AuraCall is the live-canary authority

## Incident

On 2026-09-09 a LitScout ChatGPT connected-app canary invoked:

```text
pnpm tsx bin/auracall.ts --profile wsl-chrome-3 apps test ... --submit
```

from `/home/ecochran76/workspace.local/auracall`, which was checked out at
`9860b9d49` on `fix/plan0315-aggregate-status-latency`. That branch does not
contain durable-selector repair `24eaab891`. Its resolved browser target stayed
`gpt-5.2-pro`, so the live picker rejected it before composer selection or
prompt submission.

The user-scoped installed launcher was not defective in this incident.
`~/.local/bin/auracall` dispatches to the installed `0.1.1` runtime, whose
current resolver maps the retained `wsl-chrome-3` compatibility input
`gpt-5.2-pro` to `gpt-5.6-sol`. Installed help advertises durable selectors such
as `chatgpt:fast`, `chatgpt:reasoning-high`, and `chatgpt:premium`.

## Durable operator boundary

- Use the installed `auracall` command for installed/runtime/live canaries.
- Before a live effect, record `command -v auracall`, `auracall --version`, the
  installed launcher target, the AuraCall runtime profile, and the resolved
  effective model target.
- Use `pnpm tsx bin/auracall.ts` only for explicitly source-scoped development
  or validation against a frozen checkout. Never substitute it for installed
  runtime proof merely because the repository is adjacent or already open.
- When source execution is intended, require the exact branch/commit and prove
  that it contains the governing selector migration before browser effects.
- Keep supervising-agent selection separate from the ChatGPT actor model. A
  Luna worker does not imply a Luna ChatGPT picker choice.

## Remaining documentation drift

The durable-selector migration repaired current CLI help and operational smoke
defaults, while retaining versioned strings as compatibility/API/DOM inputs.
Some operator-facing examples remain stale on current `main`, including
`docs/configuration.md` and `skills/oracle/SKILL.md`. Those examples should be
converted to durable selectors in a separate bounded cleanup without deleting
intentional compatibility aliases, provider API identifiers, historical
receipts, or DOM matchers.

This note records the incident and boundary only. It does not alter AuraCall
source, configuration, installed runtime, browser state, or model selection.
