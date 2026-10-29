# Grok attached-target provider-session provenance (#405)

Scope: repair the configured Grok read prerequisite without weakening account
identity or authorizing installation, OAuth, Bot changes, sends or browser launch.
The parent Grok implementation plan and ticket #405 remain open.

## Cause and change

Configured Grok list options intentionally resolve `about:blank` for owned
backend admission. That resolution can prove the managed browser/process while
leaving `browserTargetId` empty. `connectToGrokTab` subsequently attached an actual
Grok target but did not update the provider-session context. Strict account
preflight then rejected the missing process/target fingerprint. ChatGPT already
binds its actual connection before verification; Grok lacked that handoff.

Root and project connection returns now bind the attached target and actual
DevTools endpoint into their existing authorization context. Changing the target
or endpoint discards the previous proof. This supplies neither identity nor a
browser process ID. If the endpoint differs from the previously proved endpoint,
the old process ID is cleared and authorization remains fail-closed until new
process provenance is supplied. Configured expectation and observed identity
requirements are retained.

The identity-smoke report's null observation and empty provenance are not,
by themselves, proof that native identity detection failed: its report builder
synthesizes a missing proof when the underlying operation returns no proof.
The configured native error and this source reproducer are separate evidence.
No worker native read or browser launch was performed for this repair.

## Verification

The provider-free regression drives the real configured Bot-service wrapper,
real Grok list-option builder, durable traffic authority, controlled continuous
CDP transport and real account pre/post verification. Before the fix it throws
`grok_bot_account_not_verified`. After the fix it returns its expected explicit
unknown-composer outcome with the verified provider-account reference. This test
proves authorization progression, not native Bot inventory acceptance.

Further cases cover exact attachment, retained target selection, newly owned
blank-target attachment, previous-proof invalidation, missing process provenance,
fresh account mismatch and endpoint change. None fabricates a browser PID from
the CLI process or treats a prior proof as fresh authority.

Command:

```sh
pnpm vitest run tests/browser/grokProviderSessionBinding.test.ts tests/browser/grokAdapter.test.ts tests/browser/providerSessionAuthority.test.ts tests/browser/grok407Bots.test.ts tests/browser/chatgptProofSession.test.ts --maxWorkers=1
pnpm typecheck
pnpm exec biome lint src/browser/providers/grokAdapter.ts tests/browser/grokProviderSessionBinding.test.ts
git diff --check
```

Focused result: 81 tests passed across five files. Typecheck, targeted two-file
Biome lint and diff-check passed. An earlier full-picker fixture
hit the five-second test timeout under real interaction pacing. The auth
regression now observes the pre/post proof boundary and explicit missing-composer
outcome; existing Bot tests retain picker behavior coverage. No timeout was
raised and no governor was disabled. Setup-only fixture failures were corrected
before the matching account-verification red was observed.

Native no-launch identity/Bot read verification is coordinator-owned and pending
at this source checkpoint. No saved Connector identity/grant or #405 completion
claim follows from this fix. Memory disposition: forbidden; no explicit user
request authorizes a memory write.
