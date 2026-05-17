import type { ResolvedUserConfig } from '../config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { resolveRuntimeSelection } from '../config/model.js';
import { applyBrowserProfileOverrides } from '../browser/service/profileConfig.js';
import { BrowserAutomationClient } from '../browser/client.js';
import type {
  Conversation,
  ConversationArtifact,
  FileRef,
  Project,
} from '../browser/providers/domain.js';
import type { AccountMirrorMediaManifestEntry } from '../browser/llmService/cache/store.js';
import type { ProviderUserIdentity } from '../browser/providers/types.js';
import type { AccountMirrorProvider } from './politePolicy.js';
import { recordDomDriftObservation } from '../browser/domDriftObservations.js';
import type {
  AccountMirrorMetadataCounts,
  AccountMirrorMetadataEvidence,
} from './statusRegistry.js';

const MAX_DOM_DRIFT_SCREENSHOTS_PER_PROCESS = 3;
let domDriftScreenshotsCaptured = 0;

export interface AccountMirrorMetadataCollectorInput {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  expectedIdentityKey: string;
  previousEvidence?: AccountMirrorMetadataEvidence | null;
  shouldYield?: () => Promise<boolean> | boolean;
  abortSignal?: AbortSignal;
  limits: {
    maxPageReadsPerCycle: number;
    maxConversationRowsPerCycle: number;
    maxArtifactRowsPerCycle: number;
    maxBrowserInteractionsPerMinute: number;
  };
}

export interface AttachmentInventoryCursor {
  nextProjectIndex: number;
  nextConversationIndex: number;
  detailReadLimit: number;
  scannedProjects: number;
  scannedConversations: number;
  yielded?: boolean;
  yieldCause?: {
    observedAt: string | null;
    ownerCommand: string | null;
    kind: string | null;
    operationClass: string | null;
  } | null;
}

export interface AccountMirrorMetadataCollectorResult {
  detectedIdentityKey: string | null;
  detectedAccountLevel: string | null;
  metadataCounts: AccountMirrorMetadataCounts;
  manifests: {
    projects: Project[];
    conversations: Conversation[];
    artifacts: ConversationArtifact[];
    files: FileRef[];
    media: AccountMirrorMediaManifestEntry[];
  };
  evidence: {
    identitySource: string | null;
    projectSampleIds: string[];
    conversationSampleIds: string[];
    truncated: {
      projects: boolean;
      conversations: boolean;
      artifacts: boolean;
    };
    attachmentInventory?: AttachmentInventoryCursor | null;
  };
}

export interface AccountMirrorMetadataCollector {
  collect(input: AccountMirrorMetadataCollectorInput): Promise<AccountMirrorMetadataCollectorResult>;
}

export interface AccountMirrorDomDriftObservationContext {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  client?: AccountMirrorDomDriftClient;
}

interface AccountMirrorDomDriftClient {
  connectDevTools(): Promise<{
    client: AccountMirrorDomDriftCdpLike;
  }>;
}

type AccountMirrorDomDriftCdpLike = {
  close(): Promise<unknown>;
} & Record<'Runtime', {
  enable(): Promise<unknown>;
  evaluate(input: { expression: string; returnByValue?: boolean }): Promise<{ result?: { value?: unknown } }>;
}> & Record<'Page', {
  enable(): Promise<unknown>;
  captureScreenshot(input: { format: 'png' }): Promise<{ data?: string } | null>;
}>;

export class AccountMirrorIdentityMismatchError extends Error {
  constructor(
    readonly provider: AccountMirrorProvider,
    readonly expectedIdentityKey: string,
    readonly detectedIdentityKey: string | null,
  ) {
    super(
      detectedIdentityKey
        ? `Detected ${provider} identity ${detectedIdentityKey} does not match expected ${expectedIdentityKey}.`
        : `${provider} identity could not be detected for expected ${expectedIdentityKey}.`,
    );
    this.name = 'AccountMirrorIdentityMismatchError';
  }
}

