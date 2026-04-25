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
  pending: boolean;
  terminalImage: boolean;
  terminalVideo: boolean;
  runState: string | null;
  image: boolean;
  video: boolean;
  labels: string[];
  routes: string[];
  controls: Array<Record<string, unknown>>;
  discoveryAction: Record<string, unknown> | null;
  materializationControls: Array<Record<string, unknown>>;
  media: {
    images: Array<Record<string, unknown>>;
    videos: Array<Record<string, unknown>>;
    visibleTiles: Array<Record<string, unknown>>;
    urls: string[];
  };
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
        runState: signals.runState,
        pending: signals.pending,
        terminalImage: signals.terminalImage,
        terminalVideo: signals.terminalVideo,
        controls: signals.controls,
        discoveryAction: signals.discoveryAction,
        materializationControls: signals.materializationControls,
        media: signals.media,
      },
    });
  }

  if (signals.video || signals.terminalVideo) {
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
        notes: ['Grok Imagine video browser automation requires live Video-mode discovery and terminal generated-video readback.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'imagine_video',
        routes: signals.routes,
        runState: signals.runState,
        pending: signals.pending,
        terminalImage: signals.terminalImage,
        terminalVideo: signals.terminalVideo,
        controls: signals.controls,
        discoveryAction: signals.discoveryAction,
        materializationControls: signals.materializationControls,
        media: signals.media,
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
    pending: false,
    terminalImage: false,
    terminalVideo: false,
    runState: null,
    image: false,
    video: false,
    labels: [],
    routes: [],
    controls: [],
    discoveryAction: null,
    materializationControls: [],
    media: {
      images: [],
      videos: [],
      visibleTiles: [],
      urls: [],
    },
  };
  collectFromObject(root, signals);
  if (root.configured && typeof root.configured === 'object') {
    collectFromObject(root.configured as GrokImagineFeatureObject, signals);
  }
  if (root.detected && typeof root.detected === 'object') {
    collectFromObject(root.detected as GrokImagineFeatureObject, signals);
  }
  if (signals.accountGated || signals.blocked) {
    signals.pending = false;
    signals.terminalImage = false;
    signals.terminalVideo = false;
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
    pending?: unknown;
    terminal_image?: unknown;
    terminal_video?: unknown;
    run_state?: unknown;
    modes?: unknown;
    labels?: unknown;
    routes?: unknown;
    controls?: unknown;
    discovery_action?: unknown;
    materialization_controls?: unknown;
    media?: unknown;
  };
  if (entry.visible === true) signals.visible = true;
  if (entry.account_gated === true) signals.accountGated = true;
  if (entry.blocked === true) signals.blocked = true;
  if (entry.pending === true) signals.pending = true;
  if (entry.terminal_image === true) {
    signals.terminalImage = true;
    signals.image = true;
  }
  if (entry.terminal_video === true) {
    signals.terminalVideo = true;
    signals.video = true;
  }
  const runState = typeof entry.run_state === 'string' && entry.run_state.trim() ? entry.run_state.trim() : null;
  if (runState) signals.runState = runState;
  if (Array.isArray(entry.modes)) {
    for (const mode of entry.modes) {
      const normalized = normalizeToken(mode);
      if (normalized.includes('image')) signals.image = true;
      if (normalized.includes('video')) signals.video = true;
    }
  }
  collectStringArray(entry.labels, signals.labels);
  collectStringArray(entry.routes, signals.routes);
  signals.controls.push(...collectRecordArray(entry.controls, 30));
  const discoveryAction = collectRecord(entry.discovery_action);
  if (discoveryAction) {
    signals.discoveryAction = discoveryAction;
    if (
      discoveryAction.action === 'grok-imagine-video-mode' &&
      (
        discoveryAction.status === 'clicked' ||
        discoveryAction.status === 'already_selected' ||
        discoveryAction.status === 'observed_video_mode' ||
        Boolean(discoveryAction.videoModeAudit)
      )
    ) {
      signals.visible = true;
      signals.video = true;
    }
  }
  signals.materializationControls.push(...collectRecordArray(entry.materialization_controls, 30));
  collectMediaEvidence(entry.media, signals.media);
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

function collectRecordArray(value: unknown, limit: number): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .slice(0, limit)
    .map((entry) => ({ ...entry }));
}

function collectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
}

function collectMediaEvidence(value: unknown, sink: GrokImagineSignals['media']): void {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  sink.images.push(...collectRecordArray(record.images, 20));
  sink.videos.push(...collectRecordArray(record.videos, 20));
  sink.visibleTiles.push(...collectRecordArray(record.visible_tiles, 80));
  if (Array.isArray(record.urls)) {
    for (const entry of record.urls) {
      const normalized = normalizeLabel(entry);
      if (normalized) sink.urls.push(normalized);
    }
  }
  sink.urls = Array.from(new Set(sink.urls)).slice(0, 40);
}
