export const GROK_MODEL_LABEL_NORMALIZER = `(text) => {
  const cleaned = (text || '').replace(/\\s+/g, ' ').trim();
  return cleaned.split('\\\\n')[0] || cleaned;
}`;

export function normalizeGrokModelLabel(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.split('\n')[0] || cleaned;
}
