export interface GeminiActivityEvidence {
  hasActiveAvatarSpinner: boolean;
  hasGeneratedMedia: boolean;
  hasStopControl: boolean;
  isGenerating: boolean;
}

export function buildGeminiActivityEvidenceExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const hasActiveAvatarSpinner = Array.from(document.querySelectorAll(
      [
        'model-response .avatar_primary_animation.is-gpi-avatar',
        'model-response [lottie-animation].avatar_primary_animation',
        'model-response .avatar_primary_model.is-gpi-avatar',
        '[lottie-animation].avatar_primary_animation.is-gpi-avatar',
        '.avatar_primary_model.is-gpi-avatar .avatar_primary_animation',
      ].join(', ')
    )).some((node) => visible(node));
    const hasGeneratedMedia = Array.from(document.querySelectorAll(
      'model-response img.image, model-response img.loaded, model-response button.image-button, model-response button[data-test-id="download-generated-image-button"], model-response video'
    )).some((node) => visible(node));
    const hasStopControl = Array.from(document.querySelectorAll('button')).some((node) => {
      if (!visible(node)) return false;
      const label = normalize(\`\${node.getAttribute('aria-label') || ''} \${node.textContent || ''}\`).toLowerCase();
      return label.includes('stop') || label.includes('cancel generation');
    });
    return {
      hasActiveAvatarSpinner,
      hasGeneratedMedia,
      hasStopControl,
      isGenerating: hasActiveAvatarSpinner || (hasStopControl && !hasGeneratedMedia),
    };
  })()`;
}

export function coerceGeminiActivityEvidence(value: unknown): GeminiActivityEvidence {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const hasActiveAvatarSpinner = Boolean(record.hasActiveAvatarSpinner);
  const hasGeneratedMedia = Boolean(record.hasGeneratedMedia);
  const hasStopControl = Boolean(record.hasStopControl);
  return {
    hasActiveAvatarSpinner,
    hasGeneratedMedia,
    hasStopControl,
    isGenerating:
      typeof record.isGenerating === 'boolean'
        ? record.isGenerating
        : hasActiveAvatarSpinner || (hasStopControl && !hasGeneratedMedia),
  };
}
