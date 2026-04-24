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
import { registerMediaGenerationTool } from './tools/mediaGeneration.js';
import { registerWorkbenchCapabilitiesTool } from './tools/workbenchCapabilities.js';
import { registerRunStatusTool } from './tools/runStatus.js';
import { registerRuntimeInspectTool } from './tools/runtimeInspect.js';
import { resolveConfig } from '../schema/resolver.js';
import type { ResolvedUserConfig } from '../config.js';
import { createMediaGenerationService } from '../media/service.js';
import { createBrowserMediaGenerationExecutor } from '../media/browserExecutor.js';
import { createWorkbenchCapabilityService } from '../workbench/service.js';
import { createBrowserWorkbenchCapabilityDiscovery } from '../workbench/browserDiscovery.js';
import { createBrowserWorkbenchCapabilityDiagnostics } from '../workbench/browserDiagnostics.js';

export interface McpServiceBundle {
  mediaGenerationService: ReturnType<typeof createMediaGenerationService>;
  workbenchCapabilityReporter: ReturnType<typeof createWorkbenchCapabilityService>;
}

export interface CreateMcpServicesDeps {
  createMediaGenerationService?: typeof createMediaGenerationService;
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
  registerTeamRunTool(server);
  registerRunStatusTool(server, {
    mediaGenerationService: services.mediaGenerationService,
  });
  registerRuntimeInspectTool(server);
  registerMediaGenerationTool(server, {
    service: services.mediaGenerationService,
  });
  registerWorkbenchCapabilitiesTool(server, {
    reporter: services.workbenchCapabilityReporter,
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

export function createMcpServicesFromConfig(
  resolvedUserConfig: ResolvedUserConfig,
  deps: CreateMcpServicesDeps = {},
): McpServiceBundle {
  const createWorkbenchService =
    deps.createWorkbenchCapabilityService ?? createWorkbenchCapabilityService;
  const createDiscovery =
    deps.createBrowserWorkbenchCapabilityDiscovery ?? createBrowserWorkbenchCapabilityDiscovery;
  const createDiagnostics =
    deps.createBrowserWorkbenchCapabilityDiagnostics ?? createBrowserWorkbenchCapabilityDiagnostics;
  const createMediaService = deps.createMediaGenerationService ?? createMediaGenerationService;
  const createMediaExecutor =
    deps.createBrowserMediaGenerationExecutor ?? createBrowserMediaGenerationExecutor;

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
  return {
    mediaGenerationService,
    workbenchCapabilityReporter,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('auracall-mcp')) {
  startMcpServer().catch((error) => {
    console.error('Failed to start auracall-mcp:', error);
    process.exitCode = 1;
  });
}
