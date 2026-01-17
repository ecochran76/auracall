# Browser Automation Playbook

## Goal
Codify repeatable steps for UI automation so we avoid rediscovering DOM quirks.

## Workflow Checklist
1) **Recon first**
   - Use `scripts/browser-tools.ts eval` to list visible elements, labels, and positions.
   - Prefer `aria-label`, `role`, and obvious text nodes over brittle class selectors.
   - Check `docs/dev/browser-service-tools.md` for reusable helpers before writing new DOM logic.

2) **Scope selectors**
   - If the workflow uses a dialog, scope queries to the dialog root.
   - If the workflow uses a list row, scope queries to the row container.

3) **Use visible element filters**
   - Filter candidates with `getBoundingClientRect()` so hidden hover-only controls are ignored.
   - When multiple matches exist, pick the closest element to the target row.

4) **Interact like a user**
   - Hover over rows to surface hidden controls.
   - Use pointer events when click handlers are picky.
   - Prefer browser-service helpers (`pressButton`, `openMenu`, `hoverElement`) over ad-hoc DOM events.

5) **Set inputs reliably**
   - For inputs, use the native setter + `input`/`change` events.
   - For contenteditable, set `textContent` + `input` event.

6) **Verify state changes**
   - Confirm edit mode exits.
   - Confirm the title/label matches the new value.
   - If verification fails, throw with the observed value.

7) **Fail loudly with context**
   - Return useful error strings when UI elements are missing.
   - Log selector candidates and counts in verbose mode.

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
