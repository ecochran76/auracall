# Smoke Tests

These are real end-to-end checks for the Grok browser path. Keep them updated as behavior changes.

For the still-open breadth work after this acceptance bar, see [grok-remaining-crud-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/grok-remaining-crud-plan.md).
If a smoke fails because of structural DOM drift rather than Grok-only behavior, consult [browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md) before adding another provider-local workaround.
For the remaining ChatGPT project-management surface after lifecycle CRUD, see [chatgpt-project-surface-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/chatgpt-project-surface-plan.md).

Current post-acceptance status:
- the full scripted WSL-primary Grok acceptance pass remains the canonical
  bar via `DISPLAY=:0.0 pnpm test:grok-acceptance`
- latest clean transcript:
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
  - returned `ok: true` on suffix `gmgchb`
- project create now recovers success by exact project name even when Grok does not immediately navigate to the new project URL
- Grok browser sends now tolerate the current delayed submit/commit path after uploads and preserve multiline Markdown prompts on the live `ProseMirror` composer
- live Grok conversation-file read parity is working via
  `auracall conversations files list <conversationId> --target grok [--project-id <id>]`
- live Grok conversation-file mutation is now available as append-only add via
  `auracall conversations files add <conversationId> --target grok --prompt <text> -f <path>`
- the same sent-turn file chips now appear in `conversations context get ...` as `files[]`
- the scripted runner now also verifies a disposable non-project conversation file via:
  - live `conversations files list`
  - live `conversations context get ... --json-only`
  - `cache files list --dataset conversation-files`
- conversation delete now clears the matching `conversation-files` cache rows during cleanup
- when the root/non-project conversation list surface lags after a browser-file prompt, the scripted runner now logs that lag and falls back to the fresh browser session `conversationId` from `~/.auracall/sessions/*/meta.json` so the same conversation can still be validated end to end

Current ChatGPT project status:
- lifecycle CRUD is green on the authenticated managed WSL Chrome path: list, create, rename, delete
- project create now also supports the memory-mode gear via `--memory-mode global|project`
- the signed-in browser session now supplies ChatGPT cache identity automatically via `/api/auth/session`
- remaining work is project sources/files first, then instructions, then clone if the native UI exposes it

## Environment

- If Chrome runs headful on Linux, prefix with `DISPLAY=:0.0` (or your X display).
- Close any stray Chrome profiles if a test depends on fresh launch behavior.
- The primary acceptance path is the authenticated WSL Chrome Aura-Call profile. Treat Windows Chrome as a secondary/manual-debug path until its human-session vs debug-session split is cleaner.
- Use disposable Grok project names made of normal words. Timestamp-heavy names can trip Grok's server-side `contains-phone-number` validation and produce false negatives during `projects create`.

## Grok Acceptance (WSL Chrome Primary)

Run this checklist before calling the WSL Grok browser path "fully functional." Use one disposable project, one disposable clone, one disposable conversation, and one disposable account-wide file, then clean them all up at the end.

Scripted runner:

```sh
DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts
```

Use `--profile <name>` if you want to run against a non-default Aura-Call profile, and `--keep-projects` if you want to keep the disposable project and clone around after a successful run for manual inspection. The manual steps below are the equivalent checklist the scripted runner executes, including the disposable root/non-project conversation-file parity step.

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

Notes:
- Treat clone rename as a real acceptance requirement, not best-effort. A passing run must return the requested clone name in the refreshed project list, not a fallback `(...clone)` title.

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
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --project-id <project_id> --dataset project-knowledge
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files remove <project_id> grok-file.txt --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files list <project_id> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --project-id <project_id> --dataset project-knowledge
```

Pass when:
- first list shows `grok-file.txt`
- cache file catalog shows `grok-file.txt` under `project-knowledge`
- remove succeeds
- second list no longer shows `grok-file.txt`
- cache file catalog no longer shows `grok-file.txt`

File stress extension:

```sh
printf 'alpha\n' >/tmp/grok-file-a.txt
cat >/tmp/grok-file-b.md <<'EOF'
# Sample

- one
- two
EOF
python3 - <<'PY'
from pathlib import Path
p = Path('/tmp/grok-medium.jsonl')
with p.open('w') as f:
    for i in range(6000):
        f.write('{"row":%d,"value":"%s"}\n' % (i, 'x' * 20))
PY

DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files add <project_id> -f /tmp/grok-file-a.txt /tmp/grok-file-b.md --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files list <project_id> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --project-id <project_id> --dataset project-knowledge
DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files add <project_id> -f /tmp/grok-medium.jsonl --target grok
```

Pass when:
- the multi-file upload persists and the refreshed list shows both unique file names
- the cache file catalog also shows both unique file names under `project-knowledge`
- if Grok silently drops the medium file after Save, Aura-Call now fails explicitly with `Uploaded file(s) did not persist after save: grok-medium.jsonl` instead of printing a false success

Notes:
- Use unique file names for the acceptance checklist. Same-name duplicate uploads are exploratory only; the current Grok file surface is name-based, so duplicate-name remove/list behavior is not the right primary correctness check.

### 5. Account Files Add + List + Remove

This is the account-wide `/files` surface linked from the avatar popup, not project knowledge. It matters because Grok enforces a 1 GB storage quota on this master file list.

```sh
printf 'Account file smoke\n' >/tmp/grok-account-file.txt
DISPLAY=:0.0 pnpm tsx bin/auracall.ts files add --target grok --file /tmp/grok-account-file.txt
DISPLAY=:0.0 pnpm tsx bin/auracall.ts files list --target grok
ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --dataset account-files --query grok-account-file.txt
DISPLAY=:0.0 pnpm tsx bin/auracall.ts files remove <account_file_id> --target grok
DISPLAY=:0.0 pnpm tsx bin/auracall.ts files list --target grok
ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --dataset account-files --query grok-account-file.txt
```

Pass when:
- the first list returns the uploaded file with a concrete Grok file id
- the cache file catalog shows the uploaded file under `account-files`
- remove succeeds without hanging on staged inline delete controls
- the second list no longer shows that file id or filename
- the cache file catalog no longer shows that file

Notes:
- Grok account-file delete is a two-step inline row action on `/files`: `Delete file` first, then a row-local `Delete`. Aura-Call must drive both steps.

### 6. Conversation Create + List + Context + Rename + Delete

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

### 7. Prompt Capture + Markdown Preservation

```sh
DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --browser-target grok --project-id <project_id> --model grok-4.1-thinking --prompt $'Return exactly this Markdown:\\n- alpha\\n```txt\\nbeta\\n```' --wait --force
```

Pass when:
- the CLI/session transcript preserves the bullet and fenced code block
- the run does not echo the prompt back as the assistant answer

### 8. Cache Freshness + Cleanup

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

Notes:
- A passing cleanup run means the `projects remove ...` commands themselves return success, not merely that the disposable projects disappear later from Grok.

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
