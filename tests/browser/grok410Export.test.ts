import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createGrokBuildService } from "../../src/browser/grokBuildService.js";
import { runGrokBuildCommand } from "../../src/cli/grokBuildCommand.js";

const seam = vi.hoisted(() => ({
	click: vi.fn(),
	view: vi.fn(),
	governor: {
		attribution: { provider: "grok", targetId: "target" },
		admitBackendRequest: vi.fn(),
		checkWarning: vi.fn(),
		begin: vi.fn(),
	},
}));
vi.mock("../../src/browser/providers/grokBuild.js", async (original) => ({
	...(await original<object>()),
	readGrokBuildPlaneSnapshot: seam.view,
}));
vi.mock("../../src/browser/providers/mutationAudit.js", () => ({
	resolveProviderTrafficGovernor: () => seam.governor,
}));
vi.mock("../../src/browser/service/ui.js", async (original) => ({
	...(await original<object>()),
	pressButtonWithTrustedPointer: seam.click,
}));
const roots: string[] = [];
afterEach(async () => {
	vi.useRealTimers();
	vi.clearAllMocks();
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture(
	input: {
		setupFails?: boolean;
		rootFails?: boolean;
		resetFails?: boolean;
		partial?: boolean;
		accountChanges?: boolean;
		clickFails?: boolean;
		moreClosed?: boolean;
		initiallyHidden?: boolean;
		suppressFocus?: boolean;
		accountAfterFocus?: boolean;
	} = {},
) {
	seam.governor.begin.mockResolvedValue({ settle: vi.fn() });
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok410-export-"));
	roots.push(root);
	await fs.chmod(root, 0o700);
	let directory = "",
		accounts = 0;
	let visibility = input.initiallyHidden ? "hidden" : "visible",
		focused = false;
	const bringToFront = vi.fn(async () => {
		visibility = "visible";
		focused = true;
	});
	seam.view.mockResolvedValue({
		state: "completed",
		responseId: "assistant",
		gatewayRowId: "gateway:assistant",
		conversationId: "conversation",
		conversationUrl: "https://grok.com/c/conversation",
	});
	const page = vi.fn(
		async ({ behavior, downloadPath }: { behavior: string; downloadPath?: string }) => {
			if (behavior === "allow") {
				directory = downloadPath!;
				if (input.setupFails) throw new Error("unknown setup");
			}
			if (behavior === "default" && input.resetFails) throw new Error("reset failed");
		},
	);
	const close = vi.fn(async () => {}),
		evaluate = vi.fn(async ({ expression }: { expression: string }) =>
			expression.includes("document.visibilityState")
				? {
						result: {
							value: {
								visibilityState: visibility,
								origin: "https://grok.com",
								pathname: "/c/conversation",
								href: "https://grok.com/c/conversation",
							},
						},
					}
				: {
						result: {
							value: {
								stage: input.rootFails
									? "current-root-changed"
									: input.moreClosed
										? expression.includes('action="more"')
											? "owned-more-prepared"
											: "active-menu-relation-unqualified"
										: "owned-menu-observed",
								flags: { expandedOwnedTriggerCount: input.moreClosed ? 0 : 1 },
							},
						},
					},
		);
	seam.click.mockImplementation(async () => {
		if (visibility !== "visible")
			return { ok: false, trusted: false, reason: "Matched control did not receive a click" };
		if (input.moreClosed && input.clickFails) throw new Error("More acknowledgement lost");
		if (input.partial) await fs.writeFile(path.join(directory, "left.crdownload"), "partial");
		await fs.writeFile(
			path.join(directory, "workspace.zip"),
			Buffer.from(
				"UEsDBBQAAAAAAHqjWV0a3tBqBQAAAAUAAAAJAAAAdGltZXIudHh0dGltZXJQSwECFAMUAAAAAAB6o1ldGt7QagUAAAAFAAAACQAAAAAAAAAAAAAAgAEAAAAAdGltZXIudHh0UEsFBgAAAAABAAEANwAAACwAAAAAAA==",
				"base64",
			),
		);
		if (input.clickFails) throw new Error("native click acknowledgement lost");
		return { ok: true, trusted: true };
	});
	const connect = vi.fn(async () => ({
		client: {
			Runtime: { evaluate },
			Page: { setDownloadBehavior: page, bringToFront },
			close,
			__auracallSuppressFocus: input.suppressFocus === true,
		},
		targetId: "target",
	}));
	const service = createGrokBuildService(
		{ port: 45040 },
		{
			connect: connect as never,
			verifyAccount: async () =>
				(input.accountChanges && ++accounts > 2) || (input.accountAfterFocus && focused)
					? "other-account"
					: "account",
		},
	);
	const request = {
		action: "export",
		targetId: "target",
		conversationId: "conversation",
		responseId: "assistant",
		outputDir: root,
		acknowledgeTargetDefaultReset: true,
	};
	return { service, request, root, page, close, connect, bringToFront };
}
test("public export rejects missing target default reset consent before connection", async () => {
	const f = await fixture();
	const { acknowledgeTargetDefaultReset: _, ...request } = f.request;
	expect(await runGrokBuildCommand(request, f.service)).toMatchObject({ status: "invalid" });
	expect(f.connect).not.toHaveBeenCalled();
});
test("native export reports captured bytes separately from unknown app/version", async () => {
	const f = await fixture();
	const r = await runGrokBuildCommand(f.request, f.service);
	expect(r).toMatchObject({
		operation: "export",
		status: "partial",
		effectState: "completed",
		retrySafe: false,
		app: { id: null, version: null },
		artifacts: {
			status: "retrieved",
			entries: [
				{
					kind: "workspace-archive",
					sizeBytes: 121,
					provenance: { source: "native-download-menu", responseId: "assistant" },
				},
			],
		},
		exportCapture: { setup: "acknowledged", reset: "default_acknowledged" },
		cleanupState: "completed",
	});
	expect(seam.click).toHaveBeenCalledTimes(1);
	expect(f.connect).toHaveBeenCalledWith(
		expect.objectContaining({
			tabTargetId: "target",
			allowNavigation: false,
			requireExistingTarget: true,
			tabLifecycle: "retain",
		}),
	);
	expect(f.page.mock.calls.map((x) => x[0].behavior)).toEqual(["allow", "default"]);
});
test.each([
	{ setupFails: true },
	{ rootFails: true },
])("preflight failure dispatches no Download and resets even unknown setup (%j)", async (options) => {
	const f = await fixture(options);
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		effectState: "none",
		artifacts: { status: "unavailable" },
		cleanupState: "completed",
		exportCapture: { reset: "default_acknowledged" },
	});
	expect(seam.click).not.toHaveBeenCalled();
	expect(f.close).toHaveBeenCalledOnce();
});
test("captured bytes survive unknown policy reset without claiming retry safety", async () => {
	const f = await fixture({ resetFails: true });
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		status: "unknown",
		retrySafe: false,
		artifacts: { status: "retrieved" },
		exportCapture: { reset: "unknown" },
		cleanupState: "completed",
	});
	expect(f.close).toHaveBeenCalledOnce();
});
test("nonprivate output directory is rejected before provider connection", async () => {
	const f = await fixture();
	await fs.chmod(f.root, 0o755);
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		status: "invalid",
		code: "grok_build_private_output_required",
	});
	expect(f.connect).not.toHaveBeenCalled();
});

