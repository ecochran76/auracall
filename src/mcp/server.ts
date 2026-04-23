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

export async function startMcpServer(): Promise<void> {
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
  registerRunStatusTool(server);
  registerRuntimeInspectTool(server);
  registerMediaGenerationTool(server);
  registerWorkbenchCapabilitiesTool(server);
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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('auracall-mcp')) {
  startMcpServer().catch((error) => {
    console.error('Failed to start auracall-mcp:', error);
    process.exitCode = 1;
  });
}
