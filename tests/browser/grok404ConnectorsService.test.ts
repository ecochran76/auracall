// biome-ignore-all lint/style/useNamingConvention: CDP and provider identity wire names are case-sensitive.
import { describe, expect, it } from "vitest";
import { createGrokConnectorsService } from "../../src/browser/grokConnectorsService.js";
import {
	connectorDomFixture,
	fixtureConnectorServiceOptions,
} from "./grok404ConnectorDomFixture.js";

describe("governed Grok Connector discovery service", () => {
	it("refuses ungoverned connections before DOM access and closes the transport", async () => {
		let closed = false;
		const service = createGrokConnectorsService(
			{},
			{
				connect: async () => ({
					client: {
						Runtime: {
							evaluate: async () => {
								throw new Error("Must not read");
							},
						},
						close: async () => {
							closed = true;
						},
					},
					shouldClose: false,
					host: "localhost",
					port: 1,
				}),
			},
		);
		await expect(service.list()).rejects.toThrow("grok_connector_governor_required");
		expect(closed).toBe(true);
	});
	it("rejects a different observed Grok account before Connector discovery", async () => {
		const fixture = connectorDomFixture({ userEmail: "other@example.test" });
		const service = createGrokConnectorsService(fixtureConnectorServiceOptions(), {
			connect: async () => ({
				client: {
					Runtime: fixture.runtime,
					close: async () => {},
					__auracallProviderTrafficGovernor: {
						attribution: { provider: "grok", targetId: "fixture-target" },
						admitBackendRequest: async () => {},
						begin: async () => ({ settle: async () => {} }),
					},
				},
				targetId: "fixture-target",
				shouldClose: false,
				host: "localhost",
				port: 1,
			}),
		});
		await expect(service.list()).rejects.toThrow("grok_connector_account_not_verified");
	});
	it("refuses a detail result when the provider account changes during observation", async () => {
		const fixture = connectorDomFixture();
		const row = fixture.document
			.querySelectorAll("button")
			.find((node) => node.ownText.startsWith("Example\n"));
		const open = row?.onClick;
		if (row)
			row.onClick = () => {
				open?.();
				fixture.setUserEmail("other@example.test");
			};
		const service = createGrokConnectorsService(fixtureConnectorServiceOptions(), {
			connect: async () => ({
				client: {
					Runtime: fixture.runtime,
					close: async () => {},
					__auracallProviderTrafficGovernor: {
						attribution: { provider: "grok", targetId: "fixture-target" },
						admitBackendRequest: async () => {},
						begin: async () => ({ settle: async () => {} }),
					},
				},
				targetId: "fixture-target",
				shouldClose: false,
				host: "localhost",
				port: 1,
			}),
		});
		await expect(service.inspect({ name: "Example", kind: "installed" })).rejects.toThrow(
			"grok_connector_account_not_verified",
		);
	});
	it("retains the owned target when transport cleanup leaves request custody unknown", async () => {
		let targetClosed = false;
		const fixture = connectorDomFixture();
		const service = createGrokConnectorsService(fixtureConnectorServiceOptions(), {
			connect: async () => ({
				client: {
					Runtime: fixture.runtime,
					close: async () => {
						throw new Error("owned cleanup unknown");
					},
					__auracallProviderTrafficGovernor: {
						attribution: { provider: "grok", targetId: "fixture-target" },
						admitBackendRequest: async () => {},
						begin: async () => ({ settle: async () => {} }),
					},
				},
				targetId: "fixture-target",
				shouldClose: true,
				host: "localhost",
				port: 1,
			}),
			closeTarget: async () => {
				targetClosed = true;
			},
		});
		await expect(service.list()).rejects.toThrow("owned cleanup unknown");
		expect(targetClosed).toBe(false);
	});
});
