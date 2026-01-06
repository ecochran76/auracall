export type SelectorList = readonly string[];

export interface ProviderSelectorConfig {
  input: SelectorList;
  sendButton: SelectorList;
  modelButton: SelectorList;
  menuItem: SelectorList;
  assistantBubble: SelectorList;
  assistantRole: SelectorList;
  copyButton: SelectorList;
  composerRoot: SelectorList;
  fileInput: SelectorList;
  attachmentMenu: SelectorList;
}

export interface BrowserProviderConfig {
  id: 'chatgpt' | 'grok';
  selectors: ProviderSelectorConfig;
  loginUrlHints?: SelectorList;
}

export interface BrowserProviderCapabilities {
  projects?: boolean;
  conversations?: boolean;
  instructions?: boolean;
  files?: boolean;
}

export interface BrowserProvider {
  id: BrowserProviderConfig['id'];
  config: BrowserProviderConfig;
  capabilities?: BrowserProviderCapabilities;
  listProjects?: () => Promise<unknown>;
  listConversations?: (projectId?: string) => Promise<unknown>;
  openConversation?: (conversationId: string) => Promise<void>;
  readConversationContext?: (conversationId: string) => Promise<unknown>;
  updateProjectInstructions?: (projectId: string, content: string) => Promise<void>;
  listProjectFiles?: (projectId: string) => Promise<unknown>;
  uploadProjectFile?: (projectId: string, filePath: string) => Promise<unknown>;
  downloadProjectFile?: (projectId: string, fileId: string, destPath: string) => Promise<void>;
  listConversationFiles?: (conversationId: string) => Promise<unknown>;
  downloadConversationFile?: (conversationId: string, fileId: string, destPath: string) => Promise<void>;
}
