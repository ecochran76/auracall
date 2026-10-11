# Plan0404 | Dead browser readiness classification

State: CLOSED
Owner: primary, serialized. User authorized diagnosing Issue226 and a bounded fix.
Domain authority CONTEXT.md. Base merged8aa11f18a. No installed/live/provider effects.

## Current State

Issue226 remains open for generic CDP readiness failure after dead managed browser.
Existing Plan0400 already proves one active response crossed original idle expiry;
exit actor remains unknown. Existing lifecycle tests pass28 but explicitly expect
legacy generic probe error. Source owns child at launcher readiness seam.

## Bounded outcome

Provider-free public launchChrome regression: exact owned child exits before CDP
ready; return typed classification and operator instruction rather than generic
port timeout. Also preserve distinction for running/unknown process, cancellation
and cleanup. Use existing lifecycle harness; one red/green slice at a time.
No auto-restart, shared process kill, provider request, installed change or new wake.
Review Standards/Spec, targeted tests/typecheck/lint, docs and reviewable PR.
Done at source acceptance; installed adoption remains separate.

## Source acceptance

Public launchChrome reproducer red: generic unready port error after owned child
exit. Green: typed exited error, PID/exit/profile context and recovery action. First
green attempt missed WSL profile path; context forwarding corrected. Final45
focused/adjacent tests pass, typecheck pass, lint has2 pre-existing mocked-export
naming warnings; package source excluded by repository lint config. Serial primary
Standards/Spec review0 blocking findings. Source acceptance only: no install/live
changes, prior exit actor unknown. Source PR delivery to be recorded below.
