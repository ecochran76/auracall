# P473 | Native operation lock refusal diagnostics

State: CLOSED
Lane: P473
Branch: fix/native-desktop-lock-diagnostics
Target: main

## Current State

Source repair complete: 22 focused tests, typecheck, build and scoped lint pass locally. Installed runtime unchanged.

ASPECT app inventory failed at NativeDesktopStore.exclusive before display-gate capture. The original refusal retained no owner identity; later inventory succeeded. Owner health and historical cause remain unqualified.

## Scope

Primary owns source, public lock-interface regression, and documentation. Add allowlisted diagnostics to the existing refusal and acquisition generation metadata. Independent work is too small to justify delegation; serialize regression, implementation and validation.

## Non-goals

No lock reclamation policy change, polling, provider calls, runtime install, service restart, or research submission. Never expose owner UUID, operation key, command line or environment.

## Acceptance / Definition of Done

Real child-process contention preserves refusal and owner custody while reporting PID, acquisition time and observed process generation. Legacy records remain compatible and report unknown comparison. Diagnostic read failure cannot replace refusal. Targeted local checks, typecheck, build and scoped lint pass; record exact source commit and local/hosted differences.

## Installation continuation | 2026-10-31

Operator authorized installation, then return to LitScout and the retained ASPECT
vinyl-ester prompt. Live baseline had advanced to user-runtime-list-generation-
5c4b54512. Carry its exact two source modules and corresponding tests from5c4b54512
so this installation cannot regress deployed listing custody.17combined tests and
scoped lint pass; full build precedes immutable-prefix install. API and wrappers
must agree; browser/config identity must be preserved. No hosted CI purchased.
