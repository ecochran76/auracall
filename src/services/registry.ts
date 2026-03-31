import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuracallHomeDir } from '../auracallHome.js';
import {
  parseServicesManifest,
  parseServicesRegistryCache,
} from './manifest.js';

export interface ServiceModelEntry {
  id: string;
  label: string;
  aliases?: string[];
}

export interface ServiceRouteRegistry {
  baseUrl?: string;
  app?: string;
  files?: string;
  projectIndex?: string;
  compatibleHosts?: string[];
  cookieOrigins?: string[];
  project?: string;
  projectConversations?: string;
  projectSources?: string;
  conversation?: string;
  projectConversation?: string;
  conversationApi?: string;
}

export interface ServiceFeatureRegistry {
  detector?: string;
  flags?: Record<string, string[]>;
  appTokens?: Record<string, string[]>;
}

export interface ServiceComposerRegistry {
  aliases?: Record<string, string[]>;
  knownLabels?: string[];
  topLevelSentinels?: string[];
  moreLabels?: string[];
  topMenuSignalLabels?: string[];
  topMenuSignalSubstrings?: string[];
  chipIgnoreTokens?: string[];
  fileRequestLabels?: string[];
}

export interface ServiceUiRegistry {
  labels?: Record<string, string>;
  labelSets?: Record<string, string[]>;
}

export interface ServiceSelectorRegistry {
  input?: string[];
  sendButton?: string[];
  modelButton?: string[];
  menuItem?: string[];
  assistantBubble?: string[];
  assistantRole?: string[];
  copyButton?: string[];
  composerRoot?: string[];
  fileInput?: string[];
  attachmentMenu?: string[];
}

export interface ServiceDomRegistry {
  selectors?: Record<string, string>;
  selectorSets?: Record<string, string[]>;
}

export interface ServiceArtifactRegistry {
  downloadKindExtensions?: Record<string, string[]>;
  contentTypeExtensions?: Record<string, string>;
  nameMimeTypes?: Record<string, string>;
  defaultTitles?: Record<string, string>;
  payloadMarkers?: Record<string, string[]>;
}

export interface ServiceRegistryEntry {
  models?: ServiceModelEntry[];
  routes?: ServiceRouteRegistry;
  features?: ServiceFeatureRegistry;
  composer?: ServiceComposerRegistry;
  ui?: ServiceUiRegistry;
  selectors?: ServiceSelectorRegistry;
  dom?: ServiceDomRegistry;
  artifacts?: ServiceArtifactRegistry;
}

export interface ServicesRegistry {
  version: number;
  services: Record<string, ServiceRegistryEntry>;
}

interface ServicesRegistryFile extends ServicesRegistry {
  templateHash?: string;
}

export type ServiceRouteTemplateKey = Exclude<keyof ServiceRouteRegistry, 'baseUrl' | 'compatibleHosts' | 'cookieOrigins'>;

let bundledRegistryCache: ServicesRegistry | null = null;

function getTemplatePath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(dir, '..', '..', 'configs', 'auracall.services.json');
}

function hashContents(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function normalizeStringList(values: readonly string[] | undefined, fallback: readonly string[]): string[] {
  const entries = Array.isArray(values) ? values : fallback;
  return Array.from(
    new Set(
      entries
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0),
    ),
  );
}

function normalizeTokenDictionary(
  values: Record<string, string[]> | undefined,
  fallback: Record<string, readonly string[]>,
): Record<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const [key, tokens] of Object.entries(fallback)) {
    merged.set(key, normalizeStringList(tokens, []));
  }
  if (!values) {
    return Object.fromEntries(merged);
  }
  for (const [key, tokens] of Object.entries(values)) {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    if (!normalizedKey) continue;
    merged.set(normalizedKey, normalizeStringList(tokens, merged.get(normalizedKey) ?? []));
  }
  return Object.fromEntries(merged);
}

function normalizeStringDictionary(
  values: Record<string, string> | undefined,
  fallback: Record<string, string>,
): Record<string, string> {
  const merged = new Map<string, string>();
  for (const [key, value] of Object.entries(fallback)) {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedKey || !normalizedValue) continue;
    merged.set(normalizedKey, normalizedValue);
  }
  if (!values) {
    return Object.fromEntries(merged);
  }
  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!normalizedKey || !normalizedValue) continue;
    merged.set(normalizedKey, normalizedValue);
  }
  return Object.fromEntries(merged);
}

