# Stale CDP endpoint collision — installed repair, 2026-10-23

Issue #240 / Plan0448. Operator reports the main browser apparently gone and an
unexplained Browser1 unable to close with Native desktop browser ownership changed.

## Evidence and repair

The unmatched row was the retained default/chatgpt blank browser PID2414370,
browser28774016-5548-4712-bb70-f6420ebebb47. A dead default/grok receipt PID19025
shared its CDP port45011. Admission rejected that stale candidate before reaching
the live verified browser. Main browser was already replaced with PID3060274,
browsercf8171c7-bc4b-4f02-9658-832a3d4dd932, two pages. No restart/exit actor or
explanation for prior typing/paste symptoms is inferred from these observations.

Source2538fbec0 / PR382 merged35bb3c855 ignores non-verifying endpoint candidates
only after /proc proves PID absence, requires a unique verified current native
owner, and keeps stale-only endpoints blocked. Live/unknown identity conflicts,
per-command generation validation, and human-control gates remain unchanged.
Historical records remain intact. Actual wire regression fails before repair with
the exact operator error; fourteen wire/close/control checks pass after, including
stale-only refusal and reused-process/control fences. Compile, lint and whitespace
checks pass. Primary Standards/Spec review found no blocking findings.

## Installed acceptance

Installed prefix ~/.auracall/user-runtime-issue240-custody-2538fbec0; API PID3109599.
Before shutdown, API selected zero run claims and background drain was idle.
Supported closeDesktopBrowser qualified the exact unmatched browser, rechecked its
only page was about:blank, and closed it without an OS kill or ownership bypass.
All13 captured process identities are absent. Main browser retains its verified
PID/start/browser identity; runtime profile wsl-chrome-3 is ready. Installed catalog
now has exactly one ready browser, so the unmatched Browser1 row disappears.

No main-browser navigation, tab mass closure, provider prompt, assignment adoption,
new marker or keyboard/paste test was performed. This proves endpoint/close repair,
not resolution of the separately reported native keyboard/clipboard symptoms.
Private receipts: ~/.local/state/auracall-stale-endpoint-20261023/result.json and
blank-processes.json; install log under the previous desktop-simplification private
receipt directory. Memory forbidden: no explicit save request.
