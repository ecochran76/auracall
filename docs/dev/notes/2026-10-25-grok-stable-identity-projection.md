# Grok stable identity fallback and bounded bootstrap projection (#405)

Scope: repair the configured read prerequisite while retaining strict expected
account proof. No browser launch, native worker read, settings-menu click,
installation, OAuth, Bot mutation or Send is authorized by this packet.

## Two observed source defects

A name-only DOM label was a truthy identity and prevented the existing serialized
fallback from running. The same-transport preflight regression reproduced missing
configured email/handle despite available serialized stable identity. Detection
now tries the existing fallback when the direct probe has no ID/email/handle;
name-only fallback remains available when no stable evidence exists. Direct
stable conflicts and guest-CTA boundaries retain priority.

Separately, the coordinator's private native capture established that a qualifying
Flight script was 371401 characters long, with stable user fields beyond the old
16000-character prefix. Its actual `initialData.user` object is structured JSON,
not a reason to increase returned raw-script budgets. The worker inspected only
private offline structure and boolean equality against the coordinator's prior
parsed identity; no raw payload or private identity was printed or committed.

The new shared collector parses Next Flight push arrays and their JSON records,
then traverses actual object properties to project `initialData.user`. JSON string
values are not recursively interpreted as account objects. It returns only
whitelisted stable identity/name fields, excluding session identifiers and other
account payload. Unrelated earlier `userId`/`email` fields cannot be mixed with the
user subtree. Conflicting stable user tuples return no identity.

Input scanning is capped at 2 MiB per qualifying script and 8 MiB total, traversal
at 50000 nodes/depth48, and returned projections at eight. Over-budget input or
conflicting account evidence does not authorize an arbitrary account. The page
expression carries an inert name-preservation helper for tsx/esbuild's generated
nested-function annotations; the same collector runs under the source CLI and
compiled TypeScript.

## Evidence

- The name-only preflight regression was observed red before the detector fix.
- Three further reds reproduced prefix truncation, cross-subtree field mixing,
  and choosing the first of conflicting serialized users.
- An escaped Flight record with a 200000-character nonidentity prefix now returns
  the selected stable account fields and excludes a synthetic private session ID.
- Offline qualification of the coordinator's actual private capture through both
  the Node parser and tsx-generated page expression returned one 164-byte identity
  projection. ID/email/handle equality all passed; sessionId was not exported.
- The historical adapter fixture's outer push array was valid JSON but its inner
  Flight array lacked the closing `]`. One character repairs that invalid framing;
  its existing expected identity is unchanged. Valid legacy Flight framing remains
  supported. No regex field-mixing fallback was retained for malformed JSON.

Validation:

```sh
pnpm vitest run tests/browser/grokIdentity.test.ts tests/browser/grokAdapter.test.ts tests/browser/grokProviderSessionBinding.test.ts tests/browser/providerSessionAuthority.test.ts --maxWorkers=1
pnpm typecheck
pnpm exec biome lint src/browser/providers/grokIdentity.ts tests/browser/grokIdentity.test.ts
git diff --check
```

Focused selection: 78 tests across four files passed. A further causal depth-bound
regression proved that exhausted traversal must discard an earlier valid user
rather than hide deeper conflicting account evidence. The exhaustion flag now
fails closed for both depth and node budgets. Native post-fix identity and
owned-inventory reads remain coordinator-owned; this source/offline qualification
does not close #405 or establish Connector installation/grants. Memory disposition:
forbidden, because no explicit user request authorizes a memory write.
