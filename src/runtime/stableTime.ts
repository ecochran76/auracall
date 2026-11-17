import { constants } from "node:fs";
import fs from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";

export interface StableTimeReading {
	utc: string;
	earliestUtc: string;
	latestUtc: string;
	epoch: string;
	evidenceGeneration: number;
}

/** Parse UTC evidence exactly; millisecond truncation could clear a fence too early. */
export function utcNanoseconds(value: unknown): bigint | null {
	if (typeof value !== "string") return null;
	const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value);
	if (!match) return null;
	const milliseconds = Date.parse(`${match[1]}Z`);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString().slice(0, 19) !== match[1]
	)
		return null;
	return BigInt(milliseconds) * 1_000_000n + BigInt((match[2] ?? "").padEnd(9, "0"));
}

export function qualifyStableTime(value: unknown): StableTimeReading {
	const data = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
	const rawEstimate = data?.estimate;
	const estimate =
		rawEstimate && typeof rawEstimate === "object"
			? (rawEstimate as Record<string, unknown>)
			: null;
	const instant = utcNanoseconds(estimate?.utc);
	const earliest = utcNanoseconds(estimate?.earliest_utc);
	const latest = utcNanoseconds(estimate?.latest_utc);
	if (
		data?.contract_version !== "2.0" ||
		data.status !== "qualified_live" ||
		data.bound !== "finite" ||
		!estimate ||
		typeof estimate.utc !== "string" ||
		typeof estimate.earliest_utc !== "string" ||
		typeof estimate.latest_utc !== "string" ||
		instant === null ||
		earliest === null ||
		latest === null ||
		earliest > instant ||
		instant > latest ||
		typeof data.epoch !== "string" ||
		typeof data.evidence_generation !== "number" ||
		!Number.isSafeInteger(data.evidence_generation)
	) {
		throw new Error("StableTime is unavailable or unqualified; no reset performed.");
	}
	return {
		utc: estimate.utc,
		earliestUtc: estimate.earliest_utc,
		latestUtc: estimate.latest_utc,
		epoch: data.epoch,
		evidenceGeneration: data.evidence_generation,
	};
}

/** Read the authenticated Windows authority; never extrapolate using the WSL clock. */
export async function readQualifiedStableTime(
	profilePath = process.env.AURACALL_STABLE_TIME_CLIENT_CONFIG ??
		path.join(os.homedir(), ".local/share/stable-time/client.json"),
): Promise<StableTimeReading> {
	try {
		const profile = JSON.parse(await fs.readFile(profilePath, "utf8"));
		const endpoint = new URL("/v1/time", profile.url);
		if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
			throw new Error("Invalid authority");
		const tokenHandle = await fs.open(
			profile.token_file,
			constants.O_RDONLY | constants.O_NOFOLLOW,
		);
		let token: string;
		try {
			const stat = await tokenHandle.stat();
			if (
				!stat.isFile() ||
				stat.size > 16384 ||
				stat.mode & 0o077 ||
				(process.getuid && stat.uid !== process.getuid())
			)
				throw new Error("Invalid private credential");
			token = (await tokenHandle.readFile("utf8")).trim();
			if (!token || /[\r\n]/.test(token)) throw new Error("Invalid private credential");
		} finally {
			await tokenHandle.close();
		}
		const ca = await fs.readFile(profile.ca_file);
		const body = await new Promise<string>((resolve, reject) => {
			const request = https.get(
				endpoint,
				{ ca, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
				(response) => {
					if (response.statusCode !== 200) {
						response.resume();
						reject(new Error("Authority unavailable"));
						return;
					}
					const chunks: Buffer[] = [];
					let size = 0;
					response.on("data", (chunk: Buffer) => {
						size += chunk.length;
						if (size > 131072) {
							request.destroy();
							reject(new Error("Authority response too large"));
						} else chunks.push(chunk);
					});
					response.on("error", reject);
					response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
				},
			);
			request.on("error", reject);
		});
		return qualifyStableTime(JSON.parse(body));
	} catch {
		// Native request errors may contain URLs or headers; keep receiving credentials private.
		throw new Error("StableTime is unavailable or unqualified; no reset performed.");
	}
}