export function createChatgptAccountMirrorMetadataCollector(
  userConfig: ResolvedUserConfig,
): AccountMirrorMetadataCollector {
  return {
    async collect(input) {
      const clientConfig = resolveRuntimeProfileUserConfig(userConfig, input.runtimeProfileId, input.provider);
      const client = await BrowserAutomationClient.fromConfig(clientConfig, { target: input.provider });
      const pacer = createBrowserInteractionPacer(
        input.limits.maxBrowserInteractionsPerMinute,
        input.abortSignal,
      );
      throwIfCollectionAborted(input.abortSignal);
      const listOptions = input.abortSignal ? { abortSignal: input.abortSignal } : undefined;
      await pacer.beforeInteraction();
      const identity = await client.getUserIdentity(listOptions);
      throwIfCollectionAborted(input.abortSignal);
      const detectedIdentityKey = readIdentityKey(identity);
      const expectedIdentityKey = normalizeIdentityKey(input.expectedIdentityKey);
      if (!expectedIdentityKey || detectedIdentityKey !== expectedIdentityKey) {
        throw new AccountMirrorIdentityMismatchError(input.provider, expectedIdentityKey ?? '', detectedIdentityKey);
      }

      const projects = await readBoundedProjects(client, input.limits.maxPageReadsPerCycle, {
        tolerateReadFailure: input.provider === 'gemini',
        listOptions,
        pacer,
        observation: createAccountMirrorObservationContext(input, client),
      });
      throwIfCollectionAborted(input.abortSignal);
      const conversationBudget = Math.max(0, Math.floor(input.limits.maxConversationRowsPerCycle));
      const rootConversations = await readBoundedConversations(client, null, conversationBudget, {
        listOptions,
        pacer,
      });
      let remainingConversationBudget = Math.max(0, conversationBudget - rootConversations.items.length);
      const projectConversations: Conversation[] = [];
      if (shouldReadProjectConversationsForAccountMirror(input.provider)) {
        for (const project of projects.items) {
          throwIfCollectionAborted(input.abortSignal);
          if (remainingConversationBudget <= 0) break;
          const result = await readBoundedConversations(client, project.id, remainingConversationBudget, {
            listOptions,
            pacer,
            observation: createAccountMirrorObservationContext(input, client),
          });
          projectConversations.push(...result.items);
          remainingConversationBudget -= result.items.length;
          if (result.truncated) break;
        }
      }
      throwIfCollectionAborted(input.abortSignal);
      const conversations = [...rootConversations.items, ...projectConversations];
      const inventory = input.provider === 'chatgpt'
        ? await readBoundedChatgptDetailInventory(
            client,
            projects.items,
            conversations,
            input.limits.maxArtifactRowsPerCycle,
            {
              maxDetailReads: input.limits.maxPageReadsPerCycle,
              cursor: input.previousEvidence?.attachmentInventory ?? null,
              shouldYield: input.shouldYield,
              listOptions,
              pacer,
              observation: createAccountMirrorObservationContext(input, client),
            },
          )
        : input.provider === 'grok'
          ? await readBoundedGrokAccountFileInventory(client, input.limits.maxArtifactRowsPerCycle, {
              listOptions,
              pacer,
              observation: createAccountMirrorObservationContext(input, client),
            })
        : {
            artifacts: [],
            files: [],
            media: [],
            truncated: false,
            cursor: null,
          };
      return {
        detectedIdentityKey,
        detectedAccountLevel: readAccountLevel(identity),
        metadataCounts: {
          projects: projects.items.length,
          conversations: conversations.length,
          artifacts: inventory.artifacts.length,
          files: inventory.files.length,
          media: inventory.media.length,
        },
        manifests: {
          projects: projects.items,
          conversations,
          artifacts: inventory.artifacts,
          files: inventory.files,
          media: inventory.media,
        },
        evidence: {
          identitySource: identity?.source ?? null,
          projectSampleIds: projects.items.slice(0, 8).map((project) => project.id),
          conversationSampleIds: conversations.slice(0, 8).map((conversation) => conversation.id),
          truncated: {
            projects: projects.truncated,
            conversations:
              rootConversations.truncated ||
              projectConversations.length >= conversationBudget ||
              remainingConversationBudget <= 0,
            artifacts: inventory.truncated,
          },
          attachmentInventory: inventory.cursor,
        },
      };
    },
  };
}

export function shouldReadProjectConversationsForAccountMirror(provider: AccountMirrorProvider): boolean {
  return provider === 'chatgpt';
}

function createAccountMirrorObservationContext(
  input: Pick<AccountMirrorMetadataCollectorInput, 'provider' | 'runtimeProfileId'>,
  client?: AccountMirrorDomDriftClient,
): AccountMirrorDomDriftObservationContext {
  return {
    provider: input.provider,
    runtimeProfileId: input.runtimeProfileId,
    client,
  };
}

function throwIfCollectionAborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) {
    const reason = signal.reason;
    throw reason instanceof Error ? reason : new Error('Account mirror metadata collection was aborted.');
  }
}

type BrowserInteractionPacer = {
  beforeInteraction(): Promise<void>;
};

