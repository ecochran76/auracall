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
