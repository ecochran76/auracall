# Grok409 same-browser comparison and worktree reconciliation

User requested comparing the failing route with working browsing and reconciling
the active worktrees. Source baseline121b3a0c1; source code is unchanged.

## Corrected diagnosis

The earlier HTTP500responses are real observations from one Bot reload. They
do not establish a browser-wide outage or the cause of the original Bot's empty
page. The earlier advice to wait for generic upstream recovery was too broad.

Primary passively compared two retained targets under the same verified original
account, configured managed browser profile and OS browser process. The original
synthetic test-Bot route had only the35-character navigation shell: no composer,
Bot header, Settings fields or response content. The second target had been
navigated from the reference conversation to a different Bot route. The first
comparison correctly stopped on the route change; it did not reload or navigate.

A current-route read then found10,448characters on the second page. A further
structural read separated the open Plugins dialog from the underlying page:
8,534characters and one composer remained outside the dialog. Thus the positive
control is more than an overlay. The dialog was left untouched. Original account
continuity, exact target attribution, admission settlement and cleanup passed
for both pages. Total reloads, uploads, prompts and mutations in this comparison:0.

The working-page React scan reached its8,000-fiber bound; no conclusion about
absence of its Bot DTO follows from that scan. The failing page's1,011-fiber
scan completed and exposed no observed Bot data/component. Neither observation
proves the original Bot exists, is deleted, is inaccessible, or has permanently
missing resource controls. No fresh working-page network trace was collected,
so the prior500s are not claimed to occur simultaneously with the positive
control. They remain unproven as the cause of the route-specific symptom.

409 remains OPEN on original Bot identity/loading and eventual resource-grant
acceptance. Investigation should now distinguish the original subject/route from
the working Bot instead of assuming whole-browser failure. No selector defect or
source fix is demonstrated.411's publication binding gap is unchanged;414is CLOSED.

## Worktree reconciliation

- Main checkout was clean and behind; fast-forwarded from5f4697f85 to121b3a0c1.
  It is now the sole coding checkout on `fix/grok409-browser-comparison`.
- The clean411research checkout's sole72561e040 commit was patch-equivalent to
  merged main, and its note was already retained through aa02a0f25/PR498. It had
  no ignored or untracked files and no retained runtime dependency. Removed the
  worktree normally, preserving its local and published branch.
- The clean406implementation checkout matched main121b3a0c1 and its published
  branch. Live Chrome roots plus their Node launcher retain its cwd. It stays
  runtime-only; no independent edits or process termination. Reconcile its ref
  to the final merged documentation without changing runtime source behavior.
- Unrelated legacy/other-lane worktrees were left untouched.

This is one coding location plus a necessary runtime hold, not two diverging
implementation lines. Prior review/findings counters remain1/1. No additional
code review, test suite, installed update or provider write was performed.

## Private evidence

Native IDs, account data and page content stay outside Git. Private scripts and
receipts are under `~/.auracall/private/grok/implementation-native/409-20261029-comparison/`.
SHA256 bindings:

- Changed-route refusal: `2d19668dfd8a69e69fc30587b4ea2848165f0cf8d3099d9227b8968c0f3cae7f`.
- Passive current-route comparison: `b623b56e5f7bc0ea2e9fffe1f4ec3ca04ac7dfd3eb2858164e39232313b3986e`.
- Underlying-page/dialog separation: `c392799e0567004c7fb80461b26988b729cb4d10db0c6144ae9f30ec484ed99b`.

Memory disposition:forbidden; no explicit memory-write request exists.