const SELECTOR_KEYS = [
  'input',
  'sendButton',
  'modelButton',
  'menuItem',
  'assistantBubble',
  'assistantRole',
  'copyButton',
  'composerRoot',
  'fileInput',
  'attachmentMenu',
] as const satisfies readonly (keyof ServiceSelectorRegistry)[];

type RequiredServiceSelectorRegistry = {
  [K in (typeof SELECTOR_KEYS)[number]]: string[];
};

function normalizeSelectorRegistry(
  values: ServiceSelectorRegistry | undefined,
  fallback: RequiredServiceSelectorRegistry,
): RequiredServiceSelectorRegistry {
  return Object.fromEntries(
    SELECTOR_KEYS.map((key) => [key, normalizeStringList(values?.[key], fallback[key])]),
  ) as RequiredServiceSelectorRegistry;
}

function getBundledServiceEntry(serviceId: string): ServiceRegistryEntry | undefined {
  return readBundledServicesRegistry().services[serviceId];
}

export function readBundledServicesRegistry(): ServicesRegistry {
  if (bundledRegistryCache) {
    return bundledRegistryCache;
  }
  const payload = fsSync.readFileSync(getTemplatePath(), 'utf8');
  const result = parseServicesManifest(payload, 'bundled services manifest');
  if (!result.ok) {
    throw new Error(result.message);
  }
  bundledRegistryCache = result.value as ServicesRegistry;
  return bundledRegistryCache;
}

export async function ensureServicesRegistry(): Promise<ServicesRegistry> {
  const templatePath = getTemplatePath();
  const templateContents = await fs.readFile(templatePath, 'utf8');
  const templateHash = hashContents(templateContents);
  const templateResult = parseServicesManifest(templateContents, 'bundled services manifest');
  if (!templateResult.ok) {
    throw new Error(templateResult.message);
  }
  const template = templateResult.value as ServicesRegistry;

  const registryPath = path.join(getAuracallHomeDir(), 'services.json');
  let registry: (ServicesRegistryFile & { templateHash?: string }) | null = null;
  try {
    const existing = await fs.readFile(registryPath, 'utf8');
    const existingResult = parseServicesRegistryCache(existing, `cached services registry at ${registryPath}`);
    if (!existingResult.ok) {
      registry = null;
    } else {
      registry = existingResult.value as ServicesRegistryFile;
    }
  } catch {
    registry = null;
  }

  if (!registry || registry.templateHash !== templateHash) {
    const next = {
      ...template,
      templateHash,
    } as ServicesRegistryFile;
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(next, null, 2));
    registry = next;
  }

  return {
    version: registry!.version,
    services: registry!.services,
  };
}

export function resolveBundledServiceModelLabels(serviceId: string, input: string): string[] {
  return resolveServiceModelLabels(readBundledServicesRegistry(), serviceId, input);
}

export function resolveBundledServiceBaseUrl(serviceId: string, fallback: string): string {
  const configured = getBundledServiceEntry(serviceId)?.routes?.baseUrl?.trim();
  return configured && configured.length > 0 ? configured : fallback;
}

export function resolveBundledServiceCompatibleHosts(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.routes?.compatibleHosts, fallback);
}

export function resolveBundledServiceCookieOrigins(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.routes?.cookieOrigins, fallback);
}

export function resolveBundledServiceRouteTemplate(
  serviceId: string,
  route: ServiceRouteTemplateKey,
  fallback: string,
): string {
  const configured = getBundledServiceEntry(serviceId)?.routes?.[route];
  return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : fallback;
}

export function resolveBundledServiceFeatureDetector(serviceId: string, fallback: string): string {
  const configured = getBundledServiceEntry(serviceId)?.features?.detector?.trim();
  return configured && configured.length > 0 ? configured : fallback;
}

export function resolveBundledServiceFeatureFlagTokens(
  serviceId: string,
  fallback: Record<string, readonly string[]>,
): Record<string, string[]> {
  return normalizeTokenDictionary(getBundledServiceEntry(serviceId)?.features?.flags, fallback);
}

export function resolveBundledServiceAppTokens(
  serviceId: string,
  fallback: Record<string, readonly string[]>,
): Record<string, string[]> {
  return normalizeTokenDictionary(getBundledServiceEntry(serviceId)?.features?.appTokens, fallback);
}

