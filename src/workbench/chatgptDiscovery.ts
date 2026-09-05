import type { WorkbenchCapability } from './types.js';

interface ChatgptFeatureObject {
  web_search?: unknown;
  deep_research?: unknown;
  company_knowledge?: unknown;
  shopping?: unknown;
  composer_tools?: unknown;
  create_image?: unknown;
  image_generation?: unknown;
  image?: unknown;
  apps?: unknown;
  composer_mode?: unknown;
  composer_apps?: unknown;
  installed_apps?: unknown;
  linked_apps?: unknown;
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

type ChatgptComposerAppSignal = {
  name: string;
  appId?: string;
  pluginId?: string;
  selectionState?: 'selected' | 'selectable' | 'connect_required' | 'unknown';
};

type ChatgptInstalledAppSignal = {
  pluginId: string;
  name: string;
  appIds: string[];
  status?: string;
  enabled?: boolean;
  installationPolicy?: string;
  authenticationPolicy?: string;
};

type ChatgptLinkedAppSignal = {
  linkId: string;
  connectorId: string;
  name: string;
  authStatus?: string;
  connectorStatus?: string;
  visibility?: string;
  disableAutoInvocation?: boolean;
  actionsCount?: number;
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
  const composerToolLabels = new Set(signals.composerTools.map(normalizeToolLabel));
  const observedToolLabel = (label: string): string | null =>
    composerToolLabels.has(normalizeToolLabel(label)) ? label : null;

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

  const shoppingLabel = observedToolLabel('Shopping');
  if (signals.shopping || shoppingLabel) {
    capabilities.push({
      id: 'chatgpt.commerce.shopping',
      provider: 'chatgpt',
      providerLabels: [shoppingLabel ?? 'Shopping'],
      category: 'other',
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: { mayUseExternalAccount: true },
      observedAt,
      source: 'browser_discovery',
      metadata: { featureSignatureSignal: shoppingLabel ? 'composer_tools' : 'shopping' },
    });
  }

  const localUploadLabel = observedToolLabel('Add photos & files');
  if (localUploadLabel) {
    capabilities.push({
      id: 'chatgpt.files.local_upload',
      provider: 'chatgpt',
      providerLabels: [localUploadLabel],
      category: 'file',
      invocationMode: 'composer_attachment',
      surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: [{ name: 'file', required: true, description: 'Local file attached to the active composer.' }],
      output: { artifactTypes: ['generated'] },
      safety: {},
      observedAt,
      source: 'browser_discovery',
      metadata: { featureSignatureSignal: 'composer_tools' },
    });
  }

  const libraryLabel = observedToolLabel('Add from library');
  if (libraryLabel) {
    capabilities.push({
      id: 'chatgpt.files.library',
      provider: 'chatgpt',
      providerLabels: [libraryLabel],
      category: 'file',
      invocationMode: 'composer_attachment',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: [],
      output: { artifactTypes: ['generated'] },
      safety: { requiresUserConsent: true },
      observedAt,
      source: 'browser_discovery',
      metadata: { featureSignatureSignal: 'composer_tools' },
    });
  }

  const structuredAppIds = new Set<string>();
  for (const installedApp of signals.installedApps) {
    const app = normalizeAppId(installedApp.name);
    if (!app) continue;
    structuredAppIds.add(app);
    const composerMatches = signals.composerApps.filter((candidate) =>
      candidate.pluginId === installedApp.pluginId ||
      (candidate.appId
        ? installedApp.appIds.some((appId) =>
            connectorIdentityMatches(appId, candidate.appId as string))
        : false) ||
      normalizeAppId(candidate.name) === app
    );
    const linkedMatches = signals.linkedApps.filter((candidate) =>
      installedApp.appIds.some((appId) =>
        connectorIdentityMatches(appId, candidate.connectorId)) ||
      normalizeAppId(candidate.name) === app
    );
    const composerSelectionStates = Array.from(new Set(
      composerMatches.map((candidate) => candidate.selectionState).filter(Boolean),
    ));
    const authStatuses = Array.from(new Set(
      linkedMatches.map((candidate) => candidate.authStatus).filter(Boolean),
    ));
    const connectorStatuses = Array.from(new Set(
      linkedMatches.map((candidate) => candidate.connectorStatus).filter(Boolean),
    ));
    const explicitlySelectable = composerSelectionStates.some(
      (state) => state === 'selected' || state === 'selectable',
    );
    const activeLink = linkedMatches.some(
      (link) => link.authStatus === 'ACTIVE' && (!link.connectorStatus || link.connectorStatus === 'ENABLED'),
    );
    const connectionRequired =
      composerSelectionStates.includes('connect_required') ||
      authStatuses.some((status) => status === 'REAUTH_REQUIRED' || status === 'AUTH_REQUIRED');
    const disabled =
      installedApp.enabled === false ||
      (installedApp.status !== undefined && installedApp.status !== 'ENABLED') ||
      connectorStatuses.some((status) => status !== 'ENABLED');
    const availability = disabled
      ? 'blocked'
      : connectionRequired
        ? 'account_gated'
        : explicitlySelectable || activeLink
          ? 'available'
          : 'unknown';
    const label = installedApp.name || formatAppLabel(app);
    capabilities.push({
      id: `chatgpt.apps.${app}`,
      provider: 'chatgpt',
      providerLabels: [label],
      category: 'app',
      invocationMode: 'composer_mention',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability,
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: {
        requiresUserConsent: availability !== 'available',
        mayUseExternalAccount: true,
        notes: [
          'ChatGPT routes selected apps through an inline ecosystemMention in the submitted user message.',
          'Do not install, reconnect, or enable apps without user consent.',
        ],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'installed_apps',
        app,
        installed: true,
        pluginId: installedApp.pluginId,
        appIds: installedApp.appIds,
        installedStatus: installedApp.status,
        installedEnabled: installedApp.enabled,
        installationPolicy: installedApp.installationPolicy,
        authenticationPolicy: installedApp.authenticationPolicy,
        composerMode: signals.composerMode,
        composerSelectionStates,
        linkAuthStatuses: authStatuses,
        connectorStatuses,
        linkedAppCount: linkedMatches.length,
      },
    });
  }

  for (const composerApp of signals.composerApps) {
    const app = normalizeAppId(composerApp.name);
    if (!app || structuredAppIds.has(app)) continue;
    structuredAppIds.add(app);
    const availability =
      composerApp.selectionState === 'selected' || composerApp.selectionState === 'selectable'
        ? 'available'
        : composerApp.selectionState === 'connect_required'
          ? 'account_gated'
          : 'unknown';
    capabilities.push({
      id: `chatgpt.apps.${app}`,
      provider: 'chatgpt',
      providerLabels: [composerApp.name],
      category: 'app',
      invocationMode: 'composer_mention',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability,
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: {
        requiresUserConsent: availability !== 'available',
        mayUseExternalAccount: true,
        notes: ['ChatGPT showed this app in the current composer menu; Connect is not treated as selectable.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'composer_apps',
        app,
        installed: false,
        composerMode: signals.composerMode,
        composerSelectionState: composerApp.selectionState,
        appId: composerApp.appId,
        pluginId: composerApp.pluginId,
      },
    });
  }

  for (const app of signals.apps) {
    if (structuredAppIds.has(app)) continue;
    const label = formatAppLabel(app);
    capabilities.push({
      id: `chatgpt.apps.${app}`,
      provider: 'chatgpt',
      providerLabels: [label],
      category: 'app',
      invocationMode: 'composer_mention',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability: 'unknown',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: {
        requiresUserConsent: true,
        mayUseExternalAccount: true,
        notes: ['Legacy app token visibility does not prove installation, connection, or composer selection.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'apps',
        app,
        installed: false,
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
      invocationMode: 'unknown',
      surfaces: ['browser_service', 'local_api', 'mcp'],
      availability: 'unknown',
      stability: 'observed',
      requiredInputs: commonPromptInput,
      output: { artifactTypes: ['generated'] },
      safety: {
        requiresUserConsent: true,
        notes: ['A visible skill label does not prove installation, activation, stable identity, or invocation.'],
      },
      observedAt,
      source: 'browser_discovery',
      metadata: {
        featureSignatureSignal: 'skills',
        skill,
        lifecycleState: 'unknown',
        stableIdentityObserved: false,
        installationObserved: false,
        invocationObserved: false,
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
  shopping: boolean;
  composerTools: string[];
  apps: string[];
  composerMode?: 'chat' | 'work';
  composerApps: ChatgptComposerAppSignal[];
  installedApps: ChatgptInstalledAppSignal[];
  linkedApps: ChatgptLinkedAppSignal[];
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
    shopping: false,
    composerTools: new Set<string>(),
    apps: new Set<string>(),
    composerMode: undefined as 'chat' | 'work' | undefined,
    composerApps: new Map<string, ChatgptComposerAppSignal>(),
    installedApps: new Map<string, ChatgptInstalledAppSignal>(),
    linkedApps: new Map<string, ChatgptLinkedAppSignal>(),
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
    shopping: signals.shopping,
    composerTools: Array.from(signals.composerTools),
    apps: Array.from(signals.apps).sort(),
    composerMode: signals.composerMode,
    composerApps: [...signals.composerApps.values()].sort((left, right) => left.name.localeCompare(right.name)),
    installedApps: [...signals.installedApps.values()].sort((left, right) => left.name.localeCompare(right.name)),
    linkedApps: [...signals.linkedApps.values()].sort((left, right) => {
      const byName = left.name.localeCompare(right.name);
      return byName || left.linkId.localeCompare(right.linkId);
    }),
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
    shopping: boolean;
    composerTools: Set<string>;
    apps: Set<string>;
    composerMode?: 'chat' | 'work';
    composerApps: Map<string, ChatgptComposerAppSignal>;
    installedApps: Map<string, ChatgptInstalledAppSignal>;
    linkedApps: Map<string, ChatgptLinkedAppSignal>;
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
  if (source.shopping === true) signals.shopping = true;
  if (source.create_image === true || source.image_generation === true || source.image === true) {
    signals.createImage = true;
  }
  collectStringArray(source.apps, signals.apps);
  collectStringArray(source.composer_tools, signals.composerTools);
  if (source.composer_mode === 'chat' || source.composer_mode === 'work') {
    signals.composerMode = source.composer_mode;
  }
  collectComposerApps(source.composer_apps, signals.composerApps);
  collectInstalledApps(source.installed_apps, signals.installedApps);
  collectLinkedApps(source.linked_apps, signals.linkedApps);
  collectStringArray(source.skills, signals.skills);
  const modelControls = normalizeModelControls(source.model_controls);
  if (modelControls.visible) {
    signals.modelControls = modelControls;
  }
}

function normalizeAppId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeToolLabel(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeConnectorIdentity(value: string): string {
  return value.replace(/^(?:connector_|asdk_app_)/i, '');
}

function connectorIdentityMatches(left: string, right: string): boolean {
  return normalizeConnectorIdentity(left) === normalizeConnectorIdentity(right);
}

function collectComposerApps(
  value: unknown,
  target: Map<string, ChatgptComposerAppSignal>,
): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const name = normalizeDisplayString(record.name);
    if (!name) continue;
    const appId = normalizeDisplayString(record.app_id ?? record.appId);
    const pluginId = normalizeDisplayString(record.plugin_id ?? record.pluginId);
    const selectionState =
      record.selection_state === 'selected' ||
      record.selection_state === 'selectable' ||
      record.selection_state === 'connect_required' ||
      record.selection_state === 'unknown'
        ? record.selection_state
        : undefined;
    const key = pluginId || appId || normalizeAppId(name);
    target.set(key, { name, appId, pluginId, selectionState });
  }
}

function collectInstalledApps(
  value: unknown,
  target: Map<string, ChatgptInstalledAppSignal>,
): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const pluginId = normalizeDisplayString(record.plugin_id ?? record.pluginId);
    const name = normalizeDisplayString(record.name);
    if (!pluginId || !name) continue;
    target.set(pluginId, {
      pluginId,
      name,
      appIds: normalizeDisplayStringArray(record.app_ids ?? record.appIds),
      status: normalizeDisplayString(record.status),
      enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
      installationPolicy: normalizeDisplayString(record.installation_policy ?? record.installationPolicy),
      authenticationPolicy: normalizeDisplayString(record.authentication_policy ?? record.authenticationPolicy),
    });
  }
}

function collectLinkedApps(
  value: unknown,
  target: Map<string, ChatgptLinkedAppSignal>,
): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const linkId = normalizeDisplayString(record.link_id ?? record.linkId);
    const connectorId = normalizeDisplayString(record.connector_id ?? record.connectorId);
    const name = normalizeDisplayString(record.name);
    if (!linkId || !connectorId || !name) continue;
    target.set(linkId, {
      linkId,
      connectorId,
      name,
      authStatus: normalizeDisplayString(record.auth_status ?? record.authStatus),
      connectorStatus: normalizeDisplayString(record.connector_status ?? record.connectorStatus),
      visibility: normalizeDisplayString(record.visibility),
      disableAutoInvocation:
        typeof record.disable_auto_invocation === 'boolean'
          ? record.disable_auto_invocation
          : (typeof record.disableAutoInvocation === 'boolean' ? record.disableAutoInvocation : undefined),
      actionsCount:
        typeof record.actions_count === 'number'
          ? record.actions_count
          : (typeof record.actionsCount === 'number' ? record.actionsCount : undefined),
    });
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