function createBrowserInteractionPacer(
  maxBrowserInteractionsPerMinute: number | null | undefined,
  abortSignal?: AbortSignal,
): BrowserInteractionPacer {
  const maxPerMinute = typeof maxBrowserInteractionsPerMinute === 'number' && Number.isFinite(maxBrowserInteractionsPerMinute)
    ? Math.max(1, Math.floor(maxBrowserInteractionsPerMinute))
    : 20;
  const minSpacingMs = Math.ceil(60_000 / maxPerMinute);
  let lastInteractionAtMs = 0;
  return {
    async beforeInteraction() {
      throwIfCollectionAborted(abortSignal);
      const nowMs = Date.now();
      const waitMs = lastInteractionAtMs > 0 ? Math.max(0, lastInteractionAtMs + minSpacingMs - nowMs) : 0;
      if (waitMs > 0) {
        await sleepWithAbort(waitMs, abortSignal);
      }
      lastInteractionAtMs = Date.now();
    },
  };
}

function sleepWithAbort(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      const reason = signal?.reason;
      reject(reason instanceof Error ? reason : new Error('Account mirror metadata collection was aborted.'));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
}

function resolveRuntimeProfileUserConfig(
  userConfig: ResolvedUserConfig,
  runtimeProfileId: string,
  provider: AccountMirrorProvider,
): ResolvedUserConfig {
  if (userConfig.auracallProfile === runtimeProfileId && userConfig.browser?.target === provider) {
    return userConfig;
  }
  const next = cloneConfig(userConfig);
  const selection = resolveRuntimeSelection(next, {
    explicitProfileName: runtimeProfileId,
  });
  if (!selection.runtimeProfileId || !selection.runtimeProfile) {
    return userConfig;
  }
  next.defaultRuntimeProfile = selection.runtimeProfileId;
  next.auracallProfile = selection.runtimeProfileId;
  if (typeof selection.runtimeProfile.engine === 'string') {
    next.engine = selection.runtimeProfile.engine as ResolvedUserConfig['engine'];
  }
  next.browser = {
    ...(isRecord(next.browser) ? next.browser : {}),
  } as ResolvedUserConfig['browser'];
  applyBrowserProfileOverrides(next as Record<string, unknown>, selection.runtimeProfile, next.browser, {
    overrideExisting: true,
  });
  next.browser.target = provider;
  return next;
}

function cloneConfig(userConfig: ResolvedUserConfig): ResolvedUserConfig {
  return (typeof structuredClone === 'function'
    ? structuredClone(userConfig)
    : JSON.parse(JSON.stringify(userConfig))) as ResolvedUserConfig;
}

export async function readBoundedProjects(
  client: Pick<BrowserAutomationClient, 'listProjects'>,
  maxPageReads: number,
  options: {
    tolerateReadFailure?: boolean;
    listOptions?: Parameters<BrowserAutomationClient['listProjects']>[0];
    pacer?: BrowserInteractionPacer;
    observation?: AccountMirrorDomDriftObservationContext;
  } = {},
): Promise<{ items: Project[]; truncated: boolean }> {
  const pageBudget = Math.max(1, Math.floor(maxPageReads));
  let projects: Project[];
  try {
    await options.pacer?.beforeInteraction();
    projects = (await client.listProjects(options.listOptions)) as Project[];
  } catch (error) {
    await recordAccountMirrorDomDriftObservation(options.observation, {
      surface: 'account-mirror-projects',
      action: 'list-projects',
      fallbackKind: options.tolerateReadFailure ? 'read-failure-tolerated' : 'read-failure',
      error,
    });
    if (!options.tolerateReadFailure) {
      throw error;
    }
    projects = [];
  }
  const limit = pageBudget * 25;
  return {
    items: projects.slice(0, limit),
    truncated: projects.length > limit,
  };
}

async function readBoundedConversations(
  client: BrowserAutomationClient,
  projectId: string | null,
  maxRows: number,
  options: {
    listOptions?: Parameters<BrowserAutomationClient['listConversations']>[1];
    pacer?: BrowserInteractionPacer;
    observation?: AccountMirrorDomDriftObservationContext;
  } = {},
): Promise<{ items: Conversation[]; truncated: boolean }> {
  const limit = Math.max(0, Math.floor(maxRows));
  if (limit <= 0) {
    return { items: [], truncated: true };
  }
  await options.pacer?.beforeInteraction();
  let conversations: Conversation[];
  try {
    conversations = (await client.listConversations(projectId ?? undefined, {
      ...options.listOptions,
      historyLimit: limit,
      includeHistory: true,
    })) as Conversation[];
  } catch (error) {
    await recordAccountMirrorDomDriftObservation(options.observation, {
      surface: projectId ? 'account-mirror-project-conversations' : 'account-mirror-conversations',
      action: 'list-conversations',
      fallbackKind: 'read-failure',
      error,
      metadata: {
        projectId,
        historyLimit: limit,
      },
    });
    throw error;
  }
  return {
    items: conversations.slice(0, limit),
    truncated: conversations.length > limit,
  };
}

