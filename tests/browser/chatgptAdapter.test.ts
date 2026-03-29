import { describe, expect, test } from 'vitest';
import { normalizeProjectMemoryMode } from '../../src/browser/providers/domain.js';
import {
  extractChatgptProjectIdFromUrl,
  findChatgptProjectByName,
  normalizeChatgptAuthSessionIdentity,
  normalizeChatgptProjectId,
  resolveChatgptProjectMemoryLabel,
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
