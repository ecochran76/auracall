import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { BrowserAutomationError } from "../oracle/errors.js";
import { projectGrokAccountReference } from "./grokAccountReference.js";
import type {
	GrokBuildDependencies,
	GrokBuildExportRequest,
	GrokBuildResult,
} from "./grokBuildService.js";
import { grokBuildUnknown } from "./grokBuildService.js";
import { runGrokUiOperation } from "./grokUiOperation.js";
import {
	readGrokBuildPlaneSnapshot,
	readGrokBuildWorkspaceReadiness,
} from "./providers/grokBuild.js";
import { grokBuildExportControlExpression } from "./providers/grokBuildExport.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import { pressButtonWithTrustedPointer } from "./service/ui.js";
import type { ChromeClient } from "./types.js";

/** Download capture never changes Browser-wide settings, follows a URL, or executes generated code. */
export async function captureGrokBuildArchive(
	directory: string,
	signal?: AbortSignal,
	timeoutMs = 60000,
) {
	const deadline = Date.now() + timeoutMs;
	let previous = "",
		stable = 0;
	while (Date.now() < deadline) {
		signal?.throwIfAborted();
		const names = await fs.readdir(directory);
		const entries = await Promise.all(
			names.map(async (name) => ({ name, stat: await fs.lstat(path.join(directory, name)) })),
		);
		if (
			entries.some(
				(e) => !e.stat.isFile() || e.stat.isSymbolicLink() || e.stat.size > 25 * 1024 * 1024,
			)
		)
			throw new Error("grok_build_export_capture_invalid");
		const state = JSON.stringify(
			entries.map((e) => ({ name: e.name, size: e.stat.size, mtime: e.stat.mtimeMs })),
		);
		stable =
			entries.length === 1 &&
			!/\.(crdownload|tmp|part)$/i.test(entries[0].name) &&
			state === previous
				? stable + 1
				: 0;
		previous = state;
		if (stable >= 3) {
			const localPath = path.join(directory, entries[0].name);
			await fs.chmod(localPath, 0o600);
			const bytes = await fs.readFile(localPath);
			let end = -1;
			for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
				if (
					bytes.readUInt32LE(i) === 0x06054b50 &&
					i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
				) {
					end = i;
					break;
				}
			if (
				bytes.length < 22 ||
				bytes.length > 25 * 1024 * 1024 ||
				bytes.readUInt32LE(0) !== 0x04034b50 ||
				end < 0 ||
				bytes.readUInt16LE(end + 4) !== 0 ||
				bytes.readUInt16LE(end + 6) !== 0 ||
				bytes.readUInt16LE(end + 10) === 0 ||
				bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10) ||
				bytes.readUInt32LE(end + 16) + bytes.readUInt32LE(end + 12) !== end ||
				bytes.readUInt32LE(end + 16) + 4 > end ||
				bytes.readUInt32LE(bytes.readUInt32LE(end + 16)) !== 0x02014b50
			)
				throw new Error("grok_build_export_zip_unqualified");
			return {
				localPath,
				sizeBytes: bytes.length,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			};
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error("grok_build_export_capture_timeout");
}
export async function exportGrokBuild(
	options: BrowserProviderListOptions,
	dependencies: GrokBuildDependencies,
	request: GrokBuildExportRequest,
): Promise<GrokBuildResult> {
	const capture: NonNullable<GrokBuildResult["exportCapture"]> = {
		setup: "not_attempted",
		reset: "not_needed",
	};
	let result: GrokBuildResult = {
		...grokBuildUnknown(),
		operation: "export",
		targetId: request.targetId,
		exportCapture: capture,
	};
	const valid = (s: string) => typeof s === "string" && /^[A-Za-z0-9:_-]{1,200}$/.test(s);
	if (
		!valid(request.targetId) ||
		!valid(request.conversationId) ||
		(request.responseId !== undefined && !valid(request.responseId)) ||
		request.acknowledgeTargetDefaultReset !== true ||
		typeof request.outputDir !== "string" ||
		!path.isAbsolute(request.outputDir)
	)
		return {
			...result,
			status: "invalid",
			code: "grok_build_request_invalid",
			cleanupState: "completed",
		};
	let directory: string;
	try {
		const root = await fs.lstat(request.outputDir);
		if (
			!root.isDirectory() ||
			root.isSymbolicLink() ||
			(root.mode & 0o077) !== 0 ||
			(process.getuid && root.uid !== process.getuid())
		)
			throw new Error();
		directory = await fs.mkdtemp(path.join(await fs.realpath(request.outputDir), "grok-build-"));
		await fs.chmod(directory, 0o700);
	} catch {
		return {
			...result,
			status: "invalid",
			code: "grok_build_private_output_required",
			cleanupState: "completed",
		};
	}
	if (!options.port)
		return {
			...result,
			status: "unavailable",
			code: "grok_build_existing_browser_required",
			cleanupState: "completed",
		};
	const connect =
		dependencies.connect ?? (await import("./providers/grokAdapter.js")).connectToGrokTab;
	const connection = await connect({
		...options,
		tabTargetId: request.targetId,
		tabUrl: undefined,
		requireExistingTarget: true,
		allowNavigation: false,
		preserveActiveTab: true,
		tabLifecycle: "retain",
		providerTrafficRequired: true,
	});
	const client = connection.client as ChromeClient;
	let uncertainUiEffect = false;
	let attempted = false,
		setupAttempted = false;
	const page = client.Page as unknown as {
		setDownloadBehavior?: (input: {
			behavior: "allow" | "default";
			downloadPath?: string;
		}) => Promise<unknown>;
	};
	const setDownloadPolicy = page?.setDownloadBehavior?.bind(page);
	try {
		const governor = resolveProviderTrafficGovernor(client);
		if (
			connection.targetId !== request.targetId ||
			!governor ||
			governor.attribution.provider !== "grok" ||
			governor.attribution.targetId !== request.targetId ||
			!governor.admitBackendRequest
		)
			throw new Error("grok_build_export_authority_unqualified");
		const verify =
			dependencies.verifyAccount ??
			(async (runtime: ChromeClient["Runtime"], input: BrowserProviderListOptions) => {
				const p = await (await import("./providers/grokAdapter.js")).checkGrokBrowserAuthPreflight(
					runtime,
					input,
				);
				return p.ok ? projectGrokAccountReference(p.actualIdentity, "legacy-untagged") : null;
			});
		await governor.checkWarning?.(client.Runtime);
		const account = await verify(client.Runtime, options);
		if (!account) throw new Error("grok_build_account_not_verified");
		const view = await readGrokBuildPlaneSnapshot(client.Runtime, {
			conversationId: request.conversationId,
			allowInertBackground: true,
		});
		if (
			view.state !== "completed" ||
			!view.responseId ||
			!view.gatewayRowId ||
			(request.responseId !== undefined && request.responseId !== view.responseId)
		)
			throw new Error("grok_build_completed_assistant_required");
		result = {
			...result,
			conversationId: view.conversationId,
			conversationUrl: view.conversationUrl,
			providerAccountRef: account,
			generation: {
				status: "response_completed",
				responseId: view.responseId,
				text: null,
				markdown: null,
				gatewayRowId: view.gatewayRowId,
				uiState: "completed",
			},
		};
		if (
			(await readGrokBuildWorkspaceReadiness(client.Runtime, request.conversationId)) === "inactive"
		)
			throw new Error("grok_build_workspace_inactive");
		const responseId = view.responseId,
			gatewayRowId = view.gatewayRowId;
		const exact = { ...request, responseId };
		const control = async (action: "more" | "download" | "read", click: boolean) => {
			options.abortSignal?.throwIfAborted();
			await governor.checkWarning?.(client.Runtime);
			if ((await verify(client.Runtime, options)) !== account)
				throw new Error("grok_build_account_changed");
			if (
				(await readGrokBuildWorkspaceReadiness(client.Runtime, request.conversationId)) ===
				"inactive"
			)
				throw new Error("grok_build_workspace_inactive");
			if (click) {
				const { ensureGrokTabVisible } = await import("./providers/grokAdapter.js");
				await ensureGrokTabVisible(client, { timeoutMs: 2500 });
				const observed = await client.Runtime.evaluate({
					expression:
						"(()=>({visibilityState:document.visibilityState??null,origin:location.origin,pathname:location.pathname}))()",
					returnByValue: true,
				});
				const page = observed.result?.value as
					| { visibilityState?: string; origin?: string; pathname?: string }
					| undefined;
				if (
					observed.exceptionDetails ||
					page?.visibilityState !== "visible" ||
					page.origin !== "https://grok.com" ||
					page.pathname !== `/c/${request.conversationId}` ||
					connection.targetId !== request.targetId ||
					governor.attribution.targetId !== request.targetId
				)
					throw new BrowserAutomationError("grok_build_export_visible_target_required", {
						effectState: "pre_effect",
						targetId: request.targetId,
					});
				if ((await verify(client.Runtime, options)) !== account)
					throw new BrowserAutomationError("grok_build_account_changed", {
						effectState: "pre_effect",
						targetId: request.targetId,
					});
			}
			const token = randomUUID(),
				r = await client.Runtime.evaluate({
					expression: grokBuildExportControlExpression(exact, gatewayRowId, token, action),
					returnByValue: true,
				});
			const state = r.result?.value as
				| { stage?: string; flags?: { expandedOwnedTriggerCount?: number } }
				| undefined;
			if (r.exceptionDetails) throw new Error("grok_build_export_control_unqualified");
			if (!click) return state;
			if (state?.stage !== (action === "more" ? "owned-more-prepared" : "owned-menu-observed"))
				throw new Error("grok_build_export_control_unqualified");
			if (action === "download") attempted = true;
			try {
				const c = await pressButtonWithTrustedPointer(client, {
					selector: `[data-auracall-build-download="${token}"]`,
					requireVisible: true,
					timeoutMs: 2500,
				});
				if (!c.ok && c.reason === "Trusted pointer button target not found") {
					if (action === "download") attempted = false;
					throw new BrowserAutomationError("grok_build_export_control_unavailable", {
						effectState: "pre_effect",
						targetId: request.targetId,
					});
				}
				if (!c.ok || !c.trusted) throw new Error("grok_build_export_dispatch_unconfirmed");
			} catch (error) {
				if (error instanceof BrowserAutomationError && error.details?.effectState === "pre_effect")
					throw error;
				uncertainUiEffect = true;
				throw new BrowserAutomationError(
					"grok_build_export_ui_outcome_unknown",
					{ effectState: "unknown", targetId: request.targetId },
					error,
				);
			}
			return state;
		};
		if (!setDownloadPolicy) throw new Error("grok_build_target_download_unsupported");
		setupAttempted = true;
		capture.setup = "attempted";
		await setDownloadPolicy({ behavior: "allow", downloadPath: directory });
		capture.setup = "acknowledged";
		const initial = await control("read", false);
		if (initial?.flags?.expandedOwnedTriggerCount !== 1)
			await runGrokUiOperation({
				governor,
				runtime: client.Runtime,
				kind: "in-page-click",
				source: "provider:grok:build-export-more",
				abortSignal: options.abortSignal,
				effect: () => control("more", true),
			});
		await runGrokUiOperation({
			governor,
			runtime: client.Runtime,
			kind: "in-page-click",
			source: "provider:grok:build-export-download",
			abortSignal: options.abortSignal,
			effect: async () => {
				try {
					await control("download", true);
					const artifact = await captureGrokBuildArchive(directory, options.abortSignal);
					const after = await readGrokBuildPlaneSnapshot(client.Runtime, {
						conversationId: request.conversationId,
						allowInertBackground: true,
					});
					if (
						after.state !== "completed" ||
						after.responseId !== responseId ||
						after.gatewayRowId !== gatewayRowId
					)
						throw new Error("grok_build_export_response_binding_changed");
					if ((await verify(client.Runtime, options)) !== account)
						throw new Error("grok_build_account_changed");
					result = {
						...result,
						status: "partial",
						code: "grok_build_export_retrieved_app_identity_unobserved",
						artifacts: {
							status: "retrieved",
							code: "grok_build_workspace_archive_retrieved",
							entries: [
								{
									...artifact,
									kind: "workspace-archive",
									mediaType: "application/zip",
									provenance: {
										targetId: request.targetId,
										conversationId: request.conversationId,
										responseId,
										source: "native-download-menu",
									},
								},
							],
						},
						effectState: "completed",
						retrySafe: false,
					};
				} catch (error) {
					if (attempted)
						throw new BrowserAutomationError(
							"grok_build_export_outcome_unknown",
							{ effectState: "unknown", targetId: request.targetId },
							error,
						);
					throw error;
				}
			},
		});
	} catch (error) {
		const inactive = error instanceof Error && error.message === "grok_build_workspace_inactive";
		const unsupported =
			error instanceof Error && error.message === "grok_build_target_download_unsupported";
		result = {
			...result,
			status: unsupported || inactive ? "unavailable" : "unknown",
			code: attempted
				? "grok_build_export_outcome_unknown"
				: uncertainUiEffect
					? "grok_build_export_ui_outcome_unknown"
					: inactive
						? "grok_build_workspace_inactive"
						: unsupported
							? "grok_build_target_download_unsupported"
							: "grok_build_export_preflight_failed",
			effectState: attempted || uncertainUiEffect ? "unknown" : "none",
			retrySafe: !attempted && !uncertainUiEffect,
			artifacts:
				result.artifacts.status === "retrieved"
					? result.artifacts
					: {
							status: attempted ? "unknown" : "unavailable",
							code: "grok_build_archive_not_qualified",
							entries: [],
						},
		};
	} finally {
		try {
			if (setupAttempted && setDownloadPolicy) {
				try {
					await setDownloadPolicy({ behavior: "default" });
					capture.reset = "default_acknowledged";
				} catch {
					capture.reset = "unknown";
					result.status = "unknown";
					result.code = "grok_build_export_reset_unknown";
					result.retrySafe = false;
				}
			}
		} finally {
			try {
				await client.close();
				result.cleanupState = "completed";
			} catch {
				result.cleanupState = "unknown";
				result.status = "unknown";
				result.code = "grok_build_cleanup_unknown";
				result.retrySafe = false;
			}
		}
	}
	return result;
}
