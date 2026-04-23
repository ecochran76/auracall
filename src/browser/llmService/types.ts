import type {
  BrowserProvider,
  BrowserProviderListOptions,
  BrowserProviderPromptResult,
  ProviderUserIdentity,
} from '../providers/types.js';
import type { Conversation, Project, ProviderId } from '../providers/domain.js';
import type { ResolvedUserConfig } from '../../config.js';

export type LlmCapabilities = {
  projects?: boolean;
  conversations?: boolean;
  rename?: boolean;
  contexts?: boolean;
  files?: boolean;
  models?: boolean;
};

export type LlmServiceAdapter = BrowserProvider & {
  id: ProviderId;
};

export type CacheSettings = {
  cacheRoot?: string | null;
  ttlMs?: number | null;
};

export type CacheIdentity = {
  userIdentity: ProviderUserIdentity | null;
  identityKey: string | null;
  featureSignature: string | null;
};

export type CacheContext = CacheSettings & {
  provider: ProviderId;
  userConfig: ResolvedUserConfig;
  listOptions: BrowserProviderListOptions;
  userIdentity?: ProviderUserIdentity | null;
  identityKey?: string | null;
  featureSignature?: string | null;
};

export type ProjectListResult = Project[];
export type ConversationListResult = Conversation[];
export type PromptResult = BrowserProviderPromptResult;

export type IdentityPrompt = (provider: ProviderId) => Promise<ProviderUserIdentity | null>;

export type PromptReusePolicy = 'new' | 'reuse';

export type PromptPlan = {
  targetUrl: string | null;
  projectId: string | null;
  conversationId: string | null;
  reusePolicy: PromptReusePolicy;
  promptMode: 'new' | 'reuse';
};

export type PromptInput = {
  prompt: string;
  capabilityId?: string | null;
  configuredUrl?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  conversationId?: string | null;
  conversationName?: string | null;
  noProject?: boolean;
  allowAutoRefresh?: boolean;
  forceProjectRefresh?: boolean;
  forceConversationRefresh?: boolean;
  timeoutMs?: number | null;
  listOptions?: BrowserProviderListOptions;
};
