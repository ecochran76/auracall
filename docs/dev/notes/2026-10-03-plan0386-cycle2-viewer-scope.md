# Plan 0386 cycle 2: inline card mistaken for viewer download

Work item: #165. Branch: `fix/issue-165-cycle2-diagnosis`.

Cycle 1 installed job `hmj_80d56a1c9430421fa12fa801f51aeebf` failed after
selecting a PDF: its isolated destination contained `Bailey_Project_Timeline.pptx`.
The filename verifier correctly rejected that mismatch. Selecting the first
candidate under maxItems=1 is not itself proven incorrect; the prior chat claim
that selection was the defect is withdrawn.

A bounded read-only capture of the restored exact conversation found three
inline assistant cards with generic `Download file` buttons. The first belonged
to the timeline PPTX. The viewer helper searched every page button and selected
the first matching generic label, without excluding conversation turns.

Feedback loop: `pnpm vitest run tests/browser/chatgptViewerDownloadScope.test.ts`.
It failed twice with `expected true to be false` for one inline card. Removing
that sole card passed. Fake timers reduced the five-second absence wait to
milliseconds. The repaired helper excludes conversation-turn descendants; tests
cover zero, one (minimal), and three (observed page shape) inline cards.
Existing positive viewer and trusted-pointer product replays remain green.

Installed counter remains 1/5. This source repair has not yet received its
installed control. Identity passed for the expected account on Chromium stealth
CDP 150; the preceding job observed 192 aggregate owned-browser requests, one
document request, zero top-level navigations, and six pointer events. These are
observation-window counters, not a claim that every request was job-caused.
Cleanup closed the exact browser; it was reopened only for read-only diagnosis.
Scheduler resume and unchanged/new-asset acceptance remain unproven.

No temporary debug logs were added. Runtime/private artifacts remain outside
Git; the synthetic regression contains no credentials or proposal contents.

Primary validation: 346 tests across viewer scope, adapter, product replay,
LLM files and history materialization; typecheck, scoped Biome lint, production
build, planning audit and diff hygiene passed. Standards/spec review confirms
this prevents the demonstrated inline-card click without changing candidate
ordering, download identity checks, or provider recovery authority.
