# Plan0386 captured rich-composer readiness repair

Journey6 on installed PR237 reproduces the independently added root conversation admission failure. PR237's no-op fallback fix is real and regression-qualified, but it did not resolve this live failure. The corrected controller stops before journey7. Six charged, four unused; no counter reset.

Two bounded read-only CDP snapshots of the exact owned page after collector failure and before child advancement show canonical /c/<id>, document readyState complete, zero data-message-author-role nodes, no #prompt-textarea, and an editable rich composer. Sanitized captured attributes: tag DIV, data-composer-markdown present, contenteditable=true, role=textbox, aria-label=Ask ChatGPT. Raw main/body content stays private. The old readiness expression checks a textarea label or composer-plus button and rejects that rich composer, eventually requesting another governed navigation.

Public seam: createChatgptAdapter().readConversationContext, using the existing single-visit fixture, actual readiness expression in VM and a minimal attribute-matching DOM model from captured attributes. Correct-root rich-composer fixture goes RED with exact detail/page_navigate limit1; matched and mismatched project cases and unrelated-label negative pass. An initial real-time fixture exceeded the test deadline; fake timers then expose the precise denial deterministically in105ms. This setup timeout is not a production red.

Repair adds the exact observed DIV selector to the existing composer readiness alternatives. No generic textbox acceptance, navigation budget change, provider mutation or mode selection. GREEN: `pnpm vitest run tests/browser/chatgptSingleVisitContext.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptContextReadDeadline.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/completionService.test.ts tests/browser-service/ui.test.ts` passes398tests/6files in3.68s. Typecheck and touched lint pass. The earlier failed independent B has no rendered messages in the snapshot; recognizing its composer cannot establish readable content or assets.

Journey6 child independently captures32,096 valid JSON bytes from a different retained conversation. SHA01d56ab38d8356fd661d2b02a4f21c96d79d69a28f19c261bbf830c65ac173e2 matches local/job/archive; archive HTTP200. Frozen path inventory proves prior absence. One manifest entry matches size/type/status. Original A and both earlier Markdown captures keep bytes/hash/mtime. Earlier journey8 partial conversation manifest count remains1 but IDs change after capture, so no stable quiet-repeat claim. [Receipt](2026-10-08-plan0386-ten-journey6.json).

Installed retry after source qualification must preserve this failure, the remaining four journeys, ordinary eligibility and the nested-failure stop. Root-read success is not positive changed-B acceptance; empty messages, warning or new readiness failure must remain failed evidence. Plan0386 remains OPEN.

## Live continuation result

Journey7 completes context and skips absent downloadable artifacts. Journey8
reaches the previously failing independent conversation with one observed visit
and no navigation-budget denial, but context fails `messages not found`. Its child
skips another retained row. This qualifies narrower readiness progress and leaves
actual content and changed-B acceptance unproven. Controller55649 stops at the
frozen nested-failure gate before9. Eight charged and terminal, two unused; no
counter reset or third source repair. Fresh containment/integrity readback is in
[stop receipt](2026-10-08-plan0386-ten-journey-stop.json). The ten-journey objective
is incomplete and Plan0386 stays OPEN. Memory disposition remains unavailable:
focused discovery supplied no qualified AuraCall group.

## Installed successor (historical start checkpoint)

PR238 mergec6710b169 installed from canonical source. Adapter SHA5c893ff21d2f1fb86ee4dcbeff4c927ec1fdd509931704cd2892038cd3a07861 matches installed bytes; API12677, zero active materialization jobs and parent paused at pass11 before journey7. Scheduler stays paused. [Install receipt](2026-10-08-plan0386-rich-install.json). Controller exec55649 owns journeys7–10; poll it before starting any replacement work. At this checkpoint journey7 is active, not accepted. Memory disposition: unavailable; focused discovery supplied no qualified AuraCall group.
