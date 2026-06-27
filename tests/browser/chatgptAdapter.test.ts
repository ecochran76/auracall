import { describe, expect, test, vi } from "vitest";
import {
	buildChatgptAuthSessionIdentityExpression,
	buildChatgptCreateProjectDialogStateExpressionForTest,
	classifyChatgptBlockingSurfaceProbe,
	createChatgptAdapter,
	extractChatgptConversationArtifactsFromPayload,
	extractChatgptConversationIdFromUrl,
	extractChatgptConversationSourcesFromPayload,
	extractChatgptProjectIdFromUrl,
	extractChatgptProjectSourceName,
	filterChatgptDeepResearchTargets,
	findChatgptProjectByName,
	findChatgptProjectSourceName,
	isChatgptTargetReusableForPreferredUrl,
	isRetryableChatgptTransientMessage,
	matchesChatgptConversationTitleProbe,
	matchesChatgptDeleteConfirmationProbe,
	matchesChatgptDownloadButtonProbe,
	matchesChatgptImageArtifactProbe,
	matchesChatgptProjectDeleteConfirmationProbe,
	matchesChatgptProjectSettingsSnapshot,
	matchesChatgptRenameEditorProbe,
	mergeChatgptCanvasArtifactContent,
	mergeChatgptConversationArtifacts,
	normalizeChatgptAuthSessionIdentity,
	normalizeChatgptConversationDownloadArtifactProbes,
	normalizeChatgptConversationFileProbes,
	normalizeChatgptConversationHistoryLimit,
	normalizeChatgptConversationId,
	normalizeChatgptConversationLinkProbes,
	normalizeChatgptLibraryItemProbes,
	normalizeChatgptProjectId,
	normalizeChatgptProjectSourceProbes,
	normalizeChatgptVisibleImageArtifactProbes,
	readChatgptConversationPayloadWithClient,
	recoverVisibleChatgptBlockingSurfaceWithClientForTest,
	resolveChatgptCanvasArtifactContentText,
	resolveChatgptConversationUrl,
	resolveChatgptProjectCreateConfirmLabelsForTest,
	resolveChatgptProjectMemoryLabel,
	resolveChatgptProjectMemoryLabelCandidates,
	resolveChatgptProjectSettingsCommitLabelsForTest,
	resolveChatgptProjectSourceUploadActionLabelsForTest,
	resolveChatgptProjectUrl,
	serializeChatgptGridRowsToCsv,
} from "../../src/browser/providers/chatgptAdapter.js";
import { normalizeProjectMemoryMode } from "../../src/browser/providers/domain.js";

describe("isChatgptTargetReusableForPreferredUrl", () => {
	test("does not reuse running conversation tabs for root/library requests", () => {
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/g/g-p-demo/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/library",
			),
		).toBe(false);
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/",
			),
		).toBe(false);
	});

	test("allows exact conversation reuse only for the matching conversation request", () => {
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/g/g-p-demo/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/g/g-p-demo/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
			),
		).toBe(true);
		expect(
			isChatgptTargetReusableForPreferredUrl(
				"https://chatgpt.com/c/6a0a6f14-7a80-83ea-a77b-81f654b709aa",
				"https://chatgpt.com/c/6a0a69aa-1f5c-83ea-bcdc-692457c7e212",
			),
		).toBe(false);
	});
});

describe("filterChatgptDeepResearchTargets", () => {
	test("keeps only Deep Research iframe targets embedded in the active page", () => {
		const activeFrameUrl = "https://chatgpt.com/backend-api/deep_research/report-active?token=1";
		const staleFrameUrl = "https://chatgpt.com/backend-api/deep_research/report-stale?token=2";
		const targets = [
			{
				type: "iframe",
				id: "active-frame",
				title: "Deep Research",
				url: activeFrameUrl,
			},
			{
				type: "iframe",
				id: "stale-frame",
				title: "Deep Research",
				url: staleFrameUrl,
			},
			{
				type: "page",
				id: "page-target",
				title: "ChatGPT",
				url: "https://chatgpt.com/c/6a09ccc6-7576-439e-896e-10f9feae6ab5",
			},
		] as Parameters<typeof filterChatgptDeepResearchTargets>[0];

		expect(
			filterChatgptDeepResearchTargets(targets, new Set([activeFrameUrl])).map(
				(target) => target.id,
			),
		).toEqual(["active-frame"]);
		expect(
			filterChatgptDeepResearchTargets(targets, new Set([activeFrameUrl]), {
				expectedTargetId: "stale-frame",
			}),
		).toEqual([]);
	});
});

describe("normalizeChatgptLibraryItemProbes", () => {
	test("uses provider UUIDs and dedupes duplicated library entries", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "Research appendix.pdf",
				href: "https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
				kind: "file",
				text: "Research appendix.pdf PDF",
			},
			{
				title: "Research appendix.pdf",
				href: "https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
				kind: "download",
				text: "Research appendix.pdf Download",
			},
			{
				title: "Market model.xlsx",
				href: "https://chatgpt.com/library/artifacts/223e4567-e89b-12d3-a456-426614174111",
				kind: "spreadsheet",
				text: "Market model.xlsx Spreadsheet",
			},
		]);

		expect(inventory.files.map((file) => file.id)).toEqual([
			"123e4567-e89b-12d3-a456-426614174000",
			"223e4567-e89b-12d3-a456-426614174111",
		]);
		expect(inventory.files[0]).toMatchObject({
			name: "Research appendix.pdf",
			provider: "chatgpt",
			source: "account",
			mimeType: "application/pdf",
			metadata: {
				source: "chatgpt-library",
				libraryIdentitySource: "provider-uuid",
				libraryRouteKind: "library_file_detail",
				libraryRouteUrl: "https://chatgpt.com/library/files/123e4567-e89b-12d3-a456-426614174000",
				artifactId: "chatgpt-library:123e4567-e89b-12d3-a456-426614174000",
				artifactKind: "download",
			},
		});
		expect(inventory.artifacts).toMatchObject([
			{
				id: "chatgpt-library:123e4567-e89b-12d3-a456-426614174000",
				title: "Research appendix.pdf",
				kind: "download",
			},
			{
				id: "chatgpt-library:223e4567-e89b-12d3-a456-426614174111",
				title: "Market model.xlsx",
				kind: "spreadsheet",
			},
		]);
	});

	test("creates stable UUID-shaped IDs when the library item has no provider UUID", () => {
		const first = normalizeChatgptLibraryItemProbes([
			{
				title: "Untitled canvas",
				href: "https://chatgpt.com/library/canvas/local-route",
				kind: "canvas",
			},
		]);
		const second = normalizeChatgptLibraryItemProbes([
			{
				title: "Untitled canvas",
				href: "https://chatgpt.com/library/canvas/local-route",
				kind: "canvas",
			},
		]);

		expect(first.files[0]?.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(second.files[0]?.id).toBe(first.files[0]?.id);
		expect(first.artifacts[0]).toMatchObject({
			id: `chatgpt-library:${first.files[0]?.id}`,
			kind: "canvas",
			metadata: {
				libraryRouteKind: "library_canvas_detail",
				libraryRouteUrl: "https://chatgpt.com/library/canvas/local-route",
			},
		});
	});

	test("uses ChatGPT Library row file ids for account-file retrieval", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "2026-05-15 GreenKey whitepaper.pdf",
				testId: "artifact-checkbox-bridge-file_00000000fa5871fbaa5ba6f3e05d99f6",
				ariaLabel: "Select 2026-05-15 GreenKey whitepaper.pdf",
				providerFileId: "file_00000000fa5871fbaa5ba6f3e05d99f6",
				libraryFileId: "libfile_ea646b8add488191959d6333f4a6ef9b",
			},
		]);

		expect(inventory.files).toHaveLength(1);
		expect(inventory.files[0]?.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(inventory.files[0]).toMatchObject({
			name: "2026-05-15 GreenKey whitepaper.pdf",
			provider: "chatgpt",
			source: "account",
			remoteUrl: "chatgpt://file/file_00000000fa5871fbaa5ba6f3e05d99f6",
			mimeType: "application/pdf",
			metadata: {
				source: "chatgpt-library",
				libraryIdentity: "file_00000000fa5871fbaa5ba6f3e05d99f6",
				libraryIdentitySource: "provider-file-id",
				libraryRouteKind: "library_file_detail",
				libraryRouteUrl:
					"https://chatgpt.com/library/files/libfile_ea646b8add488191959d6333f4a6ef9b",
				providerFileId: "file_00000000fa5871fbaa5ba6f3e05d99f6",
				libraryFileId: "libfile_ea646b8add488191959d6333f4a6ef9b",
				materializationSurface: "chatgpt-library-file-row-click",
			},
		});
	});

	test("classifies conversation links as detail routes rather than downloads", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "File creation request",
				href: "https://chatgpt.com/c/6a0bcbbd-009c-83ea-b817-5b86181927f1",
				kind: "download",
			},
		]);

		expect(inventory.files[0]).toMatchObject({
			name: "File creation request",
			remoteUrl: "https://chatgpt.com/c/6a0bcbbd-009c-83ea-b817-5b86181927f1",
			metadata: {
				libraryRouteKind: "conversation_detail",
				libraryRouteUrl: "https://chatgpt.com/c/6a0bcbbd-009c-83ea-b817-5b86181927f1",
			},
		});
	});

	test("drops library page chrome while preserving decoded file titles", () => {
		const inventory = normalizeChatgptLibraryItemProbes([
			{
				title: "Skip to content",
				href: "https://chatgpt.com/library#main",
			},
			{
				title: "Library",
				href: "https://chatgpt.com/library",
				testId: "sidebar-item-recall",
			},
			{
				title: "ChE%204470%20Exam.docx",
				kind: "file",
			},
		]);

		expect(inventory.files).toHaveLength(1);
		expect(inventory.files[0]).toMatchObject({
			name: "ChE 4470 Exam.docx",
			mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});
	});
});

