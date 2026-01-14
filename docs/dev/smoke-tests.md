# Smoke Tests

These are real end-to-end checks for the Grok browser path. Keep them updated as behavior changes.

## Environment

- If Chrome runs headful on Linux, prefix with `DISPLAY=:0.0` (or your X display).
- Close any stray Chrome profiles if a test depends on fresh launch behavior.

## Grok Core

1) Basic prompt (default profile, keep browser alive)

```sh
DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts -p "ping" --model grok-4.1-thinking --force --browser-keep-browser
```

2) Projects refresh + cache

```sh
DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts projects --target grok --refresh
pnpm tsx bin/oracle-cli.ts cache
```

3) Conversations list (history dialog + scrolling)

```sh
DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts conversations --target grok --refresh --include-history
```

4) Prompt inside project (uses cached project, resolves slug)

```sh
DISPLAY=:0.0 pnpm tsx bin/oracle-cli.ts -p "ping" --target grok --project-name "SABER" --force --browser-keep-browser
```

## Session + Registry

5) Reattach flow (keep Chrome open)

```sh
pnpm tsx bin/oracle-cli.ts session
pnpm tsx bin/oracle-cli.ts session <id> --render
```

6) Registry sanity (ports + tabs + services)

```sh
python3 - <<'PY'
import json,os
p=os.path.expanduser('~/.oracle/browser-state.json')
print(json.dumps(json.load(open(p)),indent=2))
PY
```
