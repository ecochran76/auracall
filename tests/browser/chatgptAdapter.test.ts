import { describe, expect, test } from 'vitest';
import { normalizeProjectMemoryMode } from '../../src/browser/providers/domain.js';
import {
  classifyChatgptBlockingSurfaceProbe,
  createChatgptAdapter,
  extractChatgptConversationArtifactsFromPayload,
  extractChatgptConversationIdFromUrl,
  extractChatgptProjectIdFromUrl,
  extractChatgptProjectSourceName,
  extractChatgptConversationSourcesFromPayload,
  findChatgptProjectByName,
  findChatgptProjectSourceName,
  mergeChatgptCanvasArtifactContent,
  mergeChatgptConversationArtifacts,
  matchesChatgptConversationTitleProbe,
  matchesChatgptDeleteConfirmationProbe,
  matchesChatgptImageArtifactProbe,
  matchesChatgptProjectDeleteConfirmationProbe,
  matchesChatgptProjectSettingsSnapshot,
  matchesChatgptRenameEditorProbe,
  normalizeChatgptAuthSessionIdentity,
  normalizeChatgptConversationId,
  normalizeChatgptConversationDownloadArtifactProbes,
  normalizeChatgptConversationFileProbes,
  normalizeChatgptConversationLinkProbes,
  normalizeChatgptProjectSourceProbes,
  normalizeChatgptProjectId,
  isRetryableChatgptTransientMessage,
  resolveChatgptConversationUrl,
  resolveChatgptProjectUrl,
  resolveChatgptProjectMemoryLabel,
  resolveChatgptProjectSettingsCommitLabelsForTest,
  resolveChatgptProjectSourceUploadActionLabelsForTest,
  serializeChatgptGridRowsToCsv,
} from '../../src/browser/providers/chatgptAdapter.js';

describe('extractChatgptProjectIdFromUrl', () => {
  test('returns the project id for concrete project URLs', () => {
    expect(
      extractChatgptProjectIdFromUrl(
        'https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/project',
      ),
    ).toBe('g-p-68c1a5feea188191809eb91ef1f14c3b');
  });

  test('returns the project id for project conversation URLs', () => {
    expect(
      extractChatgptProjectIdFromUrl(
        'https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222',
      ),
    ).toBe('g-p-68c1a5feea188191809eb91ef1f14c3b');
  });

  test('keeps bare project ids unchanged', () => {
    expect(
      extractChatgptProjectIdFromUrl(
        'https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project',
      ),
    ).toBe('g-p-69c851be8cc88191afe109bea1b2a28d');
  });

  test('returns null for non-project urls', () => {
    expect(extractChatgptProjectIdFromUrl('https://chatgpt.com/c/69c80cee-440c-8333-8369-c36b99382172')).toBeNull();
  });

  test('returns null for malformed project routes without a canonical g-p id', () => {
    expect(
      extractChatgptProjectIdFromUrl(
        'https://chatgpt.com/g/AuraCall%20Cache%20Identity%20Probe%201774743669/project',
      ),
    ).toBeNull();
  });
});

describe('extractChatgptConversationIdFromUrl', () => {
  test('returns the conversation id for root conversation URLs', () => {
    expect(extractChatgptConversationIdFromUrl('https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da')).toBe(
      '69c93b5d-e6b0-8332-8c20-da466cc863da',
    );
  });

  test('returns the conversation id for project conversation URLs', () => {
    expect(
      extractChatgptConversationIdFromUrl(
        'https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222',
      ),
    ).toBe('69c73884-2fb0-832f-8acc-c043e5002222');
  });
});

describe('normalizeChatgptConversationId', () => {
  test('keeps bare root conversation ids unchanged', () => {
    expect(normalizeChatgptConversationId('69c9a282-91a4-832e-b8c0-21fa595a24a9')).toBe(
      '69c9a282-91a4-832e-b8c0-21fa595a24a9',
    );
  });

  test('extracts ids from root and project conversation urls', () => {
    expect(
      normalizeChatgptConversationId('https://chatgpt.com/c/69c9a282-91a4-832e-b8c0-21fa595a24a9'),
    ).toBe('69c9a282-91a4-832e-b8c0-21fa595a24a9');
    expect(
      normalizeChatgptConversationId(
        'https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222',
      ),
    ).toBe('69c73884-2fb0-832f-8acc-c043e5002222');
  });

  test('rejects non-conversation selectors', () => {
    expect(normalizeChatgptConversationId('ChatGPT ACCEPT BASE')).toBeNull();
    expect(normalizeChatgptConversationId('https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project')).toBeNull();
  });
});

describe('normalizeChatgptProjectId', () => {
  test('keeps bare ids unchanged and strips slug suffixes', () => {
    expect(normalizeChatgptProjectId('g-p-69c859e5d5b48191af37847a03153475')).toBe('g-p-69c859e5d5b48191af37847a03153475');
    expect(normalizeChatgptProjectId('g-p-69c859e5d5b48191af37847a03153475-oracle')).toBe('g-p-69c859e5d5b48191af37847a03153475');
  });

  test('rejects non-canonical project ids', () => {
    expect(normalizeChatgptProjectId('AuraCall Cache Identity Probe 1774743669')).toBeNull();
    expect(normalizeChatgptProjectId('AuraCall%20Cache%20Identity%20Probe%201774743669')).toBeNull();
  });
});

