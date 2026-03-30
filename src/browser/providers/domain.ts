export type ProviderId = 'chatgpt' | 'grok';
export type ProjectMemoryMode = 'global' | 'project';

export function normalizeProjectMemoryMode(value: string | null | undefined): ProjectMemoryMode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!normalized) return null;
  if (normalized === 'global' || normalized === 'default') {
    return 'global';
  }
  if (normalized === 'project' || normalized === 'project-only' || normalized === 'projectonly') {
    return 'project';
  }
  return null;
}

export interface Project {
  id: string;
  name: string;
  provider: ProviderId;
  url?: string;
  memoryMode?: ProjectMemoryMode;
}

export interface Conversation {
  id: string;
  title: string;
  provider: ProviderId;
  projectId?: string;
  url?: string;
  updatedAt?: string;
}

export interface FileRef {
  id: string;
  name: string;
  provider: ProviderId;
  source: 'project' | 'conversation' | 'account';
  size?: number;
  mimeType?: string;
  remoteUrl?: string;
  localPath?: string;
  checksumSha256?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  time?: string;
}

export interface ConversationSource {
  url: string;
  title?: string;
  domain?: string;
  messageIndex?: number;
  sourceGroup?: string;
}

export interface ConversationArtifact {
  id: string;
  title: string;
  kind?: 'download' | 'canvas' | 'generated' | 'image' | 'spreadsheet';
  uri?: string;
  messageIndex?: number;
  messageId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationContext {
  provider: ProviderId;
  conversationId: string;
  messages: ConversationMessage[];
  files?: FileRef[];
  sources?: ConversationSource[];
  artifacts?: ConversationArtifact[];
}
