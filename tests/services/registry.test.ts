import { describe, expect, test } from 'vitest';
import {
  ensureServicesRegistry,
  readBundledServicesRegistry,
  resolveBundledServiceArtifactContentTypeExtensions,
  resolveBundledServiceArtifactDefaultTitle,
  resolveBundledServiceArtifactKindExtensions,
  resolveBundledServiceArtifactNameMimeTypes,
  resolveBundledServiceArtifactPayloadMarkerSet,
  resolveBundledServiceComposerAliases,
  resolveBundledServiceComposerChipIgnoreTokens,
  resolveBundledServiceComposerFileRequestLabels,
  resolveBundledServiceComposerKnownLabels,
  resolveBundledServiceComposerMoreLabels,
  resolveBundledServiceComposerTopMenuSignalLabels,
  resolveBundledServiceComposerTopMenuSignalSubstrings,
  resolveBundledServiceComposerTopLevelSentinels,
  resolveBundledServiceAppTokens,
  resolveBundledServiceCompatibleHosts,
  resolveBundledServiceDomSelector,
  resolveBundledServiceDomSelectorSet,
  resolveBundledServiceFeatureFlagTokens,
  resolveBundledServiceModelLabels,
  resolveBundledServiceRouteTemplate,
  resolveBundledServiceSelectors,
  resolveBundledServiceUiLabel,
  resolveBundledServiceUiLabelSet,
} from '../../src/services/registry.js';