describe('findChatgptProjectByName', () => {
  test('matches projects by normalized exact name', () => {
    expect(
      findChatgptProjectByName(
        [
          {
            id: 'g-p-1-reviewer',
            name: 'Reviewer',
            url: 'https://chatgpt.com/g/g-p-1-reviewer/project',
          },
          {
            id: 'g-p-2-auracall-cedar',
            name: '  AuraCall   Cedar Harbor  ',
            url: 'https://chatgpt.com/g/g-p-2-auracall-cedar/project',
          },
        ],
        'AuraCall Cedar Harbor',
      ),
    ).toEqual({
      id: 'g-p-2-auracall-cedar',
      name: '  AuraCall   Cedar Harbor  ',
      url: 'https://chatgpt.com/g/g-p-2-auracall-cedar/project',
    });
  });
});

describe('resolveChatgptProjectMemoryLabel', () => {
  test('maps global mode to the ChatGPT Default label', () => {
    expect(resolveChatgptProjectMemoryLabel('global')).toBe('Default');
  });

  test('maps project mode to the ChatGPT Project-only label', () => {
    expect(resolveChatgptProjectMemoryLabel('project')).toBe('Project-only');
  });
});

describe('resolveChatgptProjectSettingsCommitLabelsForTest', () => {
  test('uses manifest-owned project settings commit button labels', () => {
    expect(resolveChatgptProjectSettingsCommitLabelsForTest()).toEqual(
      expect.arrayContaining(['save', 'save changes', 'done', 'apply']),
    );
  });
});

describe('resolveChatgptProjectSourceUploadActionLabelsForTest', () => {
  test('uses manifest-owned project source upload action labels', () => {
    expect(resolveChatgptProjectSourceUploadActionLabelsForTest()).toEqual(
      expect.arrayContaining(['upload', 'browse', 'upload file']),
    );
  });
});

describe('resolveChatgptProjectUrl', () => {
  test('builds project routes from the service manifest template', () => {
    expect(resolveChatgptProjectUrl('g-p-69c851be8cc88191afe109bea1b2a28d')).toBe(
      'https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project',
    );
  });
});

describe('classifyChatgptBlockingSurfaceProbe', () => {
  test('classifies rate limit surfaces', () => {
    expect(
      classifyChatgptBlockingSurfaceProbe({
        text: 'Too many requests. You are making requests too quickly. Please try again later.',
      }),
    ).toEqual({
      kind: 'rate-limit',
      summary: 'Too many requests.',
    });
  });

  test('classifies connection failures', () => {
    expect(
      classifyChatgptBlockingSurfaceProbe({
        text: 'Server connection failed. Please check your network and try again.',
      }),
    ).toEqual({
      kind: 'connection-failed',
      summary: 'Server connection failed.',
    });
  });

  test('classifies retry affordances on failed chat turns', () => {
    expect(
      classifyChatgptBlockingSurfaceProbe({
        text: 'Server connection failed.',
        buttonLabels: ['Retry'],
      }),
    ).toEqual({
      kind: 'retry-affordance',
      summary: 'retry',
    });
  });

  test('classifies generic transient error surfaces', () => {
    expect(
      classifyChatgptBlockingSurfaceProbe({
        text: 'Something went wrong while generating the response. Please try again.',
      }),
    ).toEqual({
      kind: 'transient-error',
      summary: 'Something went wrong while generating the response.',
    });
  });
});

describe('isRetryableChatgptTransientMessage', () => {
  test('treats known transient ChatGPT failures as retryable', () => {
    expect(isRetryableChatgptTransientMessage('Server connection failed.')).toBe(true);
    expect(isRetryableChatgptTransientMessage('Something went wrong. Please try again.')).toBe(true);
    expect(isRetryableChatgptTransientMessage('Too many requests.')).toBe(true);
  });

  test('does not mark unrelated text as retryable', () => {
    expect(isRetryableChatgptTransientMessage('Project settings')).toBe(false);
  });
});

describe('normalizeChatgptAuthSessionIdentity', () => {
  test('prefers auth session user email and id', () => {
    expect(
      normalizeChatgptAuthSessionIdentity({
        user: {
          id: 'user-PVyuqYSOU4adOEf6UCUK3eiK',
          name: 'Eric Cochra',
          email: 'ecochran76@gmail.com',
        },
        account: {
          id: '27e72181-04ee-4a6e-9859-ba8617766af4',
          name: 'Cochran Group',
          email: null,
        },
      }),
    ).toEqual({
      id: 'user-PVyuqYSOU4adOEf6UCUK3eiK',
      name: 'Eric Cochra',
      email: 'ecochran76@gmail.com',
      source: 'auth-session',
    });
  });

  test('falls back to account or storage-derived fields when user email is unavailable', () => {
    expect(
      normalizeChatgptAuthSessionIdentity({
        user: {
          id: null,
          name: 'Cochran Group',
          email: null,
        },
        account: {
          id: 'user-PVyuqYSOU4adOEf6UCUK3eiK',
          name: null,
          email: null,
        },
      }),
    ).toEqual({
      id: 'user-PVyuqYSOU4adOEf6UCUK3eiK',
      name: 'Cochran Group',
      email: undefined,
      source: 'auth-session',
    });
  });
});

