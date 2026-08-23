# Plan 0308 Git Custody And Oracle Reference Review

Date: 2026-08-23

This receipt freezes AuraCall repository custody and the first bounded review
of Oracle as a separate reference project. It authorizes no branch, remote-ref,
or worktree deletion and no Oracle-derived implementation.

## Evidence Boundary

- AuraCall baseline: `main == origin/main == 68da5063cdeed6dfc1d40e3e46dbc66344634d06`
  after fresh no-tag fetches; divergence was `0/0` before the execution branch.
- Execution branch: `chore/plan0308-repository-true-up`, initially published at
  `04f4067d460204ef2a624572fd26b70e3ea9fbe3`.
- Oracle research snapshot: Git remote `upstream`, branch tip
  `083bba7e61f487ad3d99b42039d9f603f61dc4ff` dated 2026-08-14.
- Historical common base: `2408811f7e395925e68f521faf3fd559c40fbfcd`.
  Divergence is `517` Oracle-only and `1,784` AuraCall-only commits. This is
  project divergence, not AuraCall synchronization debt.
- Evidence commands: `git fetch --no-tags origin`, `git fetch --no-tags upstream`,
  `git for-each-ref`, `git worktree list --porcelain`, `git merge-base --is-ancestor`,
  `git cherry -v`, `git patch-id --stable`, and focused source/test inspection.

## Local Branch Custody

The initial census contained 18 branches. The execution branch raises the
current population to 19. `main` is the integration target and the execution
branch is the sole active lane; all other topic refs are retained evidence or
cleanup candidates pending exact operator authority.

| Local branch | Tip at census | Evidence | Disposition |
| --- | --- | --- | --- |
| `chore/plan0308-repository-true-up` | `04f4067d` initial checkpoint | active worktree; equal to origin at checkpoint | active Plan 0308 lane |
| `main` | `68da5063` | equal to `origin/main` at baseline | integration target |
| `chore/host-stranded-recovery` | `8b06605c` | ancestor of main; origin equal | cleanup candidate |
| `fix/chatgpt-app-refresh` | `7ee9df47` | ancestor of main; no origin tracking ref; clean worktree | cleanup candidate, local-only custody retained |
| `fix/chatgpt-app-test-current-model` | `2686511b` | ancestor of main; origin equal; clean worktree | cleanup candidate |
| `fix/plan0294-browser-launch-plan-function-clone` | `b45cc959` | ancestor of main; origin equal; clean worktree | cleanup candidate |
| `fix/plan0295-chatgpt-local-upload-surface` | `ec1859ee` | ancestor of main; origin equal | cleanup candidate |
| `fix/plan0296-chatgpt-composer-target` | `057f387d` | ancestor of main; origin equal; clean worktree | cleanup candidate |
| `fix/plan0297-chatgpt-implicit-chat-conversation-mode` | `61ce0c82` | ancestor of main; origin equal | cleanup candidate |
| `fix/plan0299-chatgpt-work-marker-semantic-repair` | `cf12ddfa` | ancestor of main; origin equal | cleanup candidate |
| `fix/plan0300-chatgpt-tool-approval-acknowledgment` | `fa831b02` | ancestor of main; origin equal | cleanup candidate |
| `fix/plan0301-chatgpt-post-submit-profile-lock` | `e5917183` | ancestor of main; origin equal | cleanup candidate |
| `fix/plan0302-chatgpt-timeout-signal-cleanup` | `f7e1aa73` | ancestor of main; origin equal | cleanup candidate |
| `runtime-service-mainline` | `232e6f21` | ancestor of main; origin equal | cleanup candidate |
| `runtime/responses-host-seam` | `a4cec5f6` | ancestor of main; origin equal | cleanup candidate |
| `sync/upstream-browser-reliability` | `dbbe1d9f` | ancestor of main; origin equal | retained historical compatibility ref; name does not imply current Oracle sync |
| `fix/chatgpt-advanced-effort-selector` | `34d92c36` | non-ancestor; origin equal; clean worktree | cleanup candidate after semantic port; retain until cleanup authority |
| `fix/chatgpt-advanced-effort-selector-main-refresh` | `5f6d8eef` | non-ancestor; origin equal; clean worktree | cleanup candidate after semantic port; retain until cleanup authority |
| `runtime-service-foundation` | `5b33703e` | non-ancestor; origin equal; all commits patch-equivalent | archival/cleanup candidate |

