import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: 'direct Page.navigate', pattern: /\bPage\.navigate\s*\(/ },
  { label: 'direct Page.reload', pattern: /\bPage\.reload\s*\(/ },
  { label: 'direct location.assign', pattern: /\blocation\.assign\s*\(/ },
  { label: 'direct location.replace', pattern: /\blocation\.replace\s*\(/ },
  { label: 'direct location.href assignment', pattern: /\b(?:window\.)?location\.href\s*=/ },
];

describe('browser mutation control plane', () => {
  test('legacy browser flows do not issue direct navigation mutations', async () => {
    const files = await fg(['src/browser/**/*.ts', 'src/gemini-web/**/*.ts'], {
      cwd: repoRoot,
      absolute: true,
      ignore: [
        'src/browser/providers/**',
        'src/browser/service/**',
        'src/browser/liveDiagnostics.ts',
      ],
    });
    const violations: string[] = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      const relative = path.relative(repoRoot, file);
      for (const { label, pattern } of forbiddenPatterns) {
        if (pattern.test(text)) {
          violations.push(`${relative}: ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