describe('extractChatgptProjectSourceName', () => {
  test('prefers the concise leaf text over row metadata', () => {
    expect(
      extractChatgptProjectSourceName({
        rowText: '20251106-NSF GRFP Instructions.mdFile · Nov 6, 2025',
        leafTexts: [
          '20251106-NSF GRFP Instructions.mdFile · Nov 6, 2025',
          '20251106-NSF GRFP Instructions.md',
          'File · Nov 6, 2025',
        ],
      }),
    ).toBe('20251106-NSF GRFP Instructions.md');
  });

  test('falls back to stripping the trailing kind label from row text', () => {
    expect(
      extractChatgptProjectSourceName({
        rowText: 'Cochran_Faculty_Vita (15).pdfPDF · Oct 6, 2025',
        leafTexts: [],
      }),
    ).toBe('Cochran_Faculty_Vita (15).pdf');
  });
});

describe('matchesChatgptImageArtifactProbe', () => {
  test('matches image probes by file id when the artifact uri is concrete', () => {
    expect(
      matchesChatgptImageArtifactProbe(
        {
          src: 'https://files.oaiusercontent.com/file-abc123?se=1&id=file-xyz789',
          alt: 'irrelevant preview text',
        },
        {
          title: 'diagram.png',
          uri: 'chatgpt://file/file-xyz789',
        },
      ),
    ).toBe(true);
  });

  test('falls back to alt-text title matching when no file id is available', () => {
    expect(
      matchesChatgptImageArtifactProbe(
        {
          src: 'https://files.oaiusercontent.com/generated-image.png',
          alt: 'AuraCall Architecture Diagram preview',
        },
        {
          title: 'AuraCall Architecture Diagram',
          uri: undefined,
        },
      ),
    ).toBe(true);
  });

  test('rejects probes that do not match the image artifact identity', () => {
    expect(
      matchesChatgptImageArtifactProbe(
        {
          src: 'https://files.oaiusercontent.com/generated-image.png',
          alt: 'different artifact',
        },
        {
          title: 'AuraCall Architecture Diagram',
          uri: undefined,
        },
      ),
    ).toBe(false);
    expect(
      matchesChatgptImageArtifactProbe(
        {
          src: 'https://files.oaiusercontent.com/file-abc123?se=1&id=file-other',
          alt: 'AuraCall Architecture Diagram preview',
        },
        {
          title: 'AuraCall Architecture Diagram',
          uri: 'chatgpt://file/file-xyz789',
        },
      ),
    ).toBe(false);
  });
});

describe('normalizeChatgptConversationLinkProbes', () => {
  test('dedupes conversation ids and prefers concrete titles, urls, and project ids', () => {
    expect(
      normalizeChatgptConversationLinkProbes([
        {
          id: '69c93b5d-e6b0-8332-8c20-da466cc863da',
          title: '69c93b5d-e6b0-8332-8c20-da466cc863da',
        },
        {
          id: '69c93b5d-e6b0-8332-8c20-da466cc863da',
          title: 'AURACALL VERIFY PROBE',
          url: 'https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da',
        },
        {
          id: '69c93212-f180-8330-815b-5f831fc395e6',
          title: 'AURACALL CHATGPT REQUEST',
          projectId: 'g-p-69c851be8cc88191afe109bea1b2a28d-oracle',
          url: 'https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d-oracle/c/69c93212-f180-8330-815b-5f831fc395e6',
        },
      ]),
    ).toEqual([
      {
        id: '69c93b5d-e6b0-8332-8c20-da466cc863da',
        title: 'AURACALL VERIFY PROBE',
        provider: 'chatgpt',
        url: 'https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da',
      },
      {
        id: '69c93212-f180-8330-815b-5f831fc395e6',
        title: 'AURACALL CHATGPT REQUEST',
        provider: 'chatgpt',
        projectId: 'g-p-69c851be8cc88191afe109bea1b2a28d',
        url: 'https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d-oracle/c/69c93212-f180-8330-815b-5f831fc395e6',
      },
    ]);
  });

  test('prefers a shorter authoritative title over a concatenated title+preview string', () => {
    expect(
      normalizeChatgptConversationLinkProbes([
        {
          id: '69cac4d9-dcb8-8330-bace-c259f9d386bb',
          title: 'AC GPT PC bqeekfReply exactly with CHATGPT ACCEPT PROJECT CHAT bqeekf.',
          projectId: 'g-p-69cac42e3728819197f969fb4afa0e84',
          url: 'https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb',
        },
        {
          id: '69cac4d9-dcb8-8330-bace-c259f9d386bb',
          title: 'AC GPT PC bqeekf',
          projectId: 'g-p-69cac42e3728819197f969fb4afa0e84',
          url: 'https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb',
        },
      ]),
    ).toEqual([
      {
        id: '69cac4d9-dcb8-8330-bace-c259f9d386bb',
        title: 'AC GPT PC bqeekf',
        provider: 'chatgpt',
        projectId: 'g-p-69cac42e3728819197f969fb4afa0e84',
        url: 'https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb',
      },
    ]);
  });

  test('does not keep a generic ChatGPT title when a concrete row title exists', () => {
    expect(
      normalizeChatgptConversationLinkProbes([
        {
          id: '69cc7121-eca0-832c-ab8a-9dde700e87d7',
          title: 'ChatGPT',
          projectId: 'g-p-69cc275fdfac8191be921387165ca803',
          url: 'https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7',
        },
        {
          id: '69cc7121-eca0-832c-ab8a-9dde700e87d7',
          title: 'AC GPT PC live exact',
          projectId: 'g-p-69cc275fdfac8191be921387165ca803',
          url: 'https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7',
        },
      ]),
    ).toEqual([
      {
        id: '69cc7121-eca0-832c-ab8a-9dde700e87d7',
        title: 'AC GPT PC live exact',
        provider: 'chatgpt',
        projectId: 'g-p-69cc275fdfac8191be921387165ca803',
        url: 'https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7',
      },
    ]);
  });
});

