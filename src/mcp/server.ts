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
import { registerMediaGenerationTool } from './tools/mediaGeneration.js';
import { registerWorkbenchCapabilitiesTool } from './tools/workbenchCapabilities.js';
import { registerRunStatusTool } from './tools/runStatus.js';
import { registerApiStatusTool } from './tools/apiStatus.js';
import { registerApiOpsBrowserStatusTool } from './tools/apiOpsBrowserStatus.js';
import { registerRuntimeInspectTool } from './tools/runtimeInspect.js';
import { registerAccountMirrorStatusTool } from './tools/accountMirrorStatus.js';
import { registerAccountMirrorRefreshTool } from './tools/accountMirrorRefresh.js';
import { registerAccountMirrorCatalogTool } from './tools/accountMirrorCatalog.js';
import { registerAccountMirrorSchedulerHistoryTool } from './tools/accountMirrorSchedulerHistory.js';
import { registerAccountMirrorCompletionTools } from './tools/accountMirrorCompletion.js';
import { resolveConfig } from '../schema/resolver.js';
import type { ResolvedUserConfig } from '../config.js';
import { createMediaGenerationService } from '../media/service.js';
import { createExecutionResponsesService } from '../runtime/responsesService.js';
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

export interface McpServiceBundle {
  responsesService: ReturnType<typeof createExecutionResponsesService>;
  mediaGenerationService: ReturnType<typeof createMediaGenerationService>;
  workbenchCapabilityReporter: ReturnType<typeof createWorkbenchCapabilityService>;
  accountMirrorStatusRegistry: ReturnType<typeof createAccountMirrorStatusRegistry>;
  accountMirrorRefreshService: ReturnType<typeof createAccountMirrorRefreshService>;
  accountMirrorCatalogService: ReturnType<typeof createAccountMirrorCatalogService>;
  accountMirrorCompletionService: ReturnType<typeof createAccountMirrorCompletionService>;
}

export interface CreateMcpServicesDeps {
  createMediaGenerationService?: typeof createMediaGenerationService;
  createExecutionResponsesService?: typeof createExecutionResponsesService;
  createBrowserMediaGenerationExecutor?: typeof createBrowserMediaGenerationExecutor;
  createWorkbenchCapabilityService?: typeof createWorkbenchCapabilityService;
  createBrowserWorkbenchCapabilityDiscovery?: typeof createBrowserWorkbenchCapabilityDiscovery;
  createBrowserWorkbenchCapabilityDiagnostics?: typeof createBrowserWorkbenchCapabilityDiagnostics;
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
  registerTeamRunTool(server);
  registerRunStatusTool(server, {
    responsesService: services.responsesService,
    mediaGenerationService: services.mediaGenerationService,
  });
  registerApiStatusTool(server);
  registerApiOpsBrowserStatusTool(server);
  registerRuntimeInspectTool(server);
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
  registerAccountMirrorCompletionTools(server, {
    service: services.accountMirrorCompletionService,
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
  const createMediaExecutor =
    deps.createBrowserMediaGenerationExecutor ?? createBrowserMediaGenerationExecutor;
  const configuredStoredStepExecutor = createConfiguredStoredStepExecutor(
    resolvedUserConfig as Record<string, unknown>,
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
  return {
    responsesService,
    mediaGenerationService,
    workbenchCapabilityReporter,
    accountMirrorStatusRegistry,
    accountMirrorRefreshService,
    accountMirrorCatalogService,
    accountMirrorCompletionService,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('auracall-mcp')) {
  startMcpServer().catch((error) => {
    console.error('Failed to start auracall-mcp:', error);
    process.exitCode = 1;
  });
}
