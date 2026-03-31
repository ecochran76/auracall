#!/usr/bin/env tsx
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Project = {
  id: string;
  name: string;
};

type Conversation = {
  id: string;
  title?: string;
  name?: string;
};

type ProjectInstructions = {
  text?: string;
  model?: string;
};

type ConversationContextPayload = {
  conversationId?: string;
  files?: Array<{ id?: string; name?: string }>;
  messages?: Array<{ role?: string; text?: string }>;
  context?: {
    files?: Array<{ id?: string; name?: string }>;
    messages?: Array<{ role?: string; text?: string }>;
  };
};

type RecentBrowserSessionMatch = {
  conversationId: string;
  composerTool: string | null;
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
  profile?: string;
  model: string;
  thinkingTime: string;
  phase: AcceptancePhase;
  commandTimeoutMs: number;
  projectId?: string;
  conversationId?: string;
  stateFile?: string;
  resumeFile?: string;
};

type AcceptancePhase = 'full' | 'project' | 'project-chat' | 'root-base' | 'root-followups' | 'cleanup';

type AcceptanceSummary = {
  ok: boolean;
  phase: AcceptancePhase;
  profile: string | null;
  model: string;
  thinkingTime: string;
  suffix: string;
  tempDir: string;
  projectId: string | null;
  projectConversationId: string | null;
  conversationId: string | null;
  projectName: string;
  renamedProjectName: string;
  renamedProjectConversationName: string;
  renamedConversationName: string;
  sourceFileName: string;
  attachmentFileName: string;
};

