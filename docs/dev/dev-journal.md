# Dev Journal

Log ongoing progress, current focus, and problems/solutions. Keep entries brief and ordered newest-first.

## Entry format

- Date:
- Focus:
- Progress:
- Issues:
- Next:

## Entries

- Date: 2026-01-24
- Focus: UI helper upgrades + Grok menu/hover reliability.
- Progress: Added `waitForMenuOpen`, `pressMenuButtonByAriaLabel`, `hoverAndReveal`, and `pressButton` diagnostics; scoped menu selection with `menuRootSelectors`; adopted helpers in Grok project menu + history rename/delete; added fallback navigation when create-project hover fails; added `scripts/start-devtools-session.ts` to launch/resolve a DevTools port.
- Issues: Local smoke scripts require a live DevTools port; no active port caused verify scripts to fail.
- Next: Resume Phase 7 CRUD (project sources knowledge + conversations).

- Date: 2026-01-15
- Focus: Grok project sources file management + UI helper extraction.
- Progress: Added project file add/list/remove CLI; hardened Sources tab attach/upload/remove flows; extracted reusable helpers (`ensureCollapsibleExpanded`, `hoverRowAndClickAction`, `queryRowsByText`, `openRadixMenu`) and updated docs.
- Issues: Grok sources collapse state + hover-only controls required coordinate hover; Radix menus required pointer event sequence.
- Next: Continue Phase 7 project CRUD (knowledge files + clone fix), then revisit conversation flows.