The 14 topic branches that were ancestral to `main` at the initial census are
the entries from `chore/host-stranded-recovery` through
`sync/upstream-browser-reliability` above. No unique source work is inferred
from their retained refs.

## Linked Worktree Custody

All seven worktrees were clean at the frozen census. Plan 0308 makes the root
worktree dirty only through its named source/test/doc write set.

| Path | Branch | Disposition |
| --- | --- | --- |
| `/home/ecochran76/workspace.local/auracall` | `chore/plan0308-repository-true-up` | active until integration |
| `/home/ecochran76/workspace.local/auracall-plan0259-thinking-time` | `fix/chatgpt-advanced-effort-selector` | removal candidate after final clean check and authority |
| `/home/ecochran76/workspace.local/auracall-plan0261-selector-refresh` | `fix/chatgpt-advanced-effort-selector-main-refresh` | removal candidate after final clean check and authority |
| `/home/ecochran76/workspace.local/auracall-plan0267-h3` | `fix/chatgpt-app-refresh` | removal candidate after final clean check and authority |
| `/home/ecochran76/workspace.local/auracall-plan0282-app-test-current-model` | `fix/chatgpt-app-test-current-model` | removal candidate after final clean check and authority |
| `/home/ecochran76/workspace.local/auracall-plan0294-launch-plan-clone` | `fix/plan0294-browser-launch-plan-function-clone` | removal candidate after final clean check and authority |
| `/home/ecochran76/workspace.local/auracall-plan0295-local-upload-surface` | `fix/plan0296-chatgpt-composer-target` | removal candidate after final clean check and authority |

No process-use claim was made for the six non-root paths. Before any removal,
recheck exact porcelain, branch/path ownership, and operator workflow use.

After freezing that seven-worktree population, Plan 0308 created
`/home/ecochran76/workspace.local/auracall-plan0308-main-catalog` as the clean
`main` integration worktree so the default-branch catalog could be committed
without changing feature-branch custody. It remains the current main checkout
at closeout and is intentionally retained; removing even this plan-created
worktree was not necessary for acceptance.

## Selector Family Adjudication

The two selector branches were not merged. Their source commits `b27b0c99` and
`85de5fb0` have the same functional patch. Their remaining commits
`34d92c36`, `be0056d4`, and `5f6d8eef` are historical plan/acceptance records,
not missing product behavior.

- The old thinking-time half is superseded by main commit `7bca2532`, which
  recognizes compact `EffortPro` controls structurally and carries a live-shaped
  fixture.
- Current main still lacked the model-picker half: compact `Advanced`,
  `ModelGPT-*`, and aria-label-backed controls.
- Plan 0308 ports only that missing semantic slice into current
  `modelSelection.ts` with current tests. It does not import either branch's
  stale documentation history or duplicate thinking-time helper.
- Focused provider-free validation passed both model selection and thinking
  time: 2 files, 27 tests.

This resolves all five patch-unique commits as either one duplicated product
patch split into superseded and still-needed behavior, or historical docs that
need no mainline port.

## Runtime Foundation Patch Mapping

`git cherry -v main runtime-service-foundation` marks all three commits
patch-equivalent. Stable patch IDs map them to current main history:

| Foundation commit | Main equivalent |
| --- | --- |
| `56cc167c` execution store dispatcher and lease scaffolding | `51b7d2d8154acd2c3f7d12aad35623ec82484d66` |
| `b098c8d3` local control and revisioned store | `d378f886ba1d4668c97b8ac98ffeb32535486950` |
| `5b33703e` bounded responses HTTP adapter | `232e6f214415c0f4fc4ece59bfbf5907965d1b9f` |