import { captureGrokBuildArchive } from "../../src/browser/grokBuildExport.js";

test("a completed-looking ZIP alongside an active partial download never qualifies", async () => {
	const f = await fixture();
	await fs.writeFile(path.join(f.root, "archive.zip"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
	await fs.writeFile(path.join(f.root, "archive.zip.crdownload"), "active");
	await expect(captureGrokBuildArchive(f.root, undefined, 1700)).rejects.toThrow(
		"grok_build_export_capture_timeout",
	);
});
test("capture rejects symlinks rather than reading outside its private directory", async () => {
	const f = await fixture();
	await fs.symlink("/etc/hosts", path.join(f.root, "archive.zip"));
	await expect(captureGrokBuildArchive(f.root, undefined, 100)).rejects.toThrow(
		"grok_build_export_capture_invalid",
	);
});
test("account change before Download dispatch preserves target without a click", async () => {
	const f = await fixture({ accountChanges: true });
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		effectState: "none",
		cleanupState: "completed",
	});
	expect(seam.click).not.toHaveBeenCalled();
});

test("unconfirmed Download preserves the unknown effect fence and never retries", async () => {
	const f = await fixture({ clickFails: true });
	const settle = vi.fn();
	seam.governor.begin.mockResolvedValue({ settle });
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		effectState: "unknown",
		retrySafe: false,
		artifacts: { status: "unknown" },
		cleanupState: "completed",
	});
	expect(seam.click).toHaveBeenCalledOnce();
	expect(settle).toHaveBeenCalledWith(
		expect.objectContaining({ outcome: "failed", effectState: "outcome-unknown" }),
	);
});

