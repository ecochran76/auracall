import { describe, expect, it } from 'vitest';
import {
  buildGeminiActivityEvidenceExpression,
  coerceGeminiActivityEvidence,
} from '../../src/browser/providers/geminiEvidence.js';

describe('Gemini activity evidence helpers', () => {
  it('recomputes generating state from spinner/media/stop evidence when needed', () => {
    expect(
      coerceGeminiActivityEvidence({
        hasActiveAvatarSpinner: false,
        hasGeneratedMedia: false,
        hasStopControl: true,
      }),
    ).toMatchObject({
      hasActiveAvatarSpinner: false,
      hasGeneratedMedia: false,
      hasStopControl: true,
      isGenerating: true,
    });

    expect(
      coerceGeminiActivityEvidence({
        hasActiveAvatarSpinner: false,
        hasGeneratedMedia: true,
        hasStopControl: true,
      }),
    ).toMatchObject({
      hasGeneratedMedia: true,
      hasStopControl: true,
      isGenerating: false,
    });
  });

  it('keeps the Gemini activity selector contract in one generated expression', () => {
    const expression = buildGeminiActivityEvidenceExpression();

    expect(expression).toContain('avatar_primary_animation.is-gpi-avatar');
    expect(expression).toContain('[lottie-animation].avatar_primary_animation.is-gpi-avatar');
    expect(expression).toContain('download-generated-image-button');
    expect(expression).toContain('cancel generation');
  });
});
