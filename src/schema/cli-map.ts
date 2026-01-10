export const CLI_MAPPING: Record<string, string> = {
  // Core
  'model': 'model',
  'engine': 'engine',
  'search': 'search',
  'verbose': 'verbose',
  'timeout': 'timeout',
  'file': 'file',
  'filesReport': 'filesReport',
  
  // Output
  'writeOutput': 'writeOutput',
  'renderMarkdown': 'renderMarkdown',
  'renderPlain': 'renderPlain',
  'verboseRender': 'verboseRender',
  
  // Browser - General
  'browserTarget': 'browser.target',
  'browserTimeout': 'browser.timeoutMs',
  'browserInputTimeout': 'browser.inputTimeoutMs',
  'browserCookieWait': 'browser.cookieSyncWaitMs',
  'browserHeadless': 'browser.headless',
  'browserHideWindow': 'browser.hideWindow',
  'browserKeepBrowser': 'browser.keepBrowser',
  'browserManualLogin': 'browser.manualLogin',
  'browserManualLoginProfileDir': 'browser.manualLoginProfileDir',
  'browserWslChrome': 'browser.wslChromePreference',
  
  // Browser - Connection/Chrome
  'browserChromeProfile': 'browser.chromeProfile',
  'browserChromePath': 'browser.chromePath',
  'browserCookiePath': 'browser.chromeCookiePath',
  'browserPort': 'browser.debugPort',
  'browserDebugPort': 'browser.debugPort', // alias
  'remoteChrome': 'browser.remoteChrome',
  
  // Browser - URLs/Scope
  'grokUrl': 'browser.grokUrl',
  'chatgptUrl': 'browser.chatgptUrl',
  'geminiUrl': 'browser.geminiUrl',
  'browserUrl': 'browser.url',
  'projectId': 'browser.projectId',
  'projectName': 'browser.projectName',
  'conversationId': 'browser.conversationId',
  'conversationName': 'browser.conversationName',
  
  // Browser - Cookies
  'browserCookieNames': 'browser.cookieNames',
  'browserInlineCookies': 'browser.inlineCookies',
  'browserInlineCookiesFile': 'browser.inlineCookiesFile',
  'browserNoCookieSync': 'browser.noCookieSync',
  'browserAllowCookieErrors': 'browser.allowCookieErrors',
  
  // Browser - Behavior
  'browserModelStrategy': 'browser.modelStrategy',
  'browserThinkingTime': 'browser.thinkingTime',
  'browserAttachments': 'browser.attachments',
  'browserInlineFiles': 'browser.inlineFiles',
  'browserBundleFiles': 'browser.bundleFiles',
  
  // Remote Service
  'remoteHost': 'remote.host',
  'remoteToken': 'remote.token',
  
  // Azure
  'azureEndpoint': 'azure.endpoint',
  'azureDeployment': 'azure.deployment',
  'azureApiVersion': 'azure.apiVersion',
};
