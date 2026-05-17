#!/usr/bin/env node
import 'dotenv/config';
import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getCliVersion } from '../version.js';
import { registerConsultTool } from './tools/consult.js';
import { registerSessionsTool } from './tools/sessions.js';
import { registerSessionResources } from './tools/sessionResources.js';
import { registerTeamRunTool } from './tools/teamRun.js';
import { registerResponseCreateTool } from './tools/responseCreate.js';
import { registerResponseBatchTools } from './tools/responseBatch.js';
import { registerMediaGenerationTool } from './tools/mediaGeneration.js';
import { registerWorkbenchCapabilitiesTool } from './tools/workbenchCapabilities.js';
import { registerRunStatusTool } from './tools/runStatus.js';
import { registerApiLogTailTool } from './tools/apiLogTail.js';
import { registerPreflightRunTool } from './tools/preflightRun.js';
import { registerApiStatusTool } from './tools/apiStatus.js';
import { registerApiOpsBrowserStatusTool } from './tools/apiOpsBrowserStatus.js';
import { registerRuntimeInspectTool } from './tools/runtimeInspect.js';
import { registerRuntimeRunsRecentTool } from './tools/runtimeRunsRecent.js';
import { registerRunArchiveTools } from './tools/runArchive.js';
import { registerConfigEntityTools } from './tools/configEntities.js';
import { registerProjectEnsureTool } from './tools/projectEnsure.js';
import { registerAgentSetupPackageTool } from './tools/agentSetupPackage.js';
import { registerApiKeyTools } from './tools/apiKeys.js';
import { registerAccountMirrorStatusTool } from './tools/accountMirrorStatus.js';
import { registerAccountMirrorRefreshTool } from './tools/accountMirrorRefresh.js';
import { registerAccountMirrorCatalogTool } from './tools/accountMirrorCatalog.js';
import { registerAccountMirrorSchedulerHistoryTool } from './tools/accountMirrorSchedulerHistory.js';
import { registerAccountMirrorSchedulerDiagnosticsTool } from './tools/accountMirrorSchedulerDiagnostics.js';
import { registerAccountMirrorCompletionTools } from './tools/accountMirrorCompletion.js';
import { registerAccountMirrorProviderGuardTools } from './tools/accountMirrorProviderGuard.js';
import { resolveConfig } from '../schema/resolver.js';
import type { ResolvedUserConfig } from '../config.js';
import { createMediaGenerationService } from '../media/service.js';
import { createExecutionResponsesService } from '../runtime/responsesService.js';
import {
  createResponseBatchService,
  type ResponseBatchService,
} from '../runtime/responseBatchService.js';
import { createConfiguredStoredStepExecutor } from '../runtime/configuredExecutor.js';
import { resolveHostLocalActionExecutionPolicy } from '../config/model.js';
import { createBrowserMediaGenerationExecutor } from '../media/browserExecutor.js';
import { createWorkbenchCapabilityService } from '../workbench/service.js';
import { createBrowserWorkbenchCapabilityDiscovery } from '../workbench/browserDiscovery.js';
import { createBrowserWorkbenchCapabilityDiagnostics } from '../workbench/browserDiagnostics.js';
import { createAccountMirrorStatusRegistry } from '../accountMirror/statusRegistry.js';
import { createAccountMirrorRefreshService } from '../accountMirror/refreshService.js';
import { createAccountMirrorPersistence } from '../accountMirror/cachePersistence.js';
import { createAccountMirrorCatalogService } from '../accountMirror/catalogService.js';
import { createAccountMirrorCompletionService } from '../accountMirror/completionService.js';
import { createAccountMirrorCompletionStore } from '../accountMirror/completionStore.js';
import {
  createAgentTeamConfigService,
  type AgentTeamConfigService,
} from '../config/agentConfigService.js';
import { createAgentRegistryStore } from '../config/agentRegistryStore.js';
import {
  createAgentSetupPackageService,
  type AgentSetupPackageService,
} from '../projects/agentSetupPackageService.js';
import {
  createProjectEnsureService,
  type ProjectEnsureService,
} from '../projects/projectEnsureService.js';
import { createRunArchiveService } from '../runtime/archiveService.js';

