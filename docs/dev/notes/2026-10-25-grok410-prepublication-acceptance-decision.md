# #410 prepublication acceptance decision

State: OPEN — explicit operator decision required. No issue criteria, dependency
or governing specification has been amended by this proposal.

[Native evidence](2026-10-25-grok410-artifact-frontier.md) now qualifies one Build
generation and public workspace archive retrieval. The current public result is
partial with genuine app/version identity unobserved. The native Publish dialog
reports Not Published. Its controller separates opening the dialog from a
later deployment request. These observations do not prove that Grok never exposes
prepublication identity elsewhere, and no missing identity is invented.

The original #410 requires artifact binding to app/version/conversation; #411 is
blocked by #410 and requires a concrete version before publication. The proposed
stage split moves the still-unmet first-publication identity qualification into
#411. It permits closing prepublication work only after its own evidence passes.
The parent program retains the identity obligation and remains open.

Option A: retain the original contract. Keep #410/#411/#414 open until genuine
prepublication identity can be qualified within the original authority.

Option B (recommended): approve the exact amendments below. This approves
acceptance routing only. It grants no publication, legal consent, provider grant,
new generation, external hosting or installed runtime upgrade. A first publication
still needs a concrete selected-output operation packet and separate approval.

## Exact #410 amendments

Replace What to build with:

> Generate one owned Grok Build workspace and retain its observed preview/result
> and available local archive with exact provider-account, target, conversation
> and assistant provenance. Report genuine app/version identity when observed;
> otherwise retain explicit null/partial identity. First-publication provider
> identity qualification remains required under #411.

Replace acceptance criterion 3 with:

- [ ] Bind the archive to the exact owned account/target/conversation/assistant and freshly observed gateway; verify bytes and integrity. Report app/version only from genuine native evidence, never from a task ID, filename or archive hash.

Add acceptance criterion 6:

- [ ] Preserve the original app/version obligation in #411 and the approved specification amendment; prepublication closure does not satisfy that program gate.

## Exact #411 amendments

Replace What to build with:

> Publish/share an explicitly selected generated output through Grok-native
> controls. For first publication, qualify the selected current workspace and
> its attributable verified archive before approval, then require authentic
> provider identity and publication readback. For an existing published version,
> bind the operation to its actual observed provider identity before dispatch.

Replace acceptance criterion 2 with:

- [ ] Require an explicit concrete selected-output operation. First publication may select a freshly qualified native workspace/archive snapshot when provider app/version identity remains unobserved; refuse stale or uncertain snapshot-to-publish binding. Existing published versions require actual observed provider identity before dispatch. Preserve the provider-observed URL and qualify genuine app/version identity on readback; unavailable identity remains an unmet gate, never an alias.

## Exact Plan0452 amendments

Replace user story 28 with:

> 28. As an operator, I want explicit Grok-native publication of a selected Build output, with first-publication identity qualified on readback and existing published versions selected by their actual provider identity, so that the published URL corresponds to the output I approved.

Replace the Build architecture bullet with:

> Build generation, local archive retrieval and native publication remain separate
> stages. Prepublication evidence binds the exact provider account, conversation,
> assistant and current native workspace snapshot; unobserved app/version identity
> remains explicit. First publication requires a concrete selected-output packet
> and fresh reliable snapshot binding, then genuine provider app/version and URL
> readback. Existing published versions require actual provider identity selection
> before dispatch. Missing identity never satisfies its live gate. No external
> hosting deployment is introduced.

#410 and #411 retain their original issue idempotency markers and dependencies.
No new follow-up is needed for this stage split: #411 already owns publication
and would retain the missing identity requirement. #414 becomes dependency-ready
only after approved #410 criteria are actually met and its closure is read back.
