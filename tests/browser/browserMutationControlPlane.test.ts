import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { describe, expect, test } from 'vitest';
import { RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST } from '../../scripts/raw-devtools-guard.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: 'direct Page.navigate', pattern: /\bPage\.navigate\s*\(/ },
  { label: 'direct Page.reload', pattern: /\bPage\.reload\s*\(/ },
  { label: 'direct location.assign', pattern: /\blocation\.assign\s*\(/ },
  { label: 'direct location.replace', pattern: /\blocation\.replace\s*\(/ },
  { label: 'direct location.href assignment', pattern: /\b(?:window\.)?location\.href\s*=(?!=)/ },
];

const browserServiceControlPointAllowlist = new Set([
  'packages/browser-service/src/chromeLifecycle.ts',
  'packages/browser-service/src/service/ui.ts',
]);

describe('browser mutation control plane', () => {
  test('legacy browser flows do not issue direct navigation mutations', async () => {
    const files = await fg([
      'src/browser/**/*.ts',
      'src/gemini-web/**/*.ts',
      'packages/browser-service/src/**/*.ts',
    ], {
      cwd: repoRoot,
      absolute: true,
    });
    const violations: string[] = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      const relative = path.relative(repoRoot, file);
      if (browserServiceControlPointAllowlist.has(relative)) {
        continue;
      }
      for (const { label, pattern } of forbiddenPatterns) {
        if (pattern.test(text)) {
          violations.push(`${relative}: ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('raw mutating CDP scripts are explicit guarded escape hatches', async () => {
    const files = await fg(['scripts/**/*.ts'], {
      cwd: repoRoot,
      absolute: true,
      ignore: ['scripts/browser-service/**'],
    });
    const rawMutatingScripts: string[] = [];
    const unguardedScripts: string[] = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      const relative = path.relative(repoRoot, file);
      const hasDirectMutation = forbiddenPatterns.some(({ pattern }) => pattern.test(text));
      if (!hasDirectMutation) {
        continue;
      }
      rawMutatingScripts.push(relative);
      if (!text.includes("enforceRawDevToolsEscapeHatchForCli")) {
        unguardedScripts.push(relative);
      }
    }

    // The allowlist also includes guarded tools that delegate to mutation helpers.
    // Every direct navigation must be allowlisted, and every listed tool guarded.
    for (const script of rawMutatingScripts) {
      expect(RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST).toContain(script);
    }
    for (const script of RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST) {
      expect(await readFile(path.join(repoRoot, script), 'utf8')).toContain('enforceRawDevToolsEscapeHatchForCli');
    }
    expect(unguardedScripts).toEqual([]);
  });
});