describe("extractChatgptProjectIdFromUrl", () => {
	test("returns the project id for concrete project URLs", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/project",
			),
		).toBe("g-p-68c1a5feea188191809eb91ef1f14c3b");
	});

	test("returns the project id for project conversation URLs", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222",
			),
		).toBe("g-p-68c1a5feea188191809eb91ef1f14c3b");
	});

	test("keeps bare project ids unchanged", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project",
			),
		).toBe("g-p-69c851be8cc88191afe109bea1b2a28d");
	});

	test("returns null for non-project urls", () => {
		expect(
			extractChatgptProjectIdFromUrl("https://chatgpt.com/c/69c80cee-440c-8333-8369-c36b99382172"),
		).toBeNull();
	});

	test("returns null for malformed project routes without a canonical g-p id", () => {
		expect(
			extractChatgptProjectIdFromUrl(
				"https://chatgpt.com/g/AuraCall%20Cache%20Identity%20Probe%201774743669/project",
			),
		).toBeNull();
	});
});

describe("extractChatgptConversationIdFromUrl", () => {
	test("returns the conversation id for root conversation URLs", () => {
		expect(
			extractChatgptConversationIdFromUrl(
				"https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
			),
		).toBe("69c93b5d-e6b0-8332-8c20-da466cc863da");
	});

	test("returns the conversation id for project conversation URLs", () => {
		expect(
			extractChatgptConversationIdFromUrl(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222",
			),
		).toBe("69c73884-2fb0-832f-8acc-c043e5002222");
	});
});

describe("normalizeChatgptConversationId", () => {
	test("keeps bare root conversation ids unchanged", () => {
		expect(normalizeChatgptConversationId("69c9a282-91a4-832e-b8c0-21fa595a24a9")).toBe(
			"69c9a282-91a4-832e-b8c0-21fa595a24a9",
		);
	});

	test("extracts ids from root and project conversation urls", () => {
		expect(
			normalizeChatgptConversationId("https://chatgpt.com/c/69c9a282-91a4-832e-b8c0-21fa595a24a9"),
		).toBe("69c9a282-91a4-832e-b8c0-21fa595a24a9");
		expect(
			normalizeChatgptConversationId(
				"https://chatgpt.com/g/g-p-68c1a5feea188191809eb91ef1f14c3b-reviewer/c/69c73884-2fb0-832f-8acc-c043e5002222",
			),
		).toBe("69c73884-2fb0-832f-8acc-c043e5002222");
	});

	test("rejects non-conversation selectors", () => {
		expect(normalizeChatgptConversationId("ChatGPT ACCEPT BASE")).toBeNull();
		expect(
			normalizeChatgptConversationId(
				"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project",
			),
		).toBeNull();
	});
});

describe("normalizeChatgptProjectId", () => {
	test("keeps bare ids unchanged and strips slug suffixes", () => {
		expect(normalizeChatgptProjectId("g-p-69c859e5d5b48191af37847a03153475")).toBe(
			"g-p-69c859e5d5b48191af37847a03153475",
		);
		expect(normalizeChatgptProjectId("g-p-69c859e5d5b48191af37847a03153475-oracle")).toBe(
			"g-p-69c859e5d5b48191af37847a03153475",
		);
		expect(normalizeChatgptProjectId("133ad4c5-b857-4a30-bf17-d951db57c33f")).toBe(
			"133ad4c5-b857-4a30-bf17-d951db57c33f",
		);
	});

	test("rejects non-canonical project ids", () => {
		expect(normalizeChatgptProjectId("AuraCall Cache Identity Probe 1774743669")).toBeNull();
		expect(
			normalizeChatgptProjectId("AuraCall%20Cache%20Identity%20Probe%201774743669"),
		).toBeNull();
	});
});

describe("findChatgptProjectByName", () => {
	test("matches projects by normalized exact name", () => {
		expect(
			findChatgptProjectByName(
				[
					{
						id: "g-p-1-reviewer",
						name: "Reviewer",
						url: "https://chatgpt.com/g/g-p-1-reviewer/project",
					},
					{
						id: "g-p-2-auracall-cedar",
						name: "  AuraCall   Cedar Harbor  ",
						url: "https://chatgpt.com/g/g-p-2-auracall-cedar/project",
					},
				],
				"AuraCall Cedar Harbor",
			),
		).toEqual({
			id: "g-p-2-auracall-cedar",
			name: "  AuraCall   Cedar Harbor  ",
			url: "https://chatgpt.com/g/g-p-2-auracall-cedar/project",
		});
	});
});

describe("resolveChatgptProjectMemoryLabel", () => {
	test("maps global mode to the ChatGPT Default label", () => {
		expect(resolveChatgptProjectMemoryLabel("global")).toBe("Default");
	});

	test("maps project mode to the ChatGPT Project-only label", () => {
		expect(resolveChatgptProjectMemoryLabel("project")).toBe("Project-only");
	});

	test("keeps tolerant candidates for current menuitem-based project memory selector", () => {
		expect(resolveChatgptProjectMemoryLabelCandidates("global")).toEqual(
			expect.arrayContaining(["Default", "Default memory"]),
		);
		expect(resolveChatgptProjectMemoryLabelCandidates("project")).toEqual(
			expect.arrayContaining(["Project-only", "Project only", "Project-only memory"]),
		);
	});
});