describe('normalizeChatgptConversationFileProbes', () => {
  test('emits stable conversation file refs from user-turn probes', () => {
    expect(
      normalizeChatgptConversationFileProbes('69c95f14-2ca0-8329-9d3a-be5d1a1967ab', [
        {
          turnId: '1411ca60-9384-407a-a39a-ce9b772c737a',
          messageId: '1411ca60-9384-407a-a39a-ce9b772c737a',
          tileIndex: 0,
          name: 'chatgpt-real-upload-vmuk.txt',
          label: 'Document',
        },
        {
          turnId: '1411ca60-9384-407a-a39a-ce9b772c737a',
          messageId: '1411ca60-9384-407a-a39a-ce9b772c737a',
          tileIndex: 0,
          name: 'chatgpt-real-upload-vmuk.txt',
          label: 'Document',
        },
      ]),
    ).toEqual([
      {
        id: '69c95f14-2ca0-8329-9d3a-be5d1a1967ab:1411ca60-9384-407a-a39a-ce9b772c737a:0:chatgpt-real-upload-vmuk.txt',
        name: 'chatgpt-real-upload-vmuk.txt',
        provider: 'chatgpt',
        source: 'conversation',
        metadata: {
          label: 'Document',
          turnId: '1411ca60-9384-407a-a39a-ce9b772c737a',
          messageId: '1411ca60-9384-407a-a39a-ce9b772c737a',
        },
      },
    ]);
  });
});

