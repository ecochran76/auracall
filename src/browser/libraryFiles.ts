import type { FileRef, ProviderId } from "./providers/domain.js";

export type LibraryFileSelector = { id: string; name?: never } | { id?: never; name: string };

export interface LibraryFileIdentity {
	id: string;
	name: string;
	provider: ProviderId;
	mimeType?: string | null;
	sizeBytes?: number | null;
}

export interface LibraryFileInventory {
	provider: ProviderId;
	complete: boolean;
	observedAt: string;
	files: LibraryFileIdentity[];
	incompleteReason?: string | null;
}

export interface LibraryFileAttachmentReceipt {
	requested: LibraryFileSelector[];
	attached: LibraryFileIdentity[];
	inventoryObservedAt: string;
}

export function normalizeLibraryFileSelector(selector: LibraryFileSelector): LibraryFileSelector {
	const id = typeof selector.id === "string" ? selector.id.trim() : "";
	const name = typeof selector.name === "string" ? normalizeLibraryFileName(selector.name) : "";
	if ((id ? 1 : 0) + (name ? 1 : 0) !== 1) {
		throw new Error("Each Library file selector must contain exactly one non-empty id or name.");
	}
	return id ? { id } : { name };
}

export function normalizeLibraryFileSelectors(
	selectors: readonly LibraryFileSelector[] | null | undefined,
): LibraryFileSelector[] {
	const normalized = (selectors ?? []).map(normalizeLibraryFileSelector);
	const keys = normalized.map((selector) =>
		"id" in selector ? `id:${selector.id}` : `name:${selector.name}`,
	);
	if (new Set(keys).size !== keys.length) {
		throw new Error("Library file selectors must be unique.");
	}
	return normalized;
}

export function resolveLibraryFileSelectors(
	inventory: LibraryFileInventory,
	selectors: readonly LibraryFileSelector[],
): LibraryFileIdentity[] {
	if (!inventory.complete) {
		throw new Error(
			`Library file inventory is incomplete${inventory.incompleteReason ? `: ${inventory.incompleteReason}` : "."}`,
		);
	}
	const requested = normalizeLibraryFileSelectors(selectors);
	const duplicateIds = findDuplicates(inventory.files.map((file) => file.id));
	if (duplicateIds.length > 0) {
		throw new Error(
			`Library file inventory contains duplicate stable IDs: ${duplicateIds.join(", ")}.`,
		);
	}

	const resolved = requested.map((selector) => {
		if ("id" in selector) {
			const match = inventory.files.find((file) => file.id === selector.id);
			if (!match) {
				throw new Error(`Library file ID "${selector.id}" is missing or stale.`);
			}
			return match;
		}
		const matches = inventory.files.filter(
			(file) => normalizeLibraryFileName(file.name) === selector.name,
		);
		if (matches.length === 0) {
			throw new Error(`Library file name "${selector.name}" was not found.`);
		}
		if (matches.length > 1) {
			throw new Error(
				`Library file name "${selector.name}" is ambiguous; request one of its stable IDs instead.`,
			);
		}
		return matches[0];
	});

	const resolvedIds = resolved.map((file) => file.id);
	if (new Set(resolvedIds).size !== resolvedIds.length) {
		throw new Error("Library file selectors resolve to the same provider file more than once.");
	}
	return resolved;
}

export function createLibraryFileInventoryFromFileRefs(
	provider: ProviderId,
	files: readonly FileRef[],
	options: { observedAt?: string; complete?: boolean; incompleteReason?: string | null } = {},
): LibraryFileInventory {
	const identities: LibraryFileIdentity[] = [];
	let hasUnusableRows = false;
	for (const file of files) {
		if (file.provider !== provider || file.source !== "account") continue;
		const providerId = readStableProviderFileId(file);
		const name = normalizeLibraryFileName(file.name);
		if (!providerId || !name) {
			hasUnusableRows = true;
			continue;
		}
		identities.push({
			id: providerId,
			name,
			provider,
			...(file.mimeType ? { mimeType: file.mimeType } : {}),
			...(typeof file.size === "number" ? { sizeBytes: file.size } : {}),
		});
	}
	const duplicateIds = findDuplicates(identities.map((file) => file.id));
	const complete = options.complete !== false && !hasUnusableRows && duplicateIds.length === 0;
	return {
		provider,
		complete,
		observedAt: options.observedAt ?? new Date().toISOString(),
		files: identities,
		...(complete
			? {}
			: {
					incompleteReason:
						options.incompleteReason ??
						(duplicateIds.length > 0
							? `duplicate provider IDs: ${duplicateIds.join(", ")}`
							: "one or more Library rows lack a stable provider ID or exact name"),
				}),
	};
}

function readStableProviderFileId(file: FileRef): string | null {
	const metadata = file.metadata;
	const providerFileId =
		typeof metadata?.providerFileId === "string" ? metadata.providerFileId.trim() : "";
	if (providerFileId) return providerFileId;
	const libraryFileId =
		typeof metadata?.libraryFileId === "string" ? metadata.libraryFileId.trim() : "";
	return libraryFileId || null;
}

function normalizeLibraryFileName(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function findDuplicates(values: readonly string[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value);
		seen.add(value);
	}
	return [...duplicates];
}
