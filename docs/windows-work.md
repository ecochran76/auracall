# Windows work notes

Read this file whenever you're working from Windows and add new findings so the next agent can stay unblocked.

- Browser engine now allowed on Windows; expect more flakiness. If automation fails, rerun with `--engine api --wait` or point `--remote-chrome` to a running Chrome with remote debugging.
- WSL + browser automation: WSL-installed Chrome must use `ORACLE_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1` (default WSL host IP points at Windows and will hang). If using Windows Chrome from WSL, ensure the DevTools port is reachable (bind `--remote-debugging-address=0.0.0.0` or use a portproxy + firewall rule).
- Chrome DevTools via mcporter: `chrome-devtools` server needs `CHROME_DEVTOOLS_URL` from a live session; without it `mcporter call chrome-devtools.*` fails. Expect this to be unset on Windows unless you bring your own Chrome session/URL.
- agent-scripts bash helpers: `runner`/`scripts/committer` can fail under PowerShell/CMD because of CRLF and bash expectations. If they explode, run commands directly (`pnpm ...`, `git add/commit`) instead.
- browser-tools binary: not built in `agent-scripts/bin` on Windows; `pnpm tsx scripts/browser-tools.ts` also fails there (no package manifest). Use a macOS-built binary or run from macOS if you need it.
- Prefer PowerShell + pnpm directly; watch for CRLF warnings when touching tracked files.

Future Windows gotchas belong here. Update this doc when you learn something new.
