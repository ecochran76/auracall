import { describe, expect, it, vi } from 'vitest';
import type { ResolvedUserConfig } from '../src/config.js';
import { createMcpServicesFromConfig } from '../src/mcp/server.js';

describe('mcp server service wiring', () => {
  it('shares configured browser media and workbench services across MCP tools', async () => {
    const config = {
      auracallProfile: 'default',
    } as ResolvedUserConfig;
    const executor = vi.fn();
    const discoverCapabilities = vi.fn();
    const diagnoseCapabilities = vi.fn();
    const workbenchReporter = {
      listCapabilities: vi.fn(),
    };
    const mediaGenerationService = {
      createGeneration: vi.fn(),
      createGenerationAsync: vi.fn(),
      readGeneration: vi.fn(),
    };
    const responsesService = {
      createResponse: vi.fn(),
      readResponse: vi.fn(),
    };
    const createBrowserMediaGenerationExecutor = vi.fn(() => executor);
    const createBrowserWorkbenchCapabilityDiscovery = vi.fn(() => discoverCapabilities);
    const createBrowserWorkbenchCapabilityDiagnostics = vi.fn(() => diagnoseCapabilities);
    const createWorkbenchCapabilityService = vi.fn(() => workbenchReporter);
    const createMediaGenerationService = vi.fn(() => mediaGenerationService);
    const createExecutionResponsesService = vi.fn(() => responsesService);

    const services = await createMcpServicesFromConfig(config, {
      createBrowserMediaGenerationExecutor,
      createBrowserWorkbenchCapabilityDiscovery,
      createBrowserWorkbenchCapabilityDiagnostics,
      createWorkbenchCapabilityService,
      createMediaGenerationService,
      createExecutionResponsesService,
    });

    expect(createBrowserWorkbenchCapabilityDiscovery).toHaveBeenCalledWith(config);
    expect(createBrowserWorkbenchCapabilityDiagnostics).toHaveBeenCalledWith(config);
    expect(createWorkbenchCapabilityService).toHaveBeenCalledWith({
      discoverCapabilities,
      diagnoseCapabilities,
    });
    expect(createBrowserMediaGenerationExecutor).toHaveBeenCalledWith(config);
    expect(createMediaGenerationService).toHaveBeenCalledWith({
      executor,
      capabilityReporter: workbenchReporter,
      runtimeProfile: 'default',
    });
    expect(createExecutionResponsesService).toHaveBeenCalledWith(
      expect.objectContaining({
        executeStoredRunStep: expect.any(Function),
      }),
    );
    expect(services).toEqual({
      responsesService,
      mediaGenerationService,
      workbenchCapabilityReporter: workbenchReporter,
      accountMirrorStatusRegistry: expect.objectContaining({
        readStatus: expect.any(Function),
        updateState: expect.any(Function),
        mergeState: expect.any(Function),
      }),
      accountMirrorRefreshService: expect.objectContaining({
        requestRefresh: expect.any(Function),
      }),
      accountMirrorCatalogService: expect.objectContaining({
        readCatalog: expect.any(Function),
      }),
      accountMirrorCompletionService: expect.objectContaining({
        start: expect.any(Function),
        read: expect.any(Function),
        control: expect.any(Function),
      }),
    });
  });
});
