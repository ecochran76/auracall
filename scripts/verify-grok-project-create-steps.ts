import { resolveScriptBrowserTarget } from './browser-target.js';
import { createGrokAdapter } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const stepArg = process.argv[2];
  if (!stepArg) {
    console.error('Usage: pnpm tsx scripts/verify-grok-project-create-steps.ts <step 1-7|all> [name] [instructions] [modelLabel] [file1] [file2] [file3]');
    process.exit(1);
  }
  const step = stepArg === 'all' ? 0 : Number.parseInt(stepArg, 10);
  if (stepArg !== 'all' && (!Number.isFinite(step) || step < 1 || step > 7)) {
    console.error('Step must be 1-7 or "all".');
    process.exit(1);
  }

  const name = process.argv[3] || 'New Project';
  const instructions = process.argv[4] || 'Test instructions.';
  const modelLabel = process.argv[5] || '';
  const filePaths = process.argv.slice(6);
  const fallbackFilePaths = process.argv.slice(3);

  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);

  const adapter = createGrokAdapter();
  const listOptions = { host, port };

  if (step === 1 || step === 0) {
    if (!adapter.openCreateProjectModal) {
      throw new Error('openCreateProjectModal not supported');
    }
    await adapter.openCreateProjectModal(listOptions);
    console.log('✅ Step 1: Create project modal opened.');
  }

  if (step === 2 || step === 0) {
    if (!adapter.setCreateProjectFields) {
      throw new Error('setCreateProjectFields not supported');
    }
    await adapter.setCreateProjectFields({ name, instructions, modelLabel }, listOptions);
    console.log('✅ Step 2: Fields set (name/instructions/model).');
  }

  if (step === 3 || step === 0) {
    if (!adapter.clickCreateProjectNext) {
      throw new Error('clickCreateProjectNext not supported');
    }
    await adapter.clickCreateProjectNext(listOptions);
    console.log('✅ Step 3: Next clicked.');
  }

  if (step === 4 || step === 0) {
    if (!adapter.clickCreateProjectAttach) {
      throw new Error('clickCreateProjectAttach not supported');
    }
    await adapter.clickCreateProjectAttach(listOptions);
    console.log('✅ Step 4: Attach button clicked.');
  }

  if (step === 5 || step === 0) {
    if (!adapter.clickCreateProjectUploadFile) {
      throw new Error('clickCreateProjectUploadFile not supported');
    }
    await adapter.clickCreateProjectUploadFile(listOptions);
    console.log('✅ Step 5: Upload a file selected.');
  }

  if (step === 6 || step === 0) {
    if (!adapter.uploadCreateProjectFiles) {
      throw new Error('uploadCreateProjectFiles not supported');
    }
    const resolvedPaths = filePaths.length > 0 ? filePaths : fallbackFilePaths;
    if (resolvedPaths.length === 0) {
      throw new Error('Step 6 requires one or more file paths.');
    }
    await adapter.uploadCreateProjectFiles(resolvedPaths, listOptions);
    console.log(`✅ Step 6: Uploaded ${resolvedPaths.length} file(s).`);
  }

  if (step === 7 || step === 0) {
    if (!adapter.clickCreateProjectConfirm) {
      throw new Error('clickCreateProjectConfirm not supported');
    }
    await adapter.clickCreateProjectConfirm(listOptions);
    console.log('✅ Step 7: Create clicked.');
  }
}

void main();
