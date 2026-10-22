import { describe, expect, it } from "vitest";
import { parseInstalledQuerySnapshot } from "../../src/browser/providers/chatgptInstalledQuery.js";

const account = "account-id";
const entry = {
	installed: true,
	remotePluginId: "plugin_exact",
	servicePlugin: { id: "plugin_exact", name: "Mail Receipts", enabled: true },
};
const query = () => ({
	queryKey: ["plugins", "installed", "local", "hosted", account],
	status: "success",
	fetchStatus: "idle",
	isInvalidated: false,
	data: [entry],
});
const snapshot = (queries: unknown[] = [query()]) => ({
	origin: "https://chatgpt.com",
	pathname: "/plugins",
	queries,
});

describe("guarded installed query snapshot", () => {
	it("accepts the exact settled account collection and empty complete collections", () => {
		expect(parseInstalledQuerySnapshot(snapshot(), account)).toEqual([entry.servicePlugin]);
		expect(parseInstalledQuerySnapshot(snapshot([{ ...query(), data: [] }]), account)).toEqual([]);
	});
	it("rejects batch metadata and unqualified routes", () => {
		expect(parseInstalledQuerySnapshot({ apps: [entry] }, account)).toBeNull();
		expect(
			parseInstalledQuerySnapshot({ ...snapshot(), origin: "https://other.test" }, account),
		).toBeNull();
		expect(parseInstalledQuerySnapshot({ ...snapshot(), pathname: "/" }, account)).toBeNull();
	});
	it("ignores foreign and catalog keys without treating them as installed membership", () => {
		const foreign = {
			...query(),
			queryKey: ["plugins", "installed", "local", "hosted", "foreign"],
		};
		const catalog = { ...query(), queryKey: [...query().queryKey, "catalog"] };
		expect(parseInstalledQuerySnapshot(snapshot([foreign, catalog]), account)).toBeNull();
		expect(parseInstalledQuerySnapshot(snapshot([foreign, catalog, query()]), account)).toEqual([
			entry.servicePlugin,
		]);
	});
	it.each([
		{ status: "error" },
		{ fetchStatus: "fetching" },
		{ isInvalidated: true },
		{ data: null },
		{ data: [entry, {}] },
	])("rejects unqualified matching state %j", (patch) => {
		expect(parseInstalledQuerySnapshot(snapshot([{ ...query(), ...patch }]), account)).toBeNull();
	});
	it("rejects duplicate queries, duplicate IDs, and identity mismatch", () => {
		expect(parseInstalledQuerySnapshot(snapshot([query(), query()]), account)).toBeNull();
		expect(
			parseInstalledQuerySnapshot(snapshot([{ ...query(), data: [entry, entry] }]), account),
		).toBeNull();
		expect(
			parseInstalledQuerySnapshot(
				snapshot([{ ...query(), data: [{ ...entry, remotePluginId: "different" }] }]),
				account,
			),
		).toBeNull();
		expect(
			parseInstalledQuerySnapshot(
				snapshot([{ ...query(), data: [{ ...entry, installed: false }] }]),
				account,
			),
		).toBeNull();
	});
});
