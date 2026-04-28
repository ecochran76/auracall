import type CDP from 'chrome-remote-interface';
import type Protocol from 'devtools-protocol';

export type ChromeClient = Awaited<ReturnType<typeof CDP>>;
export type CookieParam = Protocol.Network.CookieParam;
export type DebugPortStrategy = 'fixed' | 'auto';

export type BrowserLogger = ((message: string) => void) & {
  verbose?: boolean;
  sessionLog?: (message: string) => void;
};

export interface BrowserAttachment {
  path: string;
  displayPath: string;
  sizeBytes?: number;
}

export interface BrowserRuntimeMetadata {
  chromePid?: number;
  chromePort?: number;
  chromeHost?: string;
  userDataDir?: string;
  chromeTargetId?: string;
  tabUrl?: string;
  composerTool?: string | null;
  /** PID of the controller process that launched this browser run. Helps detect orphaned sessions. */
  controllerPid?: number;
}

export interface BrowserSessionConfig {
  chromeProfile?: string | null;
  chromePath?: string | null;
  chromeCookiePath?: string | null;
  bootstrapCookiePath?: string | null;
  url?: string;
  timeoutMs?: number;
  debugPort?: number | null;
  debugPortStrategy?: DebugPortStrategy | null;
  inputTimeoutMs?: number;
  cookieSync?: boolean;
  cookieNames?: string[] | string | null;
  cookieSyncWaitMs?: number;
  inlineCookies?: CookieParam[] | string | null;
  inlineCookiesSource?: string | null;
  headless?: boolean;
  keepBrowser?: boolean;
  hideWindow?: boolean;
  debug?: boolean;
  allowCookieErrors?: boolean;
  remoteChrome?: { host: string; port: number } | null;
  manualLogin?: boolean;
  manualLoginProfileDir?: string | null;
  manualLoginCookieSync?: boolean;
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  managedProfileRoot?: string | null;
  blockingProfileAction?: 'fail' | 'restart' | 'restart-managed';
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
}

export interface BrowserAutomationConfig {
  chromeProfile?: string | null;
  chromePath?: string | null;
  chromeCookiePath?: string | null;
  bootstrapCookiePath?: string | null;
  display?: string | null;
  profileConflictAction?: 'fail' | 'terminate-existing' | 'attach-existing';
  blockingProfileAction?: 'fail' | 'restart' | 'restart-managed';
  url?: string;
  timeoutMs?: number;
  debugPort?: number | null;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  inputTimeoutMs?: number;
  cookieSync?: boolean;
  cookieNames?: string[] | string | null;
  cookieSyncWaitMs?: number;
  inlineCookies?: CookieParam[] | string | null;
  inlineCookiesSource?: string | null;
  headless?: boolean;
  keepBrowser?: boolean;
  hideWindow?: boolean;
  debug?: boolean;
  allowCookieErrors?: boolean;
  remoteChrome?: { host: string; port: number } | string | null;
  manualLogin?: boolean;
  manualLoginProfileDir?: string | null;
  manualLoginCookieSync?: boolean;
  manualLoginWaitForSession?: boolean;
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  managedProfileRoot?: string | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
}

export interface BrowserRunOptions {
  prompt: string;
  attachments?: BrowserAttachment[];
  attachmentMode?: 'inline' | 'upload' | 'bundle';
  completionMode?: 'assistant_response' | 'prompt_submitted';
  /** 
   * Optional secondary submission to try if the initial prompt is rejected.
   * Intended for inline->upload fallback.
   */
  fallbackSubmission?: { prompt: string; attachments: BrowserAttachment[] };
  config?: BrowserAutomationConfig;
  log?: BrowserLogger;
  heartbeatIntervalMs?: number;
  verbose?: boolean;
  skipBrowserExecutionOperation?: boolean;
  /** Optional hook to persist runtime info (port/url/target) as soon as Chrome is ready. */
  runtimeHintCb?: (hint: BrowserRuntimeMetadata) => void | Promise<void>;
}

export interface BrowserRunResult {
  answerText: string;
  answerMarkdown: string;
  answerHtml?: string;
  tookMs: number;
  answerTokens: number;
  answerChars: number;
  chromePid?: number;
  chromePort?: number;
  chromeHost?: string;
  userDataDir?: string;
  chromeTargetId?: string;
  tabUrl?: string;
  composerTool?: string | null;
  controllerPid?: number;
}

export type ResolvedBrowserConfig = Required<
  Omit<
    BrowserAutomationConfig,
      'chromeProfile' |
      'chromePath' |
      'chromeCookiePath' |
      'bootstrapCookiePath' |
      'remoteChrome' |
      'profileConflictAction'
  >
> & {
  chromeProfile?: string | null;
  chromePath?: string | null;
  chromeCookiePath?: string | null;
  bootstrapCookiePath?: string | null;
  display?: string | null;
  blockingProfileAction?: 'fail' | 'restart' | 'restart-managed';
  profileConflictAction?: 'fail' | 'terminate-existing' | 'attach-existing';
  debugPort?: number | null;
  debugPortStrategy?: DebugPortStrategy | null;
  debugPortRange?: [number, number] | null;
  inlineCookies?: CookieParam[] | null;
  inlineCookiesSource?: string | null;
  cookieNames?: string[] | null;
  remoteChrome?: { host: string; port: number } | null;
  manualLogin?: boolean;
  manualLoginProfileDir?: string | null;
  manualLoginCookieSync?: boolean;
  manualLoginWaitForSession?: boolean;
  wslChromePreference?: 'auto' | 'wsl' | 'windows';
  managedProfileRoot?: string | null;
  serviceTabLimit?: number | null;
  blankTabLimit?: number | null;
  collapseDisposableWindows?: boolean;
};