describe("resolveChatgptProjectSettingsCommitLabelsForTest", () => {
	test("uses manifest-owned project settings commit button labels", () => {
		expect(resolveChatgptProjectSettingsCommitLabelsForTest()).toEqual(
			expect.arrayContaining(["save", "save changes", "done", "apply"]),
		);
	});
});

describe("resolveChatgptProjectCreateConfirmLabelsForTest", () => {
	test("uses manifest-owned create-project confirm button labels", () => {
		expect(resolveChatgptProjectCreateConfirmLabelsForTest()).toEqual(
			expect.arrayContaining(["create project", "create", "continue"]),
		);
	});
});

describe("buildChatgptCreateProjectDialogStateExpressionForTest", () => {
	test("recognizes the current create-project modal selectors", () => {
		const expression = buildChatgptCreateProjectDialogStateExpressionForTest();

		expect(expression).toContain('input[name=\\"projectName\\"]');
		expect(expression).toContain("create project");
		expect(expression).toContain("projectName");
		expect(expression).toContain("closeButtonLabels");
	});
});

describe("resolveChatgptProjectSourceUploadActionLabelsForTest", () => {
	test("uses manifest-owned project source upload action labels", () => {
		expect(resolveChatgptProjectSourceUploadActionLabelsForTest()).toEqual(
			expect.arrayContaining(["upload", "browse", "upload file"]),
		);
	});
});

describe("resolveChatgptProjectUrl", () => {
	test("builds project routes from the service manifest template", () => {
		expect(resolveChatgptProjectUrl("g-p-69c851be8cc88191afe109bea1b2a28d")).toBe(
			"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/project",
		);
		expect(resolveChatgptProjectUrl("133ad4c5-b857-4a30-bf17-d951db57c33f")).toBe(
			"https://chatgpt.com/g/133ad4c5-b857-4a30-bf17-d951db57c33f/project",
		);
	});
});

describe("classifyChatgptBlockingSurfaceProbe", () => {
	test("classifies rate limit surfaces", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Too many requests. You are making requests too quickly. Please try again later.",
			}),
		).toEqual({
			kind: "rate-limit",
			summary: "Too many requests.",
		});
	});

	test("classifies connection failures", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Server connection failed. Please check your network and try again.",
			}),
		).toEqual({
			kind: "connection-failed",
			summary: "Server connection failed.",
		});
	});

	test("classifies retry affordances on failed chat turns", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Server connection failed.",
				buttonLabels: ["Retry"],
			}),
		).toEqual({
			kind: "retry-affordance",
			summary: "retry",
		});
	});

	test("classifies generic transient error surfaces", () => {
		expect(
			classifyChatgptBlockingSurfaceProbe({
				text: "Something went wrong while generating the response. Please try again.",
			}),
		).toEqual({
			kind: "transient-error",
			summary: "Something went wrong while generating the response.",
		});
	});
});

describe("isRetryableChatgptTransientMessage", () => {
	test("treats known transient ChatGPT failures as retryable", () => {
		expect(isRetryableChatgptTransientMessage("Server connection failed.")).toBe(true);
		expect(isRetryableChatgptTransientMessage("Something went wrong. Please try again.")).toBe(
			true,
		);
		expect(isRetryableChatgptTransientMessage("Too many requests.")).toBe(true);
	});

	test("does not mark unrelated text as retryable", () => {
		expect(isRetryableChatgptTransientMessage("Project settings")).toBe(false);
	});
});

describe("readChatgptConversationPayloadWithClient", () => {
	test("does not reload the active ChatGPT tab when preserveActiveTab is set", async () => {
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(async () => ({
					result: {
						value: {
							ok: false,
							status: 404,
							body: "{}",
						},
					},
				})),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Network: {
				enable: vi.fn(),
				responseReceived: vi.fn(),
				loadingFinished: vi.fn(),
				getResponseBody: vi.fn(),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(),
				reload: vi.fn(),
			},
		};

		await expect(
			readChatgptConversationPayloadWithClient(
				client as never,
				"69d04b50-3c88-8325-8240-0d838d47ee50",
				null,
				{ preserveActiveTab: true },
			),
		).resolves.toBeNull();

		expect(client.Runtime.evaluate).toHaveBeenCalledTimes(1);
		expect(client.Network.enable).not.toHaveBeenCalled();
		expect(client.Page.enable).not.toHaveBeenCalled();
		expect(client.Page.reload).not.toHaveBeenCalled();
	});
});

describe("recoverVisibleChatgptBlockingSurfaceWithClient", () => {
	test("skips reload recovery when preserveActiveTab is set", async () => {
		const client = {
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Page: {
				enable: vi.fn(),
				reload: vi.fn(),
			},
			// biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
			Runtime: {
				evaluate: vi.fn(),
			},
		};

		await expect(
			recoverVisibleChatgptBlockingSurfaceWithClientForTest(
				client as never,
				{
					kind: "transient-error",
					summary: "Something went wrong while generating the response.",
					selector: null,
				},
				{ preserveActiveTab: true },
			),
		).resolves.toEqual({
			action: "reload-page",
			outcome: "skipped",
			summary: "Something went wrong while generating the response.:navigation-forbidden",
		});

		expect(client.Page.enable).not.toHaveBeenCalled();
		expect(client.Page.reload).not.toHaveBeenCalled();
		expect(client.Runtime.evaluate).not.toHaveBeenCalled();
	});
});

describe("normalizeChatgptAuthSessionIdentity", () => {
	test("auth session expression bounds stalled session fetches", () => {
		const expression = buildChatgptAuthSessionIdentityExpression();

		expect(expression).toContain("AbortController");
		expect(expression).toContain("controller?.abort()");
		expect(expression).toContain("}, 8000)");
		expect(expression).toContain("signal: controller?.signal");
	});

	test("prefers auth session user email and id", () => {
		expect(
			normalizeChatgptAuthSessionIdentity({
				user: {
					id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
					name: "Eric Cochra",
					email: "ecochran76@gmail.com",
				},
				account: {
					id: "27e72181-04ee-4a6e-9859-ba8617766af4",
					name: "Cochran Group",
					email: null,
					planType: "team",
					structure: "workspace",
					organizationId: "org-QClZe3UFCU1m8w330umx4eHP",
				},
			}),
		).toEqual({
			id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
			name: "Eric Cochra",
			email: "ecochran76@gmail.com",
			accountId: "27e72181-04ee-4a6e-9859-ba8617766af4",
			accountLevel: "Business",
			accountPlanType: "team",
			accountStructure: "workspace",
			organizationId: "org-QClZe3UFCU1m8w330umx4eHP",
			capabilityProfile: "chatgpt-business-restricted",
			proAccess: "restricted",
			deepResearchAccess: "restricted",
			source: "auth-session",
		});
	});

	test("falls back to account or storage-derived fields when user email is unavailable", () => {
		expect(
			normalizeChatgptAuthSessionIdentity({
				user: {
					id: null,
					name: "Cochran Group",
					email: null,
				},
				account: {
					id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
					name: null,
					email: null,
					planType: "pro",
					structure: "personal",
				},
			}),
		).toEqual({
			id: "user-PVyuqYSOU4adOEf6UCUK3eiK",
			name: "Cochran Group",
			email: undefined,
			accountId: "user-PVyuqYSOU4adOEf6UCUK3eiK",
			accountLevel: "Pro",
			accountPlanType: "pro",
			accountStructure: "personal",
			organizationId: undefined,
			capabilityProfile: "chatgpt-pro-unlimited",
			proAccess: "unlimited-standard-extended",
			deepResearchAccess: "unlimited",
			source: "auth-session",
		});
	});
});

