import { describe, expect, test } from 'vitest';
import {
  alignPromptEchoPair,
  buildPromptEchoMatcher,
  reconcileAssistantRepresentations,
} from '../../src/browser/reattachHelpers.ts';

describe('alignPromptEchoPair', () => {
  test('aligns answer text when text is a prompt echo', () => {
    const matcher = buildPromptEchoMatcher('Echo prompt');
    expect(matcher).not.toBeNull();
    const result = alignPromptEchoPair('Echo prompt', 'Real answer', matcher);
    expect(result.answerText).toBe('Real answer');
    expect(result.answerMarkdown).toBe('Real answer');
    expect(result.isEcho).toBe(false);
  });

  test('aligns answer markdown when markdown is a prompt echo', () => {
    const matcher = buildPromptEchoMatcher('Echo prompt');
    expect(matcher).not.toBeNull();
    const result = alignPromptEchoPair('Real answer', 'Echo prompt', matcher);
    expect(result.answerText).toBe('Real answer');
    expect(result.answerMarkdown).toBe('Real answer');
    expect(result.isEcho).toBe(false);
  });

  test('keeps echo flag when both text and markdown are prompt echoes', () => {
    const matcher = buildPromptEchoMatcher('Echo prompt');
    expect(matcher).not.toBeNull();
    const result = alignPromptEchoPair('Echo prompt', 'Echo prompt', matcher);
    expect(result.isEcho).toBe(true);
  });
});

describe('reconcileAssistantRepresentations', () => {
  test('prefers stable DOM when copied markdown loses one substantive digit', () => {
    const result = reconcileAssistantRepresentations({
      capturedText: 'Corpus: 150 total; 12 keep; 138 remove.',
      copiedMarkdown: 'Corpus: **150 total; 1 keep; 138 remove**.',
      finalDomText: 'Corpus: 150 total; 12 keep; 138 remove.',
    });

    expect(result).toMatchObject({
      answerText: 'Corpus: 150 total; 12 keep; 138 remove.',
      answerMarkdown: 'Corpus: 150 total; 12 keep; 138 remove.',
      decision: 'stable-dom-substantive-mismatch',
    });
    expect(result.evidence).toMatchObject({ substantiveMismatch: true });
    expect(JSON.stringify(result.evidence)).not.toContain('Corpus');
  });

  test('prefers stable DOM for a substantive word omission', () => {
    expect(
      reconcileAssistantRepresentations({
        capturedText: 'No additional approval is required.',
        copiedMarkdown: 'No approval is required.',
        finalDomText: 'No additional approval is required.',
      }),
    ).toMatchObject({
      answerText: 'No additional approval is required.',
      answerMarkdown: 'No additional approval is required.',
      decision: 'stable-dom-substantive-mismatch',
    });
  });

  test.each([
    ['emphasis', 'Corpus: **150 total; 12 keep; 138 remove**.', 'Corpus: 150 total; 12 keep; 138 remove.'],
    ['inline code', 'Stage: `evidence_gap_review`.', 'Stage: evidence_gap_review.'],
    ['link', 'See [the receipt](https://example.invalid/receipt).', 'See the receipt.'],
    ['list', '- 150 total\n- 12 keep\n- 138 remove', '150 total\n12 keep\n138 remove'],
    ['whitespace', '150 total;   12 keep;\n138 remove', '150 total; 12 keep; 138 remove'],
  ])('preserves copied markdown for formatting-only %s differences', (_label, copiedMarkdown, finalDomText) => {
    const result = reconcileAssistantRepresentations({
      capturedText: finalDomText,
      copiedMarkdown,
      finalDomText,
    });

    expect(result.answerText).toBe(finalDomText);
    expect(result.answerMarkdown).toBe(copiedMarkdown);
    expect(result.decision).toBe('copied-markdown-equivalent');
    expect(result.evidence.substantiveMismatch).toBe(false);
  });

  test('keeps the captured response when no final DOM snapshot is available', () => {
    expect(
      reconcileAssistantRepresentations({
        capturedText: 'Captured answer',
        copiedMarkdown: '**Captured answer**',
        finalDomText: '',
      }),
    ).toMatchObject({
      answerText: 'Captured answer',
      answerMarkdown: '**Captured answer**',
      decision: 'captured-with-copied-markdown',
    });
  });

  test('does not replace a captured response with a final DOM prompt echo', () => {
    expect(
      reconcileAssistantRepresentations({
        capturedText: 'Real answer',
        copiedMarkdown: '**Real answer**',
        finalDomText: 'Original prompt',
        finalDomIsPromptEcho: true,
      }),
    ).toMatchObject({
      answerText: 'Real answer',
      answerMarkdown: '**Real answer**',
      decision: 'captured-with-copied-markdown',
    });
  });
});