export async function readBoundedAttachmentInventory(
  client: Pick<BrowserAutomationClient, 'listProjectFiles' | 'listConversationFiles' | 'getConversationContext'>,
  projects: readonly Project[],
  conversations: readonly Conversation[],
  maxRows: number,
  options: number | {
    maxDetailReads?: number;
    cursor?: AttachmentInventoryCursor | null;
    shouldYield?: () => Promise<boolean> | boolean;
    listOptions?: Parameters<BrowserAutomationClient['listProjectFiles']>[1];
    pacer?: BrowserInteractionPacer;
    observation?: AccountMirrorDomDriftObservationContext;
  } = 6,
): Promise<{
  artifacts: ConversationArtifact[];
  files: FileRef[];
  media: AccountMirrorMediaManifestEntry[];
  truncated: boolean;
  cursor: AttachmentInventoryCursor;
}> {
  const limit = Math.max(0, Math.floor(maxRows));
  const maxDetailReads = typeof options === 'number'
    ? options
    : options.maxDetailReads ?? 6;
  const previousCursor = typeof options === 'number' ? null : options.cursor ?? null;
  const shouldYield = typeof options === 'number' ? undefined : options.shouldYield;
  const listOptions = typeof options === 'number' ? undefined : options.listOptions;
  const pacer = typeof options === 'number' ? undefined : options.pacer;
  const observation = typeof options === 'number' ? undefined : options.observation;
  const detailReadLimit = Math.max(1, Math.min(6, Math.floor(maxDetailReads)));
  if (limit <= 0) {
    return {
      artifacts: [],
      files: [],
      media: [],
      truncated: projects.length > 0 || conversations.length > 0,
      cursor: createAttachmentInventoryCursor(previousCursor, {
        projectsLength: projects.length,
        conversationsLength: conversations.length,
        detailReadLimit,
        scannedProjects: 0,
        scannedConversations: 0,
      }),
    };
  }
  const artifacts = new Map<string, ConversationArtifact>();
  const files = new Map<string, FileRef>();
  let remaining = limit;
  let remainingDetailReads = detailReadLimit;
  let truncated = false;
  let yielded = false;
  let projectIndex = normalizeCursorIndex(previousCursor?.nextProjectIndex, projects.length);
  let conversationIndex = normalizeCursorIndex(previousCursor?.nextConversationIndex, conversations.length);
  let scannedProjects = 0;
  let scannedConversations = 0;

  for (; projectIndex < projects.length; projectIndex += 1) {
    if (remaining <= 0 || remainingDetailReads <= 0) {
      truncated = true;
      break;
    }
    if (await shouldYield?.()) {
      truncated = true;
      yielded = true;
      break;
    }
    const project = projects[projectIndex];
    if (!project) break;
    remainingDetailReads -= 1;
    scannedProjects += 1;
    await pacer?.beforeInteraction();
    const projectFiles = await safeReadProjectFiles(client, project.id, listOptions, observation);
    for (const file of projectFiles) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      addFile(files, file, { projectId: project.id, source: 'project' });
      remaining -= 1;
    }
  }

  for (; !yielded && conversationIndex < conversations.length; conversationIndex += 1) {
    if (remaining <= 0 || remainingDetailReads <= 0) {
      truncated = true;
      break;
    }
    if (await shouldYield?.()) {
      truncated = true;
      yielded = true;
      break;
    }
    const conversation = conversations[conversationIndex];
    if (!conversation) break;
    remainingDetailReads -= 1;
    scannedConversations += 1;
    await pacer?.beforeInteraction();
    const conversationFiles = await safeReadConversationFiles(client, conversation, observation);
    await pacer?.beforeInteraction();
    const context = await safeReadConversationContext(client, conversation, observation);
    for (const file of conversationFiles) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      addFile(files, file, { conversationId: conversation.id, projectId: conversation.projectId, source: 'conversation' });
      remaining -= 1;
    }
    for (const artifact of context?.artifacts ?? []) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      addArtifact(artifacts, artifact, conversation);
      remaining -= 1;
    }
  }

  if (projectIndex < projects.length || conversationIndex < conversations.length) {
    truncated = true;
  }

  return {
    artifacts: [...artifacts.values()],
    files: [...files.values()],
    media: [],
    truncated,
    cursor: createAttachmentInventoryCursor(previousCursor, {
      projectsLength: projects.length,
      conversationsLength: conversations.length,
      detailReadLimit,
      scannedProjects,
      scannedConversations,
      nextProjectIndex:
        projectIndex >= projects.length && conversationIndex >= conversations.length ? 0 : projectIndex,
      nextConversationIndex:
        projectIndex >= projects.length && conversationIndex >= conversations.length ? 0 : conversationIndex,
      yielded,
    }),
  };
}