describe("extractChatgptProjectSourceName", () => {
	test("prefers the concise leaf text over row metadata", () => {
		expect(
			extractChatgptProjectSourceName({
				rowText: "20251106-NSF GRFP Instructions.mdFile · Nov 6, 2025",
				leafTexts: [
					"20251106-NSF GRFP Instructions.mdFile · Nov 6, 2025",
					"20251106-NSF GRFP Instructions.md",
					"File · Nov 6, 2025",
				],
			}),
		).toBe("20251106-NSF GRFP Instructions.md");
	});

	test("falls back to stripping the trailing kind label from row text", () => {
		expect(
			extractChatgptProjectSourceName({
				rowText: "Cochran_Faculty_Vita (15).pdfPDF · Oct 6, 2025",
				leafTexts: [],
			}),
		).toBe("Cochran_Faculty_Vita (15).pdf");
	});
});

describe("matchesChatgptImageArtifactProbe", () => {
	test("matches image probes by file id when the artifact uri is concrete", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/file-abc123?se=1&id=file-xyz789",
					alt: "irrelevant preview text",
				},
				{
					title: "diagram.png",
					uri: "chatgpt://file/file-xyz789",
				},
			),
		).toBe(true);
	});

	test("matches image probes by exact visible DOM image src", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "blob:https://chatgpt.com/generated-image",
					alt: "",
				},
				{
					title: "Generated image",
					uri: "blob:https://chatgpt.com/generated-image",
				},
			),
		).toBe(true);
	});

	test("falls back to alt-text title matching when no file id is available", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/generated-image.png",
					alt: "AuraCall Architecture Diagram preview",
				},
				{
					title: "AuraCall Architecture Diagram",
					uri: undefined,
				},
			),
		).toBe(true);
	});

	test("rejects probes that do not match the image artifact identity", () => {
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/generated-image.png",
					alt: "different artifact",
				},
				{
					title: "AuraCall Architecture Diagram",
					uri: undefined,
				},
			),
		).toBe(false);
		expect(
			matchesChatgptImageArtifactProbe(
				{
					src: "https://files.oaiusercontent.com/file-abc123?se=1&id=file-other",
					alt: "AuraCall Architecture Diagram preview",
				},
				{
					title: "AuraCall Architecture Diagram",
					uri: "chatgpt://file/file-xyz789",
				},
			),
		).toBe(false);
	});
});

describe("normalizeChatgptVisibleImageArtifactProbes", () => {
	test("turns visible ImageGen DOM probes into image artifacts", () => {
		expect(
			normalizeChatgptVisibleImageArtifactProbes([
				{
					turnId: "turn-1",
					messageId: "msg-1",
					messageIndex: 1,
					imageIndex: 0,
					wrapperId: "image-abc",
					src: "blob:https://chatgpt.com/generated-image",
					alt: "",
					title: "",
				},
			]),
		).toEqual([
			expect.objectContaining({
				id: "image-dom:turn-1:image-abc",
				title: "Generated image 1",
				kind: "image",
				uri: "blob:https://chatgpt.com/generated-image",
				messageIndex: 1,
				messageId: "msg-1",
				metadata: expect.objectContaining({
					extraction: "dom-imagegen-image",
					turnId: "turn-1",
					wrapperId: "image-abc",
				}),
			}),
		]);
	});

	test("deduplicates repeated rendered nodes for the same visible image src", () => {
		const artifacts = normalizeChatgptVisibleImageArtifactProbes([
			{
				turnId: "turn-1",
				messageId: null,
				messageIndex: 1,
				imageIndex: 0,
				wrapperId: "image-abc",
				src: "https://chatgpt.com/backend-api/estuary/content?id=file_abc",
				alt: "",
				title: "",
			},
			{
				turnId: "turn-1",
				messageId: null,
				messageIndex: 1,
				imageIndex: 1,
				wrapperId: null,
				src: "https://chatgpt.com/backend-api/estuary/content?id=file_abc",
				alt: "",
				title: "",
			},
		]);

		expect(artifacts).toHaveLength(1);
		expect(artifacts[0]).toEqual(
			expect.objectContaining({
				id: "image-dom:turn-1:image-abc",
				uri: "https://chatgpt.com/backend-api/estuary/content?id=file_abc",
			}),
		);
	});
});

describe("matchesChatgptDownloadButtonProbe", () => {
	test("matches assistant artifact buttons by title and turn identity", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "auracall-export.csv",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 0,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(true);
	});

	test("matches download button titles split by ChatGPT layout whitespace", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "legacy_readout.j on",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 0,
				},
				{
					title: "legacy_readout.json",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(true);
	});

	test("falls back to message identity when turn id is unavailable", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "auracall-export.csv",
					turnId: "other-turn",
					messageId: "message-2",
					messageIndex: 7,
					buttonIndex: 1,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-2",
					messageIndex: 7,
					metadata: {},
				},
			),
		).toBe(true);
	});

	test("rejects probes that do not match download button identity", () => {
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "wrong.csv",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 0,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(false);
		expect(
			matchesChatgptDownloadButtonProbe(
				{
					title: "auracall-export.csv",
					turnId: "turn-1",
					messageId: "message-1",
					messageIndex: 4,
					buttonIndex: 2,
				},
				{
					title: "auracall-export.csv",
					messageId: "message-1",
					messageIndex: 4,
					metadata: {
						turnId: "turn-1",
						buttonIndex: 0,
					},
				},
			),
		).toBe(false);
	});
});

