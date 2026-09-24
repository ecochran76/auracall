import { randomUUID } from "node:crypto";
import type { ResolvedUserConfig } from "../../../config.js";
import { runConfiguredChatgptUtilityOperation } from "../../configuredChatgptUtilityAffinity.js";
import type { Conversation, Project } from "../../providers/domain.js";
import { getProvider } from "../../providers/index.js";
import type { BrowserProviderListOptions, ProviderUserIdentity } from "../../providers/types.js";
import {
	type BrowserProcessOwnerAttribution,
	BrowserService,
} from "../../service/browserService.js";
import { LlmService } from "../llmService.js";
import type { IdentityPrompt, LlmServiceAdapter } from "../types.js";

export class ChatgptService extends LlmService {
	private readonly utilityAffinityId = `chatgpt-service-${randomUUID()}`;
	private readonly runUtilityOperation: typeof runConfiguredChatgptUtilityOperation;

	private constructor(
		userConfig: ResolvedUserConfig,
		provider: LlmServiceAdapter,
		browserService: BrowserService,
		options?: {
			identityPrompt?: IdentityPrompt;
			runUtilityOperation?: typeof runConfiguredChatgptUtilityOperation;
		},
	) {
		super(userConfig, provider, browserService, options);
		this.runUtilityOperation = options?.runUtilityOperation ?? runConfiguredChatgptUtilityOperation;
	}

	static create(
		userConfig: ResolvedUserConfig,
		options?: {
			identityPrompt?: IdentityPrompt;
			browserProcessOwner?: BrowserProcessOwnerAttribution;
			browserService?: BrowserService;
			runUtilityOperation?: typeof runConfiguredChatgptUtilityOperation;
		},
	): ChatgptService {
		const provider = getProvider("chatgpt") as LlmServiceAdapter;
		const browserService =
			options?.browserService ??
			BrowserService.fromConfig(userConfig, "chatgpt", {
				browserProcessOwner: options?.browserProcessOwner,
			});
		return new ChatgptService(userConfig, provider, browserService, options);
	}

	async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
		if (!this.provider.listProjects) {
			return [];
		}
		if (this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity") {
			return (
				(await this.runUtilityOperation({
					userConfig: this.getResolvedUserConfig(),
					browserService: this.getBrowserService(),
					utilityId: this.utilityAffinityId,
					options,
					mutability: "read-only",
					buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
					run: (exactOptions) => this.provider.listProjects?.(exactOptions) as Promise<Project[]>,
				})) ?? []
			);
		}
		const listOptions = await this.buildListOptions(options, { ensurePort: true });
		return (await this.withRetry(
			() => this.provider.listProjects?.(listOptions) as Promise<Project[]>,
			{ action: "listProjects" },
		)) as Project[];
	}

	async listConversations(
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<Conversation[]> {
		if (!this.provider.listConversations) {
			return [];
		}
		if (this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity") {
			return (
				(await this.runUtilityOperation({
					userConfig: this.getResolvedUserConfig(),
					browserService: this.getBrowserService(),
					utilityId: this.utilityAffinityId,
					options,
					mutability: "read-only",
					buildListOptions: async (overrides) =>
						this.scopeConversationListOptions(
							await this.buildListOptions(overrides, { ensurePort: true }),
							projectId,
						),
					run: (exactOptions) =>
						this.provider.listConversations?.(projectId, exactOptions) as Promise<Conversation[]>,
				})) ?? []
			);
		}
		const listOptions = this.scopeConversationListOptions(
			await this.buildListOptions(options, { ensurePort: true }),
			projectId,
		);
		return (await this.withRetry(
			() => this.provider.listConversations?.(projectId, listOptions) as Promise<Conversation[]>,
			{ action: "listConversations" },
		)) as Conversation[];
	}

	async renameConversation(
		conversationId: string,
		newTitle: string,
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<void> {
		if (!this.provider.renameConversation) {
			throw new Error(`Rename is not supported for ${this.providerId}.`);
		}
		if (this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity") {
			await this.runUtilityOperation({
				userConfig: this.getResolvedUserConfig(),
				browserService: this.getBrowserService(),
				utilityId: this.utilityAffinityId,
				options,
				mutability: "provider-mutating",
				buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
				run: (exactOptions) =>
					this.provider.renameConversation?.(
						conversationId,
						newTitle,
						projectId,
						exactOptions,
					) as Promise<void>,
			});
			return;
		}
		const listOptions = await this.buildListOptions(options, { ensurePort: true });
		await this.withRetry(
			() =>
				this.provider.renameConversation?.(
					conversationId,
					newTitle,
					projectId,
					listOptions,
				) as Promise<void>,
			{ action: "renameConversation" },
		);
	}

	async deleteConversation(
		conversationId: string,
		projectId?: string,
		options?: BrowserProviderListOptions,
	): Promise<void> {
		if (!this.provider.deleteConversation) {
			throw new Error(`Delete is not supported for ${this.providerId}.`);
		}
		if (this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity") {
			await this.runUtilityOperation({
				userConfig: this.getResolvedUserConfig(),
				browserService: this.getBrowserService(),
				utilityId: this.utilityAffinityId,
				options,
				mutability: "provider-mutating",
				buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
				run: (exactOptions) =>
					this.provider.deleteConversation?.(
						conversationId,
						projectId,
						exactOptions,
					) as Promise<void>,
			});
			return;
		}
		const listOptions = await this.buildListOptions(options, { ensurePort: true });
		await this.withRetry(
			() =>
				this.provider.deleteConversation?.(conversationId, projectId, listOptions) as Promise<void>,
			{ action: "deleteConversation" },
		);
	}

	async getUserIdentity(
		options?: BrowserProviderListOptions,
	): Promise<ProviderUserIdentity | null> {
		if (
			this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity" &&
			this.provider.getUserIdentity
		) {
			return await this.runUtilityOperation({
				userConfig: this.getResolvedUserConfig(),
				browserService: this.getBrowserService(),
				utilityId: this.utilityAffinityId,
				options,
				mutability: "read-only",
				buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
				run: async (exactOptions) => (await this.getProviderSessionProof(exactOptions)).observation,
			});
		}
		return (await this.getProviderSessionProof(options)).observation;
	}
}
