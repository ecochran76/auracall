import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getAuracallHomeDir } from "../auracallHome.js";
import type { GrokConnectorStatus } from "./providers/grokConnectors.js";
import type { GrokConnectorInstallationOutcome } from "./providers/grokConnectorInstallation.js";
export interface GrokConnectorProgress {
	status: GrokConnectorStatus | GrokConnectorInstallationOutcome["status"] | "blocked";
	code: string;
	scope: string;
	complete: boolean;
	installed: number | null;
	catalog: number | null;
	tools: number | null;
	hasProviderAccountIdentity: boolean;
	hasEndpointIdentity: boolean;
	hasAccountIdentity: boolean;
	auth: string | null;
	effectDispatched?: boolean;
	retrySafe?: boolean;
	observedAt: string;
	invocation?: Pick<
		GrokConnectorProgress,
		"status" | "code" | "effectDispatched" | "retrySafe" | "observedAt"
	>;
	installation?: Pick<
		GrokConnectorProgress,
		"status" | "code" | "effectDispatched" | "retrySafe" | "observedAt"
	>;
}
function destination(profile: string, installation = false, invocation = false) {
	return path.join(
		getAuracallHomeDir(),
		"cache",
		"providers",
		"grok",
		"__runtime__",
		`${invocation ? "connector-invocation" : installation ? "connector-installation" : "connectors"}-progress-${createHash("sha256").update(profile).digest("hex")}.json`,
	);
}
function sanitize(
	value: Omit<GrokConnectorProgress, "observedAt"> & { observedAt?: string },
): GrokConnectorProgress {
	const count = (n: number | null) => (Number.isSafeInteger(n) && Number(n) >= 0 ? n : null);
	return {
		status: [
			"blocked",
			"complete",
			"incomplete",
			"account-gated",
			"failed",
			"prepared",
			"already-connected",
			"unsupported",
			"unconfirmed",
			"awaiting-human",
			"completed",
		].includes(value.status)
			? value.status
			: "failed",
		code: /^[a-z_]{1,100}$/.test(value.code) ? value.code : "grok_connector_discovery_failed",
		scope:
			value.scope === "invocation"
				? "invocation"
				: value.scope === "installation"
					? "installation"
					: value.scope === "detail"
						? "detail"
						: "visible",
		effectDispatched: value.effectDispatched === true,
		retrySafe: value.retrySafe === true,
		complete: value.complete === true,
		installed: count(value.installed),
		catalog: count(value.catalog),
		tools: count(value.tools),
		hasProviderAccountIdentity: value.hasProviderAccountIdentity === true,
		hasEndpointIdentity: value.hasEndpointIdentity === true,
		hasAccountIdentity: value.hasAccountIdentity === true,
		auth: ["connected", "reauthentication-required", "unknown", "account-gated"].includes(
			value.auth ?? "",
		)
			? value.auth
			: null,
		observedAt:
			value.observedAt && Number.isFinite(Date.parse(value.observedAt))
				? new Date(value.observedAt).toISOString()
				: new Date().toISOString(),
	};
}
export async function recordGrokConnectorProgress(
	profile: string,
	value: Omit<GrokConnectorProgress, "observedAt">,
) {
	const file = destination(profile, value.scope === "installation", value.scope === "invocation"),
		temporary = `${file}.${randomUUID()}.tmp`;
	await fs.mkdir(path.dirname(file), { recursive: true });
	try {
		await fs.writeFile(temporary, JSON.stringify(sanitize(value)), { mode: 0o600 });
		await fs.rename(temporary, file);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
export async function readGrokConnectorProgress(
	profile: string,
): Promise<GrokConnectorProgress | undefined> {
	async function read(
		installation: boolean,
		invocation = false,
	): Promise<GrokConnectorProgress | undefined> {
		try {
			return sanitize(
				JSON.parse(await fs.readFile(destination(profile, installation, invocation), "utf8")),
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
	}
	const [inventory, installation, invocation] = await Promise.all([
		read(false),
		read(true),
		read(false, true),
	]);
	const current = inventory ?? installation ?? invocation;
	if (!current) return undefined;
	const custody = (value: GrokConnectorProgress) => ({
		status: value.status,
		code: value.code,
		effectDispatched: value.effectDispatched,
		retrySafe: value.retrySafe,
		observedAt: value.observedAt,
	});
	return {
		...current,
		...(installation ? { installation: custody(installation) } : {}),
		...(invocation ? { invocation: custody(invocation) } : {}),
	};
}
