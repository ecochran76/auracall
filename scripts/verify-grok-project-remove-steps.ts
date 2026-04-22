import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import {
  ensureMainSidebarOpen,
  ensureProjectSidebarOpen,
  openProjectMenuButton,
  clickProjectMenuItem,
  clickProjectRemoveConfirmation,
} from '../src/browser/providers/grokAdapter.js';

async function main() {
  const stepArg = process.argv[2];
  const projectId = process.argv[3];
  if (!stepArg || !projectId) {
    console.error('Usage: pnpm tsx scripts/verify-grok-project-remove-steps.ts <step 1-5> <projectId>');
    process.exit(1);
  }
  const step = Number.parseInt(stepArg, 10);
  if (!Number.isFinite(step) || step < 1 || step > 5) {
    console.error('Step must be 1-5.');
    process.exit(1);
  }

  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const targets = await CDP.List({ host, port });
  const grokTargets = targets.filter((entry) => entry.type === 'page' && entry.url?.includes('grok.com'));
  const target =
    grokTargets.find((entry) => entry.url?.includes(`/project/${projectId}`)) ||
    grokTargets.find((entry) => entry.url?.includes('/project/')) ||
    grokTargets.find((entry) => entry.url?.includes('/c/')) ||
    grokTargets[0];
  if (!target) {
    throw new Error('No grok.com page target found.');
  }
  const client = await CDP({ host, port, target });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    const projectUrl = `https://grok.com/project/${projectId}`;
    if (step >= 1) {
      await client.Page.navigate({ url: projectUrl });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      console.log('✅ Step 1: Navigated to project URL.');
    }
    if (step >= 2) {
      await ensureMainSidebarOpen(client, { logPrefix: 'script-project-remove' });
      console.log('✅ Step 2: Main sidebar ensured open.');
    }
    if (step >= 3) {
      await ensureProjectSidebarOpen(client, { logPrefix: 'script-project-remove' });
      console.log('✅ Step 3: Project sidebar is open.');
    }
    if (step >= 4) {
      await openProjectMenuButton(client, { logPrefix: 'script-project-remove' });
      console.log('✅ Step 4: Project menu opened.');
    }
    if (step >= 5) {
      await clickProjectMenuItem(client, 'Remove', { logPrefix: 'script-project-remove' });
      console.log('✅ Step 5: Remove selected.');
      await clickProjectRemoveConfirmation(client, { logPrefix: 'script-project-remove' });
      console.log('✅ Step 5: Confirmed delete.');
    }
  } finally {
    await client.close();
  }
}

void main();
