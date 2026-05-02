import type { ResolvedUserConfig } from '../config.js';
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
import type {
  AccountMirrorMetadataCounts,
  AccountMirrorMetadataEvidence,
} from './statusRegistry.js';

export interface AccountMirrorMetadataCollectorInput {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  expectedIdentityKey: string;
  previousEvidence?: AccountMirrorMetadataEvidence | null;
  shouldYield?: () => Promise<boolean> | boolean;
  limits: {
    maxPageReadsPerCycle: number;
    maxConversationRowsPerCycle: number;
    maxArtifactRowsPerCycle: number;
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
      const identity = await client.getUserIdentity();
      const detectedIdentityKey = readIdentityKey(identity);
      const expectedIdentityKey = normalizeIdentityKey(input.expectedIdentityKey);
      if (!expectedIdentityKey || detectedIdentityKey !== expectedIdentityKey) {
        throw new AccountMirrorIdentityMismatchError(input.provider, expectedIdentityKey ?? '', detectedIdentityKey);
      }

      const projects = await readBoundedProjects(client, input.limits.maxPageReadsPerCycle, {
        tolerateReadFailure: input.provider === 'gemini',
      });
      const conversationBudget = Math.max(0, Math.floor(input.limits.maxConversationRowsPerCycle));
      const rootConversations = await readBoundedConversations(client, null, conversationBudget);
      let remainingConversationBudget = Math.max(0, conversationBudget - rootConversations.items.length);
      const projectConversations: Conversation[] = [];
      for (const project of projects.items) {
        if (remainingConversationBudget <= 0) break;
        const result = await readBoundedConversations(client, project.id, remainingConversationBudget);
        projectConversations.push(...result.items);
        remainingConversationBudget -= result.items.length;
        if (result.truncated) break;
      }
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
            },
          )
        : input.provider === 'grok'
          ? await readBoundedGrokAccountFileInventory(client, input.limits.maxArtifactRowsPerCycle)
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
  } = {},
): Promise<{ items: Project[]; truncated: boolean }> {
  const pageBudget = Math.max(1, Math.floor(maxPageReads));
  let projects: Project[];
  try {
    projects = (await client.listProjects()) as Project[];
  } catch (error) {
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
): Promise<{ items: Conversation[]; truncated: boolean }> {
  const limit = Math.max(0, Math.floor(maxRows));
  if (limit <= 0) {
    return { items: [], truncated: true };
  }
  const conversations = (await client.listConversations(projectId ?? undefined, {
    historyLimit: limit,
    includeHistory: true,
  })) as Conversation[];
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
    const projectFiles = await safeReadProjectFiles(client, project.id);
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
    const [conversationFiles, context] = await Promise.all([
      safeReadConversationFiles(client, conversation),
      safeReadConversationContext(client, conversation),
    ]);
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
  } = 6,
): Promise<{
  artifacts: ConversationArtifact[];
  files: FileRef[];
  media: AccountMirrorMediaManifestEntry[];
  truncated: boolean;
  cursor: AttachmentInventoryCursor;
}> {
  const limit = Math.max(0, Math.floor(maxRows));
  const library = await readBoundedChatgptLibraryInventory(client, limit);
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
  const files = await safeReadAccountFiles(client);
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
  const files = await safeReadAccountFiles(client);
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
): Promise<FileRef[]> {
  try {
    return await client.listProjectFiles(projectId);
  } catch {
    return [];
  }
}

async function safeReadAccountFiles(
  client: Pick<BrowserAutomationClient, 'listAccountFiles'>,
): Promise<FileRef[]> {
  try {
    return await client.listAccountFiles();
  } catch {
    return [];
  }
}

async function safeReadConversationFiles(
  client: Pick<BrowserAutomationClient, 'listConversationFiles'>,
  conversation: Conversation,
): Promise<FileRef[]> {
  try {
    return await client.listConversationFiles(conversation.id, {
      projectId: conversation.projectId,
    });
  } catch {
    return [];
  }
}

async function safeReadConversationContext(
  client: Pick<BrowserAutomationClient, 'getConversationContext'>,
  conversation: Conversation,
): Promise<{ artifacts?: ConversationArtifact[] } | null> {
  try {
    return await client.getConversationContext(conversation.id, {
      projectId: conversation.projectId,
      refresh: true,
    });
  } catch {
    return null;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
