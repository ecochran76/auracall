/** Passive current-UI inventory qualification; app catalog metadata is not membership. */
function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseInstalledQuerySnapshot(
	value: unknown,
	expectedAccountId: string,
): Record<string, unknown>[] | null {
	if (
		!expectedAccountId.trim() ||
		!record(value) ||
		value.origin !== "https://chatgpt.com" ||
		value.pathname !== "/plugins" ||
		!Array.isArray(value.queries)
	)
		return null;
	const expected = ["plugins", "installed", "local", "hosted", expectedAccountId];
	const matches = value.queries.filter((query) => {
		if (!record(query)) return false;
		const key = query.queryKey;
		return (
			Array.isArray(key) &&
			key.length === expected.length &&
			expected.every((part, index) => key[index] === part)
		);
	});
	if (matches.length !== 1) return null;
	const query = matches[0];
	if (
		!record(query) ||
		query.status !== "success" ||
		query.fetchStatus !== "idle" ||
		query.isInvalidated !== false ||
		!Array.isArray(query.data) ||
		query.data.length > 2000
	)
		return null;
	const ids = new Set<string>();
	const result: Record<string, unknown>[] = [];
	for (const entry of query.data) {
		if (!record(entry) || entry.installed !== true || !record(entry.servicePlugin)) return null;
		const plugin = entry.servicePlugin;
		if (
			typeof plugin.id !== "string" ||
			!plugin.id.trim() ||
			plugin.id !== entry.remotePluginId ||
			typeof plugin.name !== "string" ||
			!plugin.name.trim() ||
			ids.has(plugin.id)
		)
			return null;
		ids.add(plugin.id);
		result.push(plugin);
	}
	return result;
}
