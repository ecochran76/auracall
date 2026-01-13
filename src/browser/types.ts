import type * as BaseTypes from '../../packages/browser-service/src/types.js';

export type { ChromeClient, CookieParam, BrowserLogger, BrowserAttachment } from '../../packages/browser-service/src/types.js';

export type BrowserModelStrategy = 'select' | 'current' | 'ignore';
export type ThinkingTimeLevel = 'light' | 'standard' | 'extended' | 'heavy';

type LlmBrowserFields = {
  target?: 'chatgpt' | 'gemini' | 'grok';
  projectId?: string | null;
  conversationId?: string | null;
  geminiUrl?: string | null;
  grokUrl?: string | null;
  chatgptUrl?: string | null;
  desiredModel?: string | null;
  modelStrategy?: BrowserModelStrategy;
  thinkingTime?: ThinkingTimeLevel;
};

export type BrowserRuntimeMetadata = BaseTypes.BrowserRuntimeMetadata & {
  conversationId?: string;
};

type BrowserBlockingProfileAction =
  | BaseTypes.BrowserAutomationConfig['blockingProfileAction']
  | 'restart-oracle';

export type BrowserSessionConfig = Omit<BaseTypes.BrowserSessionConfig, 'blockingProfileAction'> &
  LlmBrowserFields & {
    blockingProfileAction?: BrowserBlockingProfileAction;
  };

export type BrowserAutomationConfig = Omit<BaseTypes.BrowserAutomationConfig, 'blockingProfileAction'> &
  LlmBrowserFields & {
    blockingProfileAction?: BrowserBlockingProfileAction;
  };

export type BrowserRunOptions = Omit<BaseTypes.BrowserRunOptions, 'config' | 'runtimeHintCb'> & {
  config?: BrowserAutomationConfig;
  runtimeHintCb?: (hint: BrowserRuntimeMetadata) => void | Promise<void>;
};

export type BrowserRunResult = BaseTypes.BrowserRunResult & {
  conversationId?: string;
};

export type ResolvedBrowserConfig = BaseTypes.ResolvedBrowserConfig & LlmBrowserFields;
