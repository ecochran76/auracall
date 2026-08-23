# Plan 0309 Security And Policy Adjudication

Oracle is a research source for this note, not AuraCall's integration target.
The dispositions below are based on AuraCall source at feature checkpoint
`1784a3c9` and Oracle candidate commits `4ee828de`, `b17aefa3`, and `3a185f55`.

## MCP-controlled output containment

Disposition: `not-applicable` for Oracle's symlink-containment patch.

- Oracle's `consult` and image-generation MCP tools accept output paths that
  reach filesystem write sinks. Its patch therefore realpaths the deepest
  existing ancestor and rejects escaping or dangling symlinks.
- AuraCall's root CLI `--write-output` reaches `writeAssistantOutput`, but that
  path is a local CLI surface rather than an MCP input.
- The only AuraCall MCP input named like a writable destination is
  `media_generation.outputDir`. Current source validates and stores that field
  in the request shape but never consumes it in the media service, executor,
  materializer, or a filesystem write. MCP media artifacts instead use the
  AuraCall-owned artifact cache.
- Because no MCP caller-controlled path reaches a write sink, porting Oracle's
  containment helper would create an unused policy surface. If `outputDir` is
  later wired to a write, realpath-aware containment and dangling-symlink tests
  become a prerequisite, not follow-up hardening.

## Source browser profile cookie copying

Disposition: `implemented` as an AuraCall-native opt-in.

- AuraCall never writes to the source cookie database. It reads or clones from
  a source browser profile into an AuraCall-owned managed browser profile.
- Before this change, non-Windows resolution defaulted `cookieSync=true`, and
  launch planning derived a bootstrap source from `chromeCookiePath`. A fresh
  managed profile could therefore clone/copy live source credentials without
  a positive operator opt-in. Provider-side token rotation in the managed
  profile can invalidate the original interactive source session even though
  AuraCall never writes the source database.
- The default is now `cookieSync=false` on every platform. A source cookie path
  is exposed to normal launch/bootstrap only for `--browser-cookie-sync`,
  `browser.cookieSync=true`, or an explicit `--browser-bootstrap-cookie-path`.
  Existing managed browser profile cookies remain reusable without touching
  the source browser profile.
- Explicit setup/login bootstrap remains available because choosing a source
  during that operation is itself affirmative bootstrap intent.