import { grokBuildUnknown } from "../../src/browser/grokBuildService.js";
import { createGrokBuildToolHandler } from "../../src/mcp/tools/grokBuild.js";

test("MCP export validates consent before service resolution and dispatches only export", async () => {
	const exported = vi.fn(async () => ({
			...grokBuildUnknown(),
			operation: "export" as const,
			status: "partial" as const,
		})),
		resolve = vi.fn(() => ({
			export: exported,
			inspect: vi.fn(),
			discover: vi.fn(),
			generate: vi.fn(),
		}));
	const handler = createGrokBuildToolHandler(resolve);
	const request = {
		action: "export",
		targetId: "target",
		conversationId: "conversation",
		outputDir: "/private/export",
	};
	expect((await handler(request)).structuredContent.status).toBe("invalid");
	expect(resolve).not.toHaveBeenCalled();
	const accepted = { ...request, acknowledgeTargetDefaultReset: true };
	expect((await handler(accepted)).structuredContent.operation).toBe("export");
	expect(exported).toHaveBeenCalledWith(accepted);
});

test("lost More acknowledgement preserves unknown UI custody with zero Download attempts", async () => {
	const f = await fixture({ moreClosed: true, clickFails: true });
	const settle = vi.fn();
	seam.governor.begin.mockResolvedValue({ settle });
	const r = await runGrokBuildCommand(f.request, f.service);
	expect(r).toMatchObject({
		effectState: "unknown",
		retrySafe: false,
		artifacts: { status: "unavailable" },
		cleanupState: "completed",
	});
	expect(seam.click).toHaveBeenCalledOnce();
	expect(seam.governor.begin).toHaveBeenCalledWith(
		expect.objectContaining({ source: "provider:grok:build-export-more" }),
	);
	expect(seam.governor.begin).not.toHaveBeenCalledWith(
		expect.objectContaining({ source: "provider:grok:build-export-download" }),
	);
	expect(settle).toHaveBeenCalledWith(
		expect.objectContaining({ outcome: "failed", effectState: "outcome-unknown" }),
	);
});

test("known More target refusal stays pre-effect without a Download or unknown fence", async () => {
	const f = await fixture({ moreClosed: true });
	const settle = vi.fn();
	seam.governor.begin.mockResolvedValue({ settle });
	seam.click.mockResolvedValueOnce({
		ok: false,
		reason: "Trusted pointer button target not found",
	});
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		effectState: "none",
		retrySafe: true,
		artifacts: { status: "unavailable" },
	});
	expect(seam.click).toHaveBeenCalledOnce();
	expect(seam.governor.begin).not.toHaveBeenCalledWith(
		expect.objectContaining({ source: "provider:grok:build-export-download" }),
	);
	expect(settle).toHaveBeenCalledWith(
		expect.objectContaining({ outcome: "failed", effectState: "settled" }),
	);
});

test("a hidden Grok page uses existing allowed focus precondition before native export", async () => {
	const f = await fixture({ initiallyHidden: true });
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		effectState: "completed",
		artifacts: { status: "retrieved" },
	});
	expect(f.bringToFront).toHaveBeenCalledOnce();
	expect(seam.click).toHaveBeenCalledOnce();
});
test("suppressed focus plus hidden page refuses before pointer or Download", async () => {
	const f = await fixture({ initiallyHidden: true, suppressFocus: true });
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		effectState: "none",
		retrySafe: true,
		artifacts: { status: "unavailable" },
		cleanupState: "completed",
	});
	expect(f.bringToFront).not.toHaveBeenCalled();
	expect(seam.click).not.toHaveBeenCalled();
});

test("account drift after allowed focus refuses before native pointer input", async () => {
	const f = await fixture({ initiallyHidden: true, accountAfterFocus: true });
	expect(await runGrokBuildCommand(f.request, f.service)).toMatchObject({
		effectState: "none",
		retrySafe: true,
		artifacts: { status: "unavailable" },
	});
	expect(f.bringToFront).toHaveBeenCalledOnce();
	expect(seam.click).not.toHaveBeenCalled();
});