The branch contains no unpublished product patch and is an archival candidate.

## Origin-Only Refs

Thirteen observed `origin/*` branches have no local branch: `anthropic`,
`bastion/cache-mirror-2026-03-27`,
`bheemreddy-samsara/oracle-wait-option`, `double-attachment-issue`,
`fix/browser-automation-fixes`,
`fix/browser-model-selection-and-thinking-time`,
`fix/browser-session-reuse-and-response-capture`,
`fix/markdown-prompt-verification`, `fix/thinking-time-fixes`,
`fix/windows-pty-build`, `mirror/bridge-client-flags-doc-fix`,
`windows-remote-chrome`, and `windows-remote-chrome-archive`.

They are retained remote custody, not active AuraCall lanes. This packet does
not infer ownership or deletion authority from age, naming, or lack of a local
ref.

## Bounded Oracle Candidate Ledger

The review covered the recent Oracle 0.18.0 preparation window through
`083bba7e` and high-value browser, session-security, model-selection, and
dependency topics. It did not attempt to classify all 517 Oracle-only commits.

| Oracle commit | Problem and AuraCall surface | Disposition |
| --- | --- | --- |
| `b75a720e` | Session artifacts can inherit permissive directory/file modes; AuraCall's `src/sessionManager.ts` currently creates and writes them without explicit owner-only modes. | `adapt-candidate`: design an AuraCall-native, symlink-safe `0700/0600` hardening packet with migration tests. |
| `3104799d` | AuraCall parses `--browser-headless` but currently returns `headless: undefined`; saved attach-running behavior also needs an explicit conflict contract. | `adapt-candidate`: restore the documented explicit flag through current browser-profile resolution and tests. |
| `38e82d0f` | A mounted `Answer now` control can cause long real answers to be misclassified as placeholders. AuraCall never auto-clicks this control, but extraction still needs bounded chrome-only classification. | `adapt-candidate`: inspect the current response identity/extraction pipeline and add a closure-free bounded predicate only where the failure is reproducible. |
| `f9302865` | Disabled effort tiers need a distinct fail-closed result, especially for explicit Pro requests. Current AuraCall compact-control handling does not expose Oracle's disabled-tier diagnostic. | `adapt-candidate`: add a current-architecture result and account-aware fixture without importing Oracle's whole picker implementation. |
| `7b364aa5` and `573b6c7d` | Robust Advanced/model/effort submenu navigation. AuraCall has a divergent selector architecture and this packet already ports its one proven compact model-control gap. | `defer`: use the Oracle selectors and diagnostics as design evidence only if a current AuraCall fixture demonstrates another failure. |
| `3a185f55` and `5ed6a989` | Cookie sync becomes opt-in while authenticated-session recovery can request it deliberately. AuraCall's managed browser profiles, bootstrap-cookie sources, and remote-browser policy have different authority semantics. | `defer`: run a separate privacy/bootstrap policy review before changing defaults; do not cherry-pick. |
| `5941f083` and adjacent dependency updates | pnpm 11 and package refreshes. | `defer`: dependency upgrades require their own compatibility/security packet, not reference-project parity. |
| localized effort-label commits including `f5b9c810` | Additional locale labels for Oracle's picker. AuraCall currently relies on its own managed-browser locale and provider fixtures. | `not-applicable` until AuraCall declares multilingual browser automation support. |

No reviewed patch is a `cherry-pick-candidate`: each material idea crosses a
current AuraCall policy or architecture seam. None is implemented by Plan 0308.

## Cleanup Boundary

This receipt makes cleanup safe to propose, not authorized to execute. Exact
branch deletions, remote deletions, and worktree removals require a subsequent
operator instruction naming the targets. Until then, the refs and paths above
remain recoverable custody.
