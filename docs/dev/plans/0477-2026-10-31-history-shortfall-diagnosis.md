# Plan0477 — Current-runtime history shortfall diagnosis

State: CLOSED
Owner: primary agent
Branch: docs/history-shortfall-diagnosis
Source baseline: f8f8ef732
Outcome: NOT_REPRODUCED_CURRENT_RUNTIME; single 50-row listing qualified

## Scope and bound

Apply diagnosing-bugs to Plan0475's unqualified 50-row delivery. Phase 1 first:
re-anchor runtime, reuse the public ChatgptService listing observation with passive
CDP history-read/scroll tracing and one bounded pre-close DOM count snapshot.
Exactly one live observation, historyLimit50, 120-second abort signal, no automatic
replay. No production edits, installation, service/browser restart, provider-limit
changes, prompts, warning clear, ownership override or scheduler/completion control.
Raw inventories, account information and transport details remain private.

## Current runtime qualification

The launcher now selects `~/.auracall/user-runtime-utility-parent-da8a1cb65`.
It incorporates the other agent's utility-parent repair. Its assembly receipt says
only configuredChatgptUtilityAffinity changed from history-budget-37058a435;
this investigation independently byte-compared the entire compiled ChatGPT adapter
and shared-listing module with that qualified baseline: both identical.
API PID2365238 healthy, 23workflows paused before observation. Current runtime and
source origin/main differ; this observation qualifies the named composite install,
not an unbuilt source checkout. Discovery of Plan0476 was advisory; assembly/byte
checks supply the current proof. No causal claim about that repair is established.

## Executed feedback observation

Private command (user-scoped diagnostics, not shipped executable):
`node ~/.local/state/auracall-history-diagnosis-20261031/observe.mjs`
returned exit0 and sanitized signal:

```json
{"ok":true,"count":50,"uniqueCount":50,"observedConnections":1,"elapsedMs":15525.22,"backendEvents":3,"responses":2,"failed":1,"admitted":2,"rejected":1}
```

History trace progressed9,14,19,24,27,32,37,39,42 mounted rows, while union retention
returned50unique conversations. The later close-time snapshot saw52unique links;
these are different observation times, not a count contradiction or a provider
total. Two native history GET events: one response, one failure. The single local
admission rejection is not proven HTTP429, and its causal classification is not
established. A fulfilled limit is allowed to succeed under the existing contract.
Diagnostics cover owned backend interception after attachment only; pre-attachment,
auth and non-backend traffic are excluded. Before-attachment elapsed2.60s. Do not
compare different warm/cold states as a controlled performance improvement.

The earlier9/39shortfall did not reproduce on the current install. No trustworthy
deterministic red loop for a remaining pager defect was established. Do not enter
hypothesis ranking, speculative instrumentation changes or source fixes merely
because earlier evidence was incomplete. Phases2–6 are not applicable to an
unreproduced new defect; the proven quota bug remains fixed under Plan0475.
No additional regression test: current evidence identifies no new failing seam.

## Postflight and remaining boundary

API PID2365238 unchanged/healthy; all23workflow IDs/states remain paused, scheduler
paused, config.json/api.env and launcher unchanged. ChatGPT PID275110 birth2074859
and Grok PID1156715 birth866957 remain the same scoped browser generations as the
prior baseline. The private observer exited; no runtime debug logs were added.
Artifacts: `~/.local/state/auracall-history-diagnosis-20261031/`, private0700/0600.
Documentation validation: git diff --check. Hosted CI skipped; no source changes.

Single50-row listing accepted. Two overlapping50-row callers on the current
runtime remain unverified: the earlier concurrency observation returned matching9,
although it proved sharing/cancellation. A future bounded paired observation can
qualify that separate criterion; this packet does not silently add another probe.
Current total history and the original pre-attachment delay remain unknown.
