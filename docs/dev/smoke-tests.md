# Smoke Tests

These are real end-to-end checks for the Grok browser path. Keep them updated as behavior changes.

## Environment

- If Chrome runs headful on Linux, prefix with `DISPLAY=:0.0` (or your X display).
- Close any stray Chrome profiles if a test depends on fresh launch behavior.
- The primary acceptance path is the authenticated WSL Chrome Aura-Call profile. Treat Windows Chrome as a secondary/manual-debug path until its human-session vs debug-session split is cleaner.
- Use disposable Grok project names made of normal words. Timestamp-heavy names can trip Grok's server-side `contains-phone-number` validation and produce false negatives during `projects create`.

## Grok Acceptance (WSL Chrome Primary)

Run this checklist before calling the WSL Grok browser path "fully functional." Use one disposable project, one disposable clone, and one disposable conversation, then clean them all up at the end.

Suggested scratch names:

```sh
export DISPLAY=:0.0
export GROK_PROJECT_NAME="AuraCall Cedar Atlas"
export GROK_PROJECT_RENAMED="AuraCall Cedar Harbor"
export GROK_PROJECT_CLONE="AuraCall Cedar Orbit"
export GROK_CONVERSATION_RENAMED="AuraCall Maple Harbor"
printf 'AuraCall instructions smoke\\nLine two\\n' >/tmp/grok-instructions.txt
printf 'AuraCall Grok file smoke\\n' >/tmp/grok-file.txt
```

### 1. Project Create + List

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create "$GROK_PROJECT_NAME" --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh
```

Pass when:
- create returns a concrete project id
- refreshed list contains `$GROK_PROJECT_NAME`

### 2. Project Rename + Clone

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects rename <project_id> "$GROK_PROJECT_RENAMED" --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects clone <project_id> "$GROK_PROJECT_CLONE" --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh
```

Pass when:
- the renamed project appears as `$GROK_PROJECT_RENAMED`
- the clone appears as `$GROK_PROJECT_CLONE`
- the renamed project id and clone id are distinct

### 3. Project Instructions Get + Set

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects instructions set <project_id> --target grok --file /tmp/grok-instructions.txt
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects instructions get <project_id> --target grok
```

Pass when:
- `set` succeeds without selector drift errors
- `get` returns both `AuraCall instructions smoke` and `Line two`

### 4. Project Files Add + List + Remove

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files add <project_id> -f /tmp/grok-file.txt --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files list <project_id> --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files remove <project_id> grok-file.txt --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files list <project_id> --target grok
```

Pass when:
- first list shows `grok-file.txt`
- remove succeeds
- second list no longer shows `grok-file.txt`

### 5. Conversation Create + List + Context + Rename + Delete

Create the conversation inside the disposable project:

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --browser-target grok --project-id <project_id> --model grok-4.1-thinking --prompt "Reply exactly with: AuraCall Maple Ledger" --wait --force
DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations --target grok --project-id <project_id> --refresh --include-history
```

Capture the new conversation id from the refreshed conversation list, then run:

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations context get <conversation_id> --target grok --project-id <project_id>
DISPLAY=:0.0 pnpm tsx bin/auracall.ts rename <conversation_id> "$GROK_CONVERSATION_RENAMED" --target grok --project-id <project_id>
DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations --target grok --project-id <project_id> --refresh --include-history
DISPLAY=:0.0 pnpm tsx bin/auracall.ts delete <conversation_id> --target grok --project-id <project_id> --yes
DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations --target grok --project-id <project_id> --refresh --include-history
```

Pass when:
- the first refreshed conversation list includes the new conversation id
- `context get` returns both the user prompt and Grok's exact reply
- rename succeeds and the second refreshed list shows `$GROK_CONVERSATION_RENAMED`
- delete succeeds and the final refreshed list no longer includes that conversation id

### 6. Prompt Capture + Markdown Preservation

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --browser-target grok --project-id <project_id> --model grok-4.1-thinking --prompt $'Return exactly this Markdown:\\n- alpha\\n```txt\\nbeta\\n```' --wait --force
```

Pass when:
- the CLI/session transcript preserves the bullet and fenced code block
- the run does not echo the prompt back as the assistant answer

### 7. Cache Freshness + Cleanup

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove <clone_project_id> --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove <project_id> --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh
```

Pass when:
- refreshed cache/list state agrees with the live UI after rename/delete operations
- both disposable projects are gone after cleanup
- no obvious pile-up of Grok tabs/windows was created during the run

If any step fails, stop calling Grok "fully functional" and log the exact failing command plus the active UI surface in `docs/dev/dev-journal.md` and `docs/dev-fixes-log.md`.

## Grok Core

1) Basic prompt (default profile, keep browser alive)

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts -p "ping" --model grok-4.1-thinking --force --browser-keep-browser
```

1b) Basic prompt with explicit target routing

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts -p "ping" --browser-target grok --model grok-4.1-thinking --force --browser-keep-browser
```

2) Projects refresh + cache

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh
pnpm tsx bin/auracall.ts cache
```

3) Conversations list (history dialog + scrolling)

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history
```

4) Prompt inside project (uses cached project, resolves slug)

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts -p "ping" --model grok-4.1-thinking --project-name "SABER" --force --browser-keep-browser
```

5) Conversation selectors (project scope + global scope)

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --model grok-4.1-thinking --project-name "Oracle" --conversation-name latest --prompt "ping" --wait --verbose
DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --model grok-4.1-thinking --project-name "Oracle" --conversation-name latest-1 --prompt "ping" --wait --verbose
DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --model grok-4.1-thinking --no-project --conversation-name latest --prompt "ping" --wait --verbose
```

## Session + Registry

6) Reattach flow (keep Chrome open)

```sh
pnpm tsx bin/auracall.ts session
pnpm tsx bin/auracall.ts session <id> --render
```

7) Registry sanity (ports + tabs + services)

```sh
python3 - <<'PY'
import json,os
p=os.path.expanduser('~/.auracall/browser-state.json')
print(json.dumps(json.load(open(p)),indent=2))
PY
```