describe("normalizeChatgptConversationLinkProbes", () => {
	test("dedupes conversation ids and prefers concrete titles, urls, and project ids", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "69c93b5d-e6b0-8332-8c20-da466cc863da",
					title: "69c93b5d-e6b0-8332-8c20-da466cc863da",
				},
				{
					id: "69c93b5d-e6b0-8332-8c20-da466cc863da",
					title: "AURACALL VERIFY PROBE",
					url: "https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
				},
				{
					id: "69c93212-f180-8330-815b-5f831fc395e6",
					title: "AURACALL CHATGPT REQUEST",
					projectId: "g-p-69c851be8cc88191afe109bea1b2a28d-oracle",
					url: "https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d-oracle/c/69c93212-f180-8330-815b-5f831fc395e6",
				},
			]),
		).toEqual([
			{
				id: "69c93b5d-e6b0-8332-8c20-da466cc863da",
				title: "AURACALL VERIFY PROBE",
				provider: "chatgpt",
				url: "https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
			},
			{
				id: "69c93212-f180-8330-815b-5f831fc395e6",
				title: "AURACALL CHATGPT REQUEST",
				provider: "chatgpt",
				projectId: "g-p-69c851be8cc88191afe109bea1b2a28d",
				url: "https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d-oracle/c/69c93212-f180-8330-815b-5f831fc395e6",
			},
		]);
	});

	test("preserves cached conversation history timestamps from link probes", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
					title: "Handoff Preview ChatGPT",
					updatedAt: "2026-06-27T00:17:47.211915Z",
					metadata: {
						chatgptHistoryCacheSource: "cache/user/account/conversation-history-without-projects",
						chatgptHistoryCacheCreatedAt: "2026-06-27T00:16:18.808314Z",
					},
				},
			]),
		).toEqual([
			{
				id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
				title: "Handoff Preview ChatGPT",
				provider: "chatgpt",
				updatedAt: "2026-06-27T00:17:47.211Z",
				metadata: {
					chatgptHistoryCacheSource: "cache/user/account/conversation-history-without-projects",
					chatgptHistoryCacheCreatedAt: "2026-06-27T00:16:18.808314Z",
				},
			},
		]);
	});

	test("prefers a timestamped duplicate over an otherwise complete untimestamped probe", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
					title: "Handoff Preview ChatGPT",
					url: "https://chatgpt.com/c/6a3f1652-2490-83ea-add0-0a900e6d55bc",
				},
				{
					id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
					title: "Handoff Preview ChatGPT",
					updatedAt: "2026-06-27T00:17:47.211915Z",
				},
			]),
		).toEqual([
			{
				id: "6a3f1652-2490-83ea-add0-0a900e6d55bc",
				title: "Handoff Preview ChatGPT",
				provider: "chatgpt",
				url: "https://chatgpt.com/c/6a3f1652-2490-83ea-add0-0a900e6d55bc",
				updatedAt: "2026-06-27T00:17:47.211Z",
			},
		]);
	});

	test("prefers a shorter authoritative title over a concatenated title+preview string", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "69cac4d9-dcb8-8330-bace-c259f9d386bb",
					title: "AC GPT PC bqeekfReply exactly with CHATGPT ACCEPT PROJECT CHAT bqeekf.",
					projectId: "g-p-69cac42e3728819197f969fb4afa0e84",
					url: "https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb",
				},
				{
					id: "69cac4d9-dcb8-8330-bace-c259f9d386bb",
					title: "AC GPT PC bqeekf",
					projectId: "g-p-69cac42e3728819197f969fb4afa0e84",
					url: "https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb",
				},
			]),
		).toEqual([
			{
				id: "69cac4d9-dcb8-8330-bace-c259f9d386bb",
				title: "AC GPT PC bqeekf",
				provider: "chatgpt",
				projectId: "g-p-69cac42e3728819197f969fb4afa0e84",
				url: "https://chatgpt.com/g/g-p-69cac42e3728819197f969fb4afa0e84-ac-gpt-r-bksxxo/c/69cac4d9-dcb8-8330-bace-c259f9d386bb",
			},
		]);
	});

	test("does not keep a generic ChatGPT title when a concrete row title exists", () => {
		expect(
			normalizeChatgptConversationLinkProbes([
				{
					id: "69cc7121-eca0-832c-ab8a-9dde700e87d7",
					title: "ChatGPT",
					projectId: "g-p-69cc275fdfac8191be921387165ca803",
					url: "https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7",
				},
				{
					id: "69cc7121-eca0-832c-ab8a-9dde700e87d7",
					title: "AC GPT PC live exact",
					projectId: "g-p-69cc275fdfac8191be921387165ca803",
					url: "https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7",
				},
			]),
		).toEqual([
			{
				id: "69cc7121-eca0-832c-ab8a-9dde700e87d7",
				title: "AC GPT PC live exact",
				provider: "chatgpt",
				projectId: "g-p-69cc275fdfac8191be921387165ca803",
				url: "https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803-ac-gpt-r-najfie/c/69cc7121-eca0-832c-ab8a-9dde700e87d7",
			},
		]);
	});
});

describe("normalizeChatgptConversationFileProbes", () => {
	test("emits stable conversation file refs from user-turn probes", () => {
		expect(
			normalizeChatgptConversationFileProbes("69c95f14-2ca0-8329-9d3a-be5d1a1967ab", [
				{
					turnId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					messageId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					tileIndex: 0,
					name: "chatgpt-real-upload-vmuk.txt",
					label: "Document",
				},
				{
					turnId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					messageId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					tileIndex: 0,
					name: "chatgpt-real-upload-vmuk.txt",
					label: "Document",
				},
			]),
		).toEqual([
			{
				id: "69c95f14-2ca0-8329-9d3a-be5d1a1967ab:1411ca60-9384-407a-a39a-ce9b772c737a:0:chatgpt-real-upload-vmuk.txt",
				name: "chatgpt-real-upload-vmuk.txt",
				provider: "chatgpt",
				source: "conversation",
				metadata: {
					label: "Document",
					turnId: "1411ca60-9384-407a-a39a-ce9b772c737a",
					messageId: "1411ca60-9384-407a-a39a-ce9b772c737a",
				},
			},
		]);
	});

	test("marks React-backed ChatGPT file tiles as retrievable provider files", () => {
		expect(
			normalizeChatgptConversationFileProbes("6a092419-33c0-83ea-bca8-27c694312842", [
				{
					turnId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					messageId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					tileIndex: 0,
					name: "Earthline - ISU Mutual Confidentiality Agreement.pdf",
					label: "PDF",
					providerFileId: "file_000000004a0c71f89172ec251ae22c52",
					mimeType: "application/pdf",
					downloadable: "default-only",
					previewable: "default-only",
				},
			]),
		).toEqual([
			{
				id: "6a092419-33c0-83ea-bca8-27c694312842:3e6c04a6-29d0-45f6-b37c-f33353965543:0:Earthline - ISU Mutual Confidentiality Agreement.pdf",
				name: "Earthline - ISU Mutual Confidentiality Agreement.pdf",
				provider: "chatgpt",
				source: "conversation",
				mimeType: "application/pdf",
				remoteUrl: "chatgpt://file/file_000000004a0c71f89172ec251ae22c52",
				metadata: {
					label: "PDF",
					turnId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					messageId: "3e6c04a6-29d0-45f6-b37c-f33353965543",
					providerFileId: "file_000000004a0c71f89172ec251ae22c52",
					downloadable: "default-only",
					previewable: "default-only",
					materializationSurface: "chatgpt-file-tile-default-action",
				},
			},
		]);
	});
});

describe("extractChatgptConversationSourcesFromPayload", () => {
	test("normalizes file citations and dedupes content references against citations", () => {
		expect(
			extractChatgptConversationSourcesFromPayload(
				{
					mapping: {
						assistant: {
							message: {
								id: "assist-1",
								author: { role: "assistant" },
								content: { parts: ["answer"] },
								metadata: {
									content_references: [
										{
											type: "file",
											name: "proof.pdf",
											id: "file_0001",
											source: "my_files",
										},
									],
									citations: [
										{
											reference: {
												type: "file",
												name: "proof.pdf",
												id: "file_0001",
												source: "my_files",
											},
										},
									],
								},
							},
						},
					},
				},
				new Map([["assist-1", 1]]),
			),
		).toEqual([
			{
				url: "chatgpt://file/file_0001",
				title: "proof.pdf",
				domain: "chatgpt-file",
				messageIndex: 1,
				sourceGroup: "my_files",
			},
		]);
	});
});

