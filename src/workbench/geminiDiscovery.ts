import type { WorkbenchCapability } from './types.js';

interface GeminiFeatureObject {
  modes?: unknown;
  disabled_modes?: unknown;
  deep_research?: unknown;
  signed_out?: unknown;
  toggles?: unknown;
  detected?: unknown;
  configured?: unknown;
}

const GEMINI_MODE_TO_CAPABILITY: Record<string, Pick<WorkbenchCapability, 'id' | 'category' | 'output' | 'safety'>> = {
  'create image': {
    id: 'gemini.media.create_image',
    category: 'media',
    output: { artifactTypes: ['image'] },
    safety: {},
  },
  images: {
    id: 'gemini.media.create_image',
    category: 'media',
    output: { artifactTypes: ['image'] },
    safety: {},
  },
  'create music': {
    id: 'gemini.media.create_music',
    category: 'media',
    output: {
      artifactTypes: ['music', 'video/mp4'],
      description: 'Gemini music can render through a video transport artifact.',
    },
    safety: { mayTakeMinutes: true },
  },
  music: {
    id: 'gemini.media.create_music',
    category: 'media',
    output: {
      artifactTypes: ['music', 'video/mp4'],
      description: 'Gemini music can render through a video transport artifact.',
    },
    safety: { mayTakeMinutes: true },
  },
  'create video': {
    id: 'gemini.media.create_video',
    category: 'media',
    output: { artifactTypes: ['video'] },
    safety: { mayTakeMinutes: true, maySpendCredits: true },
  },
  videos: {
    id: 'gemini.media.create_video',
    category: 'media',
    output: { artifactTypes: ['video'] },
    safety: { mayTakeMinutes: true, maySpendCredits: true },
  },
  canvas: {
    id: 'gemini.canvas',
    category: 'canvas',
    output: { artifactTypes: ['canvas', 'document'] },
    safety: {},
  },
  'deep research': {
    id: 'gemini.research.deep_research',
    category: 'research',
    output: { artifactTypes: ['document', 'generated'] },
    safety: { mayTakeMinutes: true },
  },
};

export function deriveGeminiWorkbenchCapabilitiesFromFeatureSignature(
  featureSignature: string | null | undefined,
  observedAt: string,
): WorkbenchCapability[] {
  const parsed = parseFeatureSignature(featureSignature);
  if (!parsed) {
    return [];
  }
  const modes = collectGeminiModes(parsed);
  const disabledModes = new Set(collectGeminiDisabledModes(parsed));
  const signedOut = hasGeminiSignedOutSignal(parsed);
  const capabilities: WorkbenchCapability[] = [];

  for (const mode of modes) {
    const mapped = GEMINI_MODE_TO_CAPABILITY[mode];
    if (!mapped) continue;
    const disabled = signedOut || disabledModes.has(mode);
    capabilities.push({
      id: mapped.id,
      provider: 'gemini',
      providerLabels: [toProviderLabel(mode)],
      category: mapped.category,
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
      availability: disabled ? 'blocked' : 'available',
      stability: 'observed',
      requiredInputs: [
        {
          name: 'prompt',
          required: true,
          description: 'User instruction submitted to the Gemini workbench.',
        },
      ],
      output: mapped.output,
      safety: mapped.safety,
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureMode: mode,
        disabled: disabled || undefined,
        disabledReason: disabled ? signedOut ? 'gemini_signed_out' : 'gemini_tool_disabled' : undefined,
      },
    });
  }

  return capabilities;
}

function parseFeatureSignature(value: string | null | undefined): GeminiFeatureObject | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as GeminiFeatureObject;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function collectGeminiModes(root: GeminiFeatureObject): string[] {
  const modes = new Set<string>();
  collectFromObject(root, modes);
  if (root.configured && typeof root.configured === 'object') {
    collectFromObject(root.configured as GeminiFeatureObject, modes);
  }
  if (root.detected && typeof root.detected === 'object') {
    collectFromObject(root.detected as GeminiFeatureObject, modes);
  }
  return Array.from(modes).sort();
}

function collectGeminiDisabledModes(root: GeminiFeatureObject): string[] {
  const modes = new Set<string>();
  collectDisabledFromObject(root, modes);
  if (root.configured && typeof root.configured === 'object') {
    collectDisabledFromObject(root.configured as GeminiFeatureObject, modes);
  }
  if (root.detected && typeof root.detected === 'object') {
    collectDisabledFromObject(root.detected as GeminiFeatureObject, modes);
  }
  return Array.from(modes).sort();
}

function collectFromObject(source: GeminiFeatureObject, modes: Set<string>): void {
  if (Array.isArray(source.modes)) {
    for (const mode of source.modes) {
      const normalized = normalizeMode(mode);
      if (normalized) modes.add(normalized);
    }
  }
  if (source.deep_research === true) {
    modes.add('deep research');
  }
}

function collectDisabledFromObject(source: GeminiFeatureObject, modes: Set<string>): void {
  if (!Array.isArray(source.disabled_modes)) return;
  for (const mode of source.disabled_modes) {
    const normalized = normalizeMode(mode);
    if (normalized) modes.add(normalized);
  }
}

function hasGeminiSignedOutSignal(root: GeminiFeatureObject): boolean {
  if (root.signed_out === true) return true;
  if (root.configured && typeof root.configured === 'object' && (root.configured as GeminiFeatureObject).signed_out === true) {
    return true;
  }
  if (root.detected && typeof root.detected === 'object' && (root.detected as GeminiFeatureObject).signed_out === true) {
    return true;
  }
  return false;
}

function normalizeMode(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toProviderLabel(mode: string): string {
  return mode
    .split(' ')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}
