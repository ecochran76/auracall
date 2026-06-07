import { createHash } from "node:crypto";
import type { ResolvedUserConfig } from "../config.js";
import { ChatgptService } from "../browser/llmService/providers/chatgptService.js";
import {
	createProviderNativeHandoffTargetAdapter,
	type HandoffProviderNativePromptInput,
	type HandoffProviderNativePromptResult,
	type HandoffProviderNativeUploadInput,
	type HandoffProviderNativeUploadResult,
	type HandoffTargetAdapter,
} from "./service.js";

export function createChatgptBrowserHandoffTargetAdapter(
	userConfig: ResolvedUserConfig,
): HandoffTargetAdapter {
	const runtimeProfileId =
		typeof userConfig.auracallProfile === "string" ? userConfig.auracallProfile : null;
	const acquiredAt = new Date().toISOString();
	const operation = {
		kind: "handoff_target_submit",
		id: null,
		provider: "chatgpt",
		runtimeProfileId,
		browserProfileId: null,
		sourceType: "handoff",
		sourceKey: null,
		reason: "chatgpt-browser-handoff-prompt-attachment",
	};
	const service = ChatgptService.create(userConfig, {
		browserProcessOwner: {
			owner: {
				...operation,
				acquiredAt,
				heartbeatAt: acquiredAt,
			},
			operation,
			lease: {
				id: `handoff_target_submit:chatgpt:${runtimeProfileId ?? "default"}`,
				ownerId: null,
				acquiredAt,
				heartbeatAt: acquiredAt,
				expiresAt: null,
				cleanupPolicy: "handoff-target-submit-provider-work",
			},
		},
	});
	return createProviderNativeHandoffTargetAdapter(
		{
			submit: (input) => submitChatgptHandoffPrompt(service, input),
		},
		{
			upload: stageChatgptPromptAttachments,
		},
	);
}

async function stageChatgptPromptAttachments(
	input: HandoffProviderNativeUploadInput,
): Promise<HandoffProviderNativeUploadResult> {
	if (input.provider !== "chatgpt") {
		return {
			files: input.files.map((file) => ({
				sourceManifestItemId: file.sourceManifestItemId,
				status: "failed",
				error: `ChatGPT browser handoff adapter cannot upload to ${input.provider}.`,
				retryable: false,
			})),
		};
	}
	return {
		files: input.files.map((file) => ({
			sourceManifestItemId: file.sourceManifestItemId,
			status: "uploaded",
			providerFileId: buildChatgptPromptAttachmentId(input.packageDigest, file),
		})),
	};
}

async function submitChatgptHandoffPrompt(
	service: ChatgptService,
	input: HandoffProviderNativePromptInput,
): Promise<HandoffProviderNativePromptResult> {
	if (input.provider !== "chatgpt") {
		throw new Error(`ChatGPT browser handoff adapter cannot submit to ${input.provider}.`);
	}
	const prompt = buildChatgptHandoffPrompt(input);
	const result = await service.runPrompt({
		prompt,
		attachments: input.uploadedFiles.map((file) => ({
			path: file.absolutePath,
			displayPath: file.filename,
			sizeBytes: file.sizeBytes,
		})),
		completionMode: "prompt_submitted",
		configuredUrl: input.conversationRef,
		conversationId: extractChatgptConversationId(input.conversationRef),
		projectId: input.projectRef,
	});
	const targetConversationRef =
		normalizeString(result.url) ??
		(result.conversationId ? `https://chatgpt.com/c/${encodeURIComponent(result.conversationId)}` : null) ??
		input.conversationRef;
	return {
		targetConversationRef,
		providerMessageId: normalizeString(result.tabTargetId)
			? `chatgpt-tab:${normalizeString(result.tabTargetId)}`
			: null,
		responseSummary: "ChatGPT browser handoff prompt submitted with selected attachments.",
		responseExcerpt: `Submitted ${input.uploadedFiles.length} selected attachment(s) through ChatGPT browser mode.`,
	};
}

function buildChatgptHandoffPrompt(input: HandoffProviderNativePromptInput): string {
	const compactContextJson = JSON.stringify(input.compactContext, null, 2);
	return [
		input.prompt.trimEnd(),
		"## Compact Context JSON",
		"```json",
		compactContextJson,
		"```",
		input.uploadedFiles.length > 0
			? [
					"## Attached Files",
					...input.uploadedFiles.map(
						(file) =>
							`- ${file.filename} (${file.sourceManifestItemId}, ${file.sizeBytes} bytes, ${file.checksumSha256})`,
					),
				].join("\n")
			: null,
	]
		.filter((part): part is string => Boolean(part))
		.join("\n\n");
}

function buildChatgptPromptAttachmentId(
	packageDigest: string,
	file: HandoffProviderNativeUploadInput["files"][number],
): string {
	const digest = createHash("sha256")
		.update(
			JSON.stringify({
				packageDigest,
				sourceManifestItemId: file.sourceManifestItemId,
				checksumSha256: file.checksumSha256,
			}),
		)
		.digest("hex")
		.slice(0, 32);
	return `chatgpt-prompt-attachment-${digest}`;
}

function extractChatgptConversationId(value: string | null): string | null {
	const normalized = normalizeString(value);
	if (!normalized) return null;
	try {
		const url = new URL(normalized);
		const match = url.pathname.match(/\/c\/([^/?#]+)/);
		return match?.[1] ? decodeURIComponent(match[1]) : null;
	} catch {
		const match = normalized.match(/\/c\/([^/?#]+)/);
		return match?.[1] ? decodeURIComponent(match[1]) : null;
	}
}

function normalizeString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
