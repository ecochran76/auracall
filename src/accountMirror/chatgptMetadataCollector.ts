import type { ResolvedUserConfig } from '../config.js';
import { BrowserAutomationClient } from '../browser/client.js';
import type { Conversation, Project } from '../browser/providers/domain.js';
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
      return {
        detectedIdentityKey,
        detectedAccountLevel: readAccountLevel(identity),
        metadataCounts: {
          projects: projects.items.length,
          conversations: conversations.length,
          artifacts: 0,
          media: 0,
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
            artifacts: false,
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