describe('extractChatgptConversationSourcesFromPayload', () => {
  test('normalizes file citations and dedupes content references against citations', () => {
    expect(
      extractChatgptConversationSourcesFromPayload(
        {
          mapping: {
            assistant: {
              message: {
                id: 'assist-1',
                author: { role: 'assistant' },
                content: { parts: ['answer'] },
                metadata: {
                  content_references: [
                    {
                      type: 'file',
                      name: 'proof.pdf',
                      id: 'file_0001',
                      source: 'my_files',
                    },
                  ],
                  citations: [
                    {
                      reference: {
                        type: 'file',
                        name: 'proof.pdf',
                        id: 'file_0001',
                        source: 'my_files',
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        new Map([['assist-1', 1]]),
      ),
    ).toEqual([
      {
        url: 'chatgpt://file/file_0001',
        title: 'proof.pdf',
        domain: 'chatgpt-file',
        messageIndex: 1,
        sourceGroup: 'my_files',
      },
    ]);
  });
});

describe('extractChatgptConversationArtifactsFromPayload', () => {
  test('extracts downloadable sandbox artifacts from assistant markdown', () => {
    expect(
      extractChatgptConversationArtifactsFromPayload(
        {
          mapping: {
            assistant: {
              message: {
                id: 'assist-2',
                author: { role: 'assistant' },
                content: {
                  parts: [
                    'Files:\n[updated skill.zip](sandbox:/mnt/data/skilldist_papers_fix/skill.zip)\n[combined JSON extraction](sandbox:/mnt/data/papers_fixed_extract.json)',
                  ],
                },
              },
            },
          },
        },
        new Map([['assist-2', 3]]),
      ),
    ).toEqual([
      {
        id: 'assist-2:download:sandbox:/mnt/data/skilldist_papers_fix/skill.zip',
        title: 'updated skill.zip',
        kind: 'download',
        uri: 'sandbox:/mnt/data/skilldist_papers_fix/skill.zip',
        messageIndex: 3,
        messageId: 'assist-2',
      },
      {
        id: 'assist-2:download:sandbox:/mnt/data/papers_fixed_extract.json',
        title: 'combined JSON extraction',
        kind: 'download',
        uri: 'sandbox:/mnt/data/papers_fixed_extract.json',
        messageIndex: 3,
        messageId: 'assist-2',
      },
    ]);
  });

  test('classifies spreadsheet-like sandbox downloads as spreadsheet artifacts', () => {
    expect(
      extractChatgptConversationArtifactsFromPayload(
        {
          mapping: {
            assistant: {
              message: {
                id: 'assist-sheet-1',
                author: { role: 'assistant' },
                content: {
                  parts: [
                    '[parabola_trendline_demo.xlsx](sandbox:/mnt/data/parabola_trendline_demo.xlsx)',
                  ],
                },
              },
            },
          },
        },
        new Map([['assist-sheet-1', 2]]),
      ),
    ).toEqual([
      {
        id: 'assist-sheet-1:download:sandbox:/mnt/data/parabola_trendline_demo.xlsx',
        title: 'parabola_trendline_demo.xlsx',
        kind: 'spreadsheet',
        uri: 'sandbox:/mnt/data/parabola_trendline_demo.xlsx',
        messageIndex: 2,
        messageId: 'assist-sheet-1',
      },
    ]);
  });

  test('extracts canvas artifacts and carries forward code preview metadata', () => {
    expect(
      extractChatgptConversationArtifactsFromPayload(
        {
          mapping: {
            code: {
              message: {
                id: 'code-1',
                author: { role: 'assistant' },
                content: {
                  content_type: 'code',
                  parts: ['{"name":"probe.txt","type":"document","content":"AURACALL CHATGPT CANVAS PROBE 1."}'],
                },
              },
            },
            tool: {
              message: {
                id: 'tool-1',
                author: { role: 'tool' },
                metadata: {
                  command: 'create_textdoc',
                  canvas: {
                    textdoc_id: '69c8a1018ea08191b3e3cbdb038221e4',
                    textdoc_type: 'document',
                    version: 1,
                    title: 'Probe',
                    create_source: 'system_hint_canvas',
                  },
                },
              },
            },
          },
        },
        new Map([['tool-1', 4]]),
      ),
    ).toEqual([
      {
        id: 'canvas:69c8a1018ea08191b3e3cbdb038221e4',
        title: 'Probe',
        kind: 'canvas',
        uri: 'chatgpt://canvas/69c8a1018ea08191b3e3cbdb038221e4',
        messageIndex: 4,
        messageId: 'tool-1',
        metadata: {
          textdocId: '69c8a1018ea08191b3e3cbdb038221e4',
          textdocType: 'document',
          version: 1,
          createSource: 'system_hint_canvas',
          command: 'create_textdoc',
          documentName: 'probe.txt',
          documentType: 'document',
          contentText: 'AURACALL CHATGPT CANVAS PROBE 1.',
        },
      },
    ]);
  });

  test('extracts generated image artifacts from tool multimodal payloads', () => {
    expect(
      extractChatgptConversationArtifactsFromPayload(
        {
          mapping: {
            image: {
              message: {
                id: 'tool-image-1',
                author: { role: 'tool' },
                content: {
                  content_type: 'multimodal_text',
                  parts: [
                    JSON.stringify({
                      content_type: 'image_asset_pointer',
                      asset_pointer: 'sediment://file_00000000000000000000000000000001',
                      size_bytes: 450123,
                      width: 1024,
                      height: 1024,
                      metadata: {
                        generation: {
                          gen_id: 'gen-123',
                          size: '1024x1024',
                        },
                        dalle: {
                          prompt: 'A calm lake at sunrise',
                        },
                      },
                    }),
                  ],
                },
                metadata: {
                  title: 'Sunrise lake',
                },
              },
            },
          },
        },
        new Map([['tool-image-1', 6]]),
      ),
    ).toEqual([
      {
        id: 'tool-image-1:image:sediment://file_00000000000000000000000000000001',
        title: 'Sunrise lake',
        kind: 'image',
        uri: 'sediment://file_00000000000000000000000000000001',
        messageIndex: 6,
        messageId: 'tool-image-1',
        metadata: {
          contentType: 'image_asset_pointer',
          assetPointer: 'sediment://file_00000000000000000000000000000001',
          sizeBytes: 450123,
          width: 1024,
          height: 1024,
          generation: {
            gen_id: 'gen-123',
            size: '1024x1024',
          },
          dalle: {
            prompt: 'A calm lake at sunrise',
          },
        },
      },
    ]);
  });

  test('extracts spreadsheet artifacts from ada visualizations', () => {
    expect(
      extractChatgptConversationArtifactsFromPayload(
        {
          mapping: {
            table: {
              message: {
                id: 'tool-table-1',
                author: { role: 'tool' },
                metadata: {
                  ada_visualizations: [
                    {
                      type: 'table',
                      file_id: 'file-dtzUOh5KSZFM2ZdWH83pbrfO',
                      title: 'New Patents with ISURF Numbers',
                    },
                  ],
                },
              },
            },
          },
        },
        new Map([['tool-table-1', 7]]),
      ),
    ).toEqual([
      {
        id: 'spreadsheet:file-dtzUOh5KSZFM2ZdWH83pbrfO',
        title: 'New Patents with ISURF Numbers',
        kind: 'spreadsheet',
        uri: 'chatgpt://file/file-dtzUOh5KSZFM2ZdWH83pbrfO',
        messageIndex: 7,
        messageId: 'tool-table-1',
        metadata: {
          visualizationType: 'table',
          fileId: 'file-dtzUOh5KSZFM2ZdWH83pbrfO',
        },
      },
    ]);
  });

  test('uses manifest-backed default artifact titles when payload titles are absent', () => {
    expect(
      extractChatgptConversationArtifactsFromPayload({
        mapping: {
          image: {
            message: {
              id: 'tool-image-untitled',
              author: { role: 'tool' },
              content: {
                content_type: 'multimodal_text',
                parts: [
                  JSON.stringify({
                    content_type: 'image_asset_pointer',
                    asset_pointer: 'sediment://file_untitled_image',
                  }),
                ],
              },
            },
          },
          table: {
            message: {
              id: 'tool-table-untitled',
              author: { role: 'tool' },
              metadata: {
                ada_visualizations: [
                  {
                    type: 'table',
                  },
                ],
              },
            },
          },
          canvas: {
            message: {
              id: 'tool-canvas-untitled',
              author: { role: 'tool' },
              metadata: {
                canvas: {
                  textdoc_id: 'canvas-untitled',
                },
              },
            },
          },
        },
      }),
    ).toEqual([
      {
        id: 'tool-image-untitled:image:sediment://file_untitled_image',
        title: 'Generated image',
        kind: 'image',
        uri: 'sediment://file_untitled_image',
        messageId: 'tool-image-untitled',
        metadata: {
          contentType: 'image_asset_pointer',
          assetPointer: 'sediment://file_untitled_image',
        },
      },
      {
        id: 'tool-table-untitled:spreadsheet',
        title: 'Spreadsheet artifact',
        kind: 'spreadsheet',
        messageId: 'tool-table-untitled',
        metadata: {
          visualizationType: 'table',
        },
      },
      {
        id: 'canvas:canvas-untitled',
        title: 'Canvas artifact',
        kind: 'canvas',
        uri: 'chatgpt://canvas/canvas-untitled',
        messageId: 'tool-canvas-untitled',
        metadata: {
          textdocId: 'canvas-untitled',
        },
      },
    ]);
  });
});

describe('normalizeChatgptConversationDownloadArtifactProbes', () => {
  test('normalizes visible behavior-button downloads into synthetic artifacts', () => {
    expect(
      normalizeChatgptConversationDownloadArtifactProbes([
        {
          turnId: 'turn-1',
          messageId: 'assist-dom-1',
          messageIndex: 3,
          buttonIndex: 0,
          title: 'Fresh investigation bundle',
        },
        {
          turnId: 'turn-1',
          messageId: 'assist-dom-1',
          messageIndex: 3,
          buttonIndex: 0,
          title: 'Fresh investigation bundle',
        },
      ]),
    ).toEqual([
      {
        id: 'download-dom:turn-1:0',
        title: 'Fresh investigation bundle',
        kind: 'download',
        uri: 'chatgpt://download-button/turn-1/0',
        messageIndex: 3,
        messageId: 'assist-dom-1',
        metadata: {
          extraction: 'dom-behavior-button',
          turnId: 'turn-1',
          buttonIndex: 0,
        },
      },
    ]);
  });

  test('classifies spreadsheet-like button titles as spreadsheet artifacts', () => {
    expect(
      normalizeChatgptConversationDownloadArtifactProbes([
        {
          turnId: 'turn-2',
          messageIndex: 5,
          buttonIndex: 1,
          title: 'Download workbook.xlsx',
        },
      ]),
    ).toEqual([
      {
        id: 'download-dom:turn-2:1',
        title: 'Download workbook.xlsx',
        kind: 'spreadsheet',
        uri: 'chatgpt://download-button/turn-2/1',
        messageIndex: 5,
        metadata: {
          extraction: 'dom-behavior-button',
          turnId: 'turn-2',
          buttonIndex: 1,
        },
      },
    ]);
  });

  test('classifies ods downloads as spreadsheet artifacts via manifest taxonomy', () => {
    expect(
      normalizeChatgptConversationDownloadArtifactProbes([
        {
          turnId: 'turn-3',
          messageIndex: 6,
          buttonIndex: 2,
          title: 'Analysis export.ods',
        },
      ]),
    ).toEqual([
      {
        id: 'download-dom:turn-3:2',
        title: 'Analysis export.ods',
        kind: 'spreadsheet',
        uri: 'chatgpt://download-button/turn-3/2',
        messageIndex: 6,
        metadata: {
          extraction: 'dom-behavior-button',
          turnId: 'turn-3',
          buttonIndex: 2,
        },
      },
    ]);
  });
});

describe('mergeChatgptConversationArtifacts', () => {
  test('keeps payload artifacts authoritative and appends DOM-only artifacts', () => {
    expect(
      mergeChatgptConversationArtifacts(
        [
          {
            id: 'assist-1:download:sandbox:/mnt/data/comment_demo.docx',
            title: 'Download the DOCX',
            kind: 'download',
            uri: 'sandbox:/mnt/data/comment_demo.docx',
            messageIndex: 2,
          },
        ],
        [
          {
            id: 'download-dom:turn-1:0',
            title: 'Download the DOCX',
            kind: 'download',
            uri: 'chatgpt://download-button/turn-1/0',
            messageIndex: 2,
          },
          {
            id: 'download-dom:turn-2:0',
            title: 'Fresh investigation bundle',
            kind: 'download',
            uri: 'chatgpt://download-button/turn-2/0',
            messageIndex: 4,
          },
        ],
      ),
    ).toEqual([
      {
        id: 'assist-1:download:sandbox:/mnt/data/comment_demo.docx',
        title: 'Download the DOCX',
        kind: 'download',
        uri: 'sandbox:/mnt/data/comment_demo.docx',
        messageIndex: 2,
      },
      {
        id: 'download-dom:turn-2:0',
        title: 'Fresh investigation bundle',
        kind: 'download',
        uri: 'chatgpt://download-button/turn-2/0',
        messageIndex: 4,
      },
    ]);
  });
});

describe('mergeChatgptCanvasArtifactContent', () => {
  test('fills missing canvas content from visible textdoc probes', () => {
    expect(
      mergeChatgptCanvasArtifactContent(
        [
          {
            id: 'canvas:69caaa25d42081919961766acc4b79a1',
            title: 'Short Document With Comments',
            kind: 'canvas',
            uri: 'chatgpt://canvas/69caaa25d42081919961766acc4b79a1',
            metadata: {
              textdocId: '69caaa25d42081919961766acc4b79a1',
            },
          },
        ],
        [
          {
            textdocId: '69caaa25d42081919961766acc4b79a1',
            title: 'Short Document With Comments',
            contentText: 'Sample Document\nThe final paragraph concludes the document.',
          },
        ],
      ),
    ).toEqual([
      {
        id: 'canvas:69caaa25d42081919961766acc4b79a1',
        title: 'Short Document With Comments',
        kind: 'canvas',
        uri: 'chatgpt://canvas/69caaa25d42081919961766acc4b79a1',
        metadata: {
          textdocId: '69caaa25d42081919961766acc4b79a1',
          contentText: 'Sample Document\nThe final paragraph concludes the document.',
        },
      },
    ]);
  });
});

describe('serializeChatgptGridRowsToCsv', () => {
  test('quotes cells with commas, quotes, and newlines', () => {
    expect(
      serializeChatgptGridRowsToCsv([
        ['id', 'title', 'notes'],
        ['1', 'alpha,beta', 'line 1\nline "2"'],
      ]),
    ).toBe('id,title,notes\n1,"alpha,beta","line 1\nline ""2"""');
  });
});

describe('normalizeChatgptProjectSourceProbes', () => {
  test('dedupes rows and emits project-scoped file refs', () => {
    expect(
      normalizeChatgptProjectSourceProbes([
        {
          rowText: 'spec.mdFile · Mar 28, 2026',
          leafTexts: ['spec.mdFile · Mar 28, 2026', 'spec.md', 'File · Mar 28, 2026'],
          metadataText: 'File · Mar 28, 2026',
        },
        {
          rowText: 'spec.mdFile · Mar 28, 2026',
          leafTexts: ['spec.md'],
          metadataText: 'File · Mar 28, 2026',
        },
      ]),
    ).toEqual([
      {
        id: 'spec.md',
        name: 'spec.md',
        provider: 'chatgpt',
        source: 'project',
        metadata: {
          label: 'File · Mar 28, 2026',
        },
      },
    ]);
  });
});

describe('findChatgptProjectSourceName', () => {
  test('returns the canonical matched source name from normalized file refs', () => {
    expect(
      findChatgptProjectSourceName(
        [
          { name: 'Spec.md' },
          { name: 'notes.txt' },
        ],
        'spec.md',
      ),
    ).toBe('Spec.md');
  });

  test('returns null when the normalized source name is absent', () => {
    expect(
      findChatgptProjectSourceName(
        [
          { name: 'notes.txt' },
        ],
        'spec.md',
      ),
    ).toBeNull();
  });
});

describe('matchesChatgptProjectSettingsSnapshot', () => {
  test('matches by persisted project name only when requested', () => {
    expect(
      matchesChatgptProjectSettingsSnapshot(
        {
          name: 'AC GPT R test',
          text: 'instructions',
        },
        { name: 'AC GPT R test' },
      ),
    ).toBe(true);
  });

  test('matches by normalized instructions only when requested', () => {
    expect(
      matchesChatgptProjectSettingsSnapshot(
        {
          name: 'AC GPT R test',
          text: 'Line 1\n\nLine 2',
        },
        { instructions: 'Line 1\n\nLine 2' },
      ),
    ).toBe(true);
  });

  test('requires both name and instructions when both are requested', () => {
    expect(
      matchesChatgptProjectSettingsSnapshot(
        {
          name: 'AC GPT R test',
          text: 'Line 1',
        },
        {
          name: 'AC GPT R test',
          instructions: 'Different line',
        },
      ),
    ).toBe(false);
  });
});

describe('normalizeProjectMemoryMode', () => {
  test('accepts the user-facing global alias', () => {
    expect(normalizeProjectMemoryMode('global')).toBe('global');
    expect(normalizeProjectMemoryMode('default')).toBe('global');
  });

  test('accepts the user-facing project alias', () => {
    expect(normalizeProjectMemoryMode('project')).toBe('project');
    expect(normalizeProjectMemoryMode('project-only')).toBe('project');
  });
});

describe('matchesChatgptDeleteConfirmationProbe', () => {
  test('accepts the native delete dialog when the confirm button is visible even if title text drifted', () => {
    expect(
      matchesChatgptDeleteConfirmationProbe(
        {
          dialogText: 'Delete chat? This will delete AC GPT C seodiu. Delete Cancel',
          buttonLabels: ['Delete', 'Cancel'],
          hasVisibleConfirmButton: true,
        },
        'Older page title that no longer matches',
      ),
    ).toBe(true);
  });

  test('still requires the expected title when no visible confirm button is present', () => {
    expect(
      matchesChatgptDeleteConfirmationProbe(
        {
          dialogText: 'Delete chat? This will delete AC GPT C seodiu. Delete Cancel',
          buttonLabels: ['Delete', 'Cancel'],
          hasVisibleConfirmButton: false,
        },
        'Older page title that no longer matches',
      ),
    ).toBe(false);
  });
});

describe('matchesChatgptProjectDeleteConfirmationProbe', () => {
  test('accepts the project delete dialog when the expected buttons are visible', () => {
    expect(
      matchesChatgptProjectDeleteConfirmationProbe({
        dialogText:
          'Delete project? This will permanently delete all project files and chats. To save chats, move them to your chat list or another project before deleting. Delete Cancel',
        buttonLabels: ['Delete', 'Cancel'],
      }),
    ).toBe(true);
  });

  test('rejects non-project dialogs even if delete and cancel buttons exist', () => {
    expect(
      matchesChatgptProjectDeleteConfirmationProbe({
        dialogText: 'Delete chat? This will delete AC GPT C seodiu. Delete Cancel',
        buttonLabels: ['Delete', 'Cancel'],
      }),
    ).toBe(false);
  });
});

describe('matchesChatgptConversationTitleProbe', () => {
  test('accepts a matching root conversation row even when another row remains at the top', () => {
    expect(
      matchesChatgptConversationTitleProbe(
        {
          matchedConversationId: '69cb3741-2f58-832f-a6ae-f28779f30741',
          matchedProjectId: null,
          matchedTitle: 'AC GPT C tpuivt',
          topConversationId: '69ca9d71-1a04-8332-abe1-830d327b2a65',
          topTitle: 'Something else',
        },
        '69cb3741-2f58-832f-a6ae-f28779f30741',
        'AC GPT C tpuivt',
      ),
    ).toBe(true);
  });

  test('requires the matching row to be top for strict root checks', () => {
    expect(
      matchesChatgptConversationTitleProbe(
        {
          matchedConversationId: '69cb3741-2f58-832f-a6ae-f28779f30741',
          matchedProjectId: null,
          matchedTitle: 'AC GPT C tpuivt',
          topConversationId: '69ca9d71-1a04-8332-abe1-830d327b2a65',
          topTitle: 'Something else',
        },
        '69cb3741-2f58-832f-a6ae-f28779f30741',
        'AC GPT C tpuivt',
        null,
        { requireTopForRootMatch: true },
      ),
    ).toBe(false);
  });

  test('passes strict root checks when the matching row is already top', () => {
    expect(
      matchesChatgptConversationTitleProbe(
        {
          matchedConversationId: '69cb3741-2f58-832f-a6ae-f28779f30741',
          matchedProjectId: null,
          matchedTitle: 'AC GPT C tpuivt',
          topConversationId: '69cb3741-2f58-832f-a6ae-f28779f30741',
          topTitle: 'AC GPT C tpuivt',
        },
        '69cb3741-2f58-832f-a6ae-f28779f30741',
        'AC GPT C tpuivt',
        null,
        { requireTopForRootMatch: true },
      ),
    ).toBe(true);
  });

  test('accepts root conversation page-title fallback when the sidebar row is unavailable', () => {
    expect(
      matchesChatgptConversationTitleProbe(
        {
          routeConversationId: '69cb3741-2f58-832f-a6ae-f28779f30741',
          routeProjectId: null,
          documentTitle: 'AC GPT C tpuivt - ChatGPT',
        },
        '69cb3741-2f58-832f-a6ae-f28779f30741',
        'AC GPT C tpuivt',
      ),
    ).toBe(true);
  });

  test('does not apply the root page-title fallback to project conversations', () => {
    expect(
      matchesChatgptConversationTitleProbe(
        {
          routeConversationId: '69cb3741-2f58-832f-a6ae-f28779f30741',
          routeProjectId: 'g-p-69c851be8cc88191afe109bea1b2a28d',
          documentTitle: 'AC GPT C tpuivt - ChatGPT',
        },
        '69cb3741-2f58-832f-a6ae-f28779f30741',
        'AC GPT C tpuivt',
        'g-p-69c851be8cc88191afe109bea1b2a28d',
      ),
    ).toBe(false);
  });
});

describe('matchesChatgptRenameEditorProbe', () => {
  test('accepts the visible title editor input', () => {
    expect(
      matchesChatgptRenameEditorProbe({
        inputName: 'title-editor',
        value: 'AC GPT C tpuivt',
        active: true,
      }),
    ).toBe(true);
  });

  test('rejects unrelated active text inputs', () => {
    expect(
      matchesChatgptRenameEditorProbe({
        inputName: 'search',
        value: 'AC GPT C tpuivt',
        active: true,
      }),
    ).toBe(false);
  });

  test('rejects missing probes', () => {
    expect(matchesChatgptRenameEditorProbe(null)).toBe(false);
  });
});

describe('resolveChatgptConversationUrl', () => {
  test('builds a root conversation route when no project is supplied', () => {
    expect(resolveChatgptConversationUrl('69c93b5d-e6b0-8332-8c20-da466cc863da')).toBe(
      'https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da',
    );
  });

  test('builds a canonical project conversation route from a bare or slugged project id', () => {
    expect(
      resolveChatgptConversationUrl(
        '69c93212-f180-8330-815b-5f831fc395e6',
        'g-p-69c851be8cc88191afe109bea1b2a28d-oracle',
      ),
    ).toBe('https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/c/69c93212-f180-8330-815b-5f831fc395e6');
  });
});

describe('createChatgptAdapter', () => {
  test('advertises project and conversation support', () => {
    expect(createChatgptAdapter().capabilities).toEqual({
      projects: true,
      conversations: true,
      instructions: true,
      files: true,
    });
  });
});