export async function readBoundedChatgptDetailInventory(
  client: Pick<
    BrowserAutomationClient,
    'listAccountFiles' | 'listProjectFiles' | 'listConversationFiles' | 'getConversationContext'
  >,
  projects: readonly Project[],
  conversations: readonly Conversation[],
  maxRows: number,
  options: number | {
    maxDetailReads?: number;
    cursor?: AttachmentInventoryCursor | null;
    shouldYield?: () => Promise<boolean> | boolean;
    listOptions?: Parameters<BrowserAutomationClient['listAccountFiles']>[0];
    pacer?: BrowserInteractionPacer;
    observation?: AccountMirrorDomDriftObservationContext;
  } = 6,
): Promise<{
  artifacts: ConversationArtifact[];
  files: FileRef[];
  media: AccountMirrorMediaManifestEntry[];
  truncated: boolean;
  cursor: AttachmentInventoryCursor;
}> {
  const limit = Math.max(0, Math.floor(maxRows));
  const listOptions = typeof options === 'number' ? undefined : options.listOptions;
  const pacer = typeof options === 'number' ? undefined : options.pacer;
  const observation = typeof options === 'number' ? undefined : options.observation;
  const library = await readBoundedChatgptLibraryInventory(client, limit, {
    listOptions,
    pacer,
    observation,
  });
  if (library.files.length > 0 || library.artifacts.length > 0) {
    return {
      artifacts: library.artifacts,
      files: library.files,
      media: [],
      truncated: library.truncated,
      cursor: createAttachmentInventoryCursor(
        typeof options === 'number' ? null : options.cursor ?? null,
        {
          projectsLength: projects.length,
          conversationsLength: conversations.length,
          detailReadLimit: normalizeDetailReadLimit(options),
          scannedProjects: 0,
          scannedConversations: 0,
        },
      ),
    };
  }
  const remainingRows = Math.max(0, limit - library.files.length);
  const attachmentInventory = await readBoundedAttachmentInventory(
    client,
    projects,
    conversations,
    remainingRows,
    options,
  );
  return {
    artifacts: mergeConversationArtifacts(library.artifacts, attachmentInventory.artifacts),
    files: mergeFileRefs(library.files, attachmentInventory.files),
    media: [],
    truncated: library.truncated || attachmentInventory.truncated,
    cursor: attachmentInventory.cursor,
  };
}

function normalizeDetailReadLimit(
  options: number | {
    maxDetailReads?: number;
  },
): number {
  const maxDetailReads = typeof options === 'number'
    ? options
    : options.maxDetailReads ?? 6;
  return Math.max(1, Math.min(6, Math.floor(maxDetailReads)));
}

export async function readBoundedChatgptLibraryInventory(
  client: Pick<BrowserAutomationClient, 'listAccountFiles'>,
  maxRows: number,
  options: {
    listOptions?: Parameters<BrowserAutomationClient['listAccountFiles']>[0];
    pacer?: BrowserInteractionPacer;
    observation?: AccountMirrorDomDriftObservationContext;
  } = {},
): Promise<{
  artifacts: ConversationArtifact[];
  files: FileRef[];
  truncated: boolean;
}> {
  const limit = Math.max(0, Math.floor(maxRows));
  if (limit <= 0) {
    return {
      artifacts: [],
      files: [],
      truncated: true,
    };
  }
  await options.pacer?.beforeInteraction();
  const files = await safeReadAccountFiles(client, options.listOptions, options.observation, {
    surface: 'account-mirror-library',
    action: 'list-account-files',
  });
  const boundedFiles = files.slice(0, limit);
  return {
    artifacts: mapChatgptLibraryFilesToArtifacts(boundedFiles),
    files: boundedFiles,
    truncated: files.length > limit,
  };
}

export async function readBoundedGrokAccountFileInventory(
  client: Pick<BrowserAutomationClient, 'listAccountFiles'>,
  maxRows: number,
  options: {
    listOptions?: Parameters<BrowserAutomationClient['listAccountFiles']>[0];
    pacer?: BrowserInteractionPacer;
    observation?: AccountMirrorDomDriftObservationContext;
  } = {},
): Promise<{
  artifacts: ConversationArtifact[];
  files: FileRef[];
  media: AccountMirrorMediaManifestEntry[];
  truncated: boolean;
  cursor: null;
}> {
  const limit = Math.max(0, Math.floor(maxRows));
  if (limit <= 0) {
    return {
      artifacts: [],
      files: [],
      media: [],
      truncated: true,
      cursor: null,
    };
  }
  await options.pacer?.beforeInteraction();
  const files = await safeReadAccountFiles(client, options.listOptions, options.observation, {
    surface: 'account-mirror-account-files',
    action: 'list-account-files',
  });
  const boundedFiles = files.slice(0, limit);
  return {
    artifacts: [],
    files: boundedFiles,
    media: mapGrokAccountFilesToMediaManifest(boundedFiles),
    truncated: files.length > limit,
    cursor: null,
  };
}

