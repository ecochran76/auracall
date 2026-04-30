# Release Checklist

> Current distribution is repo/GitHub tarball plus user-scoped runtime. Public
> npm distribution is intentionally deferred. For a guarded, phased flow, run
> `./scripts/release.sh <phase>` (gates | artifacts | smoke | operator-smoke |
> tag | all); it stops on the first error so you can resume after fixing
> issues. The helper uses `./runner` only when its runtime is available and
> otherwise falls back to `/usr/bin/env`.

1. **Version & metadata**
   - [ ] Update `package.json` version. AuraCall is a new package line and starts at `0.1.0`; do not inherit upstream Oracle numbering.
   - [ ] Update any mirrored version strings (CLI banner/help, docs metadata) to match.
   - [ ] Confirm package metadata (name, description, repository, keywords, license, `files`/`.npmignore`) because the local/GitHub tarball is still npm-package shaped.
   - [ ] If dependencies changed, run `pnpm install` so `pnpm-lock.yaml` is current.
   - [ ] Source `~/.profile` so codesign/notary env vars are available before building the notifier.
2. **Artifacts**
   - [ ] Run `pnpm run build` (ensure `dist/` is current).
   - [ ] Verify `bin` mapping in `package.json` points to `dist/bin/auracall.js`.
 - [ ] Produce package tarball and checksums:
    - `npm pack --pack-destination /tmp` (after build)
    - Move the tarball into repo root (e.g., `auracall-<version>.tgz`) and generate `*.sha1` / `*.sha256`.
    - Keep these files handy for the GitHub release or local install handoff; do **not** commit them.
 - [ ] Rebuild macOS notifier helper with signing + notarization:
    - `cd vendor/oracle-notifier && ./build-notifier.sh` (requires `CODESIGN_ID` and `APP_STORE_CONNECT_*`).
    - Signing inputs (same as Trimmy): `CODESIGN_ID="Developer ID Application: Peter Steinberger (Y5PE65HELJ)"` plus notary env vars `APP_STORE_CONNECT_API_KEY_P8`, `APP_STORE_CONNECT_KEY_ID`, and `APP_STORE_CONNECT_ISSUER_ID`.
    - Sparkle ed25519 private key lives at `/Users/steipete/Library/CloudStorage/Dropbox/Backup/Sparkle`; export `SPARKLE_PRIVATE_KEY_FILE` to that path whenever the build script needs to sign an appcast/enclosure.
    - Verify tickets: `xcrun stapler validate vendor/oracle-notifier/OracleNotifier.app` and `spctl -a -t exec -vv vendor/oracle-notifier/OracleNotifier.app`.
3. **Changelog & docs**
  - [ ] Update `CHANGELOG.md` (or release notes) with highlights.
  - [ ] Keep changelog entries product-facing only; avoid adding release-status/meta lines (e.g., “Uploaded tarball …”)—that belongs in the GitHub release body.
  - [ ] Verify changelog structure: versions strictly descending, no duplicates or skipped numbers, single heading per version.
  - [ ] Ensure README reflects current CLI options (globs, `--status`, heartbeat behavior).
  - [ ] **Release notes must exactly match the version’s changelog section** (full Added/Changed/Fixed/Tests bullets, no omissions). After creating the GitHub release, compare the body to `CHANGELOG.md` and fix any mismatch.
4. **Validation**
   - [ ] `pnpm run check` (type errors block release).
   - [ ] `pnpm vitest run --maxWorkers 1 --testTimeout 15000` (the release helper uses this serial form by default; the normal parallel `pnpm test` can trip short unit-test timeouts under load)
   - [ ] `pnpm run lint` (error-level lint diagnostics block release; current warning-level Biome diagnostics are tracked as separate cleanup debt)
   - [ ] Optional live smoke (with real `OPENAI_API_KEY`): `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/openai-live.test.ts`
   - [ ] MCP sanity check: with `config/mcporter.json` pointed at the local stdio server (`auracall-local`), run `mcporter list auracall-local --schema --config config/mcporter.json` after building (`pnpm build`) to ensure tools/resources are discoverable.
   - [ ] Installed MCP API status smoke: after refreshing the user runtime, run `pnpm run smoke:mcp-api-status` and confirm `disabled` plus `scheduled` account-mirror scheduler postures.
5. **Publish / distribute**
   - [ ] Ensure git status is clean; commit and push any pending changes.
   - [ ] Run `./scripts/release.sh smoke` to verify the local tarball executes from an empty directory.
   - [ ] Run `./scripts/release.sh operator-smoke` to refresh the operator runtime, verify installed MCP `api_status`, and print the installed version.
   - [ ] Verify installed runtime with one dry-run command when the release changes CLI execution behavior.
   - [ ] Keep npm publish disabled unless the project deliberately opens that channel. The helper requires `AURACALL_ENABLE_NPM_PUBLISH=1` before the `publish` phase will run.
6. **Post-release**
  - [ ] Verify GitHub release exists for `vX.Y.Z` and has the intended assets (tarball + checksums if produced). Add missing assets before announcing.
  - [ ] Confirm the GitHub release body exactly matches the `CHANGELOG.md` section for `X.Y.Z` (full bullet list). If not, update with `gh release edit vX.Y.Z --notes-file <file>`.
  - [ ] `git tag vX.Y.Z && git push origin vX.Y.Z` (always tag each release).
   - [ ] Create GitHub release for tag `vX.Y.Z`:
      - Title = `X.Y.Z` (just the version, no “Oracle”, no date).
   - Body = product-facing bullet list for that version (copy from changelog bullets only; omit the heading and the word “changelog”). Always paste the full Added/Changed/Fixed bullets (no trimming) to keep npm/GitHub notes in sync.
      - Upload assets: `auracall-<version>.tgz`, `auracall-<version>.tgz.sha1`, `auracall-<version>.tgz.sha256`.
      - Confirm the auto `Source code (zip|tar.gz)` assets are present.
   - [ ] From a clean temp directory (no package.json/node_modules), install or execute the uploaded tarball and run `auracall "Smoke from empty dir" --dry-run`.
   - [ ] After uploading assets, verify they are reachable (e.g., `curl -I <GitHub-asset-URL>` or download and re-check SHA).
   - [ ] After verification, remove the untracked tarball/checksum assets from the repo root (`trash auracall-<version>.tgz*`).
   - [ ] Announce / share release notes.

## Deferred npm channel

AuraCall is not currently offered through npm. If that changes later, first
restore npm account/token setup, confirm `npm whoami`, then intentionally run
`AURACALL_ENABLE_NPM_PUBLISH=1 ./scripts/release.sh publish`. Do not treat npm
auth absence as a release blocker while this channel is deferred.
