import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wrapperDir = path.join(repoRoot, 'scripts', 'browser-service');

const wrappedScripts = [
  'browser-tools.ts',
  'grok-dom-smoke.ts',
  'inspector.ts',
  'open-grok-history.ts',
  'set-grok-prompt-model.ts',
  'start-devtools-session.ts',
  'test-browser.ts',
  'test-remote-chrome.ts',
  'verify-grok-chat-area-click.ts',
  'verify-grok-context-get.ts',
  'verify-grok-context-sources.ts',
  'verify-grok-history-close.ts',
  'verify-grok-history-hover-point.ts',
  'verify-grok-history-item.ts',
  'verify-grok-history-rename-steps.ts',
  'verify-grok-history-see-all.ts',
  'verify-grok-main-sidebar-open.ts',
  'verify-grok-main-sidebar-state.ts',
  'verify-grok-main-sidebar-toggle.ts',
  'verify-grok-project-create-model-picker.ts',
  'verify-grok-project-create-steps.ts',
  'verify-grok-project-instructions-edit.ts',
  'verify-grok-project-instructions-modal.ts',
  'verify-grok-project-menu-clone.ts',
  'verify-grok-project-menu-remove.ts',
  'verify-grok-project-menu-rename.ts',
  'verify-grok-project-menu.ts',
  'verify-grok-project-remove-steps.ts',
  'verify-grok-project-sidebar-toggle.ts',
  'verify-grok-project-sources-steps.ts',
  'verify-grok-projects-row-hover.ts',
  'verify-grok-selectors.ts',
  'verify-mouse-move.ts',
  'verify-press-button-diagnostics.ts',
  'verify-press-button.ts',
];

describe('browser-service script wrappers', () => {
  test('keep browser-service family wrappers as thin compatibility copies', async () => {
    await Promise.all(
      wrappedScripts.map(async (scriptName) => {
        const wrapperPath = path.join(wrapperDir, scriptName);
        const sourcePath = path.join(repoRoot, 'scripts', scriptName);
        await expect(fs.stat(sourcePath)).resolves.toBeTruthy();
        const wrapper = await fs.readFile(wrapperPath, 'utf8');
        expect(wrapper).toBe(`#!/usr/bin/env tsx\nawait import("../${scriptName}");\n\nexport {};\n`);
      }),
    );
  });
});