function createAttachmentInventoryCursor(
  previous: AttachmentInventoryCursor | null | undefined,
  input: {
    projectsLength: number;
    conversationsLength: number;
    detailReadLimit: number;
    scannedProjects: number;
    scannedConversations: number;
    nextProjectIndex?: number;
    nextConversationIndex?: number;
    yielded?: boolean;
  },
): AttachmentInventoryCursor {
  return {
    nextProjectIndex: normalizeCursorIndex(input.nextProjectIndex ?? previous?.nextProjectIndex, input.projectsLength),
    nextConversationIndex: normalizeCursorIndex(
      input.nextConversationIndex ?? previous?.nextConversationIndex,
      input.conversationsLength,
    ),
    detailReadLimit: input.detailReadLimit,
    scannedProjects: input.scannedProjects,
    scannedConversations: input.scannedConversations,
    yielded: input.yielded === true,
  };
}

function normalizeCursorIndex(value: number | null | undefined, length: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  const index = Math.floor(value);
  return length > 0 ? Math.min(index, length) : 0;
}

async function safeReadProjectFiles(
  client: Pick<BrowserAutomationClient, 'listProjectFiles'>,
  projectId: string,
  listOptions?: Parameters<BrowserAutomationClient['listProjectFiles']>[1],
  observation?: AccountMirrorDomDriftObservationContext,
): Promise<FileRef[]> {
  try {
    return listOptions === undefined
      ? await client.listProjectFiles(projectId)
      : await client.listProjectFiles(projectId, listOptions);
  } catch (error) {
    await recordAccountMirrorDomDriftObservation(observation, {
      surface: 'account-mirror-project-files',
      action: 'list-project-files',
      fallbackKind: 'read-failure-tolerated',
      error,
      metadata: { projectId },
    });
    return [];
  }
}

async function safeReadAccountFiles(
  client: Pick<BrowserAutomationClient, 'listAccountFiles'>,
  listOptions?: Parameters<BrowserAutomationClient['listAccountFiles']>[0],
  observation?: AccountMirrorDomDriftObservationContext,
  input: {
    surface: string;
    action: string;
  } = {
    surface: 'account-mirror-account-files',
    action: 'list-account-files',
  },
): Promise<FileRef[]> {
  try {
    return listOptions === undefined
      ? await client.listAccountFiles()
      : await client.listAccountFiles(listOptions);
  } catch (error) {
    await recordAccountMirrorDomDriftObservation(observation, {
      surface: input.surface,
      action: input.action,
      fallbackKind: 'read-failure-tolerated',
      error,
    });
    return [];
  }
}

async function safeReadConversationFiles(
  client: Pick<BrowserAutomationClient, 'listConversationFiles'>,
  conversation: Conversation,
  observation?: AccountMirrorDomDriftObservationContext,
): Promise<FileRef[]> {
  try {
    return await client.listConversationFiles(conversation.id, {
      projectId: conversation.projectId,
    });
  } catch (error) {
    await recordAccountMirrorDomDriftObservation(observation, {
      surface: 'account-mirror-conversation-files',
      action: 'list-conversation-files',
      fallbackKind: 'read-failure-tolerated',
      error,
      metadata: {
        conversationId: conversation.id,
        projectId: conversation.projectId ?? null,
      },
    });
    return [];
  }
}

async function safeReadConversationContext(
  client: Pick<BrowserAutomationClient, 'getConversationContext'>,
  conversation: Conversation,
  observation?: AccountMirrorDomDriftObservationContext,
): Promise<{ artifacts?: ConversationArtifact[] } | null> {
  try {
    return await client.getConversationContext(conversation.id, {
      projectId: conversation.projectId,
      refresh: true,
    });
  } catch (error) {
    await recordAccountMirrorDomDriftObservation(observation, {
      surface: 'account-mirror-conversation-context',
      action: 'get-conversation-context',
      fallbackKind: 'read-failure-tolerated',
      error,
      metadata: {
        conversationId: conversation.id,
        projectId: conversation.projectId ?? null,
      },
    });
    return null;
  }
}