export interface McpServiceBundle {
  resolvedUserConfig: ResolvedUserConfig;
  responsesService: ReturnType<typeof createExecutionResponsesService>;
  responseBatchService: ResponseBatchService;
  mediaGenerationService: ReturnType<typeof createMediaGenerationService>;
  workbenchCapabilityReporter: ReturnType<typeof createWorkbenchCapabilityService>;
  accountMirrorStatusRegistry: ReturnType<typeof createAccountMirrorStatusRegistry>;
  accountMirrorRefreshService: ReturnType<typeof createAccountMirrorRefreshService>;
  accountMirrorCatalogService: ReturnType<typeof createAccountMirrorCatalogService>;
  accountMirrorCompletionService: ReturnType<typeof createAccountMirrorCompletionService>;
  runArchiveService: ReturnType<typeof createRunArchiveService>;
  agentTeamConfigService: AgentTeamConfigService;
  projectEnsureService: ProjectEnsureService;
  agentSetupPackageService: AgentSetupPackageService;
}

export interface CreateMcpServicesDeps {
  createMediaGenerationService?: typeof createMediaGenerationService;
  createExecutionResponsesService?: typeof createExecutionResponsesService;
  createResponseBatchService?: typeof createResponseBatchService;
  createBrowserMediaGenerationExecutor?: typeof createBrowserMediaGenerationExecutor;
  createWorkbenchCapabilityService?: typeof createWorkbenchCapabilityService;
  createBrowserWorkbenchCapabilityDiscovery?: typeof createBrowserWorkbenchCapabilityDiscovery;
  createBrowserWorkbenchCapabilityDiagnostics?: typeof createBrowserWorkbenchCapabilityDiagnostics;
  createProjectEnsureService?: typeof createProjectEnsureService;
}

export async function startMcpServer(): Promise<void> {
  const services = await createDefaultMcpServices();
  const server = new McpServer(
    {
      name: 'auracall-mcp',
      version: getCliVersion(),
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerConsultTool(server);
  registerResponseCreateTool(server, {
    responsesService: services.responsesService,
  });
  registerResponseBatchTools(server, {
    service: services.responseBatchService,
  });
  registerTeamRunTool(server, {
    agentTeamConfigService: services.agentTeamConfigService,
  });
  registerRunStatusTool(server, {
    responsesService: services.responsesService,
    mediaGenerationService: services.mediaGenerationService,
  });
  registerApiLogTailTool(server);
  registerPreflightRunTool(server);
  registerApiStatusTool(server);
  registerApiOpsBrowserStatusTool(server);
  registerRuntimeRunsRecentTool(server);
  registerRuntimeInspectTool(server);
  registerRunArchiveTools(server, {
    service: services.runArchiveService,
  });
  registerConfigEntityTools(server, {
    service: services.agentTeamConfigService,
  });
  registerProjectEnsureTool(server, {
    service: services.projectEnsureService,
  });
  registerAgentSetupPackageTool(server, {
    service: services.agentSetupPackageService,
  });
  registerApiKeyTools(server, {
    agentTeamConfigService: services.agentTeamConfigService,
  });
  registerMediaGenerationTool(server, {
    service: services.mediaGenerationService,
  });
  registerWorkbenchCapabilitiesTool(server, {
    reporter: services.workbenchCapabilityReporter,
  });
  registerAccountMirrorStatusTool(server, {
    registry: services.accountMirrorStatusRegistry,
  });
  registerAccountMirrorRefreshTool(server, {
    service: services.accountMirrorRefreshService,
  });
  registerAccountMirrorCatalogTool(server, {
    service: services.accountMirrorCatalogService,
  });
  registerAccountMirrorSchedulerHistoryTool(server);
  registerAccountMirrorSchedulerDiagnosticsTool(server);
  registerAccountMirrorCompletionTools(server, {
    service: services.accountMirrorCompletionService,
  });
  registerAccountMirrorProviderGuardTools(server, {
    registry: services.accountMirrorStatusRegistry,
  });
  registerSessionsTool(server);
  registerSessionResources(server);

  const transport = new StdioServerTransport();
  transport.onerror = (error) => {
    console.error('MCP transport error:', error);
  };
  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => {
      resolve();
    };
  });

  // Keep the process alive until the client closes the transport.
  await server.connect(transport);
  await closed;
}

export async function createDefaultMcpServices(): Promise<McpServiceBundle> {
  const resolvedUserConfig = await resolveConfig({}, process.cwd(), process.env);
  return createMcpServicesFromConfig(resolvedUserConfig as ResolvedUserConfig);
}

