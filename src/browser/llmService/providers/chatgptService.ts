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

	private async runWithUtilityAffinity<TResult>(
		options: BrowserProviderListOptions | undefined,
		run: (exactOptions: BrowserProviderListOptions) => Promise<TResult>,
	): Promise<TResult> {
		if (options?.tabTargetId) {
			return run(options);
		}
		return (await this.runUtilityOperation({
			userConfig: this.getResolvedUserConfig(),
			browserService: this.getBrowserService(),
			utilityId: this.utilityAffinityId,
			options,
			mutability: "read-only",
			buildListOptions: (overrides) => this.buildListOptions(overrides, { ensurePort: true }),
			run,
		})) as TResult;
	}

	private usesUtilityAffinity(): boolean {
		return this.getResolvedUserConfig().browser?.tabConcurrencyMode === "tab-affinity";
	}

	async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
		if (!this.provider.listProjects) {
			return [];
		}
		if (this.usesUtilityAffinity()) {
			return this.runWithUtilityAffinity(
				options,
				(exactOptions) => this.provider.listProjects?.(exactOptions) as Promise<Project[]>,
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
		if (this.usesUtilityAffinity()) {
			return this.runWithUtilityAffinity(
				options,
				(exactOptions) =>
					this.provider.listConversations?.(
						projectId,
						this.scopeConversationListOptions(exactOptions, projectId),
					) as Promise<Conversation[]>,
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
		if (this.usesUtilityAffinity() && this.provider.getUserIdentity) {
			return this.runWithUtilityAffinity(
				options,
				async (exactOptions) => (await this.getProviderSessionProof(exactOptions)).observation,
			);
		}
		return (await this.getProviderSessionProof(options)).observation;
	}

	override listProjectFiles(
		projectId: string,
		options?: Parameters<LlmService["listProjectFiles"]>[1],
	): ReturnType<LlmService["listProjectFiles"]> {
		if (!this.usesUtilityAffinity()) return super.listProjectFiles(projectId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.listProjectFiles(projectId, { ...options, listOptions }),
		);
	}

	override materializeProjectFiles(
		projectId: string,
		options?: Parameters<LlmService["materializeProjectFiles"]>[1],
	): ReturnType<LlmService["materializeProjectFiles"]> {
		if (!this.usesUtilityAffinity()) return super.materializeProjectFiles(projectId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeProjectFiles(projectId, { ...options, listOptions }),
		);
	}

	override listAccountFiles(
		options?: Parameters<LlmService["listAccountFiles"]>[0],
	): ReturnType<LlmService["listAccountFiles"]> {
		if (!this.usesUtilityAffinity()) return super.listAccountFiles(options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.listAccountFiles({ ...options, listOptions }),
		);
	}

	override downloadAccountFile(
		fileId: string,
		destPath: string,
		options?: Parameters<LlmService["downloadAccountFile"]>[2],
	): ReturnType<LlmService["downloadAccountFile"]> {
		if (!this.usesUtilityAffinity()) return super.downloadAccountFile(fileId, destPath, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.downloadAccountFile(fileId, destPath, { ...options, listOptions }),
		);
	}

	override materializeAccountFiles(
		options?: Parameters<LlmService["materializeAccountFiles"]>[0],
	): ReturnType<LlmService["materializeAccountFiles"]> {
		if (!this.usesUtilityAffinity()) return super.materializeAccountFiles(options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeAccountFiles({ ...options, listOptions }),
		);
	}

	override listConversationFiles(
		conversationId: string,
		options?: Parameters<LlmService["listConversationFiles"]>[1],
	): ReturnType<LlmService["listConversationFiles"]> {
		if (!this.usesUtilityAffinity()) return super.listConversationFiles(conversationId, options);
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.listConversationFiles(conversationId, { ...options, listOptions }),
		);
	}

	override materializeConversationArtifacts(
		conversationId: string,
		options?: Parameters<LlmService["materializeConversationArtifacts"]>[1],
	): ReturnType<LlmService["materializeConversationArtifacts"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeConversationArtifacts(conversationId, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeConversationArtifacts(conversationId, { ...options, listOptions }),
		);
	}

	override materializeConversationArtifact(
		conversationId: string,
		artifact: Parameters<LlmService["materializeConversationArtifact"]>[1],
		destDir: string,
		options?: Parameters<LlmService["materializeConversationArtifact"]>[3],
	): ReturnType<LlmService["materializeConversationArtifact"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeConversationArtifact(conversationId, artifact, destDir, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeConversationArtifact(conversationId, artifact, destDir, {
				...options,
				listOptions,
			}),
		);
	}

	override materializeActiveMediaArtifacts(
		input: Parameters<LlmService["materializeActiveMediaArtifacts"]>[0],
		destDir: string,
		options?: Parameters<LlmService["materializeActiveMediaArtifacts"]>[2],
	): ReturnType<LlmService["materializeActiveMediaArtifacts"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeActiveMediaArtifacts(input, destDir, options);
		}
		return this.runWithUtilityAffinity(options, (listOptions) =>
			super.materializeActiveMediaArtifacts(input, destDir, listOptions),
		);
	}

	override materializeConversationFiles(
		conversationId: string,
		options?: Parameters<LlmService["materializeConversationFiles"]>[1],
	): ReturnType<LlmService["materializeConversationFiles"]> {
		if (!this.usesUtilityAffinity()) {
			return super.materializeConversationFiles(conversationId, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.materializeConversationFiles(conversationId, { ...options, listOptions }),
		);
	}

	override getConversationContext(
		conversationId: string,
		options?: Parameters<LlmService["getConversationContext"]>[1],
	): ReturnType<LlmService["getConversationContext"]> {
		if (!this.usesUtilityAffinity() || options?.cacheOnly) {
			return super.getConversationContext(conversationId, options);
		}
		return this.runWithUtilityAffinity(options?.listOptions, (listOptions) =>
			super.getConversationContext(conversationId, { ...options, listOptions }),
		);
	}
}