export function resolveBundledServiceComposerAliases(
  serviceId: string,
  fallback: Record<string, readonly string[]>,
): Record<string, string[]> {
  return normalizeTokenDictionary(getBundledServiceEntry(serviceId)?.composer?.aliases, fallback);
}

export function resolveBundledServiceComposerKnownLabels(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.composer?.knownLabels, fallback);
}

export function resolveBundledServiceComposerTopLevelSentinels(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.composer?.topLevelSentinels, fallback);
}

export function resolveBundledServiceComposerMoreLabels(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.composer?.moreLabels, fallback);
}

export function resolveBundledServiceComposerTopMenuSignalLabels(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.composer?.topMenuSignalLabels, fallback);
}

export function resolveBundledServiceComposerTopMenuSignalSubstrings(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.composer?.topMenuSignalSubstrings, fallback);
}

export function resolveBundledServiceComposerChipIgnoreTokens(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.composer?.chipIgnoreTokens, fallback);
}

export function resolveBundledServiceComposerFileRequestLabels(
  serviceId: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.composer?.fileRequestLabels, fallback);
}

export function resolveBundledServiceUiLabel(
  serviceId: string,
  key: string,
  fallback: string,
): string {
  const value = getBundledServiceEntry(serviceId)?.ui?.labels?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function resolveBundledServiceUiLabelSet(
  serviceId: string,
  key: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.ui?.labelSets?.[key], fallback);
}

export function resolveBundledServiceSelectors(
  serviceId: string,
  fallback: RequiredServiceSelectorRegistry,
): RequiredServiceSelectorRegistry {
  return normalizeSelectorRegistry(getBundledServiceEntry(serviceId)?.selectors, fallback);
}

export function resolveBundledServiceDomSelector(
  serviceId: string,
  key: string,
  fallback: string,
): string {
  const value = getBundledServiceEntry(serviceId)?.dom?.selectors?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function resolveBundledServiceDomSelectorSet(
  serviceId: string,
  key: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.dom?.selectorSets?.[key], fallback);
}

export function resolveBundledServiceArtifactKindExtensions(
  serviceId: string,
  fallback: Record<string, readonly string[]>,
): Record<string, string[]> {
  return normalizeTokenDictionary(getBundledServiceEntry(serviceId)?.artifacts?.downloadKindExtensions, fallback);
}

export function resolveBundledServiceArtifactContentTypeExtensions(
  serviceId: string,
  fallback: Record<string, string>,
): Record<string, string> {
  return normalizeStringDictionary(getBundledServiceEntry(serviceId)?.artifacts?.contentTypeExtensions, fallback);
}

export function resolveBundledServiceArtifactNameMimeTypes(
  serviceId: string,
  fallback: Record<string, string>,
): Record<string, string> {
  return normalizeStringDictionary(getBundledServiceEntry(serviceId)?.artifacts?.nameMimeTypes, fallback);
}

export function resolveBundledServiceArtifactDefaultTitle(
  serviceId: string,
  key: string,
  fallback: string,
): string {
  const value = getBundledServiceEntry(serviceId)?.artifacts?.defaultTitles?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function resolveBundledServiceArtifactPayloadMarkerSet(
  serviceId: string,
  key: string,
  fallback: readonly string[],
): string[] {
  return normalizeStringList(getBundledServiceEntry(serviceId)?.artifacts?.payloadMarkers?.[key], fallback);
}

export function normalizeServiceModelToken(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[\u2022•]+/g, ' ')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveServiceModelLabels(
  registry: ServicesRegistry,
  serviceId: string,
  input: string,
): string[] {
  const normalized = normalizeServiceModelToken(input);
  if (!normalized) return [];

  const models = registry.services[serviceId]?.models ?? [];
  const exactMatches = new Set<string>();
  const prefixMatches = new Set<string>();

  for (const model of models) {
    const tokens = [model.label, model.id, ...(model.aliases ?? [])]
      .map((token) => normalizeServiceModelToken(token))
      .filter(Boolean);
    if (tokens.includes(normalized)) {
      exactMatches.add(model.label);
      continue;
    }
    if (tokens.some((token) => token.startsWith(normalized) || normalized.startsWith(token))) {
      prefixMatches.add(model.label);
    }
  }

  if (exactMatches.size > 0) {
    return [...exactMatches];
  }

  return [...prefixMatches];
}
