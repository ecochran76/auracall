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

## Documentation cleanup

The durable-selector migration repaired current CLI help and operational smoke
defaults, while retaining versioned strings as compatibility/API/DOM inputs.
The bounded follow-up converted the primary configuration example and bundled
compatibility-named `oracle` skill to the durable `chatgpt:premium` selector
for the current GPT-6 Pro lane. The skill's live browser command now uses the
installed `auracall` launcher. Intentional compatibility aliases, provider API
identifiers, historical receipts, and DOM matchers remain unchanged.

This note records the incident and boundary only. It does not alter AuraCall
source, configuration, installed runtime, browser state, or model selection.

## Installed-command follow-up

A subsequent single-attempt check used the installed `auracall` launcher with
the explicit durable selector `chatgpt:reasoning`. The installed resolver
resolved the internal target `gpt-5.6-sol`, proving that the earlier retired-ID
failure belonged to the stale source checkout rather than that resolution
step. Post-stop CDP inspection showed the visible composer control at
`5.6 Instant`; therefore this attempt did not prove that the resolved target
was selected in the live UI. Source inspection explains the difference:
developer-app `submitTest()` deliberately uses `modelStrategy: "current"` and
therefore preserves the active Chat model.

The installed `apps test --submit` path then stopped before prompt submission
for a separate reason: it passed the private LitScout developer-app name to
`ensureChatgptComposerTool`, which searched ChatGPT's generic top-level tools
menu. That menu exposed ordinary tools such as Web search and Deep research but
not the private app. Private developer apps are selected through the composer
ecosystem-mention picker (`@LitScout`), so this command is not currently an
eligible submitting canary path for them.

The retained ChatGPT tab remained on a blank healthy composer with zero user or
assistant turns. LitScout's invocation ledger and scoped canonical state were
unchanged. The zero-retry allowance was consumed by this qualification stop;
no second prompt was sent.

Source `apps test --submit` now carries the exact app identities into the shared
prompt path, selects through `@mention`, and verifies one composer-local
ecosystem pill with no document-reference pills in a fresh conversation before Send. The installed
`0.1.1` runtime used by this incident does not contain that repair and remains
ineligible until explicitly refreshed and read back.

The current operator contract is now reflected in `README.md`,
`docs/testing.md`, and `.agents/skills/auracall-chatgpt-browser/SKILL.md`. The
separate operator-example cleanup identified above is now complete without
changing the private-app submission boundary.

This source repair has provider-free test evidence only. It did not install a
runtime, change the retained browser, or consume another ChatGPT prompt.

## Superseding runtime readback

Later on 2026-09-09, published main `2762fcabd` was installed through the
supported user-runtime/service installer. Source and installed `dist`
inventories match across all 522 files, the API is healthy with zero restarts,
and the developer-app exact-mention repair is now present in the installed
runtime. This establishes installed-byte eligibility only; no browser, prompt,
developer-app invocation, or live acceptance ran.
