import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from '../providers/types.js';
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
};

export type CacheContext = CacheSettings & {
  provider: ProviderId;
  userConfig: ResolvedUserConfig;
  listOptions: BrowserProviderListOptions;
  userIdentity?: ProviderUserIdentity | null;
  identityKey?: string | null;
};

export type ProjectListResult = Project[];
export type ConversationListResult = Conversation[];

export type IdentityPrompt = (provider: ProviderId) => Promise<ProviderUserIdentity | null>;
