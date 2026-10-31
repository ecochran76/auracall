import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { BrowserProviderListOptions } from "./providers/types.js";

const sourcePath = fileURLToPath(import.meta.url);
const sourceIdentity = fs
	.readFile(sourcePath)
	.then((bytes) => createHash("sha256").update(sourcePath).update(bytes).digest("hex"));

function stable(value: unknown): unknown {
	if (value === undefined) return null;
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return value.map(stable);
	if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, stable(item)]),
		);
	}
	throw new Error("Non-portable conversation-list configuration");
}

/** Return null when positive browser-generation/account provenance is missing. */
export async function conversationListSharingKey(
	config: unknown,
	options: BrowserProviderListOptions,
	portable: BrowserProviderListOptions,
): Promise<string | null> {
	if (process.platform !== "linux") return null;
	const authorization = options.providerSessionAuthorization;
	const context = authorization?.context;
	if (
		!authorization?.expectation.configuredIdentity ||
		!context?.managedBrowserProfile ||
		!context.browserProcessId ||
		!context.browserProfile ||
		!context.devtoolsHost ||
		!context.devtoolsPort
	)
		return null;
	try {
		const [stat, boot, implementation] = await Promise.all([
			fs.readFile(`/proc/${context.browserProcessId}/stat`, "utf8"),
			fs.readFile("/proc/sys/kernel/random/boot_id", "utf8"),
			sourceIdentity,
		]);
		const birth = stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
		if (!birth) return null;
		return createHash("sha256")
			.update(
				JSON.stringify(
					stable({
						version: 1,
						implementation,
						config,
						portable,
						// Utility admission can select another tab in the same browser.
						// Only explicit caller selection belongs in request equivalence.
						context: { ...context, browserTargetId: portable.tabTargetId ?? null },
						expectation: authorization.expectation,
						birth,
						boot,
					}),
				),
			)
			.digest("hex");
	} catch {
		return null;
	}
}
