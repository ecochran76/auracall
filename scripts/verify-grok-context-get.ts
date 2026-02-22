import { resolveScriptBrowserTarget } from './browser-target.js';
import { createGrokAdapter } from '../src/browser/providers/grokAdapter.js';
import type { ConversationContext } from '../src/browser/providers/domain.js';

async function main() {
  const conversationId = process.argv[2];
  const projectId = process.argv[3] || undefined;
  if (!conversationId) {
    console.error('Usage: pnpm tsx scripts/verify-grok-context-get.ts <conversationId> [projectId]');
    process.exit(1);
  }

  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);

  const adapter = createGrokAdapter();
  if (!adapter.readConversationContext) {
    throw new Error('readConversationContext not supported by grok adapter.');
  }
  const context = (await adapter.readConversationContext(conversationId, projectId, {
    host,
    port,
  })) as ConversationContext;
  const first = context.messages[0];
  const last = context.messages[context.messages.length - 1];
  console.log(
    `✅ Context loaded (${context.messages.length} messages). first=${first?.role ?? 'n/a'} last=${last?.role ?? 'n/a'}`,
  );
}

void main();