export async function createMcpServicesFromConfig(
  resolvedUserConfig: ResolvedUserConfig,
  deps: CreateMcpServicesDeps = {},
): Promise<McpServiceBundle> {
  const createWorkbenchService =
    deps.createWorkbenchCapabilityService ?? createWorkbenchCapabilityService;
  const createDiscovery =
    deps.createBrowserWorkbenchCapabilityDiscovery ?? createBrowserWorkbenchCapabilityDiscovery;
  const createDiagnostics =
    deps.createBrowserWorkbenchCapabilityDiagnostics ?? createBrowserWorkbenchCapabilityDiagnostics;
  const createMediaService = deps.createMediaGenerationService ?? createMediaGenerationService;
  const createResponsesService = deps.createExecutionResponsesService ?? createExecutionResponsesService;
  const createResponseBatch = deps.createResponseBatchService ?? createResponseBatchService;
  const createProjectEnsure = deps.createProjectEnsureService ?? createProjectEnsureService;
  const createMediaExecutor =
    deps.createBrowserMediaGenerationExecutor ?? createBrowserMediaGenerationExecutor;
  const agentRegistryStore = createAgentRegistryStore();
  const agentTeamConfigService = createAgentTeamConfigService({
    activeConfig: resolvedUserConfig as Record<string, unknown>,
    registryStore: agentRegistryStore,
  });
  const configuredStoredStepExecutor = createConfiguredStoredStepExecutor(
    resolvedUserConfig as Record<string, unknown>,
    {
      effectiveConfigProvider: () => agentTeamConfigService.effectiveConfig(),
    },
  );
  if (!configuredStoredStepExecutor) {
    throw new Error('Configured stored-step executor was not created for MCP response service.');
  }

  const workbenchCapabilityReporter = createWorkbenchService({
    discoverCapabilities: createDiscovery(resolvedUserConfig),
    diagnoseCapabilities: createDiagnostics(resolvedUserConfig),
  });
  const mediaGenerationService = createMediaService({
    executor: createMediaExecutor(resolvedUserConfig),
    capabilityReporter: workbenchCapabilityReporter,
    runtimeProfile:
      typeof resolvedUserConfig.auracallProfile === 'string'
        ? resolvedUserConfig.auracallProfile
        : null,
  });
  const responsesService = createResponsesService({
    localActionExecutionPolicy: resolveHostLocalActionExecutionPolicy(
      resolvedUserConfig as Record<string, unknown>,
    ),
    executeStoredRunStep: async (_request, context) => configuredStoredStepExecutor(context),
  });
  const responseBatchService = createResponseBatch({
    responsesService,
  });
  const runArchiveService = createRunArchiveService();
  const accountMirrorPersistence = createAccountMirrorPersistence({
    config: resolvedUserConfig as Record<string, unknown>,
  });
  const accountMirrorStatusRegistry = createAccountMirrorStatusRegistry({
    config: resolvedUserConfig as Record<string, unknown>,
    readPersistentState: accountMirrorPersistence.readState,
  });
  const accountMirrorRefreshService = createAccountMirrorRefreshService({
    config: resolvedUserConfig as Record<string, unknown>,
    registry: accountMirrorStatusRegistry,
    persistence: accountMirrorPersistence,
  });
  const accountMirrorCatalogService = createAccountMirrorCatalogService({
    config: resolvedUserConfig as Record<string, unknown>,
    registry: accountMirrorStatusRegistry,
    persistence: accountMirrorPersistence,
  });
  const accountMirrorCompletionStore = createAccountMirrorCompletionStore({
    config: resolvedUserConfig as Record<string, unknown>,
  });
  const accountMirrorCompletionService = createAccountMirrorCompletionService({
    registry: accountMirrorStatusRegistry,
    refreshService: accountMirrorRefreshService,
    store: accountMirrorCompletionStore,
    initialOperations: await accountMirrorCompletionStore.listOperations({ activeOnly: false, limit: null }),
    resumeActiveOperations: true,
  });
  const projectEnsureService = createProjectEnsure({
    config: resolvedUserConfig as Record<string, unknown>,
    configService: agentTeamConfigService,
  });
  const agentSetupPackageService = createAgentSetupPackageService({
    projectEnsureService,
    agentTeamConfigService,
  });
  return {
    resolvedUserConfig,
    responsesService,
    responseBatchService,
    runArchiveService,
    mediaGenerationService,
    workbenchCapabilityReporter,
    accountMirrorStatusRegistry,
    accountMirrorRefreshService,
    accountMirrorCatalogService,
    accountMirrorCompletionService,
    agentTeamConfigService,
    projectEnsureService,
    agentSetupPackageService,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('auracall-mcp')) {
  startMcpServer().catch((error) => {
    console.error('Failed to start auracall-mcp:', error);
    process.exitCode = 1;
  });
}
