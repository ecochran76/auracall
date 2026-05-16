import { z } from 'zod';
import type { ResolvedUserConfig } from '../config.js';
import {
  createAgentTeamConfigService,
  type AgentTeamConfigService,
} from '../config/agentConfigService.js';
import { AgentConfigSchema } from '../schema/types.js';
import { createLlmService } from '../browser/llmService/index.js';
import type { LlmService } from '../browser/llmService/llmService.js';
import type { Project, ProjectMemoryMode, ProviderId } from '../browser/providers/domain.js';

const PROVIDER_ID_SCHEMA = z.enum(['chatgpt', 'gemini', 'grok']);
const PROJECT_MEMORY_MODE_SCHEMA = z.enum(['global', 'project']);
const DEFAULT_PROJECT_ENSURE_TIMEOUT_MS = 120_000;

// biome-ignore lint/style/useNamingConvention: exported Zod schemas use the repo's stable Schema suffix convention.
export const ProjectEnsureInputSchema = z.object({
  service: PROVIDER_ID_SCHEMA.default('chatgpt'),
  runtimeProfile: z.string().trim().min(1).nullable().optional(),
  projectName: z.string().trim().min(1),
  createIfMissing: z.boolean().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
  instructions: z.string().nullable().optional(),
  modelLabel: z.string().trim().min(1).nullable().optional(),
  files: z.array(z.string().trim().min(1)).optional(),
  memoryMode: PROJECT_MEMORY_MODE_SCHEMA.nullable().optional(),
  agentId: z.string().trim().min(1).nullable().optional(),
  agentDescription: z.string().nullable().optional(),
  agentInstructions: z.string().nullable().optional(),
  agentPrePrompt: z.string().nullable().optional(),
  agentPostPrompt: z.string().nullable().optional(),
  agentModel: z.string().trim().min(1).nullable().optional(),
  agentModelSelector: z.string().trim().min(1).nullable().optional(),
  agentMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type ProjectEnsureInput = z.infer<typeof ProjectEnsureInputSchema>;

export interface ProjectEnsureResult {
  object: 'auracall_project_ensure';
  status: 'found' | 'created' | 'missing';
  service: ProviderId;
  runtimeProfile: string | null;
  projectName: string;
  project: Project | null;
  created: boolean;
  agent: {
    id: string;
    mutationTarget: 'config' | 'registry' | 'blocked' | null;
    blockedReason: string | null;
  } | null;
}

export interface ProjectEnsureClient {
  listProjects(): Promise<Project[]>;
  createProject(input: {
    name: string;
    instructions?: string;
    modelLabel?: string;
    files?: string[];
    memoryMode?: ProjectMemoryMode;
  }): Promise<Project | null>;
}

export interface ProjectEnsureService {
  ensureProject(input: ProjectEnsureInput): Promise<ProjectEnsureResult>;
}

export interface ProjectEnsureServiceDeps {
  config?: Record<string, unknown> | ResolvedUserConfig;
  configService?: AgentTeamConfigService;
  timeoutMs?: number;
  createProjectClient?: (input: {
    config: Record<string, unknown> | ResolvedUserConfig;
    service: ProviderId;
    runtimeProfile: string | null;
  }) => Promise<ProjectEnsureClient> | ProjectEnsureClient;
}

export function createProjectEnsureService(
  deps: ProjectEnsureServiceDeps = {},
): ProjectEnsureService {
  const config = deps.config ?? {};
  const configService =
    deps.configService ??
    createAgentTeamConfigService({
      activeConfig: config,
    });
  const createClient = deps.createProjectClient ?? createBrowserProjectEnsureClient;

  return {
    async ensureProject(input) {
      const payload = ProjectEnsureInputSchema.parse(input);
      const service = payload.service;
      const runtimeProfile = normalizeNullableString(payload.runtimeProfile);
      const timeoutMs = normalizeTimeoutMs(payload.timeoutMs ?? deps.timeoutMs);
      const client = await createClient({
        config,
        service,
        runtimeProfile,
      });
      const projects = await withProjectEnsureTimeout(
        client.listProjects(),
        timeoutMs,
        `Project listing timed out after ${timeoutMs}ms for ${service}/${runtimeProfile ?? 'default'}.`,
      );
      const matches = projects.filter((project) => normalizeName(project.name ?? project.id) === normalizeName(payload.projectName));
      if (matches.length > 1) {
        const names = matches.map((project) => `${project.name ?? project.id} (${project.id})`).join(', ');
        throw new Error(`Project name "${payload.projectName}" is ambiguous for ${service}: ${names}`);
      }

      const createIfMissing = payload.createIfMissing ?? true;
      let project: Project | null = matches[0] ?? null;
      let status: ProjectEnsureResult['status'] = project ? 'found' : 'missing';
      if (!project && createIfMissing) {
        project = await withProjectEnsureTimeout(
          client.createProject({
            name: payload.projectName,
            ...(normalizeNullableString(payload.instructions) ? { instructions: normalizeNullableString(payload.instructions) ?? undefined } : {}),
            ...(normalizeNullableString(payload.modelLabel) ? { modelLabel: normalizeNullableString(payload.modelLabel) ?? undefined } : {}),
            ...(payload.files?.length ? { files: payload.files } : {}),
            ...(payload.memoryMode ? { memoryMode: payload.memoryMode } : {}),
          }),
          timeoutMs,
          `Project creation timed out after ${timeoutMs}ms for ${service}/${runtimeProfile ?? 'default'} project "${payload.projectName}".`,
        );
        if (!project?.id) {
          throw new Error(`Project creation could not be verified for "${payload.projectName}".`);
        }
        status = 'created';
      }

      let agent: ProjectEnsureResult['agent'] = null;
      const agentId = normalizeNullableString(payload.agentId);
      if (agentId && project) {
        const mutation = await configService.upsertAgent({
          id: agentId,
          config: AgentConfigSchema.parse({
            runtimeProfile: runtimeProfile ?? undefined,
            service,
            projectId: project.id,
            projectName: project.name ?? payload.projectName,
            description: normalizeNullableString(payload.agentDescription) ?? undefined,
            instructions: normalizeNullableString(payload.agentInstructions) ?? undefined,
            prePrompt: normalizeNullableString(payload.agentPrePrompt) ?? undefined,
            postPrompt: normalizeNullableString(payload.agentPostPrompt) ?? undefined,
            model: normalizeNullableString(payload.agentModel) ?? undefined,
            modelSelector: normalizeNullableString(payload.agentModelSelector) ?? undefined,
            metadata: payload.agentMetadata ?? undefined,
          }),
        });
        agent = {
          id: agentId,
          mutationTarget: mutation.mutationTarget,
          blockedReason: mutation.blockedReason,
        };
      }

      return {
        object: 'auracall_project_ensure',
        status,
        service,
        runtimeProfile,
        projectName: payload.projectName,
        project,
        created: status === 'created',
        agent,
      };
    },
  };
}

function normalizeTimeoutMs(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return DEFAULT_PROJECT_ENSURE_TIMEOUT_MS;
  }
  return Math.max(1, Math.trunc(value as number));
}

function withProjectEnsureTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      timeout = null;
      reject(new Error(message));
    }, timeoutMs);
    operation.then(
      (value) => {
        if (timeout) clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function createBrowserProjectEnsureClient(input: {
  config: Record<string, unknown> | ResolvedUserConfig;
  service: ProviderId;
  runtimeProfile: string | null;
}): ProjectEnsureClient {
  const config = createRuntimeScopedConfig(input.config, input.service, input.runtimeProfile);
  const llmService = createLlmService(input.service, config as ResolvedUserConfig);
  return createLlmServiceProjectEnsureClient(llmService);
}

function createLlmServiceProjectEnsureClient(llmService: LlmService): ProjectEnsureClient {
  return {
    listProjects: () => llmService.listProjects(),
    createProject: (projectInput) => llmService.createProject(projectInput),
  };
}

function createRuntimeScopedConfig(
  config: Record<string, unknown> | ResolvedUserConfig,
  service: ProviderId,
  runtimeProfile: string | null,
): ResolvedUserConfig {
  const next = structuredCloneJson(config) as Record<string, unknown>;
  next.browser = {
    ...(typeof next.browser === 'object' && next.browser !== null && !Array.isArray(next.browser) ? next.browser : {}),
    target: service,
  };
  if (runtimeProfile) {
    next.defaultRuntimeProfile = runtimeProfile;
    next.auracallProfile = runtimeProfile;
  }
  return next as ResolvedUserConfig;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function structuredCloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? {}));
}
