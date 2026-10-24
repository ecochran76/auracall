# Grok request admission coverage

Observed2026-10-24 on the existing default/grok managed browser, exact live
DevTools port45040, homepage `https://grok.com/`. Bounded browser-tools DOM read
of resource timing returned six non-Next same-origin entries: one REST product
fetch (`/rest/products`), three `/monitoring` telemetry fetches, a manifest and
Cloudflare speculation resource. No request/response headers, bodies, query values
or account identifiers were acquired. One earlier Puppeteer connection timed out
and yielded no evidence; a subsequent exact-port expression completed.

Observation categories: native REST API; telemetry; static/browser infrastructure.
Existing source also observes workspace validation responses at `/rest/workspaces`.
The interception contract covers all exact-origin `/rest/` requests on the one
continuously owned target. It excludes monitoring, static resources, foreign
origins and unattached/manual targets. Same-target custody is exclusive through
the retained desktop/CDP hold; foreign user activity during that custody is not
an admissible concurrent owner. No claim covers future non-REST API families,
service workers, WebSockets or background traffic outside this owned attachment.

No numeric ceiling is proposed. Request ceilings are explicit operator opt-ins;
unset means no local numeric ceiling. All owned Grok REST callers still meter
and honor ceilings contributed by other same-account callers. Admission remains
enabled and visible in status. Operation counts
remain distinct. Provider-free tests drive real guarded transport admission,
configured authority and durable stores. They prove one permit before continue,
duplicate-event deduplication, account sharing, cancellation, native429 fencing
and uncertain continuation handling. This is source proof, separate from installed
adoption or a native backend-mutation canary.

Bootstrap ownership: request-enabled Grok service resolution launches a blank
page. The adapter attaches lease/continuous request custody before provider
navigation; the same guarded client remains attached through response/drain.
A public GrokService fixture rejects the old unowned-first-load path and now
proves interception exists before its first bootstrap REST request.
