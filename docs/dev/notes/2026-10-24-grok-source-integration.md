# Renewed Grok source integration —405/410/403/408

Integration checkpoint245f1554e on feat/grok-upgrade-integration, based on
merged PR430/ae21c97c9. #412 is CLOSED; seven of16 children closed, nine open.

Worker405 returned c9be5f9e1 plus preserved partial source b732f2e76; accepted
as integrated commits a38ea6511 and6ef9f2847. Private account/endpoint intent,
observational reconciliation, public install/reconcile and whitelisted Ops
installation state are wired. Exact native saved provider ID/account/grants and
built-in controls remain incomplete;405 stays open and406 locked.

Worker410 returned b29984f63; integrated as8f60a28c9, then shared wiring and
Ops projection added in245f1554e. CLI grok-build, MCP grok_build and operator
POST /v1/grok/build/query share discovery/generation parsing and results.
Generation confirmation is required; terminal response remains partial without
observed app/version/preview/byte evidence. No native publishing path is added.
410 stays open and411/414 remain locked.

Worker408 returned native discovery packets3f7d3c849 for408 and1a8254a7b for403;
integrated as76742a224 anddcbd79892. Exact synthetic canaries and stop rules are
reviewable; no native provider effect occurred.408 editor controls and403
selected-byte-to-provider-ID upload binding remain gates, not implementation.

Primary validation:44 tests/6 Connector files passed, then88 tests/11 combined
files passed including Build/text/UI, HTTP and public Ops CLI. Typecheck passed.
CLI help for grok-build and grok-connectors passed. Build output completed;
final standalone build receipt is retained user-scoped. No full-suite, installed
runtime, native provider acceptance or deployment claim. One HTTP test initially
expected only a subset of forwarded request fields; its expectation was corrected
to the actual public request. Ops omission was reproduced red then fixed.

Worker413 is active from ae21c97c9 in auracall-grok-413-resume; primary owns
integration and central records. One whole-program code-review and bounded TDD
findings cycle remains pending full ticket completion. No review loop reset.
Memory disposition forbidden: no explicit user memory request. No writes attempted.
