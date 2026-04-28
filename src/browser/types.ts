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
export type BrowserPassiveObservationState =
  | 'thinking'
  | 'response-incoming'
  | 'response-complete'
  | 'provider-error'
  | 'login-required'
  | 'captcha-or-human-verification'
  | 'awaiting-human';

export interface BrowserPassiveObservation {
  state: BrowserPassiveObservationState;
  source: 'provider-adapter' | 'browser-service';
  observedAt: string;
  evidenceRef?: string | null;
  confidence: 'low' | 'medium' | 'high';
}

type LlmBrowserFields = {
  selectedAgentId?: string | null;
  target?: 'chatgpt' | 'gemini' | 'grok';
  auracallProfileName?: string | null;
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
  selectedAgentId?: string | null;
  conversationId?: string;
  composerTool?: string | null;
  thinkingTime?: ThinkingTimeLevel;
  chatgptProMode?: 'standard' | 'extended';
  chatgptAccountLevel?: string;
  chatgptAccountPlanType?: string;
  chatgptAccountStructure?: string;
};

type BrowserBlockingProfileAction =
  | BaseTypes.BrowserAutomationConfig['blockingProfileAction']
  | 'restart-auracall';

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
  composerTool?: string | null;
  thinkingTime?: ThinkingTimeLevel;
  chatgptProMode?: 'standard' | 'extended';
  chatgptAccountLevel?: string;
  chatgptAccountPlanType?: string;
  chatgptAccountStructure?: string;
  passiveObservations?: BrowserPassiveObservation[];
};

export type ResolvedBrowserConfig = BaseTypes.ResolvedBrowserConfig & LlmBrowserFields;