describe("extractChatgptConversationArtifactsFromPayload", () => {
	test("extracts downloadable sandbox artifacts from assistant markdown", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						assistant: {
							message: {
								id: "assist-2",
								author: { role: "assistant" },
								content: {
									parts: [
										"Files:\n[updated skill.zip](sandbox:/mnt/data/skilldist_papers_fix/skill.zip)\n[combined JSON extraction](sandbox:/mnt/data/papers_fixed_extract.json)",
									],
								},
							},
						},
					},
				},
				new Map([["assist-2", 3]]),
			),
		).toEqual([
			{
				id: "assist-2:download:sandbox:/mnt/data/skilldist_papers_fix/skill.zip",
				title: "updated skill.zip",
				kind: "download",
				uri: "sandbox:/mnt/data/skilldist_papers_fix/skill.zip",
				messageIndex: 3,
				messageId: "assist-2",
			},
			{
				id: "assist-2:download:sandbox:/mnt/data/papers_fixed_extract.json",
				title: "combined JSON extraction",
				kind: "download",
				uri: "sandbox:/mnt/data/papers_fixed_extract.json",
				messageIndex: 3,
				messageId: "assist-2",
			},
		]);
	});

	test("classifies spreadsheet-like sandbox downloads as spreadsheet artifacts", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						assistant: {
							message: {
								id: "assist-sheet-1",
								author: { role: "assistant" },
								content: {
									parts: [
										"[parabola_trendline_demo.xlsx](sandbox:/mnt/data/parabola_trendline_demo.xlsx)",
									],
								},
							},
						},
					},
				},
				new Map([["assist-sheet-1", 2]]),
			),
		).toEqual([
			{
				id: "assist-sheet-1:download:sandbox:/mnt/data/parabola_trendline_demo.xlsx",
				title: "parabola_trendline_demo.xlsx",
				kind: "spreadsheet",
				uri: "sandbox:/mnt/data/parabola_trendline_demo.xlsx",
				messageIndex: 2,
				messageId: "assist-sheet-1",
			},
		]);
	});

	test("extracts canvas artifacts and carries forward code preview metadata", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						code: {
							message: {
								id: "code-1",
								author: { role: "assistant" },
								content: {
									content_type: "code",
									parts: [
										'{"name":"probe.txt","type":"document","content":"AURACALL CHATGPT CANVAS PROBE 1."}',
									],
								},
							},
						},
						tool: {
							message: {
								id: "tool-1",
								author: { role: "tool" },
								metadata: {
									command: "create_textdoc",
									canvas: {
										textdoc_id: "69c8a1018ea08191b3e3cbdb038221e4",
										textdoc_type: "document",
										version: 1,
										title: "Probe",
										create_source: "system_hint_canvas",
									},
								},
							},
						},
					},
				},
				new Map([["tool-1", 4]]),
			),
		).toEqual([
			{
				id: "canvas:69c8a1018ea08191b3e3cbdb038221e4",
				title: "Probe",
				kind: "canvas",
				uri: "chatgpt://canvas/69c8a1018ea08191b3e3cbdb038221e4",
				messageIndex: 4,
				messageId: "tool-1",
				metadata: {
					textdocId: "69c8a1018ea08191b3e3cbdb038221e4",
					textdocType: "document",
					version: 1,
					createSource: "system_hint_canvas",
					command: "create_textdoc",
					documentName: "probe.txt",
					documentType: "document",
					contentText: "AURACALL CHATGPT CANVAS PROBE 1.",
				},
			},
		]);
	});

	test("extracts generated image artifacts from tool multimodal payloads", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						image: {
							message: {
								id: "tool-image-1",
								author: { role: "tool" },
								content: {
									content_type: "multimodal_text",
									parts: [
										JSON.stringify({
											content_type: "image_asset_pointer",
											asset_pointer: "sediment://file_00000000000000000000000000000001",
											size_bytes: 450123,
											width: 1024,
											height: 1024,
											metadata: {
												generation: {
													gen_id: "gen-123",
													size: "1024x1024",
												},
												dalle: {
													prompt: "A calm lake at sunrise",
												},
											},
										}),
									],
								},
								metadata: {
									title: "Sunrise lake",
								},
							},
						},
					},
				},
				new Map([["tool-image-1", 6]]),
			),
		).toEqual([
			{
				id: "tool-image-1:image:sediment://file_00000000000000000000000000000001",
				title: "Sunrise lake",
				kind: "image",
				uri: "sediment://file_00000000000000000000000000000001",
				messageIndex: 6,
				messageId: "tool-image-1",
				metadata: {
					contentType: "image_asset_pointer",
					assetPointer: "sediment://file_00000000000000000000000000000001",
					sizeBytes: 450123,
					width: 1024,
					height: 1024,
					generation: {
						gen_id: "gen-123",
						size: "1024x1024",
					},
					dalle: {
						prompt: "A calm lake at sunrise",
					},
				},
			},
		]);
	});

	test("extracts spreadsheet artifacts from ada visualizations", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload(
				{
					mapping: {
						table: {
							message: {
								id: "tool-table-1",
								author: { role: "tool" },
								metadata: {
									ada_visualizations: [
										{
											type: "table",
											file_id: "file-dtzUOh5KSZFM2ZdWH83pbrfO",
											title: "New Patents with ISURF Numbers",
										},
									],
								},
							},
						},
					},
				},
				new Map([["tool-table-1", 7]]),
			),
		).toEqual([
			{
				id: "spreadsheet:file-dtzUOh5KSZFM2ZdWH83pbrfO",
				title: "New Patents with ISURF Numbers",
				kind: "spreadsheet",
				uri: "chatgpt://file/file-dtzUOh5KSZFM2ZdWH83pbrfO",
				messageIndex: 7,
				messageId: "tool-table-1",
				metadata: {
					visualizationType: "table",
					fileId: "file-dtzUOh5KSZFM2ZdWH83pbrfO",
				},
			},
		]);
	});

	test("uses manifest-backed default artifact titles when payload titles are absent", () => {
		expect(
			extractChatgptConversationArtifactsFromPayload({
				mapping: {
					image: {
						message: {
							id: "tool-image-untitled",
							author: { role: "tool" },
							content: {
								content_type: "multimodal_text",
								parts: [
									JSON.stringify({
										content_type: "image_asset_pointer",
										asset_pointer: "sediment://file_untitled_image",
									}),
								],
							},
						},
					},
					table: {
						message: {
							id: "tool-table-untitled",
							author: { role: "tool" },
							metadata: {
								ada_visualizations: [
									{
										type: "table",
									},
								],
							},
						},
					},
					canvas: {
						message: {
							id: "tool-canvas-untitled",
							author: { role: "tool" },
							metadata: {
								canvas: {
									textdoc_id: "canvas-untitled",
								},
							},
						},
					},
				},
			}),
		).toEqual([
			{
				id: "tool-image-untitled:image:sediment://file_untitled_image",
				title: "Generated image",
				kind: "image",
				uri: "sediment://file_untitled_image",
				messageId: "tool-image-untitled",
				metadata: {
					contentType: "image_asset_pointer",
					assetPointer: "sediment://file_untitled_image",
				},
			},
			{
				id: "tool-table-untitled:spreadsheet",
				title: "Spreadsheet artifact",
				kind: "spreadsheet",
				messageId: "tool-table-untitled",
				metadata: {
					visualizationType: "table",
				},
			},
			{
				id: "canvas:canvas-untitled",
				title: "Canvas artifact",
				kind: "canvas",
				uri: "chatgpt://canvas/canvas-untitled",
				messageId: "tool-canvas-untitled",
				metadata: {
					textdocId: "canvas-untitled",
				},
			},
		]);
	});
});

describe("normalizeChatgptConversationDownloadArtifactProbes", () => {
	test("normalizes visible behavior-button downloads into synthetic artifacts", () => {
		expect(
			normalizeChatgptConversationDownloadArtifactProbes([
				{
					turnId: "turn-1",
					messageId: "assist-dom-1",
					messageIndex: 3,
					buttonIndex: 0,
					title: "Fresh investigation bundle",
				},
				{
					turnId: "turn-1",
					messageId: "assist-dom-1",
					messageIndex: 3,
					buttonIndex: 0,
					title: "Fresh investigation bundle",
				},
			]),
		).toEqual([
			{
				id: "download-dom:turn-1:0",
				title: "Fresh investigation bundle",
				kind: "download",
				uri: "chatgpt://download-button/turn-1/0",
				messageIndex: 3,
				messageId: "assist-dom-1",
				metadata: {
					extraction: "dom-behavior-button",
					turnId: "turn-1",
					buttonIndex: 0,
				},
			},
		]);
	});

	test("classifies spreadsheet-like button titles as spreadsheet artifacts", () => {
		expect(
			normalizeChatgptConversationDownloadArtifactProbes([
				{
					turnId: "turn-2",
					messageIndex: 5,
					buttonIndex: 1,
					title: "Download workbook.xlsx",
				},
			]),
		).toEqual([
			{
				id: "download-dom:turn-2:1",
				title: "Download workbook.xlsx",
				kind: "spreadsheet",
				uri: "chatgpt://download-button/turn-2/1",
				messageIndex: 5,
				metadata: {
					extraction: "dom-behavior-button",
					turnId: "turn-2",
					buttonIndex: 1,
				},
			},
		]);
	});

	test("classifies ods downloads as spreadsheet artifacts via manifest taxonomy", () => {
		expect(
			normalizeChatgptConversationDownloadArtifactProbes([
				{
					turnId: "turn-3",
					messageIndex: 6,
					buttonIndex: 2,
					title: "Analysis export.ods",
				},
			]),
		).toEqual([
			{
				id: "download-dom:turn-3:2",
				title: "Analysis export.ods",
				kind: "spreadsheet",
				uri: "chatgpt://download-button/turn-3/2",
				messageIndex: 6,
				metadata: {
					extraction: "dom-behavior-button",
					turnId: "turn-3",
					buttonIndex: 2,
				},
			},
		]);
	});
});

