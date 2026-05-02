import type { WorkbenchCapability } from './types.js';

interface ChatgptFeatureObject {
  web_search?: unknown;
  deep_research?: unknown;
  company_knowledge?: unknown;
  create_image?: unknown;
  image_generation?: unknown;
  image?: unknown;
  apps?: unknown;
  skills?: unknown;
  model_controls?: unknown;
  detected?: unknown;
  configured?: unknown;
}

const commonPromptInput = [
  {
    name: 'prompt',
    required: true,
    description: 'User instruction submitted to the ChatGPT workbench.',
  },
];

const KNOWN_APP_LABELS: Record<string, string> = {
  acrobat: 'Adobe Acrobat',
  canva: 'Canva',
  github: 'GitHub',
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  google_drive: 'Google Drive',
  quickbooks: 'Intuit QuickBooks',
};

export function deriveChatgptWorkbenchCapabilitiesFromFeatureSignature(
  featureSignature: string | null | undefined,
  observedAt: string,
): WorkbenchCapability[] {
  const parsed = parseFeatureSignature(featureSignature);
  if (!parsed) {
    return [];
  }
  const signals = collectChatgptSignals(parsed);
  const capabilities: WorkbenchCapability[] = [];

  if (signals.webSearch) {
    capabilities.push({
      id: 'chatgpt.search.web_search',
      provider: 'chatgpt',
      providerLabels: ['Web search'],
      category: 'search',
      invocationMode: 'pre_prompt_toggle',
      surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: { mayUseExternalAccount: false },
      observedAt,
      source: 'browser_discovery',
      metadata: { featureSignatureSignal: 'web_search' },
    });
  }

  if (signals.deepResearch) {
    capabilities.push({
      id: 'chatgpt.research.deep_research',
      provider: 'chatgpt',
      providerLabels: ['Deep research'],
      category: 'research',
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['document', 'generated'] },
      safety: { mayTakeMinutes: true },
      observedAt,
      source: 'browser_discovery',
      metadata: { featureSignatureSignal: 'deep_research' },
    });
  }

  if (signals.companyKnowledge) {
    capabilities.push({
      id: 'chatgpt.files.company_knowledge',
      provider: 'chatgpt',
      providerLabels: ['Company knowledge'],
      category: 'file',
      invocationMode: 'composer_attachment',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: {
        mayUseExternalAccount: true,
        notes: ['Company knowledge availability is account and workspace dependent.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: { featureSignatureSignal: 'company_knowledge' },
    });
  }

  if (signals.createImage) {
    capabilities.push({
      id: 'chatgpt.media.create_image',
      provider: 'chatgpt',
      providerLabels: ['Create image'],
      category: 'media',
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['image'] },
      safety: {
        mayTakeMinutes: true,
        notes: ['ChatGPT Create image availability is account, model, and rollout dependent; discover before invocation.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: { featureSignatureSignal: 'create_image' },
    });
  }

  for (const app of signals.apps) {
    const label = formatAppLabel(app);
    capabilities.push({
      id: `chatgpt.apps.${app}`,
      provider: 'chatgpt',
      providerLabels: [label],
      category: 'app',
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: {
        requiresUserConsent: true,
        mayUseExternalAccount: true,
        notes: ['Do not auto-enable apps or connectors without user consent.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'apps',
        app,
      },
    });
  }

  for (const skill of signals.skills) {
    const label = formatAppLabel(skill);
    capabilities.push({
      id: `chatgpt.skills.${skill}`,
      provider: 'chatgpt',
      providerLabels: [label],
      category: 'skill',
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: {
        requiresUserConsent: true,
        notes: ['Skills can be plan/account dependent and should be reported before invocation.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'skills',
        skill,
      },
    });
  }

  if (signals.modelControls.visible) {
    const labels = Array.from(new Set([
      signals.modelControls.ariaLabel,
      signals.modelControls.label,
      'Model selector',
    ].filter((label): label is string => Boolean(label))));
    capabilities.push({
      id: 'chatgpt.model.selector',
      provider: 'chatgpt',
      providerLabels: mergeLabels(labels.length > 0 ? labels : ['Model selector'], signals.modelControls.synthesizedOptions),
      category: 'other',
      invocationMode: 'pre_prompt_toggle',
      surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: [],
      output: {
        artifactTypes: ['generated'],
        description: 'Controls the ChatGPT model lane before prompt submission.',
      },
      safety: {
        notes: ['Model selector labels and placement are volatile; discover before selecting Pro or Thinking modes.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'model_controls',
        label: signals.modelControls.label,
        ariaLabel: signals.modelControls.ariaLabel,
        location: signals.modelControls.location,
        selector: signals.modelControls.selector,
        modelOptions: signals.modelControls.modelOptions,
        depthOptions: signals.modelControls.depthOptions,
        synthesizedOptions: signals.modelControls.synthesizedOptions,
        selectedModel: signals.modelControls.selectedModel,
        selectedDepth: signals.modelControls.selectedDepth,
      },
    });
    for (const option of signals.modelControls.synthesizedOptions) {
      const parsedOption = parseSynthesizedModelDepthOption(option);
      if (!parsedOption) continue;
      capabilities.push({
        id: `chatgpt.model.${parsedOption.model}.${parsedOption.depth}`,
        provider: 'chatgpt',
        providerLabels: [option],
        category: 'other',
        invocationMode: 'pre_prompt_toggle',
        surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
        availability: 'available',
        stability: 'observed',
        requiredInputs: [],
        output: {
          artifactTypes: ['generated'],
          description: `Selects ChatGPT ${option} before prompt submission.`,
        },
        safety: {
          notes: ['ChatGPT exposes model and depth as separate controls; verify both before prompt submission.'],
        },
        observedAt,
        source: 'browser_discovery',
        metadata: {
          featureSignatureSignal: 'model_controls',
          model: parsedOption.model,
          depth: parsedOption.depth,
          selector: signals.modelControls.selector,
          selected: signals.modelControls.selectedModel === parsedOption.labelModel && signals.modelControls.selectedDepth === parsedOption.labelDepth,
        },
      });
    }
  }

  return capabilities.sort((left, right) => left.id.localeCompare(right.id));
}

function parseFeatureSignature(value: string | null | undefined): ChatgptFeatureObject | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ChatgptFeatureObject;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function collectChatgptSignals(root: ChatgptFeatureObject): {
  webSearch: boolean;
  deepResearch: boolean;
  companyKnowledge: boolean;
  createImage: boolean;
  apps: string[];
  skills: string[];
  modelControls: {
    visible: boolean;
    label?: string;
    ariaLabel?: string;
    location?: string;
    selector?: string;
    modelOptions: string[];
    depthOptions: string[];
    synthesizedOptions: string[];
    selectedModel?: string;
    selectedDepth?: string;
  };
} {
  const signals = {
    webSearch: false,
    deepResearch: false,
    companyKnowledge: false,
    createImage: false,
    apps: new Set<string>(),
    skills: new Set<string>(),
    modelControls: {
      visible: false,
      modelOptions: [],
      depthOptions: [],
      synthesizedOptions: [],
    },
  };
  collectFromObject(root, signals);
  if (root.configured && typeof root.configured === 'object') {
    collectFromObject(root.configured as ChatgptFeatureObject, signals);
  }
  if (root.detected && typeof root.detected === 'object') {
    collectFromObject(root.detected as ChatgptFeatureObject, signals);
  }
  return {
    webSearch: signals.webSearch,
    deepResearch: signals.deepResearch,
    companyKnowledge: signals.companyKnowledge,
    createImage: signals.createImage,
    apps: Array.from(signals.apps).sort(),
    skills: Array.from(signals.skills).sort(),
    modelControls: signals.modelControls,
  };
}

function collectFromObject(
  source: ChatgptFeatureObject,
  signals: {
    webSearch: boolean;
    deepResearch: boolean;
    companyKnowledge: boolean;
    createImage: boolean;
    apps: Set<string>;
    skills: Set<string>;
    modelControls: {
      visible: boolean;
      label?: string;
      ariaLabel?: string;
      location?: string;
      selector?: string;
      modelOptions: string[];
      depthOptions: string[];
      synthesizedOptions: string[];
      selectedModel?: string;
      selectedDepth?: string;
    };
  },
): void {
  if (source.web_search === true) signals.webSearch = true;
  if (source.deep_research === true) signals.deepResearch = true;
  if (source.company_knowledge === true) signals.companyKnowledge = true;
  if (source.create_image === true || source.image_generation === true || source.image === true) {
    signals.createImage = true;
  }
  collectStringArray(source.apps, signals.apps);
  collectStringArray(source.skills, signals.skills);
  const modelControls = normalizeModelControls(source.model_controls);
  if (modelControls.visible) {
    signals.modelControls = modelControls;
  }
}

function normalizeModelControls(value: unknown): {
  visible: boolean;
  label?: string;
  ariaLabel?: string;
  location?: string;
  selector?: string;
  modelOptions: string[];
  depthOptions: string[];
  synthesizedOptions: string[];
  selectedModel?: string;
  selectedDepth?: string;
} {
  if (!value || typeof value !== 'object') {
    return {
      visible: false,
      modelOptions: [],
      depthOptions: [],
      synthesizedOptions: [],
    };
  }
  const record = value as Record<string, unknown>;
  const modelOptions = normalizeDisplayStringArray(record.model_options ?? record.modelOptions);
  const depthOptions = normalizeDisplayStringArray(record.depth_options ?? record.depthOptions);
  const synthesizedOptions = normalizeDisplayStringArray(record.synthesized_options ?? record.synthesizedOptions);
  return {
    visible: record.visible === true,
    label: normalizeDisplayString(record.label),
    ariaLabel: normalizeDisplayString(record.aria_label ?? record.ariaLabel),
    location: normalizeDisplayString(record.location),
    selector: normalizeDisplayString(record.selector),
    modelOptions,
    depthOptions,
    synthesizedOptions: synthesizedOptions.length > 0 ? synthesizedOptions : synthesizeModelDepthOptions(modelOptions, depthOptions),
    selectedModel: normalizeDisplayString(record.selected_model ?? record.selectedModel),
    selectedDepth: normalizeDisplayString(record.selected_depth ?? record.selectedDepth),
  };
}

function normalizeDisplayString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function normalizeDisplayStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeDisplayString).filter((entry): entry is string => Boolean(entry))));
}

function synthesizeModelDepthOptions(modelOptions: string[], depthOptions: string[]): string[] {
  const options: string[] = [];
  for (const model of modelOptions) {
    if (!/^(Thinking|Pro)$/i.test(model)) continue;
    const modelLabel = model.slice(0, 1).toUpperCase() + model.slice(1).toLowerCase();
    for (const depth of depthOptions) {
      if (!/^(Standard|Extended)$/i.test(depth)) continue;
      const depthLabel = depth.slice(0, 1).toUpperCase() + depth.slice(1).toLowerCase();
      options.push(`${modelLabel} ${depthLabel}`);
    }
  }
  return Array.from(new Set(options));
}

function parseSynthesizedModelDepthOption(value: string): {
  model: 'thinking' | 'pro';
  depth: 'standard' | 'extended';
  labelModel: 'Thinking' | 'Pro';
  labelDepth: 'Standard' | 'Extended';
} | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const model = normalized.includes('thinking') ? 'thinking' : normalized.includes('pro') ? 'pro' : null;
  const depth = normalized.includes('standard') ? 'standard' : normalized.includes('extended') ? 'extended' : null;
  if (!model || !depth) return null;
  return {
    model,
    depth,
    labelModel: model === 'thinking' ? 'Thinking' : 'Pro',
    labelDepth: depth === 'standard' ? 'Standard' : 'Extended',
  };
}

function mergeLabels(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary].filter(Boolean)));
}

function collectStringArray(value: unknown, sink: Set<string>): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const normalized = normalizeToken(entry);
    if (normalized) sink.add(normalized);
  }
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatAppLabel(value: string): string {
  if (KNOWN_APP_LABELS[value]) {
    return KNOWN_APP_LABELS[value];
  }
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}
