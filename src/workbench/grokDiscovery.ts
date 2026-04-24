import type { WorkbenchCapability } from './types.js';

interface GrokImagineFeatureObject {
  imagine?: unknown;
  detected?: unknown;
  configured?: unknown;
}

interface GrokImagineSignals {
  visible: boolean;
  accountGated: boolean;
  blocked: boolean;
  image: boolean;
  video: boolean;
  labels: string[];
  routes: string[];
}

const commonPromptInput = [
  {
    name: 'prompt',
    required: true,
    description: 'User instruction submitted to the Grok Imagine workbench.',
  },
];

export function deriveGrokWorkbenchCapabilitiesFromFeatureSignature(
  featureSignature: string | null | undefined,
  observedAt: string,
): WorkbenchCapability[] {
  const parsed = parseFeatureSignature(featureSignature);
  if (!parsed) {
    return [];
  }
  const signals = collectGrokImagineSignals(parsed);
  if (!signals.visible && !signals.accountGated && !signals.blocked) {
    return [];
  }
  const availability = signals.blocked ? 'blocked' : signals.accountGated ? 'account_gated' : 'available';
  const capabilities: WorkbenchCapability[] = [];
  const labels = signals.labels.length > 0 ? signals.labels : ['Imagine'];

  if (signals.image || signals.visible || signals.accountGated || signals.blocked) {
    capabilities.push({
      id: 'grok.media.imagine_image',
      provider: 'grok',
      providerLabels: labels,
      category: 'media',
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability,
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['image'] },
      safety: {
        maySpendCredits: true,
        notes: ['Grok Imagine browser availability is account-tier and rollout dependent.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'imagine',
        routes: signals.routes,
      },
    });
  }

  if (signals.video) {
    capabilities.push({
      id: 'grok.media.imagine_video',
      provider: 'grok',
      providerLabels: labels,
      category: 'media',
      invocationMode: 'post_prompt_action',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability,
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['video'] },
      safety: {
        maySpendCredits: true,
        mayTakeMinutes: true,
        notes: ['Grok Imagine video browser automation remains gated behind discovery and run-state evidence.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'imagine_video',
        routes: signals.routes,
      },
    });
  }

  return capabilities;
}

function parseFeatureSignature(value: string | null | undefined): GrokImagineFeatureObject | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as GrokImagineFeatureObject;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function collectGrokImagineSignals(root: GrokImagineFeatureObject): GrokImagineSignals {
  const signals: GrokImagineSignals = {
    visible: false,
    accountGated: false,
    blocked: false,
    image: false,
    video: false,
    labels: [],
    routes: [],
  };
  collectFromObject(root, signals);
  if (root.configured && typeof root.configured === 'object') {
    collectFromObject(root.configured as GrokImagineFeatureObject, signals);
  }
  if (root.detected && typeof root.detected === 'object') {
    collectFromObject(root.detected as GrokImagineFeatureObject, signals);
  }
  signals.labels = Array.from(new Set(signals.labels)).sort();
  signals.routes = Array.from(new Set(signals.routes)).sort();
  return signals;
}

function collectFromObject(source: GrokImagineFeatureObject, signals: GrokImagineSignals): void {
  const imagine = source.imagine;
  if (!imagine || typeof imagine !== 'object') {
    return;
  }
  const entry = imagine as {
    visible?: unknown;
    account_gated?: unknown;
    blocked?: unknown;
    modes?: unknown;
    labels?: unknown;
    routes?: unknown;
  };
  if (entry.visible === true) signals.visible = true;
  if (entry.account_gated === true) signals.accountGated = true;
  if (entry.blocked === true) signals.blocked = true;
  if (Array.isArray(entry.modes)) {
    for (const mode of entry.modes) {
      const normalized = normalizeToken(mode);
      if (normalized.includes('image')) signals.image = true;
      if (normalized.includes('video')) signals.video = true;
    }
  }
  collectStringArray(entry.labels, signals.labels);
  collectStringArray(entry.routes, signals.routes);
}

function collectStringArray(value: unknown, sink: string[]): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const normalized = normalizeLabel(entry);
    if (normalized) sink.push(normalized);
  }
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLabel(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
