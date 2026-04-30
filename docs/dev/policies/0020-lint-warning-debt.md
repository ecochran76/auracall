# Policy | Lint Warning Debt

## Policy

- Treat `pnpm run lint` exit status as the release gate unless the release plan
  explicitly raises the bar to warning-free lint.
- Do not hide a warning class globally until the repo has decided that class is
  intentionally accepted across the codebase.
- Classify warning-level Biome diagnostics before changing code:
  - provider, API, database, HTTP, and schema payload casing may keep external
    field names when renaming would break a contract or obscure a wire format
  - tests may use targeted `any` only for deliberately malformed payloads,
    mocked dynamic imports, or migration fixtures where the point is to bypass
    TypeScript's normal shape guarantees
  - test non-null assertions are acceptable only when the assertion is proving
    fixture setup, not hiding nullable production behavior
- Prefer narrow local `biome-ignore` comments with a concrete reason when a
  warning is intentionally retained.
- Prefer typed helper functions, typed fixture builders, or `unknown` parsing
  when a warning points to real ambiguity in production code.
- Do not mechanically rename external payload fields just to satisfy
  `useNamingConvention`; keep the provider/API shape stable and adapt at the
  boundary if an internal camelCase model is needed.
- When warning debt changes materially, record the before/after count and the
  dominant remaining classes in the dev journal or fixes log.

## Adoption Notes

Use this module when the repo has legacy warning-level lint diagnostics but
still wants release gates, cleanup slices, and future warning-free work to be
consistent.
