import { createHash } from "node:crypto";
import type { ProviderUserIdentity } from "./providers/types.js";

/** Public wire compatibility, not interchangeable account namespaces.
 * Bots/Build predate kind tags. Files/Connectors and saved connector-installation
 * journals use typed-v1. A migration must explicitly handle their saved references.
 */
export type GrokAccountReferenceFormat = "legacy-untagged" | "typed-v1";

/** Project only an already verified identity. This does not establish account
 * authority. Trim surrounding whitespace, preserve case and handle spelling:
 * lowercasing or removing @ would change existing public/persisted hashes.
 * Display labels and provenance never participate in account identity.
 */
export function projectGrokAccountReference(
	identity: ProviderUserIdentity | null | undefined,
	format: GrokAccountReferenceFormat,
): string | null {
	const candidates = [
		["id", identity?.id],
		["account", identity?.accountId],
		["email", identity?.email],
		["handle", identity?.handle],
	] as const;
	for (const [kind, candidate] of candidates) {
		const value = candidate?.trim();
		if (!value) continue;
		const key = format === "typed-v1" ? `${kind}:${value}` : value;
		return createHash("sha256").update(`grok:${key}`).digest("hex");
	}
	return null;
}
