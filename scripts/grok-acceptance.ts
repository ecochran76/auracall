#!/usr/bin/env tsx
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Project = {
  id: string;
  name: string;
};

type Conversation = {
  id: string;
  title: string;
};

type ListedFile = {
  id: string;
  name: string;
  size?: number;
};

type AccountFile = ListedFile;

type ConversationContextPayload = {
  conversationId: string;
  files?: Array<{
    id?: string;
    name?: string;
    size?: number;
  }>;
  messages?: Array<{
    role?: string;
    text?: string;
  }>;
  context?: {
    files?: Array<{
      id?: string;
      name?: string;
      size?: number;
    }>;
    messages?: Array<{
      role?: string;
      text?: string;
    }>;
  };
};

type ProjectInstructions = {
  text?: string;
  model?: string;
};

type CacheFilesListPayload = {
  count?: number;
  rows?: Array<{
    dataset?: string;
    displayName?: string;
    projectId?: string | null;
  }>;
};

type RunOptions = {
  expectFailure?: boolean;
  timeoutMs?: number;
};

type RunResult = {
  stdout: string;
  stderr: string;
  combined: string;
};

type Args = {
  json: boolean;
  keepProjects: boolean;
  profile?: string;
  model: string;
};

type AcceptanceSummary = {
  ok: boolean;
  profile: string | null;
  model: string;
  suffix: string;
  tempDir: string;
  projectId: string | null;
  cloneId: string | null;
  conversationId: string | null;
  rootConversationId: string | null;
  accountFileId: string | null;
  accountFileName: string;
  conversationFileName: string;
  projectName: string;
  renamedProjectName: string;
  cloneProjectName: string;
  renamedConversationName: string;
  mediumFileGuard: string | null;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MODEL = 'grok-4.1-thinking';
const EXPECTED_MEDIUM_FILE_ERROR = 'Uploaded file(s) did not persist after save: grok-medium.jsonl';

function parseArgs(argv: string[]): Args {
  const args: Args = {
    json: false,
    keepProjects: false,
    model: DEFAULT_MODEL,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--keep-projects') {
      args.keepProjects = true;
      continue;
    }
    if (token === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if (token === '--model' && argv[i + 1]) {
      args.model = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage: pnpm tsx scripts/grok-acceptance.ts [options]

Run the full WSL-primary Grok acceptance checklist against the live Aura-Call CLI.

Options:
  --profile <name>     Aura-Call profile to use (default: active profile)
  --model <label>      Browser model for conversation/prompt checks (default: ${DEFAULT_MODEL})
  --keep-projects      Keep disposable project + clone after a successful run
  --json               Print the final summary as JSON
  --help               Show this message
`);
}

function logStep(message: string): void {
  console.log(`[grok-acceptance] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function randomSuffix(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(length);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

function buildAuracallArgs(args: Args, extra: string[]): string[] {
  const cliArgs = ['tsx', 'bin/auracall.ts'];
  if (args.profile) {
    cliArgs.push('--profile', args.profile);
  }
  cliArgs.push(...extra);
  return cliArgs;
}

function runAuracall(args: Args, extra: string[], options: RunOptions = {}): RunResult {
  const cliArgs = buildAuracallArgs(args, extra);
  const command = ['pnpm', ...cliArgs].join(' ');
  logStep(`$ ${command}`);
  const result = spawnSync('pnpm', cliArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 60_000,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      ORACLE_NO_BANNER: '1',
      NODE_NO_WARNINGS: '1',
    },
  });
  if (result.error) {
    throw result.error;
  }
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
  if (options.expectFailure) {
    if (result.status === 0) {
      throw new Error(`Expected failure but command succeeded: ${command}`);
    }
    return { stdout, stderr, combined };
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}\n${combined}`);
  }
  return { stdout, stderr, combined };
}

function parseJson<T>(label: string, text: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${label} returned empty output.`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new Error(`${label} did not return valid JSON.\n${trimmed}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findProjectByName(projects: Project[], name: string): Project | undefined {
  return projects.find((project) => project.name === name);
}

function findConversationById(conversations: Conversation[], id: string): Conversation | undefined {
  return conversations.find((conversation) => conversation.id === id);
}

function normalizeMessages(payload: ConversationContextPayload): string[] {
  const messages = payload.messages ?? payload.context?.messages ?? [];
  return messages
    .map((message) => (typeof message.text === 'string' ? message.text.trim() : ''))
    .filter((message) => message.length > 0);
}

function normalizeContextFileNames(payload: ConversationContextPayload): string[] {
  const files = payload.files ?? payload.context?.files ?? [];
  return files
    .map((file) => (typeof file.name === 'string' ? file.name.trim() : ''))
    .filter((name) => name.length > 0);
}

async function findRecentBrowserConversationIdByPrompt(prompt: string): Promise<string | null> {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return null;
  }
  const sessionsDir = path.join(homeDir, '.auracall', 'sessions');
  let entries: Dirent[];
  try {
    entries = await readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches: Array<{ startedAt: number; conversationId: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(sessionsDir, String(entry.name), 'meta.json');
    let raw = '';
    try {
      raw = await readFile(metaPath, 'utf8');
    } catch {
      continue;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const mode = typeof parsed?.mode === 'string' ? parsed.mode : '';
    const provider = typeof parsed?.browser?.context?.provider === 'string' ? parsed.browser.context.provider : '';
    const promptValue =
      typeof parsed?.options?.prompt === 'string'
        ? parsed.options.prompt
        : typeof parsed?.promptPreview === 'string'
          ? parsed.promptPreview
          : '';
    const conversationId =
      typeof parsed?.browser?.runtime?.conversationId === 'string' ? parsed.browser.runtime.conversationId.trim() : '';
    const startedAtValue =
      typeof parsed?.startedAt === 'string'
        ? Date.parse(parsed.startedAt)
        : typeof parsed?.createdAt === 'string'
          ? Date.parse(parsed.createdAt)
          : NaN;
    if (mode !== 'browser' || provider !== 'grok' || promptValue !== prompt || !conversationId) {
      continue;
    }
    matches.push({
      startedAt: Number.isFinite(startedAtValue) ? startedAtValue : 0,
      conversationId,
    });
  }
  matches.sort((left, right) => right.startedAt - left.startedAt);
  return matches[0]?.conversationId ?? null;
}

function normalizeCachedFileNames(payload: CacheFilesListPayload): string[] {
  return (payload.rows ?? [])
    .map((row) => (typeof row.displayName === 'string' ? row.displayName.trim() : ''))
    .filter((name) => name.length > 0);
}

async function writeFixtureFiles(tempDir: string): Promise<void> {
  await writeFile(path.join(tempDir, 'grok-instructions.txt'), 'AuraCall instructions smoke\nLine two\n', 'utf8');
  await writeFile(path.join(tempDir, 'grok-file.txt'), 'AuraCall Grok file smoke\n', 'utf8');
  await writeFile(path.join(tempDir, 'grok-file-a.txt'), 'alpha\n', 'utf8');
  await writeFile(path.join(tempDir, 'grok-file-b.md'), '# Sample\n\n- one\n- two\n', 'utf8');
  const lines = Array.from({ length: 6000 }, (_, index) => `{"row":${index},"value":"${'x'.repeat(20)}"}\n`).join('');
  await writeFile(path.join(tempDir, 'grok-medium.jsonl'), lines, 'utf8');
}

async function waitForProjectByName(
  args: Args,
  name: string,
  label: string,
  timeoutMs = 10_000,
): Promise<{ project: Project; projects: Project[] }> {
  const deadline = Date.now() + timeoutMs;
  let lastProjects: Project[] = [];
  while (Date.now() < deadline) {
    lastProjects = parseJson<Project[]>(
      label,
      runAuracall(args, ['projects', '--target', 'grok', '--refresh']).stdout,
    );
    const project = findProjectByName(lastProjects, name);
    if (project) {
      return { project, projects: lastProjects };
    }
    await sleep(500);
  }
  throw new Error(`Project "${name}" not found in refreshed list before timeout.`);
}

async function waitForNewConversation(
  args: Args,
  beforeConversations: Conversation[],
  label: string,
  options: { projectId?: string; timeoutMs?: number } = {},
): Promise<{ conversation: Conversation; conversations: Conversation[] }> {
  const deadline = Date.now() + (options.timeoutMs ?? 12_000);
  const existingIds = new Set(beforeConversations.map((conversation) => conversation.id));
  let lastConversations: Conversation[] = [];
  while (Date.now() < deadline) {
    const extra = ['conversations', '--target', 'grok', '--refresh', '--include-history'];
    if (options.projectId) {
      extra.push('--project-id', options.projectId);
    }
    lastConversations = parseJson<Conversation[]>(label, runAuracall(args, extra).stdout);
    const conversation = lastConversations.find((candidate) => !existingIds.has(candidate.id));
    if (conversation) {
      return { conversation, conversations: lastConversations };
    }
    await sleep(500);
  }
  throw new Error(`No new conversation appeared before timeout for ${label}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suffix = randomSuffix();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'auracall-grok-acceptance-'));
  await writeFixtureFiles(tempDir);

  const projectName = `AuraCall Cedar Atlas ${suffix}`;
  const renamedProjectName = `AuraCall Cedar Harbor ${suffix}`;
  const cloneProjectName = `AuraCall Cedar Orbit ${suffix}`;
  const promptReply = `AuraCall Maple Ledger ${suffix}`;
  const renamedConversationName = `AuraCall Maple Harbor ${suffix}`;
  const accountFileName = `grok-account-file-${suffix}.txt`;
  const conversationFileName = `grok-conversation-file-${suffix}.txt`;
  const appendedConversationFileName = `grok-conversation-append-${suffix}.txt`;
  const rootConversationReply = `AuraCall Spruce Ledger ${suffix}`;
  const rootConversationAppendReply = `AuraCall Spruce Harbor ${suffix}`;
  await writeFile(path.join(tempDir, accountFileName), `Account file smoke ${suffix}\n`, 'utf8');
  await writeFile(path.join(tempDir, conversationFileName), `Conversation file smoke ${suffix}\n`, 'utf8');
  await writeFile(path.join(tempDir, appendedConversationFileName), `Conversation append smoke ${suffix}\n`, 'utf8');

  const summary: AcceptanceSummary = {
    ok: false,
    profile: args.profile ?? null,
    model: args.model,
    suffix,
    tempDir,
    projectId: null,
    cloneId: null,
    conversationId: null,
    rootConversationId: null,
    accountFileId: null,
    accountFileName,
    conversationFileName,
    projectName,
    renamedProjectName,
    cloneProjectName,
    renamedConversationName,
    mediumFileGuard: null,
  };

  try {
    logStep(`Starting acceptance run with suffix ${suffix}`);

    runAuracall(args, ['projects', 'create', projectName, '--target', 'grok']);
    const { project: createdProject } = await waitForProjectByName(args, projectName, 'projects refresh after create');
    summary.projectId = createdProject.id;

    runAuracall(args, ['projects', 'rename', createdProject.id, renamedProjectName, '--target', 'grok']);
    const { project: renamedProject } = await waitForProjectByName(
      args,
      renamedProjectName,
      'projects refresh after rename',
    );
    assert(renamedProject.id === createdProject.id, 'Renamed project resolved to a different id.');

    runAuracall(args, ['projects', 'clone', renamedProject.id, cloneProjectName, '--target', 'grok'], {
      timeoutMs: 180_000,
    });
    const { project: cloneProject } = await waitForProjectByName(
      args,
      cloneProjectName,
      'projects refresh after clone',
      12_000,
    );
    assert(cloneProject.id !== renamedProject.id, 'Clone id unexpectedly matches the source project id.');
    summary.cloneId = cloneProject.id;

    const instructionsPath = path.join(tempDir, 'grok-instructions.txt');
    runAuracall(args, [
      'projects',
      'instructions',
      'set',
      renamedProject.id,
      '--target',
      'grok',
      '--file',
      instructionsPath,
    ]);
    const instructions = parseJson<ProjectInstructions>(
      'project instructions get',
      runAuracall(args, ['projects', 'instructions', 'get', renamedProject.id, '--target', 'grok']).stdout,
    );
    assert(
      instructions.text?.includes('AuraCall instructions smoke') && instructions.text?.includes('Line two'),
      'Project instructions get did not return the expected text.',
    );

    const singleFilePath = path.join(tempDir, 'grok-file.txt');
    runAuracall(args, ['projects', 'files', 'add', renamedProject.id, '-f', singleFilePath, '--target', 'grok'], {
      timeoutMs: 180_000,
    });
    let filesList = runAuracall(args, ['projects', 'files', 'list', renamedProject.id, '--target', 'grok']).combined;
    assert(filesList.includes('grok-file.txt'), 'Project files list did not include grok-file.txt after upload.');
    let cachedFiles = parseJson<CacheFilesListPayload>(
      'project knowledge cache after single-file upload',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--project-id',
        renamedProject.id,
        '--dataset',
        'project-knowledge',
      ]).stdout,
    );
    let cachedFileNames = normalizeCachedFileNames(cachedFiles);
    assert(
      cachedFileNames.includes('grok-file.txt'),
      'Project knowledge cache did not include grok-file.txt after upload.',
    );
    runAuracall(args, ['projects', 'files', 'remove', renamedProject.id, 'grok-file.txt', '--target', 'grok']);
    filesList = runAuracall(args, ['projects', 'files', 'list', renamedProject.id, '--target', 'grok']).combined;
    assert(!filesList.includes('grok-file.txt'), 'Project files list still included grok-file.txt after removal.');
    cachedFiles = parseJson<CacheFilesListPayload>(
      'project knowledge cache after single-file removal',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--project-id',
        renamedProject.id,
        '--dataset',
        'project-knowledge',
      ]).stdout,
    );
    cachedFileNames = normalizeCachedFileNames(cachedFiles);
    assert(
      !cachedFileNames.includes('grok-file.txt'),
      'Project knowledge cache still included grok-file.txt after removal.',
    );

    const fileAPath = path.join(tempDir, 'grok-file-a.txt');
    const fileBPath = path.join(tempDir, 'grok-file-b.md');
    const mediumFilePath = path.join(tempDir, 'grok-medium.jsonl');
    runAuracall(args, ['projects', 'files', 'add', renamedProject.id, '-f', fileAPath, fileBPath, '--target', 'grok'], {
      timeoutMs: 180_000,
    });
    filesList = runAuracall(args, ['projects', 'files', 'list', renamedProject.id, '--target', 'grok']).combined;
    assert(filesList.includes('grok-file-a.txt'), 'Project files list did not include grok-file-a.txt.');
    assert(filesList.includes('grok-file-b.md'), 'Project files list did not include grok-file-b.md.');
    cachedFiles = parseJson<CacheFilesListPayload>(
      'project knowledge cache after multi-file upload',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--project-id',
        renamedProject.id,
        '--dataset',
        'project-knowledge',
      ]).stdout,
    );
    cachedFileNames = normalizeCachedFileNames(cachedFiles);
    assert(cachedFileNames.includes('grok-file-a.txt'), 'Project knowledge cache did not include grok-file-a.txt.');
    assert(cachedFileNames.includes('grok-file-b.md'), 'Project knowledge cache did not include grok-file-b.md.');

    const mediumFailure = runAuracall(
      args,
      ['projects', 'files', 'add', renamedProject.id, '-f', mediumFilePath, '--target', 'grok'],
      { expectFailure: true, timeoutMs: 180_000 },
    );
    assert(
      mediumFailure.combined.includes(EXPECTED_MEDIUM_FILE_ERROR),
      `Medium-file guard did not produce the expected error.\n${mediumFailure.combined}`,
    );
    summary.mediumFileGuard = EXPECTED_MEDIUM_FILE_ERROR;

    const accountFilePath = path.join(tempDir, accountFileName);
    runAuracall(args, ['files', 'add', '--target', 'grok', '--file', accountFilePath], {
      timeoutMs: 180_000,
    });
    const accountFiles = parseJson<AccountFile[]>(
      'account files list after upload',
      runAuracall(args, ['files', 'list', '--target', 'grok']).stdout,
    );
    const uploadedAccountFile = accountFiles.find((file) => file.name === accountFileName);
    assert(uploadedAccountFile, `Account files list did not include ${accountFileName} after upload.`);
    summary.accountFileId = uploadedAccountFile.id;
    let accountFileCache = parseJson<CacheFilesListPayload>(
      'account files cache after upload',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--dataset',
        'account-files',
        '--query',
        accountFileName,
      ]).stdout,
    );
    let accountCachedNames = normalizeCachedFileNames(accountFileCache);
    assert(
      accountCachedNames.includes(accountFileName),
      `Account files cache did not include ${accountFileName} after upload.`,
    );
    runAuracall(args, ['files', 'remove', uploadedAccountFile.id, '--target', 'grok'], {
      timeoutMs: 180_000,
    });
    const accountFilesAfterDelete = parseJson<AccountFile[]>(
      'account files list after delete',
      runAuracall(args, ['files', 'list', '--target', 'grok']).stdout,
    );
    assert(
      !accountFilesAfterDelete.some((file) => file.id === uploadedAccountFile.id || file.name === accountFileName),
      `Account files list still included ${accountFileName} after removal.`,
    );
    accountFileCache = parseJson<CacheFilesListPayload>(
      'account files cache after delete',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--dataset',
        'account-files',
        '--query',
        accountFileName,
      ]).stdout,
    );
    accountCachedNames = normalizeCachedFileNames(accountFileCache);
    assert(
      !accountCachedNames.includes(accountFileName) && Number(accountFileCache.count ?? 0) === 0,
      `Account files cache still included ${accountFileName} after removal.`,
    );

    const beforeRootConversations = parseJson<Conversation[]>(
      'root conversations before browser file prompt',
      runAuracall(args, ['conversations', '--target', 'grok', '--refresh', '--include-history']).stdout,
    );
    const conversationFilePath = path.join(tempDir, conversationFileName);
    const rootBrowserPrompt = `Reply exactly with: ${rootConversationReply}`;
    runAuracall(
      args,
      [
        '--engine',
        'browser',
        '--browser-target',
        'grok',
        '--browser-attachments',
        'always',
        '--model',
        args.model,
        '--file',
        conversationFilePath,
        '--prompt',
        rootBrowserPrompt,
        '--wait',
        '--force',
      ],
      { timeoutMs: 12 * 60_000 },
    );
    let rootConversation: Conversation;
    try {
      ({ conversation: rootConversation } = await waitForNewConversation(
        args,
        beforeRootConversations,
        'root conversations after browser file prompt',
        { timeoutMs: 120_000 },
      ));
    } catch (error) {
      const fallbackConversationId = await findRecentBrowserConversationIdByPrompt(rootBrowserPrompt);
      if (!fallbackConversationId) {
        throw error;
      }
      logStep(
        `Root conversation discovery lagged; using browser session conversation id ${fallbackConversationId} from session metadata.`,
      );
      rootConversation = {
        id: fallbackConversationId,
        title: rootConversationReply,
      };
    }
    summary.rootConversationId = rootConversation.id;

    const rootConversationFiles = parseJson<ListedFile[]>(
      'conversation files list after root browser file prompt',
      runAuracall(args, ['conversations', 'files', 'list', rootConversation.id, '--target', 'grok']).stdout,
    );
    assert(
      rootConversationFiles.some((file) => file.name === conversationFileName),
      `Conversation files list did not include ${conversationFileName}.`,
    );
    let conversationFilesCache = parseJson<CacheFilesListPayload>(
      'conversation-files cache after root browser file prompt',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--conversation-id',
        rootConversation.id,
        '--dataset',
        'conversation-files',
      ]).stdout,
    );
    let cachedConversationFileNames = normalizeCachedFileNames(conversationFilesCache);
    assert(
      cachedConversationFileNames.includes(conversationFileName),
      `Conversation-files cache did not include ${conversationFileName}.`,
    );

    const rootContextPayload = parseJson<ConversationContextPayload>(
      'root conversation context get',
      runAuracall(args, [
        'conversations',
        'context',
        'get',
        rootConversation.id,
        '--target',
        'grok',
        '--json-only',
      ]).stdout,
    );
    const rootMessages = normalizeMessages(rootContextPayload);
    assert(
      rootMessages.some((message) => message.includes(`Reply exactly with: ${rootConversationReply}`)),
      'Root conversation context did not include the original user prompt.',
    );
    assert(
      rootMessages.some((message) => message.includes(rootConversationReply)),
      'Root conversation context did not include the expected assistant reply.',
    );
    const rootContextFileNames = normalizeContextFileNames(rootContextPayload);
    assert(
      rootContextFileNames.includes(conversationFileName),
      `Root conversation context did not include ${conversationFileName} in files[].`,
    );

    const appendedConversationFilePath = path.join(tempDir, appendedConversationFileName);
    runAuracall(args, [
      'conversations',
      'files',
      'add',
      rootConversation.id,
      '--target',
      'grok',
      '--prompt',
      `Reply exactly with: ${rootConversationAppendReply}`,
      '--file',
      appendedConversationFilePath,
    ]);
    const rootConversationFilesAfterAppend = parseJson<ListedFile[]>(
      'conversation files list after append-only add',
      runAuracall(args, ['conversations', 'files', 'list', rootConversation.id, '--target', 'grok']).stdout,
    );
    assert(
      rootConversationFilesAfterAppend.some((file) => file.name === appendedConversationFileName),
      `Conversation files list did not include ${appendedConversationFileName} after append-only add.`,
    );
    conversationFilesCache = parseJson<CacheFilesListPayload>(
      'conversation-files cache after append-only add',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--conversation-id',
        rootConversation.id,
        '--dataset',
        'conversation-files',
      ]).stdout,
    );
    cachedConversationFileNames = normalizeCachedFileNames(conversationFilesCache);
    assert(
      cachedConversationFileNames.includes(appendedConversationFileName),
      `Conversation-files cache did not include ${appendedConversationFileName} after append-only add.`,
    );
    const rootContextAfterAppend = parseJson<ConversationContextPayload>(
      'root conversation context after append-only add',
      runAuracall(args, [
        'conversations',
        'context',
        'get',
        rootConversation.id,
        '--target',
        'grok',
        '--json-only',
      ]).stdout,
    );
    const rootMessagesAfterAppend = normalizeMessages(rootContextAfterAppend);
    assert(
      rootMessagesAfterAppend.some((message) => message.includes(rootConversationAppendReply)),
      'Root conversation context did not include the append-only follow-up reply.',
    );
    const rootContextFileNamesAfterAppend = normalizeContextFileNames(rootContextAfterAppend);
    assert(
      rootContextFileNamesAfterAppend.includes(appendedConversationFileName),
      `Root conversation context did not include ${appendedConversationFileName} in files[] after append-only add.`,
    );

    runAuracall(args, ['delete', rootConversation.id, '--target', 'grok', '--yes']);
    const rootConversationsAfterDelete = parseJson<Conversation[]>(
      'root conversations after cleanup delete',
      runAuracall(args, ['conversations', '--target', 'grok', '--refresh', '--include-history']).stdout,
    );
    assert(
      !rootConversationsAfterDelete.some((conversation) => conversation.id === rootConversation.id),
      'Root conversation still appeared after deletion.',
    );
    const rootConversationFilesCacheAfterDelete = parseJson<CacheFilesListPayload>(
      'conversation-files cache after root conversation delete',
      runAuracall(args, [
        'cache',
        'files',
        'list',
        '--provider',
        'grok',
        '--conversation-id',
        rootConversation.id,
        '--dataset',
        'conversation-files',
      ]).stdout,
    );
    assert(
      Number(rootConversationFilesCacheAfterDelete.count ?? 0) === 0,
      'Conversation-files cache still included rows after root conversation delete.',
    );

    const beforeConversations = parseJson<Conversation[]>(
      'project conversations before browser prompt',
      runAuracall(args, ['conversations', '--target', 'grok', '--project-id', renamedProject.id, '--refresh', '--include-history']).stdout,
    );
    assert(beforeConversations.length === 0, 'Disposable project was expected to start without conversations.');

    runAuracall(
      args,
      [
        '--engine',
        'browser',
        '--browser-target',
        'grok',
        '--project-id',
        renamedProject.id,
        '--model',
        args.model,
        '--prompt',
        `Reply exactly with: ${promptReply}`,
        '--wait',
        '--force',
      ],
      { timeoutMs: 12 * 60_000 },
    );
    const { conversation: newConversation } = await waitForNewConversation(
      args,
      beforeConversations,
      'project conversations after browser prompt',
      { projectId: renamedProject.id, timeoutMs: 15_000 },
    );
    summary.conversationId = newConversation.id;

    const contextPayload = parseJson<ConversationContextPayload>(
      'conversation context get',
      runAuracall(args, [
        'conversations',
        'context',
        'get',
        newConversation.id,
        '--target',
        'grok',
        '--project-id',
        renamedProject.id,
        '--json-only',
      ]).stdout,
    );
    const messages = normalizeMessages(contextPayload);
    assert(
      messages.some((message) => message.includes(`Reply exactly with: ${promptReply}`)),
      'Conversation context did not include the original user prompt.',
    );
    assert(
      messages.some((message) => message.includes(promptReply)),
      'Conversation context did not include the expected assistant reply.',
    );

    runAuracall(args, [
      'rename',
      newConversation.id,
      renamedConversationName,
      '--target',
      'grok',
      '--project-id',
      renamedProject.id,
    ]);
    const renamedConversationList = parseJson<Conversation[]>(
      'project conversations after rename',
      runAuracall(args, ['conversations', '--target', 'grok', '--project-id', renamedProject.id, '--refresh', '--include-history']).stdout,
    );
    const renamedConversation = findConversationById(renamedConversationList, newConversation.id);
    assert(
      renamedConversation?.title === renamedConversationName,
      `Conversation rename did not stick. Got "${renamedConversation?.title ?? 'missing'}".`,
    );

    runAuracall(args, [
      'delete',
      newConversation.id,
      '--target',
      'grok',
      '--project-id',
      renamedProject.id,
      '--yes',
    ]);
    const afterDeleteConversationList = parseJson<Conversation[]>(
      'project conversations after delete',
      runAuracall(args, ['conversations', '--target', 'grok', '--project-id', renamedProject.id, '--refresh', '--include-history']).stdout,
    );
    assert(
      !afterDeleteConversationList.some((conversation) => conversation.id === newConversation.id),
      'Conversation still appeared after deletion.',
    );

    const markdownResult = runAuracall(
      args,
      [
        '--engine',
        'browser',
        '--browser-target',
        'grok',
        '--project-id',
        renamedProject.id,
        '--model',
        args.model,
        '--prompt',
        'Return exactly this Markdown:\n- alpha\n```txt\nbeta\n```',
        '--wait',
        '--force',
      ],
      { timeoutMs: 12 * 60_000 },
    );
    assert(markdownResult.stdout.includes('- alpha'), 'Markdown smoke did not include the bullet list.');
    assert(markdownResult.stdout.includes('```txt'), 'Markdown smoke did not preserve the fenced code block.');
    assert(markdownResult.stdout.includes('beta'), 'Markdown smoke did not include the fenced body.');

    if (!args.keepProjects) {
      runAuracall(args, ['projects', 'remove', cloneProject.id, '--target', 'grok'], { timeoutMs: 180_000 });
      runAuracall(args, ['projects', 'remove', renamedProject.id, '--target', 'grok'], { timeoutMs: 180_000 });
      const finalProjects = parseJson<Project[]>(
        'projects refresh after cleanup',
        runAuracall(args, ['projects', '--target', 'grok', '--refresh']).stdout,
      );
      assert(
        !finalProjects.some((project) => project.id === cloneProject.id || project.id === renamedProject.id),
        'Disposable projects still appeared after cleanup.',
      );
    }

    summary.ok = true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  logStep('PASS');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    `[grok-acceptance] FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
