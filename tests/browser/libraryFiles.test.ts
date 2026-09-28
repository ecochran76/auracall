import { describe, expect, test } from "vitest";
import { assertChatgptLibraryFilesAttached } from "../../src/browser/actions/chatgptLibraryFiles.js";
import {
	createLibraryFileInventoryFromFileRefs,
	type LibraryFileInventory,
	resolveLibraryFileSelectors,
} from "../../src/browser/libraryFiles.js";

const completeInventory: LibraryFileInventory = {
	provider: "chatgpt",
	complete: true,
	observedAt: "2026-09-27T12:00:00.000Z",
	files: [
		{ id: "file_alpha", name: "Alpha.pdf", provider: "chatgpt", mimeType: "application/pdf" },
		{ id: "file_beta", name: "Beta.pdf", provider: "chatgpt", mimeType: "application/pdf" },
	],
};

describe("provider Library file contracts", () => {
	test("resolves stable IDs and exact unique names in request order", () => {
		expect(
			resolveLibraryFileSelectors(completeInventory, [{ name: "Beta.pdf" }, { id: "file_alpha" }]),
		).toEqual([completeInventory.files[1], completeInventory.files[0]]);
	});

	test("fails closed on incomplete inventory, stale IDs, and duplicate names", () => {
		expect(() =>
			resolveLibraryFileSelectors(
				{ ...completeInventory, complete: false, incompleteReason: "pagination unsettled" },
				[{ id: "file_alpha" }],
			),
		).toThrow("Library file inventory is incomplete: pagination unsettled");
		expect(() => resolveLibraryFileSelectors(completeInventory, [{ id: "file_stale" }])).toThrow(
			"missing or stale",
		);
		expect(() =>
			resolveLibraryFileSelectors(completeInventory, [{ id: "file_alpha" }, { id: "file_alpha" }]),
		).toThrow("selectors must be unique");
		expect(() =>
			resolveLibraryFileSelectors(
				{
					...completeInventory,
					files: [
						...completeInventory.files,
						{ id: "file_alpha", name: "Another.pdf", provider: "chatgpt" },
					],
				},
				[{ id: "file_alpha" }],
			),
		).toThrow("duplicate stable IDs");
		expect(() =>
			resolveLibraryFileSelectors(
				{
					...completeInventory,
					files: [
						...completeInventory.files,
						{ id: "file_duplicate_name", name: "Alpha.pdf", provider: "chatgpt" },
					],
				},
				[{ name: "Alpha.pdf" }],
			),
		).toThrow("ambiguous");
	});

	test("projects only privacy-bounded usable provider identities from account rows", () => {
		const inventory = createLibraryFileInventoryFromFileRefs(
			"chatgpt",
			[
				{
					id: "internal-hash",
					name: "Packet.pdf",
					provider: "chatgpt",
					source: "account",
					mimeType: "application/pdf",
					localPath: "/private/operator/path/Packet.pdf",
					metadata: {
						providerFileId: "file_packet",
						libraryRouteUrl: "https://chatgpt.com/library/files/private-route",
					},
				},
			],
			{ observedAt: "2026-09-27T12:00:00.000Z" },
		);

		expect(inventory).toEqual({
			provider: "chatgpt",
			complete: true,
			observedAt: "2026-09-27T12:00:00.000Z",
			files: [
				{
					id: "file_packet",
					name: "Packet.pdf",
					provider: "chatgpt",
					mimeType: "application/pdf",
				},
			],
		});
		expect(JSON.stringify(inventory)).not.toContain("/private/operator/path");
		expect(JSON.stringify(inventory)).not.toContain("private-route");
	});

	test("requires each requested document reference to be uniquely observed before Send", () => {
		expect(() =>
			assertChatgptLibraryFilesAttached(completeInventory.files, [
				{ id: "file_alpha", name: "Alpha.pdf", provider: "chatgpt" },
				{ id: "file_beta", name: "Beta.pdf", provider: "chatgpt" },
			]),
		).not.toThrow();
		expect(() =>
			assertChatgptLibraryFilesAttached(completeInventory.files, [
				{ id: "", name: "Alpha.pdf", provider: "chatgpt" },
				{ id: "file_beta", name: "Beta.pdf", provider: "chatgpt" },
			]),
		).toThrow("file_alpha");
		expect(() =>
			assertChatgptLibraryFilesAttached(completeInventory.files, [
				{ id: "file_alpha", name: "Alpha.pdf", provider: "chatgpt" },
			]),
		).toThrow("file_beta");
	});
});
