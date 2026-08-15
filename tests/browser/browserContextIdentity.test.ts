import { describe, expect, test, vi } from "vitest";
import type { ResolvedUserConfig } from "../../src/config.js";
import { LlmService } from "../../src/browser/llmService/llmService.js";
import type {
	LlmServiceAdapter,
	PromptInput,
	PromptResult,
} from "../../src/browser/llmService/types.js";
import type {
	BrowserProviderListOptions,
	ProviderUserIdentity,
} from "../../src/browser/providers/types.js";
import { resolveNonInteractiveBrowserContextIdentity } from "../../src/browser/llmService/cache/browserContextIdentity.js";

class BrowserContextIdentityTestService extends LlmService {
	constructor(userConfig: ResolvedUserConfig, provider: LlmServiceAdapter) {
		super(userConfig, provider, {} as never);
	}

	async listProjects(): Promise<[]> {
		return [];
	}

	async listConversations(): Promise<[]> {
		return [];
	}

	async runPrompt(_input: PromptInput): Promise<PromptResult> {
		throw new Error("not implemented");
	}

	async renameConversation(): Promise<void> {}

	async deleteConversation(): Promise<void> {}

	async getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
		return this.provider.getUserIdentity ? this.provider.getUserIdentity(options) : null;
	}
}

describe("non-interactive browser context identity", () => {
	test("resolves configured identity without waiting for live provider probes", async () => {
		const getUserIdentity = vi.fn(() => new Promise<ProviderUserIdentity | null>(() => {}));
		const getFeatureSignature = vi.fn(() => new Promise<string | null>(() => {}));
		const provider = {
			id: "chatgpt",
			config: { id: "chatgpt", selectors: {} as never },
			getUserIdentity,
			getFeatureSignature,
		} satisfies LlmServiceAdapter;
		const service = new BrowserContextIdentityTestService(
			({
				browser: { cache: {} },
				auracallProfile: "wsl-chrome-3",
				profiles: {
					"wsl-chrome-3": {
						services: {
							chatgpt: { identity: { email: "configured@example.com" } },
						},
					},
				},
			} as unknown) as ResolvedUserConfig,
			provider,
		);

		await expect(
			Promise.race([
				resolveNonInteractiveBrowserContextIdentity(service, {}),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("browser context identity timed out")), 100),
				),
			]),
		).resolves.toMatchObject({
			userIdentity: {
				email: "configured@example.com",
				source: "profile",
			},
			identityKey: "configured@example.com",
			featureSignature: null,
		});
		expect(getUserIdentity).not.toHaveBeenCalled();
		expect(getFeatureSignature).not.toHaveBeenCalled();
	});
});