describe("mergeChatgptConversationArtifacts", () => {
	test("keeps payload artifacts authoritative and appends DOM-only artifacts", () => {
		expect(
			mergeChatgptConversationArtifacts(
				[
					{
						id: "assist-1:download:sandbox:/mnt/data/comment_demo.docx",
						title: "Download the DOCX",
						kind: "download",
						uri: "sandbox:/mnt/data/comment_demo.docx",
						messageIndex: 2,
					},
				],
				[
					{
						id: "download-dom:turn-1:0",
						title: "Download the DOCX",
						kind: "download",
						uri: "chatgpt://download-button/turn-1/0",
						messageIndex: 2,
					},
					{
						id: "download-dom:turn-2:0",
						title: "Fresh investigation bundle",
						kind: "download",
						uri: "chatgpt://download-button/turn-2/0",
						messageIndex: 4,
					},
				],
			),
		).toEqual([
			{
				id: "assist-1:download:sandbox:/mnt/data/comment_demo.docx",
				title: "Download the DOCX",
				kind: "download",
				uri: "sandbox:/mnt/data/comment_demo.docx",
				messageIndex: 2,
			},
			{
				id: "download-dom:turn-2:0",
				title: "Fresh investigation bundle",
				kind: "download",
				uri: "chatgpt://download-button/turn-2/0",
				messageIndex: 4,
			},
		]);
	});
});

describe("mergeChatgptCanvasArtifactContent", () => {
	test("fills missing canvas content from visible textdoc probes", () => {
		expect(
			mergeChatgptCanvasArtifactContent(
				[
					{
						id: "canvas:69caaa25d42081919961766acc4b79a1",
						title: "Short Document With Comments",
						kind: "canvas",
						uri: "chatgpt://canvas/69caaa25d42081919961766acc4b79a1",
						metadata: {
							textdocId: "69caaa25d42081919961766acc4b79a1",
						},
					},
				],
				[
					{
						textdocId: "69caaa25d42081919961766acc4b79a1",
						title: "Short Document With Comments",
						contentText: "Sample Document\nThe final paragraph concludes the document.",
					},
				],
			),
		).toEqual([
			{
				id: "canvas:69caaa25d42081919961766acc4b79a1",
				title: "Short Document With Comments",
				kind: "canvas",
				uri: "chatgpt://canvas/69caaa25d42081919961766acc4b79a1",
				metadata: {
					textdocId: "69caaa25d42081919961766acc4b79a1",
					contentText: "Sample Document\nThe final paragraph concludes the document.",
				},
			},
		]);
	});
});

describe("resolveChatgptCanvasArtifactContentText", () => {
	test("returns existing canvas content before consulting visible probes", () => {
		expect(
			resolveChatgptCanvasArtifactContentText(
				{
					id: "canvas:existing",
					title: "Existing Canvas",
					kind: "canvas",
					metadata: {
						textdocId: "existing",
						contentText: "Existing content",
					},
				},
				[
					{
						textdocId: "existing",
						title: "Existing Canvas",
						contentText: "Visible probe content",
					},
				],
			),
		).toBe("Existing content");
	});

	test("falls back to title match when textdoc id is unavailable", () => {
		expect(
			resolveChatgptCanvasArtifactContentText(
				{
					id: "canvas:title-only",
					title: "Title Only Canvas",
					kind: "canvas",
					metadata: {},
				},
				[
					{
						title: "Title Only Canvas",
						contentText: "Visible title-matched content",
					},
				],
			),
		).toBe("Visible title-matched content");
	});
});

describe("serializeChatgptGridRowsToCsv", () => {
	test("quotes cells with commas, quotes, and newlines", () => {
		expect(
			serializeChatgptGridRowsToCsv([
				["id", "title", "notes"],
				["1", "alpha,beta", 'line 1\nline "2"'],
			]),
		).toBe('id,title,notes\n1,"alpha,beta","line 1\nline ""2"""');
	});
});

describe("normalizeChatgptProjectSourceProbes", () => {
	test("dedupes rows and emits project-scoped file refs", () => {
		expect(
			normalizeChatgptProjectSourceProbes([
				{
					rowText: "spec.mdFile · Mar 28, 2026",
					leafTexts: ["spec.mdFile · Mar 28, 2026", "spec.md", "File · Mar 28, 2026"],
					metadataText: "File · Mar 28, 2026",
					providerFileId: "file_abc123",
					hrefs: ["https://chatgpt.com/backend-api/files/file_abc123"],
					mimeType: "text/markdown",
					size: 42,
				},
				{
					rowText: "spec.mdFile · Mar 28, 2026",
					leafTexts: ["spec.md"],
					metadataText: "File · Mar 28, 2026",
					providerFileId: "file_abc123",
				},
			]),
		).toEqual([
			{
				id: "file_abc123",
				name: "spec.md",
				provider: "chatgpt",
				source: "project",
				mimeType: "text/markdown",
				remoteUrl: "chatgpt://file/file_abc123",
				size: 42,
				metadata: {
					label: "File · Mar 28, 2026",
					providerFileId: "file_abc123",
					hrefs: ["https://chatgpt.com/backend-api/files/file_abc123"],
					materializationSurface: "chatgpt-project-source-provider-file",
				},
			},
		]);
	});

	test("keeps metadata-only project source rows as deterministic row refs", () => {
		expect(
			normalizeChatgptProjectSourceProbes([
				{
					rowText: "policy.pdfFile · Apr 2, 2026",
					leafTexts: ["policy.pdfFile · Apr 2, 2026", "policy.pdf", "File · Apr 2, 2026"],
					metadataText: "File · Apr 2, 2026",
					testIds: ["project-source-row"],
					ariaLabels: ["More actions"],
				},
			]),
		).toEqual([
			{
				id: "policy.pdf",
				name: "policy.pdf",
				provider: "chatgpt",
				source: "project",
				metadata: {
					label: "File · Apr 2, 2026",
					testIds: ["project-source-row"],
					ariaLabels: ["More actions"],
					materializationSurface: "chatgpt-project-source-row",
				},
			},
		]);
	});
});

describe("findChatgptProjectSourceName", () => {
	test("returns the canonical matched source name from normalized file refs", () => {
		expect(
			findChatgptProjectSourceName([{ name: "Spec.md" }, { name: "notes.txt" }], "spec.md"),
		).toBe("Spec.md");
	});

	test("returns null when the normalized source name is absent", () => {
		expect(findChatgptProjectSourceName([{ name: "notes.txt" }], "spec.md")).toBeNull();
	});
});

