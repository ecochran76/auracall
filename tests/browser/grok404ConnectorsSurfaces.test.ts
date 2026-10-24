// biome-ignore-all lint/style/useNamingConvention: CDP and provider identity wire names are case-sensitive.
import { describe, expect, it } from "vitest";
import { createGrokConnectorsService } from "../../src/browser/grokConnectorsService.js";
import {
	runGrokConnectorsCommand,
	summarizeGrokConnectorDiagnostics,
} from "../../src/cli/grokConnectorsCommand.js";
import { createGrokConnectorsToolHandler } from "../../src/mcp/tools/grokConnectors.js";
import {
	connectorDomFixture,
	fixtureConnectorServiceOptions,
} from "./grok404ConnectorDomFixture.js";

function service() {
	const fixture = connectorDomFixture();
	return createGrokConnectorsService(fixtureConnectorServiceOptions(), {
		connect: async () => ({
			client: {
				Runtime: fixture.runtime,
				close: async () => {},
				__auracallProviderTrafficGovernor: {
					attribution: { provider: "grok", targetId: "fixture-target" },
					admitBackendRequest: async (_key: string, effect: () => Promise<void>) => effect(),
					begin: async () => ({ settle: async () => {} }),
				},
			},
			targetId: "fixture-target",
			host: "localhost",
			port: 1,
			shouldClose: false,
		}),
	});
}
describe("Grok Connector discovery surfaces", () => {
	it("preserves the public service result across CLI and MCP and bounds Ops diagnostics", async () => {
		const request = { action: "inspect", selector: { name: "Example", kind: "installed" } };
		const cli = await runGrokConnectorsCommand(request, service());
		const mcp = await createGrokConnectorsToolHandler(() => service())(request);
		expect(mcp.structuredContent).toEqual(cli);
		expect(cli.providerAccountRef).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(cli)).not.toContain("operator@example.test");
		const diagnostics = summarizeGrokConnectorDiagnostics(cli);
		expect(diagnostics).toMatchObject({
			status: "incomplete",
			tools: 2,
			hasEndpointIdentity: true,
			hasAccountIdentity: false,
		});
		expect(JSON.stringify(diagnostics)).not.toContain("Example");
		expect(JSON.stringify(diagnostics)).not.toContain("example.test");
	});
	it("does not serialize private transport failure details through MCP", async () => {
		const tool = createGrokConnectorsToolHandler(() => ({
			list: async () => {
				throw new Error("https://private.test/mcp?token=secret");
			},
			inspect: async () => {
				throw new Error("private");
			},
		}));
		const result = await tool({ action: "list" });
		expect(result).toMatchObject({
			isError: true,
			structuredContent: { status: "failed", code: "grok_connector_discovery_failed" },
		});
		expect(JSON.stringify(result)).not.toContain("secret");
		expect(JSON.stringify(result)).not.toContain("private.test");
	});
});
