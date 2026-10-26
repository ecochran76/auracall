# #414 retained materialization bridge

State: SOURCE IMPLEMENTED AND CHECKED; #414 remains open for the remaining gates.
Base: main `ad7b34d264290b0c8e11297a25c53c096214a90a` (PR478's selected-assistant
archive binding fix included). No provider/native effect or new generation,
download, publication or deployment has run in this slice. The checkpoint
code-review/TDD passes remain owned by root and are not invoked here.

The existing archive/history job interfaces own materialization; no standalone
Grok alias is added. The trusted configured Build export result now supplies a
verified local archive receipt to that index. Native account/target/conversation/
assistant/current-gateway/checksum remain explicit, with unobserved app/version
null. Internal archive IDs are never promoted to provider identities.

Public archive reuse and serving revalidate the retained checksum without
replacing it. Changed bytes become unavailable and cannot be served; generic
filename/conversation fallback cannot borrow a workspace ZIP for another asset.
Metadata-only and uncertain export results do not become indexed bytes. Build/Ops
counts describe only the selected archive and retain incomplete coverage. The
existing durable archive queue/job/foreground gate is reused; generic history
cursor, budget and drain/restart behavior is not changed or newly accepted here.

Ordinary causal regression checks reproduced the missing archive bridge, corrupt
Grok bytes still served after availability refusal, and filename-based borrowing
of a native workspace ZIP by another metadata-only artifact. These are bounded
implementation checks, not another formal review/TDD skill pass.

## Remaining evidence and next packets

1. Source-qualified local bootstrap may retain the already verified original
   public export receipt under its immutable proof and then exercise the existing
   public archive/job read/reuse path without a new provider effect. It must bind
   exact source/provenance and preserve the original checksum; do not import an
   arbitrary caller JSON receipt as native proof. Root must qualify the exact
   existing receipt and resulting packet before any real archive-store write.
2. A separately granted bounded passive observation may discover the native
   download/retrieval control and genuine asset identity for one existing selected
   referenced file. Current Files APIs offer context/recent/select/upload but no
   verified byte-retrieval seam. No guessed URLs, app IDs, file IDs, fetch fallback,
   UI selection, download or other effect is authorized by this note.
3. Only after actual retrieval semantics are qualified can a concrete governed
   single-file transfer/reuse canary and a Grok history budget/foreground-resume
   acceptance packet be prepared. Keep metadata-only, unavailable, partial and
   uncertain coverage explicit until those gates pass.

The original #410 single approved generation/public archive proof can support the
selected workspace's provenance; it does not prove referenced-file retrieval,
installed-runtime materialization, full history coverage or authentic app/version.


## Source verification

Focused affected selection:67tests across7files passed, including native-export
composition into the existing archive and Ops, exact provenance and byte
validation, corruption refusal, generic-fallback isolation, no-provider reuse,
and durable queued-job reuse after service restart. Existing archive service,
archive materialization/job, Build export and HTTP Build tests were included.
Full `pnpm typecheck` and `git diff --check` passed. These are source checks;
no real archive store, installed runtime or browser/provider was exercised.

Detailed local logs: `/tmp/grok414-affected.log` and
`/tmp/grok414-typecheck.log`. Original causal failures are retained in
`/tmp/grok414-bridge-red.log`, `/tmp/grok414-corrupt-asset-red.log` and
`/tmp/grok414-scope-red.log`. This selected evidence does not qualify the
remaining referenced-file transfer or Grok history budget/foreground native gate.