describe("matchesChatgptProjectSettingsSnapshot", () => {
	test("matches by persisted project name only when requested", () => {
		expect(
			matchesChatgptProjectSettingsSnapshot(
				{
					name: "AC GPT R test",
					text: "instructions",
				},
				{ name: "AC GPT R test" },
			),
		).toBe(true);
	});

	test("matches by normalized instructions only when requested", () => {
		expect(
			matchesChatgptProjectSettingsSnapshot(
				{
					name: "AC GPT R test",
					text: "Line 1\n\nLine 2",
				},
				{ instructions: "Line 1\n\nLine 2" },
			),
		).toBe(true);
	});

	test("requires both name and instructions when both are requested", () => {
		expect(
			matchesChatgptProjectSettingsSnapshot(
				{
					name: "AC GPT R test",
					text: "Line 1",
				},
				{
					name: "AC GPT R test",
					instructions: "Different line",
				},
			),
		).toBe(false);
	});
});

describe("normalizeProjectMemoryMode", () => {
	test("accepts the user-facing global alias", () => {
		expect(normalizeProjectMemoryMode("global")).toBe("global");
		expect(normalizeProjectMemoryMode("default")).toBe("global");
	});

	test("accepts the user-facing project alias", () => {
		expect(normalizeProjectMemoryMode("project")).toBe("project");
		expect(normalizeProjectMemoryMode("project-only")).toBe("project");
	});
});

describe("matchesChatgptDeleteConfirmationProbe", () => {
	test("accepts the native delete dialog when the confirm button is visible even if title text drifted", () => {
		expect(
			matchesChatgptDeleteConfirmationProbe(
				{
					dialogText: "Delete chat? This will delete AC GPT C seodiu. Delete Cancel",
					buttonLabels: ["Delete", "Cancel"],
					hasVisibleConfirmButton: true,
				},
				"Older page title that no longer matches",
			),
		).toBe(true);
	});

	test("still requires the expected title when no visible confirm button is present", () => {
		expect(
			matchesChatgptDeleteConfirmationProbe(
				{
					dialogText: "Delete chat? This will delete AC GPT C seodiu. Delete Cancel",
					buttonLabels: ["Delete", "Cancel"],
					hasVisibleConfirmButton: false,
				},
				"Older page title that no longer matches",
			),
		).toBe(false);
	});
});

describe("matchesChatgptProjectDeleteConfirmationProbe", () => {
	test("accepts the project delete dialog when the expected buttons are visible", () => {
		expect(
			matchesChatgptProjectDeleteConfirmationProbe({
				dialogText:
					"Delete project? This will permanently delete all project files and chats. To save chats, move them to your chat list or another project before deleting. Delete Cancel",
				buttonLabels: ["Delete", "Cancel"],
			}),
		).toBe(true);
	});

	test("rejects non-project dialogs even if delete and cancel buttons exist", () => {
		expect(
			matchesChatgptProjectDeleteConfirmationProbe({
				dialogText: "Delete chat? This will delete AC GPT C seodiu. Delete Cancel",
				buttonLabels: ["Delete", "Cancel"],
			}),
		).toBe(false);
	});
});

describe("matchesChatgptConversationTitleProbe", () => {
	test("accepts a matching root conversation row even when another row remains at the top", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					matchedConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					matchedProjectId: null,
					matchedTitle: "AC GPT C tpuivt",
					topConversationId: "69ca9d71-1a04-8332-abe1-830d327b2a65",
					topTitle: "Something else",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
			),
		).toBe(true);
	});

	test("requires the matching row to be top for strict root checks", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					matchedConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					matchedProjectId: null,
					matchedTitle: "AC GPT C tpuivt",
					topConversationId: "69ca9d71-1a04-8332-abe1-830d327b2a65",
					topTitle: "Something else",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
				null,
				{ requireTopForRootMatch: true },
			),
		).toBe(false);
	});

	test("passes strict root checks when the matching row is already top", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					matchedConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					matchedProjectId: null,
					matchedTitle: "AC GPT C tpuivt",
					topConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					topTitle: "AC GPT C tpuivt",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
				null,
				{ requireTopForRootMatch: true },
			),
		).toBe(true);
	});

	test("accepts root conversation page-title fallback when the sidebar row is unavailable", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					routeConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					routeProjectId: null,
					documentTitle: "AC GPT C tpuivt - ChatGPT",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
			),
		).toBe(true);
	});

	test("does not apply the root page-title fallback to project conversations", () => {
		expect(
			matchesChatgptConversationTitleProbe(
				{
					routeConversationId: "69cb3741-2f58-832f-a6ae-f28779f30741",
					routeProjectId: "g-p-69c851be8cc88191afe109bea1b2a28d",
					documentTitle: "AC GPT C tpuivt - ChatGPT",
				},
				"69cb3741-2f58-832f-a6ae-f28779f30741",
				"AC GPT C tpuivt",
				"g-p-69c851be8cc88191afe109bea1b2a28d",
			),
		).toBe(false);
	});
});

describe("matchesChatgptRenameEditorProbe", () => {
	test("accepts the visible title editor input", () => {
		expect(
			matchesChatgptRenameEditorProbe({
				inputName: "title-editor",
				value: "AC GPT C tpuivt",
				active: true,
			}),
		).toBe(true);
	});

	test("rejects unrelated active text inputs", () => {
		expect(
			matchesChatgptRenameEditorProbe({
				inputName: "search",
				value: "AC GPT C tpuivt",
				active: true,
			}),
		).toBe(false);
	});

	test("rejects missing probes", () => {
		expect(matchesChatgptRenameEditorProbe(null)).toBe(false);
	});
});

describe("resolveChatgptConversationUrl", () => {
	test("builds a root conversation route when no project is supplied", () => {
		expect(resolveChatgptConversationUrl("69c93b5d-e6b0-8332-8c20-da466cc863da")).toBe(
			"https://chatgpt.com/c/69c93b5d-e6b0-8332-8c20-da466cc863da",
		);
	});

	test("builds a canonical project conversation route from a bare or slugged project id", () => {
		expect(
			resolveChatgptConversationUrl(
				"69c93212-f180-8330-815b-5f831fc395e6",
				"g-p-69c851be8cc88191afe109bea1b2a28d-oracle",
			),
		).toBe(
			"https://chatgpt.com/g/g-p-69c851be8cc88191afe109bea1b2a28d/c/69c93212-f180-8330-815b-5f831fc395e6",
		);
		expect(
			resolveChatgptConversationUrl(
				"69c93212-f180-8330-815b-5f831fc395e6",
				"133ad4c5-b857-4a30-bf17-d951db57c33f",
			),
		).toBe(
			"https://chatgpt.com/g/133ad4c5-b857-4a30-bf17-d951db57c33f/c/69c93212-f180-8330-815b-5f831fc395e6",
		);
	});
});

describe("normalizeChatgptConversationHistoryLimit", () => {
	test("normalizes bounded history requests", () => {
		expect(normalizeChatgptConversationHistoryLimit(250.9)).toBe(250);
		expect(normalizeChatgptConversationHistoryLimit(0)).toBe(0);
		expect(normalizeChatgptConversationHistoryLimit(-10)).toBe(0);
		expect(normalizeChatgptConversationHistoryLimit(Number.NaN)).toBe(0);
		expect(normalizeChatgptConversationHistoryLimit(undefined)).toBe(0);
	});
});

describe("createChatgptAdapter", () => {
	test("advertises project and conversation support", () => {
		expect(createChatgptAdapter().capabilities).toEqual({
			projects: true,
			conversations: true,
			instructions: true,
			files: true,
		});
	});
});
