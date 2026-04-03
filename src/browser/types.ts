import type * as BaseTypes from '../../packages/browser-service/src/types.js';

export type {
  ChromeClient,
  CookieParam,
  BrowserLogger,
  BrowserAttachment,
  DebugPortStrategy,
} from '../../packages/browser-service/src/types.js';

export type BrowserModelStrategy = 'select' | 'current' | 'ignore';
export type ThinkingTimeLevel = 'light' | 'standard' | 'extended' | 'heavy';

type LlmBrowserFields = {
  selectedAgentId?: string | null;
  target?: 'chatgpt' | 'gemini' | 'grok';
  projectId?: string | null;
  conversationId?: string | null;
  geminiUrl?: string | null;
  grokUrl?: string | null;
  chatgptUrl?: string | null;
  desiredModel?: string | null;
  modelStrategy?: BrowserModelStrategy;
  thinkingTime?: ThinkingTimeLevel;
  composerTool?: string | null;
};

export type BrowserRuntimeMetadata = BaseTypes.BrowserRuntimeMetadata & {
  conversationId?: string;
  composerTool?: string | null;
};

type BrowserBlockingProfileAction =
  | BaseTypes.BrowserAutomationConfig['blockingProfileAction']
  | 'restart-auracall';

export type BrowserSessionConfig = Omit<BaseTypes.BrowserSessionConfig, 'blockingProfileAction'> &
  LlmBrowserFields & {
    auracallProfileName?: string | null;
    blockingProfileAction?: BrowserBlockingProfileAction;
  };

export type BrowserAutomationConfig = Omit<BaseTypes.BrowserAutomationConfig, 'blockingProfileAction'> &
  LlmBrowserFields & {
    auracallProfileName?: string | null;
    blockingProfileAction?: BrowserBlockingProfileAction;
  };

export type BrowserRunOptions = Omit<BaseTypes.BrowserRunOptions, 'config' | 'runtimeHintCb'> & {
  config?: BrowserAutomationConfig;
  runtimeHintCb?: (hint: BrowserRuntimeMetadata) => void | Promise<void>;
};

export type BrowserRunResult = BaseTypes.BrowserRunResult & {
  conversationId?: string;
  composerTool?: string | null;
};

export type ResolvedBrowserConfig = BaseTypes.ResolvedBrowserConfig & LlmBrowserFields;