async function recordAccountMirrorDomDriftObservation(
  context: AccountMirrorDomDriftObservationContext | null | undefined,
  input: {
    surface: string;
    action: string;
    fallbackKind: string;
    error: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!context) return;
  try {
    const pageEvidence = await collectAccountMirrorDomDriftPageEvidence(context);
    await recordDomDriftObservation({
      service: context.provider,
      surface: input.surface,
      action: input.action,
      expectedLabels: [],
      observedLabel: null,
      fallbackKind: input.fallbackKind,
      metadata: {
        source: 'accountMirror.metadataCollector',
        runtimeProfileId: context.runtimeProfileId,
        errorMessage: errorMessage(input.error),
        pageEvidence,
        ...input.metadata,
      },
    });
  } catch {
    // Lazy follow observations are evidence only; they must not make mirroring fail.
  }
}

async function collectAccountMirrorDomDriftPageEvidence(
  context: AccountMirrorDomDriftObservationContext | null | undefined,
): Promise<Record<string, unknown> | null> {
  if (!context?.client) return null;
  const connection = await context.client.connectDevTools().catch(() => null);
  if (!connection) return null;
  const { client } = connection;
  try {
    await client.Runtime.enable().catch(() => undefined);
    await client.Page.enable().catch(() => undefined);
    const { result } = await client.Runtime.evaluate({
      expression: buildAccountMirrorDomDriftPageEvidenceExpression(),
      returnByValue: true,
    });
    const page = isRecord(result?.value) ? result.value : {};
    const screenshot = await captureAccountMirrorDomDriftScreenshot(client, context).catch(() => null);
    return {
      ...page,
      screenshot,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function buildAccountMirrorDomDriftPageEvidenceExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const visibleNodes = (selector) => Array.from(document.querySelectorAll(selector)).filter((node) => visible(node));
    const labels = (selector, limit) => visibleNodes(selector)
      .map((node) => normalize(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || node.getAttribute('href') || ''))
      .filter(Boolean)
      .slice(0, limit);
    return {
      url: location.href,
      title: document.title || null,
      readyState: document.readyState,
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
      bodyTextLength: document.body?.innerText?.length ?? 0,
      visibleCounts: {
        buttons: visibleNodes('button,[role="button"]').length,
        links: visibleNodes('a[href]').length,
        inputs: visibleNodes('input').length,
        textareas: visibleNodes('textarea').length,
        contenteditables: visibleNodes('[contenteditable="true"]').length,
        dialogs: visibleNodes('[role="dialog"],dialog[open],[aria-modal="true"]').length,
      },
      visibleLabels: {
        buttons: labels('button,[role="button"]', 20),
        links: labels('a[href]', 20),
        headings: labels('h1,h2,h3,[role="heading"]', 12),
        dialogs: labels('[role="dialog"],dialog[open],[aria-modal="true"]', 8),
      },
    };
  })()`;
}

async function captureAccountMirrorDomDriftScreenshot(
  client: Awaited<ReturnType<AccountMirrorDomDriftClient['connectDevTools']>>['client'],
  context: AccountMirrorDomDriftObservationContext,
): Promise<Record<string, unknown> | null> {
  if (domDriftScreenshotsCaptured >= MAX_DOM_DRIFT_SCREENSHOTS_PER_PROCESS) return null;
  const screenshot = await client.Page.captureScreenshot({ format: 'png' }).catch(() => null);
  if (!screenshot || typeof screenshot.data !== 'string' || screenshot.data.length === 0) return null;
  domDriftScreenshotsCaptured += 1;
  const bytes = Buffer.from(screenshot.data, 'base64');
  const dir = path.join(getAuracallHomeDir(), 'diagnostics', 'dom-drift');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${context.provider}-${sanitizePathToken(context.runtimeProfileId)}.png`,
  );
  await fs.writeFile(filePath, bytes);
  return {
    path: filePath,
    mimeType: 'image/png',
    bytes: bytes.length,
  };
}

function sanitizePathToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 80) || 'unknown';
}

function addFile(
  files: Map<string, FileRef>,
  file: FileRef,
  defaults: { source: FileRef['source']; projectId?: string; conversationId?: string },
): void {
  const id = `${file.provider}:${file.source ?? defaults.source}:${file.id}`;
  files.set(id, {
    ...file,
    provider: file.provider ?? 'chatgpt',
    source: file.source ?? defaults.source,
    metadata: {
      ...(file.metadata ?? {}),
      projectId: file.metadata?.projectId ?? defaults.projectId,
      conversationId: file.metadata?.conversationId ?? defaults.conversationId,
    },
  });
}

function addArtifact(
  artifacts: Map<string, ConversationArtifact>,
  artifact: ConversationArtifact,
  conversation: Conversation,
): void {
  const id = `${conversation.id}:${artifact.id}`;
  artifacts.set(id, {
    ...artifact,
    metadata: {
      ...(artifact.metadata ?? {}),
      conversationId: artifact.metadata?.conversationId ?? conversation.id,
      projectId: artifact.metadata?.projectId ?? conversation.projectId,
    },
  });
}

