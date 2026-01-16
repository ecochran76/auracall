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

export interface BrowserProviderListOptions {
  host?: string;
  port?: number;
  configuredUrl?: string | null;
  tabTargetId?: string;
  tabUrl?: string | null;
  includeHistory?: boolean;
  historyLimit?: number;
  historySince?: string;
  browserService?: import('../service/types.js').BrowserServiceHandle;
  modelLabel?: string;
}

export interface ProviderUserIdentity {
  id?: string;
  name?: string;
  handle?: string;
  email?: string;
  source?: string;
}

export interface BrowserProvider {
  id: BrowserProviderConfig['id'];
  config: BrowserProviderConfig;
  capabilities?: BrowserProviderCapabilities;
  resolveProjectUrl?: (projectId: string) => string;
  resolveConversationUrl?: (conversationId: string, projectId?: string) => string;
  listProjects?: (options?: BrowserProviderListOptions) => Promise<unknown>;
  listConversations?: (projectId?: string, options?: BrowserProviderListOptions) => Promise<unknown>;
  renameProject?: (projectId: string, newTitle: string, options?: BrowserProviderListOptions) => Promise<void>;
  cloneProject?: (projectId: string, options?: BrowserProviderListOptions) => Promise<void>;
  openProjectMenu?: (projectId: string, options?: BrowserProviderListOptions) => Promise<void>;
  selectRenameProjectItem?: (projectId: string, options?: BrowserProviderListOptions) => Promise<void>;
  selectCloneProjectItem?: (projectId: string, options?: BrowserProviderListOptions) => Promise<void>;
  selectRemoveProjectItem?: (projectId: string, options?: BrowserProviderListOptions) => Promise<void>;
  pushProjectRemoveConfirmation?: (projectId: string, options?: BrowserProviderListOptions) => Promise<void>;
  validateProjectUrl?: (projectId: string, options?: BrowserProviderListOptions) => Promise<void>;
  validateConversationUrl?: (
    conversationId: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  openCreateProjectModal?: (options?: BrowserProviderListOptions) => Promise<void>;
  setCreateProjectFields?: (
    fields: { name?: string; instructions?: string; modelLabel?: string },
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  clickCreateProjectNext?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickCreateProjectAttach?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickCreateProjectUploadFile?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickCreateProjectConfirm?: (options?: BrowserProviderListOptions) => Promise<void>;
  toggleProjectSidebar?: (options?: BrowserProviderListOptions) => Promise<void>;
  toggleMainSidebar?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickHistoryItem?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickHistorySeeAll?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickChatArea?: (options?: BrowserProviderListOptions) => Promise<void>;
  updateProjectInstructions?: (
    projectId: string,
    instructions: string,
    options?: BrowserProviderListOptions,
    modelLabel?: string,
  ) => Promise<void>;
  getProjectInstructions?: (
    projectId: string,
    options?: BrowserProviderListOptions,
  ) => Promise<{ text: string; model?: string | null }>;
  getUserIdentity?: (options?: BrowserProviderListOptions) => Promise<ProviderUserIdentity | null>;
  openConversation?: (conversationId: string) => Promise<void>;
  readConversationContext?: (conversationId: string) => Promise<unknown>;
  listProjectFiles?: (projectId: string) => Promise<unknown>;
  uploadProjectFile?: (projectId: string, filePath: string) => Promise<unknown>;
  downloadProjectFile?: (projectId: string, fileId: string, destPath: string) => Promise<void>;
  listConversationFiles?: (conversationId: string) => Promise<unknown>;
  downloadConversationFile?: (conversationId: string, fileId: string, destPath: string) => Promise<void>;
  renameConversation?: (conversationId: string, newTitle: string, projectId?: string, options?: BrowserProviderListOptions) => Promise<void>;
}