describe('service registry manifest helpers', () => {
  test('loads the bundled auracall services manifest with chatgpt pilot data', () => {
    const registry = readBundledServicesRegistry();
    expect(registry.services.chatgpt?.routes).toMatchObject({
      baseUrl: 'https://chatgpt.com/',
      conversation: 'https://chatgpt.com/c/{conversationId}',
      projectConversation: 'https://chatgpt.com/g/{projectId}/c/{conversationId}',
    });
  });

  test('resolves chatgpt model aliases through the bundled manifest', () => {
    expect(resolveBundledServiceModelLabels('chatgpt', 'gpt-5.2-thinking')).toEqual(['Thinking']);
    expect(resolveBundledServiceModelLabels('chatgpt', 'gpt-5.2')).toEqual(['Instant']);
    expect(resolveBundledServiceModelLabels('chatgpt', 'gpt-5.2-pro')).toEqual(['Pro']);
  });

  test('resolves chatgpt route templates and feature tokens through the bundled manifest', () => {
    expect(
      resolveBundledServiceRouteTemplate(
        'chatgpt',
        'projectSources',
        'https://fallback.example/project?tab=sources',
      ),
    ).toBe('https://chatgpt.com/g/{projectId}/project?tab=sources');
    expect(resolveBundledServiceCompatibleHosts('chatgpt', ['fallback.example'])).toEqual([
      'chatgpt.com',
      'chat.openai.com',
    ]);
    expect(resolveBundledServiceFeatureFlagTokens('chatgpt', {})).toMatchObject({
      web_search: ['search the web', 'web search'],
      deep_research: ['deep research'],
      company_knowledge: ['company knowledge'],
    });
    expect(resolveBundledServiceAppTokens('chatgpt', {})).toMatchObject({
      github: ['github'],
      slack: ['slack'],
    });
  });

  test('resolves chatgpt composer aliases and known labels through the bundled manifest', () => {
    expect(resolveBundledServiceComposerAliases('chatgpt', {})).toMatchObject({
      research: ['deep research'],
      gh: ['github'],
      drive: ['google drive'],
    });
    expect(resolveBundledServiceComposerKnownLabels('chatgpt', [])).toEqual(
      expect.arrayContaining(['canvas', 'google drive', 'deep research']),
    );
    expect(resolveBundledServiceComposerTopLevelSentinels('chatgpt', [])).toEqual(
      expect.arrayContaining(['more', 'deep research', 'web search']),
    );
    expect(resolveBundledServiceComposerMoreLabels('chatgpt', [])).toEqual(
      expect.arrayContaining(['more']),
    );
    expect(resolveBundledServiceComposerTopMenuSignalLabels('chatgpt', [])).toEqual(
      expect.arrayContaining(['recent files']),
    );
    expect(resolveBundledServiceComposerTopMenuSignalSubstrings('chatgpt', [])).toEqual(
      expect.arrayContaining(['add photos', 'filesctrlu']),
    );
    expect(resolveBundledServiceComposerChipIgnoreTokens('chatgpt', [])).toEqual(
      expect.arrayContaining(['add files and more', 'thinking']),
    );
    expect(resolveBundledServiceComposerFileRequestLabels('chatgpt', [])).toEqual(
      expect.arrayContaining(['file', 'recent files', 'add photos files']),
    );
  });

  test('resolves chatgpt ui labels and label sets through the bundled manifest', () => {
    expect(resolveBundledServiceUiLabel('chatgpt', 'project_settings_button', 'fallback')).toBe('Project settings');
    expect(resolveBundledServiceUiLabel('chatgpt', 'project_name_input', 'fallback')).toBe('Project name');
    expect(resolveBundledServiceUiLabel('chatgpt', 'project_title_edit_prefix', 'fallback')).toBe('edit the title of');
    expect(resolveBundledServiceUiLabel('chatgpt', 'project_source_actions', 'fallback')).toBe('Source actions');
    expect(resolveBundledServiceUiLabel('chatgpt', 'conversation_prompt_input', 'fallback')).toBe('Chat with ChatGPT');
    expect(resolveBundledServiceUiLabel('chatgpt', 'conversation_options_prefix', 'fallback')).toBe(
      'open conversation options for',
    );
    expect(resolveBundledServiceUiLabel('chatgpt', 'project_delete_dialog', 'fallback')).toBe('delete project?');
    expect(resolveBundledServiceUiLabelSet('chatgpt', 'delete_confirmation_buttons', [])).toEqual(
      expect.arrayContaining(['delete', 'cancel']),
    );
    expect(resolveBundledServiceUiLabelSet('chatgpt', 'project_source_upload_markers', [])).toEqual(
      expect.arrayContaining(['add sources', 'drag sources here']),
    );
  });

  test('resolves chatgpt selector families through the bundled manifest', () => {
    const selectors = resolveBundledServiceSelectors('chatgpt', {
      input: ['fallback-input'],
      sendButton: ['fallback-send'],
      modelButton: ['fallback-model'],
      menuItem: ['fallback-menu'],
      assistantBubble: ['fallback-bubble'],
      assistantRole: ['fallback-role'],
      copyButton: ['fallback-copy'],
      composerRoot: ['fallback-composer'],
      fileInput: ['fallback-file'],
      attachmentMenu: ['fallback-attach'],
    });
    expect(selectors.input).toEqual(
      expect.arrayContaining(['textarea[data-id="prompt-textarea"]', '#prompt-textarea']),
    );
    expect(selectors.fileInput).toEqual(
      expect.arrayContaining(['input[type="file"]', 'input[type="file"][data-testid*="file"]']),
    );
    expect(selectors.attachmentMenu[0]).toBe('#composer-plus-btn');
  });

  test('resolves chatgpt adapter dom selectors through the bundled manifest', () => {
    expect(resolveBundledServiceDomSelector('chatgpt', 'conversation_options_button', 'fallback')).toBe(
      'button[data-testid="conversation-options-button"]',
    );
    expect(resolveBundledServiceDomSelector('chatgpt', 'project_source_row', 'fallback')).toBe(
      'div[class*="group/file-row"]',
    );
    expect(resolveBundledServiceDomSelectorSet('chatgpt', 'project_dialog_roots', [])).toEqual(
      expect.arrayContaining(['[data-testid="modal-new-project-enhanced"]', '[role="dialog"]']),
    );
  });

  test('resolves chatgpt artifact taxonomy through the bundled manifest', () => {
    expect(resolveBundledServiceArtifactKindExtensions('chatgpt', {})).toMatchObject({
      spreadsheet: ['csv', 'tsv', 'xls', 'xlsx', 'ods'],
    });
    expect(resolveBundledServiceArtifactContentTypeExtensions('chatgpt', {})).toMatchObject({
      'text/csv': '.csv',
      'application/json': '.json',
    });
    expect(resolveBundledServiceArtifactNameMimeTypes('chatgpt', {})).toMatchObject({
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.md': 'text/markdown',
    });
    expect(resolveBundledServiceArtifactDefaultTitle('chatgpt', 'canvas', 'fallback')).toBe('Canvas artifact');
    expect(resolveBundledServiceArtifactPayloadMarkerSet('chatgpt', 'image_content_types', [])).toEqual(
      expect.arrayContaining(['image_asset_pointer']),
    );
  });

  test('copies the bundled manifest into the writable registry', async () => {
    const registry = await ensureServicesRegistry();
    expect(registry.services.chatgpt?.models?.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(['Thinking', 'Instant', 'Pro']),
    );
  });
});
