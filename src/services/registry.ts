import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuracallHomeDir } from '../auracallHome.js';

export interface ServiceModelEntry {
  id: string;
  label: string;
  aliases?: string[];
}

export interface ServiceRegistryEntry {
  models?: ServiceModelEntry[];
}

export interface ServicesRegistry {
  version: number;
  services: Record<string, ServiceRegistryEntry>;
}

interface ServicesRegistryFile extends ServicesRegistry {
  templateHash?: string;
}

function getTemplatePath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(dir, '..', '..', 'configs', 'oracle.services.json');
}

function hashContents(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function ensureServicesRegistry(): Promise<ServicesRegistry> {
  const templatePath = getTemplatePath();
  const templateContents = await fs.readFile(templatePath, 'utf8');
  const templateHash = hashContents(templateContents);
  const template = JSON.parse(templateContents) as ServicesRegistry;

  const registryPath = path.join(getAuracallHomeDir(), 'services.json');
  let registry: ServicesRegistryFile | null = null;
  try {
    const existing = await fs.readFile(registryPath, 'utf8');
    registry = JSON.parse(existing) as ServicesRegistryFile;
  } catch {
    registry = null;
  }

  if (!registry || registry.templateHash !== templateHash) {
    const next: ServicesRegistryFile = {
      ...template,
      templateHash,
    };
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, JSON.stringify(next, null, 2));
    registry = next;
  }

  return {
    version: registry.version,
    services: registry.services,
  };
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
