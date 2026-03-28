export type ProviderId = 'chatgpt' | 'grok';

export interface Project {
  id: string;
  name: string;
  provider: ProviderId;
  url?: string;
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

export interface ConversationContext {
  provider: ProviderId;
  conversationId: string;
  messages: ConversationMessage[];
  files?: FileRef[];
  sources?: ConversationSource[];
}
