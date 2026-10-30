import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "../auracallHome.js";
export type GrokEcosystemSurface = "files" | "bots" | "build";
export interface GrokEcosystemProgress {
	status: string;
	code: string;
	complete: boolean;
	count: number | null;
	ready: number | null;
	hasProviderAccountIdentity: boolean;
	hasProjectContext: boolean;
	hasConversationIdentity: boolean;
	hasResponseIdentity: boolean;
	effectState: "none" | "completed" | "unknown";
	observedAt: string;
	publicationInspection?: {
		nativeState: "not_published" | "deployment_observed" | "unknown";
		nativePublishEnabled: boolean;
		dialogDismissed: boolean;
		snapshotBinding: "unqualified";
	};
	materialization?: {
		status: "indexed" | "not_materialized" | "failed";
		indexedAssets: number;
		verifiedBytes: number;
		scope: "selected-workspace-archive";
		complete: false;
		referencedFiles: "not_qualified";
		appIdentity: "observed" | "unobserved";
	};
}
function destination(surface: GrokEcosystemSurface, profile: string) {
	return path.join(
		getAuracallHomeDir(),
		"cache",
		"providers",
		"grok",
		"__runtime__",
		`${surface}-progress-${createHash("sha256").update(profile).digest("hex")}.json`,
	);
}
function sanitize(value: Record<string, unknown>): GrokEcosystemProgress {
	const count = (n: unknown) =>
		typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
	const m =
		value.materialization && typeof value.materialization === "object"
			? (value.materialization as Record<string, unknown>)
			: null;
	const publication =
		value.publicationInspection && typeof value.publicationInspection === "object"
			? (value.publicationInspection as Record<string, unknown>)
			: null;
	return {
		...(publication
			? {
					publicationInspection: {
						nativeState:
							publication.nativeState === "not_published"
								? ("not_published" as const)
								: publication.nativeState === "deployment_observed"
									? ("deployment_observed" as const)
									: ("unknown" as const),
						nativePublishEnabled: publication.nativePublishEnabled === true,
						dialogDismissed: publication.dialogDismissed === true,
						snapshotBinding: "unqualified" as const,
					},
				}
			: {}),
		...(m
			? {
					materialization: {
						status:
							m.status === "indexed"
								? ("indexed" as const)
								: m.status === "not_materialized"
									? ("not_materialized" as const)
									: ("failed" as const),
						indexedAssets: count(m.indexedAssets) ?? 0,
						verifiedBytes: count(m.verifiedBytes) ?? 0,
						scope: "selected-workspace-archive" as const,
						complete: false as const,
						referencedFiles: "not_qualified" as const,
						appIdentity:
							m.appIdentity === "observed" ? ("observed" as const) : ("unobserved" as const),
					},
				}
			: {}),
		status:
			typeof value.status === "string" &&
			[
				"available",
				"unavailable",
				"partial",
				"invalid",
				"complete",
				"incomplete",
				"failed",
				"unconfirmed",
				"supported",
				"blocked",
				"unknown",
			].includes(value.status)
				? value.status
				: "unknown",
		code:
			typeof value.code === "string" && /^grok_[a-z0-9_]{1,100}$/.test(value.code)
				? value.code
				: "grok_ecosystem_unknown",
		complete: value.complete === true,
		count: count(value.count ?? value.botCount),
		ready: count(value.ready),
		hasProviderAccountIdentity: value.hasProviderAccountIdentity === true,
		hasProjectContext: value.hasProjectContext === true,
		hasConversationIdentity: value.hasConversationIdentity === true,
		hasResponseIdentity: value.hasResponseIdentity === true,
		effectState:
			value.effectState === "completed"
				? "completed"
				: value.effectState === "unknown" || value.status === "unconfirmed"
					? "unknown"
					: "none",
		observedAt:
			typeof value.observedAt === "string" && Number.isFinite(Date.parse(value.observedAt))
				? new Date(value.observedAt).toISOString()
				: new Date().toISOString(),
	};
}
export async function recordGrokEcosystemProgress(
	surface: GrokEcosystemSurface,
	profile: string,
	value: Record<string, unknown>,
) {
	const file = destination(surface, profile),
		temporary = `${file}.${randomUUID()}.tmp`;
	await fs.mkdir(path.dirname(file), { recursive: true });
	try {
		await fs.writeFile(temporary, JSON.stringify(sanitize(value)), { mode: 0o600 });
		await fs.rename(temporary, file);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
export async function readGrokEcosystemProgress(
	surface: GrokEcosystemSurface,
	profile: string,
): Promise<GrokEcosystemProgress | undefined> {
	try {
		return sanitize(JSON.parse(await fs.readFile(destination(surface, profile), "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}
