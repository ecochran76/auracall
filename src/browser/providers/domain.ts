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
  source: 'project' | 'conversation';
  size?: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  time?: string;
}

export interface ConversationContext {
  provider: ProviderId;
  conversationId: string;
  messages: ConversationMessage[];
  files?: FileRef[];
}
