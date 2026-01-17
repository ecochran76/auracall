import { resolveScriptBrowserTarget } from './browser-target.js';
import { createGrokAdapter } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const stepArg = process.argv[2];
  if (!stepArg) {
    console.error('Usage: pnpm tsx scripts/verify-grok-project-create-steps.ts <step 1-6> [name] [instructions] [modelLabel]');
    process.exit(1);
  }
  const step = Number.parseInt(stepArg, 10);
  if (!Number.isFinite(step) || step < 1 || step > 6) {
    console.error('Step must be 1-6.');
    process.exit(1);
  }

  const name = process.argv[3] || 'New Project';
  const instructions = process.argv[4] || 'Test instructions.';
  const modelLabel = process.argv[5] || '';

  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);

  const adapter = createGrokAdapter();
  const listOptions = { host, port };

  if (step >= 1) {
    if (!adapter.openCreateProjectModal) {
      throw new Error('openCreateProjectModal not supported');
    }
    await adapter.openCreateProjectModal(listOptions);
    console.log('✅ Step 1: Create project modal opened.');
  }

  if (step >= 2) {
    if (!adapter.setCreateProjectFields) {
      throw new Error('setCreateProjectFields not supported');
    }
    await adapter.setCreateProjectFields({ name, instructions, modelLabel }, listOptions);
    console.log('✅ Step 2: Fields set (name/instructions/model).');
  }

  if (step >= 3) {
    if (!adapter.clickCreateProjectNext) {
      throw new Error('clickCreateProjectNext not supported');
    }
    await adapter.clickCreateProjectNext(listOptions);
    console.log('✅ Step 3: Next clicked.');
  }

  if (step >= 4) {
    if (!adapter.clickCreateProjectAttach) {
      throw new Error('clickCreateProjectAttach not supported');
    }
    await adapter.clickCreateProjectAttach(listOptions);
    console.log('✅ Step 4: Attach button clicked.');
  }

  if (step >= 5) {
    if (!adapter.clickCreateProjectUploadFile) {
      throw new Error('clickCreateProjectUploadFile not supported');
    }
    await adapter.clickCreateProjectUploadFile(listOptions);
    console.log('✅ Step 5: Upload a file selected.');
  }

  if (step >= 6) {
    if (!adapter.clickCreateProjectConfirm) {
      throw new Error('clickCreateProjectConfirm not supported');
    }
    await adapter.clickCreateProjectConfirm(listOptions);
    console.log('✅ Step 6: Create clicked.');
  }
}

void main();