function mergeFileRefs(left: readonly FileRef[], right: readonly FileRef[]): FileRef[] {
  const merged = new Map<string, FileRef>();
  for (const file of [...left, ...right]) {
    if (!file?.id) continue;
    const key = `${file.provider}:${file.source}:${file.id}`;
    merged.set(key, { ...(merged.get(key) ?? {}), ...file });
  }
  return [...merged.values()];
}

function mergeConversationArtifacts(
  left: readonly ConversationArtifact[],
  right: readonly ConversationArtifact[],
): ConversationArtifact[] {
  const merged = new Map<string, ConversationArtifact>();
  for (const artifact of [...left, ...right]) {
    if (!artifact?.id) continue;
    const conversationId = isRecord(artifact.metadata) && typeof artifact.metadata.conversationId === 'string'
      ? artifact.metadata.conversationId
      : '';
    const key = `${conversationId}:${artifact.id}`;
    merged.set(key, { ...(merged.get(key) ?? {}), ...artifact });
  }
  return [...merged.values()];
}

export function mapChatgptLibraryFilesToArtifacts(
  files: readonly FileRef[],
): ConversationArtifact[] {
  return files
    .filter((file) => isRecord(file.metadata) && file.metadata.source === 'chatgpt-library')
    .map((file) => {
      const metadata = isRecord(file.metadata) ? file.metadata : {};
      const artifactKind = typeof metadata.artifactKind === 'string'
        ? metadata.artifactKind
        : 'download';
      const artifactId = typeof metadata.artifactId === 'string'
        ? metadata.artifactId
        : `chatgpt-library:${file.id}`;
      return {
        id: artifactId,
        title: file.name,
        kind: normalizeArtifactKind(artifactKind),
        uri: file.remoteUrl,
        metadata: {
          ...metadata,
          fileId: file.id,
          fileSource: file.source,
        },
      };
    });
}

function normalizeArtifactKind(value: string): ConversationArtifact['kind'] {
  if (
    value === 'document' ||
    value === 'download' ||
    value === 'canvas' ||
    value === 'generated' ||
    value === 'image' ||
    value === 'spreadsheet'
  ) {
    return value;
  }
  return 'download';
}

export function mapGrokAccountFilesToMediaManifest(
  files: readonly FileRef[],
): AccountMirrorMediaManifestEntry[] {
  const media: AccountMirrorMediaManifestEntry[] = [];
  for (const file of files) {
    const mediaType = inferMediaTypeFromFile(file);
    if (!mediaType) continue;
    media.push({
      id: `grok-account-file:${file.id}`,
      title: file.name || file.id || null,
      mediaType,
      uri: file.remoteUrl ?? file.localPath,
      provider: 'grok',
      metadata: {
        source: 'grok-account-files',
        fileId: file.id,
        fileName: file.name,
        fileSource: file.source,
        remoteUrl: file.remoteUrl,
        localPath: file.localPath,
        mimeType: file.mimeType,
      },
    });
  }
  return media;
}

function inferMediaTypeFromFile(
  file: FileRef,
): AccountMirrorMediaManifestEntry['mediaType'] | null {
  const haystack = [
    file.mimeType,
    file.name,
    file.remoteUrl,
    file.localPath,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
  if (!haystack) return null;
  if (/\bimage\//.test(haystack) || /\.(avif|gif|jpe?g|png|webp)(?:[?#\s]|$)/.test(haystack)) {
    return 'image';
  }
  if (/\bvideo\//.test(haystack) || /\.(m4v|mov|mp4|webm)(?:[?#\s]|$)/.test(haystack)) {
    return 'video';
  }
  if (/\baudio\//.test(haystack) || /\.(aac|flac|m4a|mp3|ogg|wav)(?:[?#\s]|$)/.test(haystack)) {
    return 'audio';
  }
  return null;
}

function readIdentityKey(identity: ProviderUserIdentity | null): string | null {
  return (
    normalizeIdentityKey(identity?.email) ??
    normalizeIdentityKey(identity?.handle) ??
    normalizeIdentityKey(identity?.accountId) ??
    normalizeIdentityKey(identity?.name) ??
    null
  );
}

function readAccountLevel(identity: ProviderUserIdentity | null): string | null {
  return (
    readString(identity?.accountLevel) ??
    readString(identity?.accountPlanType) ??
    readString(identity?.capabilityProfile) ??
    readString(identity?.proAccess)
  );
}

function normalizeIdentityKey(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function readString(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