type AcceptanceState = {
  version: 1;
  updatedAt: string;
  lastError?: string | null;
  summary: AcceptanceSummary;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MODEL = 'gpt-5.2-thinking';
const DEFAULT_THINKING_TIME = 'standard';
const DEFAULT_CHATGPT_MUTATION_TIMEOUT_MS = 6 * 60_000;
const DEFAULT_CHATGPT_COMMAND_TIMEOUT_MS = 180_000;
const MAX_CHATGPT_ACCEPTANCE_RETRY_WAIT_MS = 60_000;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    json: false,
    model: DEFAULT_MODEL,
    thinkingTime: DEFAULT_THINKING_TIME,
    commandTimeoutMs: DEFAULT_CHATGPT_COMMAND_TIMEOUT_MS,
    phase: 'full',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--profile' && argv[index + 1]) {
      args.profile = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (token === '--model' && argv[index + 1]) {
      args.model = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (token === '--thinking-time' && argv[index + 1]) {
      args.thinkingTime = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (token === '--phase' && argv[index + 1]) {
      const phase = argv[index + 1].trim() as AcceptancePhase;
      if (!['full', 'project', 'project-chat', 'root-base', 'root-followups', 'cleanup'].includes(phase)) {
        throw new Error(`Unknown phase: ${phase}`);
      }
      args.phase = phase;
      index += 1;
      continue;
    }
    if (token === '--project-id' && argv[index + 1]) {
      args.projectId = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (token === '--conversation-id' && argv[index + 1]) {
      args.conversationId = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (token === '--state-file' && argv[index + 1]) {
      args.stateFile = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (token === '--command-timeout-ms' && argv[index + 1]) {
      const timeoutMs = Number.parseInt(argv[index + 1].trim(), 10);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`Invalid --command-timeout-ms value: ${argv[index + 1]}`);
      }
      args.commandTimeoutMs = timeoutMs;
      index += 1;
      continue;
    }
    if (token === '--resume' && argv[index + 1]) {
      args.resumeFile = argv[index + 1].trim();
      index += 1;
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
  console.log(`Usage: pnpm tsx scripts/chatgpt-acceptance.ts [options]

Run the managed WSL ChatGPT acceptance checklist against the live Aura-Call CLI.

Options:
  --profile <name>        Aura-Call profile to use (default: active profile)
  --model <label>         Browser model for the thinking/model check (default: ${DEFAULT_MODEL})
  --thinking-time <mode>  Browser thinking depth (default: ${DEFAULT_THINKING_TIME})
  --phase <name>          One of: full, project, project-chat, root-base, root-followups, cleanup
  --project-id <id>       Existing ChatGPT project id for project-chat or cleanup phases
  --conversation-id <id>  Existing root conversation id for root-followups or cleanup phases
  --state-file <path>     Write phase summary JSON to this path after progress/success/failure
  --resume <path>         Read a prior phase summary JSON and reuse its ids by default
  --command-timeout-ms     Timeout in ms for auracall and probe commands (default: ${DEFAULT_CHATGPT_COMMAND_TIMEOUT_MS})
  --json                  Print the final summary as JSON
  --help                  Show this message
`);
}

function logStep(message: string): void {
  console.log(`[chatgpt-acceptance] ${message}`);
}

function resolveCliPath(filePath: string): string {
  const trimmed = filePath.trim();
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(ROOT, trimmed);
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
    timeout: options.timeoutMs ?? args.commandTimeoutMs,
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

function readChatgptGuardCooldownUntilMs(profile?: string | null): number | null {
  const state = readChatgptGuardState(profile);
  return typeof state?.cooldownUntil === 'number' && Number.isFinite(state.cooldownUntil) ? state.cooldownUntil : null;
}

function readChatgptGuardState(profile?: string | null): {
  cooldownUntil?: number | null;
  lastMutationAt?: number | null;
  recentMutationAts?: number[];
  cooldownReason?: string | null;
} | null {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return null;
  }
  const guardPath = path.join(
    homeDir,
    '.auracall',
    'cache',
    'providers',
    'chatgpt',
    '__runtime__',
    `rate-limit-${profile ?? 'default'}.json`,
  );
  try {
    const raw = readFileSync(guardPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      cooldownUntil?: number | null;
      lastMutationAt?: number | null;
      recentMutationAts?: number[];
      cooldownReason?: string | null;
    };
    return {
      cooldownUntil:
        typeof parsed.cooldownUntil === 'number' && Number.isFinite(parsed.cooldownUntil) ? parsed.cooldownUntil : null,
      lastMutationAt:
        typeof parsed.lastMutationAt === 'number' && Number.isFinite(parsed.lastMutationAt) ? parsed.lastMutationAt : null,
      recentMutationAts: Array.isArray(parsed.recentMutationAts)
        ? parsed.recentMutationAts.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        : [],
      cooldownReason: typeof parsed.cooldownReason === 'string' ? parsed.cooldownReason : null,
    };
  } catch {
    return null;
  }
}

function logChatgptGuardStatus(profile?: string | null): void {
  const state = readChatgptGuardState(profile);
  if (!state) {
    return;
  }
  const now = Date.now();
  if (typeof state.cooldownUntil === 'number' && state.cooldownUntil > now) {
    const remainingMs = state.cooldownUntil - now;
    const summary = state.cooldownReason ? ` ${state.cooldownReason}` : '';
    logStep(
      `Guard: cooldown active for ${Math.ceil(remainingMs / 1000)}s until ${new Date(state.cooldownUntil).toISOString()}.${summary}`.trim(),
    );
    return;
  }
  const recentMutationCount = Array.isArray(state.recentMutationAts)
    ? state.recentMutationAts.filter((value) => value > now - 2 * 60_000).length
    : 0;
  if (recentMutationCount > 0) {
    logStep(`Guard: ${recentMutationCount} recent ChatGPT writes recorded in the last 120s.`);
  }
}

async function readAcceptanceState(filePath: string): Promise<AcceptanceState | null> {
  try {
    const raw = await readFile(resolveCliPath(filePath), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AcceptanceState>;
    if (!parsed || parsed.version !== 1 || !parsed.summary || typeof parsed.summary !== 'object') {
      return null;
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
      summary: parsed.summary as AcceptanceSummary,
    };
  } catch {
    return null;
  }
}

async function writeAcceptanceState(
  filePath: string,
  summary: AcceptanceSummary,
  lastError?: string | null,
): Promise<void> {
  const resolved = resolveCliPath(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  const payload: AcceptanceState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    lastError: lastError ?? null,
    summary,
  };
  await writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function mergeArgsWithAcceptanceState(args: Args, state: AcceptanceState | null): Args {
  if (!state) {
    return args;
  }
  return {
    ...args,
    profile: args.profile ?? state.summary.profile ?? undefined,
    projectId: args.projectId ?? state.summary.projectId ?? undefined,
    conversationId: args.conversationId ?? state.summary.conversationId ?? undefined,
  };
}

function extractChatgptCooldownUntilMs(text: string, profile?: string | null): number | null {
  const match = text.match(
    /(?:cooling down|write budget active|post-write quiet period active) until ([0-9]{4}-[0-9]{2}-[0-9]{2}T[^.\s]+(?:\.\d+)?Z)/i,
  );
  if (match?.[1]) {
    const parsed = Date.parse(match[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const relativeMatch = text.match(/(?:post-write quiet period|quiet period active)[^()]*\((\d+)s remaining\)/i);
  if (relativeMatch?.[1]) {
    const remaining = Number(relativeMatch[1]);
    if (Number.isFinite(remaining) && remaining > 0) {
      return Date.now() + remaining * 1000;
    }
  }
  return readChatgptGuardCooldownUntilMs(profile);
}

async function runAuracallWithChatgptRateLimitRetry(
  args: Args,
  extra: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const preflightCooldownUntilMs = readChatgptGuardCooldownUntilMs(args.profile ?? null);
  if (preflightCooldownUntilMs) {
    const preflightWaitMs = preflightCooldownUntilMs - Date.now();
    if (preflightWaitMs > 0) {
      if (preflightWaitMs > MAX_CHATGPT_ACCEPTANCE_RETRY_WAIT_MS) {
        throw new Error(
          `ChatGPT cooldown is still active for ${Math.ceil(preflightWaitMs / 1000)}s; aborting acceptance mutation instead of waiting.`,
        );
      }
      logStep(`ChatGPT cooldown active; waiting ${Math.ceil(preflightWaitMs / 1000)}s before continuing.`);
      await sleep(preflightWaitMs + 1_000);
    }
  }
  try {
    return runAuracall(args, extra, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/ChatGPT rate limit detected|Too many requests|too quickly|ChatGPT write budget active|post-write quiet period active/i.test(message)
    ) {
      throw error;
    }
    const cooldownUntilMs = extractChatgptCooldownUntilMs(message, args.profile ?? null);
    if (!cooldownUntilMs) {
      throw error;
    }
    const waitMs = cooldownUntilMs - Date.now();
    if (waitMs <= 0) {
      throw error;
    }
    if (waitMs > MAX_CHATGPT_ACCEPTANCE_RETRY_WAIT_MS) {
      throw new Error(
        `ChatGPT rate limit remained active for ${Math.ceil(waitMs / 1000)}s; aborting acceptance mutation instead of waiting.`,
      );
    }
    logStep(`Rate-limit cooldown active; waiting ${Math.ceil(waitMs / 1000)}s before retrying.`);
    await sleep(waitMs + 1_000);
    return runAuracall(args, extra, options);
  }
}

async function runChatgptMutation(args: Args, extra: string[], options: RunOptions = {}): Promise<RunResult> {
  return runAuracallWithChatgptRateLimitRetry(args, extra, {
    ...options,
    timeoutMs: Math.max(
      options.timeoutMs ?? 0,
      Math.max(DEFAULT_CHATGPT_MUTATION_TIMEOUT_MS, args.commandTimeoutMs),
    ),
  });
}

function probeAuracall(args: Args, extra: string[]): RunResult | null {
  const cliArgs = buildAuracallArgs(args, extra);
  const result = spawnSync('pnpm', cliArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: args.commandTimeoutMs,
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
  if (result.status !== 0) {
    return null;
  }
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
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
    throw new Error(
      `${label} did not return valid JSON.\n${trimmed}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findProjectByName(projects: Project[], name: string): Project | undefined {
  return projects.find((project) => project.name === name);
}

function conversationTitle(conversation: Conversation): string {
  return typeof conversation.title === 'string' && conversation.title.trim().length > 0
    ? conversation.title.trim()
    : typeof conversation.name === 'string'
      ? conversation.name.trim()
      : '';
}

function buildConversationListArgs(projectId?: string | null): string[] {
  return projectId
    ? ['conversations', '--target', 'chatgpt', '--project-id', projectId, '--refresh']
    : ['conversations', '--target', 'chatgpt', '--refresh'];
}

function extractConversationIdFromOutput(text: string): string | null {
  const patterns = [
    /conversation url \(post-response\)\s*=\s*https:\/\/chatgpt\.com\/(?:g\/[^/]+\/)?c\/([a-z0-9-]+)/i,
    /conversation url \(post-submit\)\s*=\s*https:\/\/chatgpt\.com\/(?:g\/[^/]+\/)?c\/([a-z0-9-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

async function findRecentBrowserSessionByPrompt(prompt: string): Promise<RecentBrowserSessionMatch | null> {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return null;
  }
  const sessionsDir = path.join(homeDir, '.auracall', 'sessions');
  let entries;
  try {
    entries = await readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches: Array<{ startedAt: number; conversationId: string; composerTool: string | null }> = [];
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
    const composerTool =
      typeof parsed?.browser?.runtime?.composerTool === 'string' ? parsed.browser.runtime.composerTool.trim() : null;
    const startedAtValue =
      typeof parsed?.startedAt === 'string'
        ? Date.parse(parsed.startedAt)
        : typeof parsed?.createdAt === 'string'
          ? Date.parse(parsed.createdAt)
          : NaN;
    if (mode !== 'browser' || provider !== 'chatgpt' || promptValue !== prompt || !conversationId) {
      continue;
    }
    matches.push({
      startedAt: Number.isFinite(startedAtValue) ? startedAtValue : 0,
      conversationId,
      composerTool,
    });
  }
  matches.sort((left, right) => right.startedAt - left.startedAt);
  return matches[0]
    ? {
        conversationId: matches[0].conversationId,
        composerTool: matches[0].composerTool,
      }
    : null;
}

async function waitForRecentBrowserSessionByPrompt(
  prompt: string,
  options: { timeoutMs?: number; requireComposerTool?: boolean } = {},
): Promise<RecentBrowserSessionMatch> {
  const deadline = Date.now() + (options.timeoutMs ?? 12_000);
  while (Date.now() < deadline) {
    const match = await findRecentBrowserSessionByPrompt(prompt);
    if (match && (!options.requireComposerTool || Boolean(match.composerTool?.trim()))) {
      return match;
    }
    await sleep(500);
  }
  throw new Error(`Recent browser session for prompt "${prompt}" did not appear before timeout.`);
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

function normalizeComposerToolLabel(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tryReadConversationContext(
  args: Args,
  conversationId: string,
  projectId?: string | null,
): ConversationContextPayload | null {
  const extra = ['conversations', 'context', 'get', conversationId, '--target', 'chatgpt', '--json-only'];
  if (projectId) {
    extra.splice(4, 0, '--project-id', projectId);
  }
  const result = probeAuracall(args, extra);
  if (!result) {
    return null;
  }
  try {
    return parseJson<ConversationContextPayload>('conversation context probe', result.stdout);
  } catch {
    return null;
  }
}

function contextMatches(
  payload: ConversationContextPayload,
  expectedPrompt: string,
  expectedAssistantFragment: string,
  expectedFileName?: string,
): boolean {
  const messages = normalizeMessages(payload);
  const hasPrompt = messages.some((message) => message.includes(expectedPrompt));
  const hasAssistant = messages.some((message) => message.includes(expectedAssistantFragment));
  const fileNames = normalizeContextFileNames(payload);
  const hasFile = expectedFileName ? fileNames.includes(expectedFileName) : true;
  return hasPrompt && hasAssistant && hasFile;
}

async function waitForProjectByName(
  args: Args,
  name: string,
  label: string,
  timeoutMs = 12_000,
): Promise<Project> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const projects = parseJson<Project[]>(label, runAuracall(args, ['projects', '--target', 'chatgpt', '--refresh']).stdout);
    const project = findProjectByName(projects, name);
    if (project) {
      return project;
    }
    await sleep(500);
  }
  throw new Error(`Project "${name}" not found before timeout.`);
}

async function waitForProjectMissing(args: Args, id: string, timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const projects = parseJson<Project[]>(
      'projects refresh after delete',
      runAuracall(args, ['projects', '--target', 'chatgpt', '--refresh']).stdout,
    );
    if (!projects.some((project) => project.id === id)) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`Project ${id} still appeared after delete.`);
}

async function waitForConversation(
  args: Args,
  id: string,
  timeoutMs = 12_000,
  projectId?: string | null,
): Promise<Conversation> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const conversations = parseJson<Conversation[]>(
      'conversations refresh',
      runAuracall(args, buildConversationListArgs(projectId)).stdout,
    );
    const conversation = conversations.find((entry) => entry.id === id);
    if (conversation) {
      return conversation;
    }
    const context = tryReadConversationContext(args, id, projectId);
    if (context && (context.conversationId === id || normalizeMessages(context).length > 0)) {
      return { id };
    }
    await sleep(500);
  }
  throw new Error(`Conversation ${id} not found before timeout.`);
}

async function waitForConversationTitle(
  args: Args,
  id: string,
  expectedTitle: string,
  timeoutMs = 30_000,
  projectId?: string | null,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const conversations = parseJson<Conversation[]>(
      'conversations refresh after rename',
      runAuracall(args, buildConversationListArgs(projectId)).stdout,
    );
    const conversation = conversations.find((entry) => entry.id === id) ?? null;
    if (projectId) {
      if (conversation && conversationTitle(conversation) === expectedTitle) {
        return;
      }
    } else {
      const topConversation = conversations[0] ?? null;
      if (topConversation && topConversation.id === id && conversationTitle(topConversation) === expectedTitle) {
        return;
      }
    }
    if (!conversation) {
      const context = tryReadConversationContext(args, id, projectId);
      if (!context) {
        throw new Error(`Conversation ${id} disappeared while waiting for rename.`);
      }
    }
    await sleep(500);
  }
  throw new Error(
    projectId
      ? `Conversation ${id} did not reach title "${expectedTitle}" in the project conversation list before timeout.`
      : `Conversation ${id} did not move to the top of the list as "${expectedTitle}" before timeout.`,
  );
}

async function waitForConversationMissing(
  args: Args,
  id: string,
  timeoutMs = 12_000,
  projectId?: string | null,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const conversations = parseJson<Conversation[]>(
      'conversations refresh after delete',
      runAuracall(args, buildConversationListArgs(projectId)).stdout,
    );
    if (!conversations.some((conversation) => conversation.id === id)) {
      return;
    }
    if (!tryReadConversationContext(args, id, projectId)) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`Conversation ${id} still appeared after delete.`);
}

async function waitForConversationContext(
  args: Args,
  conversationId: string,
  expectedPrompt: string,
  expectedAssistantFragment: string,
  options: { expectedFileName?: string; timeoutMs?: number; projectId?: string | null } = {},
): Promise<ConversationContextPayload> {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  let lastPayload: ConversationContextPayload | null = null;
  while (Date.now() < deadline) {
    const extra = ['conversations', 'context', 'get', conversationId, '--target', 'chatgpt', '--json-only'];
    if (options.projectId) {
      extra.splice(4, 0, '--project-id', options.projectId);
    }
    lastPayload = parseJson<ConversationContextPayload>(
      'conversation context refresh',
      runAuracall(args, extra).stdout,
    );
    if (contextMatches(lastPayload, expectedPrompt, expectedAssistantFragment, options.expectedFileName)) {
      return lastPayload;
    }
    await sleep(500);
  }
  throw new Error(
    `Conversation ${conversationId} context did not include prompt "${expectedPrompt}" and assistant fragment "${expectedAssistantFragment}" before timeout.`,
  );
}

async function writeFixtureFiles(tempDir: string, instructionsFileName: string, sourceFileName: string, attachmentFileName: string): Promise<void> {
  await writeFile(path.join(tempDir, instructionsFileName), 'Keep answers concise.\nFlag uncertainty explicitly.\n', 'utf8');
  await writeFile(path.join(tempDir, sourceFileName), '# ChatGPT acceptance source\n\n- alpha\n- beta\n', 'utf8');
  await writeFile(path.join(tempDir, attachmentFileName), 'ChatGPT conversation attachment acceptance\n', 'utf8');
}

async function bestEffortCleanup(args: Args, summary: AcceptanceSummary): Promise<void> {
  if (summary.projectConversationId && summary.projectId) {
    try {
      await runChatgptMutation(
        args,
        ['delete', summary.projectConversationId, '--target', 'chatgpt', '--project-id', summary.projectId, '--yes'],
        { timeoutMs: 120_000 },
      );
    } catch {
      // ignore cleanup failures
    }
  }
  if (summary.conversationId) {
    try {
      await runChatgptMutation(
        args,
        ['delete', summary.conversationId, '--target', 'chatgpt', '--yes'],
        { timeoutMs: 120_000 },
      );
    } catch {
      // ignore cleanup failures
    }
  }
  if (summary.projectId) {
    try {
      await runChatgptMutation(
        args,
        ['projects', 'remove', summary.projectId, '--target', 'chatgpt'],
        { timeoutMs: 120_000 },
      );
    } catch {
      // ignore cleanup failures
    }
  }
}

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  const resumedState = parsedArgs.resumeFile ? await readAcceptanceState(parsedArgs.resumeFile) : null;
  const args = mergeArgsWithAcceptanceState(parsedArgs, resumedState);
  const stateFile = args.stateFile ?? args.resumeFile ?? null;
  const priorSummary = resumedState?.summary ?? null;
  const suffix = priorSummary?.suffix?.trim() ? priorSummary.suffix.trim() : randomSuffix();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'auracall-chatgpt-acceptance-'));

  const projectName = priorSummary?.projectName?.trim() || `AC GPT P ${suffix}`;
  const renamedProjectName = priorSummary?.renamedProjectName?.trim() || `AC GPT R ${suffix}`;
  const renamedProjectConversationName =
    priorSummary?.renamedProjectConversationName?.trim() || `AC GPT PC ${suffix}`;
  const renamedConversationName = priorSummary?.renamedConversationName?.trim() || `AC GPT C ${suffix}`;
  const instructionsFileName = `chatgpt-instructions-${suffix}.txt`;
  const sourceFileName = priorSummary?.sourceFileName?.trim() || `chatgpt-source-${suffix}.md`;
  const attachmentFileName = priorSummary?.attachmentFileName?.trim() || `chatgpt-attachment-${suffix}.txt`;
  await writeFixtureFiles(tempDir, instructionsFileName, sourceFileName, attachmentFileName);

  const basePrompt = `Reply exactly with CHATGPT ACCEPT BASE ${suffix}.`;
  const projectConversationPrompt = `Reply exactly with CHATGPT ACCEPT PROJECT CHAT ${suffix}.`;
  const webPrompt = `Reply exactly with CHATGPT ACCEPT WEB ${suffix}.`;
  const canvasPrompt = `Reply exactly with CHATGPT ACCEPT CANVAS ${suffix}.`;
  const filePrompt = `Reply exactly with CHATGPT ACCEPT FILE ${suffix}.`;
  const baseReply = `CHATGPT ACCEPT BASE ${suffix}`;
  const projectConversationReply = `CHATGPT ACCEPT PROJECT CHAT ${suffix}`;
  const webReply = `CHATGPT ACCEPT WEB ${suffix}`;
  const canvasReply = `CHATGPT ACCEPT CANVAS ${suffix}`;
  const fileReply = `CHATGPT ACCEPT FILE ${suffix}`;

  const summary: AcceptanceSummary = {
    ok: false,
    phase: args.phase,
    profile: args.profile ?? null,
    model: args.model,
    thinkingTime: args.thinkingTime,
    suffix,
    tempDir,
    projectId: args.projectId ?? null,
    projectConversationId: priorSummary?.projectConversationId ?? null,
    conversationId: args.conversationId ?? null,
    projectName,
    renamedProjectName,
    renamedProjectConversationName,
    renamedConversationName,
    sourceFileName,
    attachmentFileName,
  };
  const persistSummary = async (lastError?: string | null): Promise<void> => {
    if (!stateFile) return;
    await writeAcceptanceState(stateFile, summary, lastError);
  };

  try {
    if (resumedState) {
      logStep(`Resumed state from ${resolveCliPath(args.resumeFile ?? stateFile ?? '')}`);
      if (resumedState.lastError) {
        logStep(`Previous recorded failure: ${resumedState.lastError}`);
      }
    }
    logChatgptGuardStatus(args.profile ?? null);
    logStep(`Starting acceptance run with suffix ${suffix}`);
    await persistSummary(null);
    let workingProjectId = summary.projectId;
    let workingConversationId = summary.conversationId;

    if (args.phase === 'project-chat' && !workingProjectId) {
      throw new Error('--phase project-chat requires --project-id or a prior full/project phase result.');
    }
    if (args.phase === 'root-followups' && !workingConversationId) {
      throw new Error('--phase root-followups requires --conversation-id or a prior root-base/full phase result.');
    }
    if (args.phase === 'cleanup' && !workingProjectId && !workingConversationId) {
      throw new Error('--phase cleanup requires --project-id, --conversation-id, or both.');
    }

    if (args.phase === 'full' || args.phase === 'project') {
      await runChatgptMutation(args, [
        'projects',
        'create',
        projectName,
        '--target',
        'chatgpt',
        '--memory-mode',
        'project',
      ]);
      const createdProject = await waitForProjectByName(args, projectName, 'projects refresh after create');
      summary.projectId = createdProject.id;

      await runChatgptMutation(args, ['projects', 'rename', createdProject.id, renamedProjectName, '--target', 'chatgpt']);
      const renamedProject = await waitForProjectByName(args, renamedProjectName, 'projects refresh after rename');
      assert(renamedProject.id === createdProject.id, 'Renamed project resolved to a different id.');
      workingProjectId = renamedProject.id;
      summary.projectId = renamedProject.id;
      await persistSummary(null);

      const sourcePath = path.join(tempDir, sourceFileName);
      await runChatgptMutation(args, ['projects', 'files', 'add', renamedProject.id, '-f', sourcePath, '--target', 'chatgpt'], {
        timeoutMs: 180_000,
      });
      const filesList = runAuracall(args, ['projects', 'files', 'list', renamedProject.id, '--target', 'chatgpt']).combined;
      assert(filesList.includes(sourceFileName), 'Project files list did not include the uploaded source.');
      await runChatgptMutation(args, ['projects', 'files', 'remove', renamedProject.id, sourceFileName, '--target', 'chatgpt']);
      const filesListAfterDelete = runAuracall(args, ['projects', 'files', 'list', renamedProject.id, '--target', 'chatgpt']).combined;
      assert(!filesListAfterDelete.includes(sourceFileName), 'Project files list still included the removed source.');

      const instructionsPath = path.join(tempDir, instructionsFileName);
      await runChatgptMutation(args, ['projects', 'instructions', 'set', renamedProject.id, '--target', 'chatgpt', '--file', instructionsPath]);
      const instructions = parseJson<ProjectInstructions>(
        'project instructions get',
        runAuracall(args, ['projects', 'instructions', 'get', renamedProject.id, '--target', 'chatgpt']).stdout,
      );
      assert(
        instructions.text?.includes('Keep answers concise.') && instructions.text?.includes('Flag uncertainty explicitly.'),
        'Project instructions get did not return the expected text.',
      );
    }

    if (args.phase === 'full' || args.phase === 'project-chat') {
      assert(workingProjectId, 'Project conversation phase requires a project id.');
      const projectConversationRun = await runChatgptMutation(
        args,
        [
          '--chatgpt',
          '--project-id',
          workingProjectId,
          '--model',
          args.model,
          '--browser-thinking-time',
          args.thinkingTime,
          '--verbose',
          projectConversationPrompt,
        ],
        { timeoutMs: 180_000 },
      );
      const projectConversationSession = await waitForRecentBrowserSessionByPrompt(projectConversationPrompt);
      const projectConversationId =
        extractConversationIdFromOutput(projectConversationRun.combined) ?? projectConversationSession.conversationId;
      assert(projectConversationId, 'Unable to resolve the ChatGPT project conversation id.');
      summary.projectConversationId = projectConversationId;
      await persistSummary(null);

      await waitForConversation(args, projectConversationId, 12_000, workingProjectId);
      await waitForConversationContext(
        args,
        projectConversationId,
        projectConversationPrompt,
        projectConversationReply,
        { projectId: workingProjectId },
      );
      await runChatgptMutation(
        args,
        ['rename', projectConversationId, renamedProjectConversationName, '--target', 'chatgpt', '--project-id', workingProjectId],
      );
      await waitForConversationTitle(args, projectConversationId, renamedProjectConversationName, 30_000, workingProjectId);
      await runChatgptMutation(
        args,
        ['delete', projectConversationId, '--target', 'chatgpt', '--project-id', workingProjectId, '--yes'],
        { timeoutMs: 120_000 },
      );
      await waitForConversationMissing(args, projectConversationId, 12_000, workingProjectId);
      summary.projectConversationId = null;
      await persistSummary(null);
    }

    if (args.phase === 'full' || args.phase === 'root-base') {
      const baseRun = await runChatgptMutation(
        args,
        ['--chatgpt', '--model', args.model, '--browser-thinking-time', args.thinkingTime, '--verbose', basePrompt],
        { timeoutMs: 180_000 },
      );
      const baseSession = await waitForRecentBrowserSessionByPrompt(basePrompt);
      const conversationId =
        extractConversationIdFromOutput(baseRun.combined) ?? baseSession.conversationId;
      assert(conversationId, 'Unable to resolve the ChatGPT acceptance conversation id.');
      workingConversationId = conversationId;
      summary.conversationId = conversationId;
      await persistSummary(null);

      await waitForConversation(args, conversationId);
      await waitForConversation(args, conversationId);
      const baseContext = await waitForConversationContext(
        args,
        conversationId,
        basePrompt,
        baseReply,
      );
      void baseContext;

      await runChatgptMutation(args, ['rename', conversationId, renamedConversationName, '--target', 'chatgpt']);
      await waitForConversationTitle(args, conversationId, renamedConversationName);
      await persistSummary(null);
    }

    if (args.phase === 'full' || args.phase === 'root-followups') {
      assert(workingConversationId, 'Root follow-up phase requires a conversation id.');

      await runChatgptMutation(
        args,
        [
          '--chatgpt',
          '--conversation-id',
          workingConversationId,
          '--browser-composer-tool',
          'web-search',
          '--verbose',
          webPrompt,
        ],
        { timeoutMs: 180_000 },
      );
      const webSession = await waitForRecentBrowserSessionByPrompt(webPrompt, { requireComposerTool: true });
      assert(
        normalizeComposerToolLabel(webSession?.composerTool) === 'web search',
        `Expected web-search session metadata to record "Web search", got "${webSession?.composerTool ?? ''}".`,
      );
      await waitForConversationContext(
        args,
        workingConversationId,
        webPrompt,
        webReply,
      );

      await runChatgptMutation(
        args,
        [
          '--chatgpt',
          '--conversation-id',
          workingConversationId,
          '--browser-composer-tool',
          'canvas',
          '--verbose',
          canvasPrompt,
        ],
        { timeoutMs: 180_000 },
      );
      const canvasSession = await waitForRecentBrowserSessionByPrompt(canvasPrompt, { requireComposerTool: true });
      assert(
        normalizeComposerToolLabel(canvasSession?.composerTool) === 'canvas',
        `Expected canvas session metadata to record "Canvas", got "${canvasSession?.composerTool ?? ''}".`,
      );
      await waitForConversationContext(
        args,
        workingConversationId,
        canvasPrompt,
        canvasReply,
      );

      const attachmentPath = path.join(tempDir, attachmentFileName);
      await runChatgptMutation(
        args,
        [
          '--chatgpt',
          '--conversation-id',
          workingConversationId,
          '--browser-attachments',
          'always',
          '-f',
          attachmentPath,
          '--verbose',
          filePrompt,
        ],
        { timeoutMs: 240_000 },
      );
      const fileContext = await waitForConversationContext(
        args,
        workingConversationId,
        filePrompt,
        fileReply,
        { expectedFileName: attachmentFileName, timeoutMs: 60_000 },
      );

      const conversationFiles = runAuracall(args, ['conversations', 'files', 'list', workingConversationId, '--target', 'chatgpt']).combined;
      assert(conversationFiles.includes(attachmentFileName), 'Conversation files list did not include the uploaded attachment.');
      const attachmentFileNames = normalizeContextFileNames(fileContext);
      assert(attachmentFileNames.includes(attachmentFileName), 'Conversation context files[] did not include the uploaded attachment.');

      await runChatgptMutation(args, ['delete', workingConversationId, '--target', 'chatgpt', '--yes']);
      await waitForConversationMissing(args, workingConversationId);
      summary.conversationId = null;
      workingConversationId = null;
      await persistSummary(null);
    }

    if (args.phase === 'full' || args.phase === 'cleanup') {
      if (workingConversationId) {
        await runChatgptMutation(args, ['delete', workingConversationId, '--target', 'chatgpt', '--yes']);
        await waitForConversationMissing(args, workingConversationId);
        summary.conversationId = null;
        workingConversationId = null;
        await persistSummary(null);
      }
      if (workingProjectId) {
        await runChatgptMutation(args, ['projects', 'remove', workingProjectId, '--target', 'chatgpt']);
        await waitForProjectMissing(args, workingProjectId);
        summary.projectId = null;
        workingProjectId = null;
        await persistSummary(null);
      }
    }

    summary.ok = true;
    await persistSummary(null);
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      logStep(`PASS (${args.phase})`);
      if (summary.projectId) {
        logStep(`Project: ${summary.projectId}`);
      }
      if (summary.conversationId) {
        logStep(`Conversation: ${summary.conversationId}`);
      }
    }
  } catch (error) {
    summary.ok = false;
    await persistSummary(error instanceof Error ? error.message : String(error));
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.error(`[chatgpt-acceptance] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    }
    throw error;
  } finally {
    if (args.phase === 'full') {
      await bestEffortCleanup(args, summary).catch(() => undefined);
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  if (!(error instanceof Error)) {
    console.error(String(error));
  }
  process.exitCode = 1;
});
