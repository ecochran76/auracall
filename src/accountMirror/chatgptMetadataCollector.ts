import type { ResolvedUserConfig } from '../config.js';
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
import type { AccountMirrorMetadataCounts } from './statusRegistry.js';

export interface AccountMirrorMetadataCollectorInput {
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  expectedIdentityKey: string;
  limits: {
    maxPageReadsPerCycle: number;
    maxConversationRowsPerCycle: number;
    maxArtifactRowsPerCycle: number;
  };
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
  };
}

export interface AccountMirrorMetadataCollector {
  collect(input: AccountMirrorMetadataCollectorInput): Promise<AccountMirrorMetadataCollectorResult>;
}

export class AccountMirrorIdentityMismatchError extends Error {
  constructor(
    readonly expectedIdentityKey: string,
    readonly detectedIdentityKey: string | null,
  ) {
    super(
      detectedIdentityKey
        ? `Detected ChatGPT identity ${detectedIdentityKey} does not match expected ${expectedIdentityKey}.`
        : `ChatGPT identity could not be detected for expected ${expectedIdentityKey}.`,
    );
    this.name = 'AccountMirrorIdentityMismatchError';
  }
}

export function createChatgptAccountMirrorMetadataCollector(
  userConfig: ResolvedUserConfig,
): AccountMirrorMetadataCollector {
  return {
    async collect(input) {
      if (input.provider !== 'chatgpt') {
        throw new Error(`Account mirror metadata collection is not implemented for ${input.provider}.`);
      }
      const client = await BrowserAutomationClient.fromConfig(userConfig, { target: 'chatgpt' });
      const identity = await client.getUserIdentity();
      const detectedIdentityKey = readIdentityKey(identity);
      const expectedIdentityKey = normalizeIdentityKey(input.expectedIdentityKey);
      if (!expectedIdentityKey || detectedIdentityKey !== expectedIdentityKey) {
        throw new AccountMirrorIdentityMismatchError(expectedIdentityKey ?? '', detectedIdentityKey);
      }

      const projects = await readBoundedProjects(client, input.limits.maxPageReadsPerCycle);
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
      const inventory = await readBoundedAttachmentInventory(
        client,
        projects.items,
        conversations,
        input.limits.maxArtifactRowsPerCycle,
        input.limits.maxPageReadsPerCycle,
      );
      return {
        detectedIdentityKey,
        detectedAccountLevel: readAccountLevel(identity),
        metadataCounts: {
          projects: projects.items.length,
          conversations: conversations.length,
          artifacts: inventory.artifacts.length,
          files: inventory.files.length,
          media: 0,
        },
        manifests: {
          projects: projects.items,
          conversations,
          artifacts: inventory.artifacts,
          files: inventory.files,
          media: [],
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
        },
      };
    },
  };
}

async function readBoundedProjects(
  client: BrowserAutomationClient,
  maxPageReads: number,
): Promise<{ items: Project[]; truncated: boolean }> {
  const pageBudget = Math.max(1, Math.floor(maxPageReads));
  const projects = (await client.listProjects()) as Project[];
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
  maxDetailReads: number = 6,
): Promise<{ artifacts: ConversationArtifact[]; files: FileRef[]; truncated: boolean }> {
  const limit = Math.max(0, Math.floor(maxRows));
  const detailReadLimit = Math.max(1, Math.min(6, Math.floor(maxDetailReads)));
  if (limit <= 0) {
    return { artifacts: [], files: [], truncated: projects.length > 0 || conversations.length > 0 };
  }
  const artifacts = new Map<string, ConversationArtifact>();
  const files = new Map<string, FileRef>();
  let remaining = limit;
  let remainingDetailReads = detailReadLimit;
  let truncated = false;

  for (const project of projects) {
    if (remaining <= 0 || remainingDetailReads <= 0) {
      truncated = true;
      break;
    }
    remainingDetailReads -= 1;
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

  for (const conversation of conversations) {
    if (remaining <= 0 || remainingDetailReads <= 0) {
      truncated = true;
      break;
    }
    remainingDetailReads -= 1;
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

  if (projects.length + conversations.length > detailReadLimit) {
    truncated = true;
  }

  return {
    artifacts: [...artifacts.values()],
    files: [...files.values()],
    truncated,
  };
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
