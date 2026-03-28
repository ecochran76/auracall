# Browser Automation Playbook

## Goal
Codify repeatable steps for UI automation so we avoid rediscovering DOM quirks.

For generic DOM-drift follow-on work, use
[browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md)
as the extraction plan. If a repair looks reusable, prefer moving it into
`packages/browser-service/` over adding another provider-local workaround.
Current plan: keep trigger/button scoring in the adapter unless it clearly
repeats on another real surface/provider; make structured UI diagnostics the
next browser-service extraction so failures arrive with scoped evidence.

## Workflow Checklist
1) **Recon first**
   - Use `scripts/browser-tools.ts tabs --port <port>` first when you are not sure which tab the tooling will target.
   - Use `scripts/browser-tools.ts eval` to list visible elements, labels, and positions.
   - If the issue looks like route settling, hover-row action drift, or poor failure diagnostics, check the current DOM-drift priorities in `docs/dev/browser-service-upgrade-backlog.md` before patching provider code.
   - Default tab policy should be: exact URL reuse first, then blank-tab reuse, then same-origin reuse, then compatible service-host reuse, and only create a new tab when nothing reusable exists.
   - Cleanup policy should stay conservative and profile-scoped: always keep the selected tab, keep only a small tail of matching-family tabs, keep at most one spare blank/new-tab page, and only collapse extra windows when every tab in that window is disposable for the same profile/service action.
   - If a profile needs different cleanup behavior, set it explicitly in config via `browser.serviceTabLimit`, `browser.blankTabLimit`, and `browser.collapseDisposableWindows` instead of patching provider code.
   - Prefer `aria-label`, `role`, and obvious text nodes over brittle class selectors.
   - Check `docs/dev/browser-service-tools.md` for reusable helpers before writing new DOM logic.
   - If no DevTools port is active, run `pnpm tsx scripts/start-devtools-session.ts --url=https://grok.com`.

2) **Scope selectors**
   - If the workflow uses a dialog, scope queries to the dialog root.
   - If the workflow uses a list row, scope queries to the row container.
   - Prefer selector helpers (`cssClassContains`, `cssAttrContains`) to avoid escaping bugs.

3) **Use visible element filters**
   - Filter candidates with `getBoundingClientRect()` so hidden hover-only controls are ignored.
   - When multiple matches exist, pick the closest element to the target row.

4) **Interact like a user**
  - Hover over rows to surface hidden controls.
  - Use pointer events when click handlers are picky.
  - Prefer browser-service helpers (`pressButton`, `openMenu`, `hoverElement`) over ad-hoc DOM events.
  - Prefer `navigateAndSettle(...)` over raw `Page.navigate(...)` when the app is an SPA or a route/ready race has shown up before.
  - When troubleshooting a miss, enable `pressButton` diagnostics (`logCandidatesOnMiss`) to capture visible labels.
   - For menu buttons, prefer `aria-label="Open menu"` to avoid picking the profile/user menu.
   - If a menu uses `aria-controls`, wait for the referenced element id but fall back to a generic
     menu selector when the id is missing.
   - Use `clickRevealedRowAction(...)` for hover-revealed Rename/Delete actions before dropping to lower-level hover/click helpers.
- For hover-only row menus, prefer `openRevealedRowMenu(...)` before wiring `hoverAndReveal(...)` + `openMenu(...)` manually.
- If the row menu trigger lives inside or beside a navigable link, use the
  helper's trigger-prep/direct-click options instead of adding provider-local
  menu-open suppression unless the row still needs custom button scoring.
- For hover-only row actions (files/conversations), prefer `hoverRowAndClickAction` when the row is located by visible text instead of a pre-tagged selector.
- For collapsible panels (Files/Sources), use `ensureCollapsibleExpanded` before searching rows.
- For project Sources workflows, use `ensureProjectSourcesTabSelected` + `ensureProjectSourcesFilesExpanded`
  and the `verify-grok-project-sources-steps.ts` script to validate the attach/upload/delete sequence.

5) **Set inputs reliably**
   - For inputs, use the native setter + `input`/`change` events.
   - For contenteditable, set `textContent` + `input` event.
   - Prefer `submitInlineRename` for inline rename flows to handle save + close logic.

6) **Verify state changes**
   - Confirm edit mode exits.
   - Confirm the title/label matches the new value.
   - If verification fails, throw with the observed value.

7) **Fail loudly with context**
   - Return useful error strings when UI elements are missing.
   - Log selector candidates and counts in verbose mode.
   - Prefer package-owned diagnostics and probe helpers when possible so the next repair does not start from raw `eval`.
   - When a flow is still fragile after the row/menu helper extraction, the next default move is not more provider-local selector glue; it is adopting the upcoming structured diagnostics wrapper from `browser-service-upgrade-backlog.md`.

## When to Ask for Browser Inspection
If the DOM is ambiguous or selectors are inconsistent:
- Ask the user to inspect the UI and provide the target element HTML snippet.
- Ask for the `aria-label` / button text / role and whether it’s visible or hover-only.
- Ask for a quick `browser-tools.ts eval` output scoped to the target area.

## Common Probe Snippets
List visible buttons + labels:
```
pnpm tsx scripts/browser-tools.ts eval --port <port> \
  "Array.from(document.querySelectorAll('button[aria-label], button'))
    .map(btn => ({ label: btn.getAttribute('aria-label'),
                   text: (btn.textContent || '').trim().slice(0, 40),
                   visible: (() => { const r = btn.getBoundingClientRect(); return r.width > 0 && r.height > 0; })() }))
    .filter(item => item.visible && (item.label || item.text))"
```

Find active inputs/editables:
```
pnpm tsx scripts/browser-tools.ts eval --port <port> \
  "(() => ({ active: document.activeElement?.outerHTML?.slice(0, 200) || null }))()"
```

Find a row and its controls:
```
pnpm tsx scripts/browser-tools.ts eval --port <port> \
  "(() => {
     const row = document.querySelector('<row-selector>');
     if (!row) return { ok: false };
     const buttons = Array.from(row.querySelectorAll('button'))
       .map(btn => ({ aria: btn.getAttribute('aria-label'), text: (btn.textContent || '').trim() }));
     return { ok: true, buttons };
   })()"
```

## Known Grok Patterns (as of now)
- Project rename uses header input `aria-label="Project name"` and a `button[type="submit"][aria-label="Save"]`.
- Conversation rename in project list uses `button[aria-label="Rename"]` and row-level `button[aria-label="Save"]`.
- History dialog actions must be scoped to the dialog root.
- Project instructions UI can be slow to render; find the Edit Instructions button with a retry loop and avoid relying on a single selector.
- On newer project sidebars, the instructions editor may open from the clickable instructions card (`group/side-panel-section`) even when a labeled `Edit instructions` button is absent; keep a card-click fallback.
