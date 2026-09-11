import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

describe('conversation artifact fetch lifecycle', () => {
  test('forces the completed CLI process to settle after materialization output', async () => {
    const source = await fs.readFile(path.resolve('bin/auracall.ts'), 'utf8');
    const start = source.indexOf("conversationArtifactsCommand\n  .command('fetch <id>')");
    const end = source.indexOf("conversationContextCommand\n  .command('get <id>')", start);
    const action = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(action).toContain('materializeConversationArtifacts');
    expect(action.match(/exitAfterCompletedBrowserFileCommand\(\)/g)).toHaveLength(1);
    expect(action.indexOf('exitAfterCompletedBrowserFileCommand()')).toBeGreaterThan(
      action.indexOf('materializeConversationArtifacts'),
    );
  });
});
