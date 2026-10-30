# Grok #411 publication contract research

Plan0458 / P458411. Research only, 2026-10-29. No provider actions or source changes.

## Question and bound

Does the observed native Publish path bind the exact selected generated output
revision, and expose authentic app/version readback? Allowed evidence was local
publication source and two specified retained native receipts, with at most six
relevant source lookups; stop at the decisive contract. Two CodeGraph discovery
queries preceded targeted source inspection. No browser/network operation, callback,
hook, terms acceptance, publication, upload or Send was performed. No additional
native receipts were consulted. The older issue excerpt in
`/tmp/grok411-contract-spec.txt` is historical context, not current readiness proof.

## Finding

**Exact selected-output revision binding is not qualified by this evidence.** The
observed native deployment mutation passes `{conversationId, projectName, access}`
to its SDK call. Its returned `id` is recorded as a pending deployment ID. There is
no selected assistant response ID, workspace revision, content hash, archive
manifest or app-version argument at that observed call boundary. This is an
observed caller contract, not proof that the unobserved SDK or server cannot choose
or snapshot a revision internally. [R1, `observed.result.value.bindingFunctions`,
paths `memoCache.data.26.0.mutationFn` and `memoCache.data.23.14`]

The confirmation callback forwards the chosen name and access settings. A preceding
terms gate checks a per-user/per-conversation `termsVersion`; its acceptance path
stores acceptance and forwards the same name/access pair. A public-access warning
can also precede deployment. These callbacks were inspected as retained function
source and were never invoked. Terms version is a consent schema version, not an
app version. [R1, `buttons[label=Publish].functions`; binding-function paths
`memoCache.data.54.22.requestDeploy`, `.accept`, and `memoCache.data.52.20.requestDeploy`]

The owned controller was `ready=true`, `phase=idle`, `deployment=null`; the dialog
reported unpublished state. Account continuity and transport cleanup passed, and
confirmation was not clicked. This supersedes the older excerpt's claim that no
Publish control had been qualified, but establishes no publication or deployment
identity. [R1, `frames[4].controller`, `confirmationClicked`, top-level continuity
and cleanup fields; R2, `result.publication.controls`]

## Authentic identity and missing fields

| Item | What the evidence supports |
| --- | --- |
| Conversation/controller ownership | Exact conversation-owned native dialog under the same committed React root; not an output revision. |
| Selected assistant/gateway identity | Public inspection rechecks these before/after dialog inspection; they remain distinct domains. |
| Deployment ID | Native code expects a returned deployment `id` and compares pending/current deployment IDs. No concrete deployment ID was observed because `deployment=null`. |
| Project/app identity | Native dialog source references `deployment.projectId` and supplied `projectId`; neither establishes an authentic observed app ID here. |
| App version | No authentic app version was observed. Public result retains `app.id=null`, `app.version=null`. |
| Selected output revision binding | Missing at the observed mutation argument boundary; no server-side mapping has been observed. |

Ownership and stable selected-response checks are implemented in
[grokBuildPublication.ts](../../../src/browser/providers/grokBuildPublication.ts#L12)
(lines12–37) and
[grokBuildService.ts](../../../src/browser/grokBuildService.ts#L475)
(lines475–504). The public contract explicitly restricts `snapshotBinding` to
`unqualified` ([lines83–89](../../../src/browser/grokBuildService.ts#L83)). The
plane snapshot carries conversation, response and gateway identities, text and
preview availability, without an output-revision or app-version field
([grokBuild.ts lines57–65](../../../src/browser/providers/grokBuild.ts#L57)).
R2 reports partial inspection, null app/version, unavailable artifact identity and
unqualified binding; it does not claim successful publication. [R1, `frames[4].source`
and binding functions `.23.32`, `.26.0.mutationFn`; R2, `result.app`, `.artifacts`,
`.publication`, `.effectState`]

Do not reinterpret a conversation ID, assistant response ID, gateway row ID,
selected-file checksum, terms version, proposed publication name, deployment ID
or project ID as an app version. The retained source's `promotePendingBaseline`
function name suggests client baseline bookkeeping, but the captured callback
only passes conversation and deployment; its unobserved implementation cannot
establish a workspace-revision guarantee. [R1, binding function `.23.32`]

## Disposition and next decisive probe

This is a **provider-contract evidence gap**, with a remaining AuraCall product
implementation boundary. The source currently reports unknown publication and
unqualified binding correctly. The bounded evidence does not demonstrate a
provider defect or justify inventing app/version aliases. Implementing a publish
operation against this caller alone would not satisfy exact-output approval.

The smallest next useful probe is a separately authorized, read-only observation
of the actual SDK wrapper and any already-loaded deployment response/query DTO on
the exact owned target, retaining field names and provenance fingerprints only.
Stop if there is no current deployment. Determine whether a genuine revision or
snapshot identifier exists and whether an authentic returned deployment/project
object maps it to the selected output. Do not invoke the SDK, query function or
controller, and do not manufacture a version from local content hashes. If no
such mapping is exposed, the next step requires a provider-supported contract or
a separately approved publication experiment with explicit output/effect scope;
this research does not authorize that experiment.

## Evidence locators and integrity

Private receipt paths below are locators only; no raw account reference, proposed
name, private URL or native conversation/target identifier is copied into this note.

- **R1:** `~/.auracall/private/grok/implementation-native/20261029-resume/publish-binding-1793287163925.json`
  — SHA256 `b50ae1cfeae002294a8064080e15e3311462a3b6e8addf13eb3de02dde88dd7f`.
  Observed 2026-10-29 15:19 UTC; opened/dismissed owned dialog, no confirmation.
- **R2:** `~/.auracall/private/grok/implementation-native/20261029-resume/public-publication-inspect-1793286238504.json`
  — SHA256 `250030448dff0b838aa9dc3c31f78b32bcbb269e39035dda2ed385f3405435ed`.
  Observed 2026-10-29 15:03 UTC; public adapter inspection, no publication effect.

Source was read from the integration worktree and byte-compared against this
research worktree at `5f4697f85`; the three cited files match exactly. Source
qualification and the retained native observations are separate proof boundaries.
No code tests were needed for this documentation-only research. Memory disposition:
`forbidden` — this packet explicitly excludes memory writes.
