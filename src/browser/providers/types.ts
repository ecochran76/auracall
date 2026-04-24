import type { BrowserMutationAuditSink } from '../../../packages/browser-service/src/service/mutationDispatcher.js';
import type { ConversationArtifact, FileRef, Project, ProjectMemoryMode } from './domain.js';

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
  id: 'chatgpt' | 'gemini' | 'grok';
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
  projectId?: string | null;
  tabTargetId?: string;
  tabUrl?: string | null;
  includeHistory?: boolean;
  historyLimit?: number;
  historySince?: string;
  preserveActiveTab?: boolean;
  browserService?: import('../service/types.js').BrowserServiceHandle;
  modelLabel?: string;
  mutationAudit?: BrowserMutationAuditSink;
  mutationSourcePrefix?: string;
}

export interface ProviderUserIdentity {
  id?: string;
  name?: string;
  handle?: string;
  email?: string;
  source?: string;
}

export interface BrowserProviderPromptInput {
  prompt: string;
  capabilityId?: string | null;
  completionMode?: 'assistant_response' | 'prompt_submitted';
  projectId?: string | null;
  conversationId?: string | null;
  targetUrl?: string | null;
  timeoutMs?: number | null;
  onProgress?: (event: BrowserProviderPromptProgressEvent) => Promise<void> | void;
}

export interface BrowserProviderPromptResult {
  text: string;
  conversationId?: string | null;
  url?: string | null;
  tabTargetId?: string | null;
}

export interface BrowserProviderActiveMediaMaterializationInput {
  capabilityId?: string | null;
  mediaType?: string | null;
  maxItems?: number | null;
  compareFullQuality?: boolean | null;
}

export type BrowserProviderPromptProgressPhase =
  | 'browser_target_attached'
  | 'gemini_surface_ready'
  | 'capability_selected'
  | 'composer_ready'
  | 'prompt_inserted'
  | 'send_attempted'
  | 'submitted_state_observed';

export interface BrowserProviderPromptProgressEvent {
  phase: BrowserProviderPromptProgressPhase;
  details?: Record<string, unknown> | null;
}

export interface BrowserProvider {
  id: BrowserProviderConfig['id'];
  config: BrowserProviderConfig;
  capabilities?: BrowserProviderCapabilities;
  normalizeProjectId?: (value: string | null | undefined) => string | null;
  normalizeConversationId?: (value: string | null | undefined) => string | null;
  extractProjectIdFromUrl?: (url: string) => string | null;
  resolveProjectUrl?: (projectId: string) => string;
  resolveConversationUrl?: (conversationId: string, projectId?: string) => string;
  listProjects?: (options?: BrowserProviderListOptions) => Promise<unknown>;
  listConversations?: (projectId?: string, options?: BrowserProviderListOptions) => Promise<unknown>;
  renameProject?: (projectId: string, newTitle: string, options?: BrowserProviderListOptions) => Promise<void>;
  cloneProject?: (projectId: string, options?: BrowserProviderListOptions) => Promise<Project | null>;
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
    fields: { name?: string; instructions?: string; modelLabel?: string; memoryMode?: ProjectMemoryMode },
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  clickCreateProjectNext?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickCreateProjectAttach?: (options?: BrowserProviderListOptions) => Promise<void>;
  clickCreateProjectUploadFile?: (options?: BrowserProviderListOptions) => Promise<void>;
  uploadCreateProjectFiles?: (paths: string[], options?: BrowserProviderListOptions) => Promise<void>;
  clickCreateProjectConfirm?: (options?: BrowserProviderListOptions) => Promise<void>;
  createProject?: (
    input: {
      name: string;
      instructions?: string;
      modelLabel?: string;
      files?: string[];
      memoryMode?: ProjectMemoryMode;
    },
    options?: BrowserProviderListOptions,
  ) => Promise<Project | null>;
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
  getFeatureSignature?: (options?: BrowserProviderListOptions) => Promise<string | null>;
  openConversation?: (conversationId: string) => Promise<void>;
  readConversationContext?: (
    conversationId: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ) => Promise<unknown>;
  readActiveConversationArtifacts?: (
    conversationId: string,
    options?: BrowserProviderListOptions,
  ) => Promise<ConversationArtifact[]>;
  runPrompt?: (
    input: BrowserProviderPromptInput,
    options?: BrowserProviderListOptions,
  ) => Promise<BrowserProviderPromptResult>;
  listProjectFiles?: (
    projectId: string,
    options?: BrowserProviderListOptions,
  ) => Promise<unknown>;
  listAccountFiles?: (
    options?: BrowserProviderListOptions,
  ) => Promise<unknown>;
  uploadProjectFile?: (projectId: string, filePath: string) => Promise<unknown>;
  uploadProjectFiles?: (
    projectId: string,
    filePaths: string[],
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  uploadAccountFiles?: (
    filePaths: string[],
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  deleteProjectFile?: (
    projectId: string,
    fileName: string,
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  deleteAccountFile?: (
    fileId: string,
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  downloadProjectFile?: (projectId: string, fileId: string, destPath: string) => Promise<void>;
  listConversationFiles?: (
    conversationId: string,
    options?: BrowserProviderListOptions,
  ) => Promise<unknown>;
  downloadConversationFile?: (
    conversationId: string,
    fileId: string,
    destPath: string,
    options?: BrowserProviderListOptions,
  ) => Promise<void>;
  materializeConversationArtifact?: (
    conversationId: string,
    artifact: ConversationArtifact,
    destDir: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ) => Promise<FileRef | null>;
  materializeActiveMediaArtifacts?: (
    input: BrowserProviderActiveMediaMaterializationInput,
    destDir: string,
    options?: BrowserProviderListOptions,
  ) => Promise<FileRef[]>;
  renameConversation?: (conversationId: string, newTitle: string, projectId?: string, options?: BrowserProviderListOptions) => Promise<void>;
  deleteConversation?: (conversationId: string, projectId?: string, options?: BrowserProviderListOptions) => Promise<void>;
}
