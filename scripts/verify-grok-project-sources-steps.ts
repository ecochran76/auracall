import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import {
  clickProjectSourcesAttachWithClient,
  clickProjectSourcesUploadFileWithClient,
  ensureProjectSourcesFilesExpanded,
  ensureProjectSourcesTabSelected,
  removeProjectSourceFileWithClient,
  uploadProjectSourceFilesWithClient,
} from '../src/browser/providers/grokAdapter.js';
import { waitForSelector } from '../src/browser/service/ui.js';

async function main() {
  const stepArg = process.argv[2];
  const projectIdArg = process.argv[3];
  if (!stepArg || !projectIdArg) {
    console.error('Usage: pnpm tsx scripts/verify-grok-project-sources-steps.ts <step 1-6|all> <projectId|current> [file... ] [--delete <fileName>]');
    process.exit(1);
  }
  const step = stepArg === 'all' ? 0 : Number.parseInt(stepArg, 10);
  if (stepArg !== 'all' && (!Number.isFinite(step) || step < 1 || step > 6)) {
    console.error('Step must be 1-6 or "all".');
    process.exit(1);
  }

  let deleteName: string | null = null;
  const files: string[] = [];
  const args = process.argv.slice(4);
  for (let idx = 0; idx < args.length; idx += 1) {
    const value = args[idx];
    if (value === '--delete') {
      deleteName = args[idx + 1] ?? null;
      idx += 1;
      continue;
    }
    files.push(value);
  }

  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const targets = await CDP.List({ host, port });
  const grokTargets = targets.filter((entry) => entry.type === 'page' && entry.url?.includes('grok.com'));
  const target = grokTargets.find((entry) => entry.url?.includes('/project/')) || grokTargets[0];
  if (!target) {
    throw new Error('No grok.com page target found.');
  }

  const client = await CDP({ host, port, target });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);

  let projectId = projectIdArg;
  if (projectId === 'current') {
    const match = target.url?.match(/\/project\/([^/?#]+)/);
    if (!match?.[1]) {
      throw new Error('Current tab is not a project URL.');
    }
    projectId = match[1];
  }
  const projectUrl = `https://grok.com/project/${projectId}?tab=sources`;
  try {
    if (step === 0 || step === 1) {
      await client.Page.navigate({ url: projectUrl });
      await client.Page.loadEventFired();
      await ensureProjectSourcesTabSelected(client);
      const ready = await waitForSelector(
        client.Runtime,
        'div[id*="content-sources"], div[class*="group/collapsible-row"]',
        10_000,
      );
      if (!ready) {
        throw new Error('Sources content not found');
      }
      console.log('✅ Step 1: Sources tab selected.');
    }

    if (step === 0 || step === 2) {
      await ensureProjectSourcesFilesExpanded(client);
      console.log('✅ Step 2: Files section expanded.');
    }

    if (step === 0 || step === 3) {
      await clickProjectSourcesAttachWithClient(client);
      console.log('✅ Step 3: Attach menu opened.');
    }

    if (step === 0 || step === 4) {
      await clickProjectSourcesUploadFileWithClient(client);
      console.log('✅ Step 4: Upload a file selected.');
    }

    if (step === 0 || step === 5) {
      if (files.length === 0) {
        throw new Error('Step 5 requires one or more file paths.');
      }
      await uploadProjectSourceFilesWithClient(client, files);
      console.log(`✅ Step 5: Uploaded ${files.length} file(s).`);
    }

    if (step === 0 || step === 6) {
      if (!deleteName) {
        throw new Error('Step 6 requires --delete <fileName>.');
      }
      await removeProjectSourceFileWithClient(client, deleteName);
      console.log(`✅ Step 6: Remove clicked for "${deleteName}".`);
    }
  } finally {
    await client.close();
  }
}

void main();
