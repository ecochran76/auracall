#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { NativeDesktopControlError } from "../src/browser/service/nativeDesktopControl.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";

const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-desktop-client-smoke-"));
setAuracallHomeDirOverrideForTest(home);
const imageBase64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=";
const desktops = [
	{
		name: "research",
		label: "Research",
		state: "ready" as const,
		presentation: "native" as const,
		browsers: [
			{
				browserId: "research-browser",
				handoffUrl: "https://browser.example.test/remote-view/research",
			},
		],
	},
	{
		name: "writing",
		label: "Writing",
		state: "ready" as const,
		presentation: "native" as const,
		browsers: [
			{
				browserId: "writing-browser",
				handoffUrl: "https://browser.example.test/remote-view/writing",
			},
		],
	},
	{ name: "empty", label: "Empty desktop", state: "empty" as const, browsers: [] },
	{
		name: "unavailable",
		label: "Unavailable desktop",
		state: "unavailable" as const,
		browsers: [],
		message: "Configured desktop route is unavailable.",
	},
];
desktops.push({
	name: "constructor",
	label: "Constructor desktop",
	state: "ready",
	presentation: "native",
	browsers: [{ browserId: "constructor-browser", handoffUrl: "/desktops?desktop=constructor" }],
});
const runtimeProfiles = [
	{
		runtimeProfileId: "research-runtime",
		provider: "chatgpt" as const,
		accountKey: "account-a",
		accountLabel: "Research account",
		state: "ready" as "ready" | "dormant",
		wakeable: false,
		desktopName: "research",
		browserId: "research-browser",
	},
	{
		runtimeProfileId: "writing-runtime",
		provider: "chatgpt" as const,
		accountKey: "account-a",
		accountLabel: "Research account",
		state: "ready" as "ready" | "dormant",
		wakeable: false,
		desktopName: "writing",
		browserId: "writing-browser",
	},
	{
		runtimeProfileId: "dormant-runtime",
		provider: "grok" as const,
		accountKey: "account-b",
		accountLabel: "Writing account",
		state: "dormant" as "ready" | "dormant",
		wakeable: true,
		desktopName: "writing",
		browserId: undefined as string | undefined,
	},
];
const frames: string[] = [];
const controlEvents: string[] = [];
let rejectRelease = true;
const server = await createResponsesHttpServer(
	{ host: "127.0.0.1", port: 0, tabAffinityMaintenanceIntervalMs: 0 },
	{
		desktopClient: {
			profiles: async () => runtimeProfiles,
			wakeProfile: async (id) => {
				assert.equal(id, "dormant-runtime");
				controlEvents.push(`wake:${id}`);
				const item = runtimeProfiles[2];
				assert(item);
				item.state = "ready";
				item.wakeable = false;
				item.browserId = "writing-browser";
				return { runtimeProfileId: id, desktopName: "writing", browserId: "writing-browser" };
			},
			list: async () => ({
				defaultDesktop: "research",
				rootDesktopUrl: "https://browser.example.test/root",
				desktops,
			}),
			view: async (name, browserId) => {
				frames.push(`${name}:${browserId}`);
				return {
					url:
						"https://desktop.example.test/embed/" +
						(name === "research"
							? "11111111-1111-4111-8111-111111111111"
							: "22222222-2222-4222-8222-222222222222"),
					capability: "observe" as const,
				};
			},
			takeControl: async (name, browserId, token) => {
				controlEvents.push(`take:${name}:${browserId}`);
				if (name === "constructor")
					throw new NativeDesktopControlError("Another controller owns this desktop.", false);
				return {
					url: "https://desktop.example.test/embed/33333333-3333-4333-8333-333333333333",
					capability: "control" as const,
					token,
				};
			},
			releaseControl: async (name, browserId) => {
				controlEvents.push(`release:${name}:${browserId}`);
				if (rejectRelease) throw new Error("Fixture revoke not confirmed.");
			},
			capture: async (name, browserId) => {
				frames.push(`${name}:${browserId}`);
				return { imageBase64, width: 1, height: 1 };
			},
		},
	},
);
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
let browserProfileArgument: string | undefined;
try {
	browser = await puppeteer.launch({
		executablePath: process.env.AURACALL_OPERATOR_UX_SMOKE_CHROME_PATH ?? "/usr/bin/google-chrome",
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
	browserProfileArgument = browser
		.process()
		?.spawnargs.find((argument) => argument.startsWith("--user-data-dir="));
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		if (request.url().startsWith("https://desktop.example.test/embed/")) {
			void request.respond({
				status: 200,
				contentType: "text/html",
				body: `<html><body style="background:#122035;color:white;font:24px system-ui;padding:40px">Native Remote View fixture<script>parent.postMessage({schemaVersion:1,type:'status',state:'ready',capability:'${request.url().includes("33333333") ? "control" : "observe"}'},'http://127.0.0.1:${server.port}')</script></body></html>`,
			});
		} else void request.continue();
	});
	await page.goto(`http://127.0.0.1:${server.port}/desktops`);
	await page.waitForFunction(
		() => document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(await page.$eval("#title", (node) => node.textContent), "Research");
	await page.$eval('#desktops button[data-desktop="writing"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(
		() =>
			document.querySelector("#title")?.textContent === "Writing" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(new URL(page.url()).searchParams.get("desktop"), "writing");
	await page.reload();
	await page.waitForFunction(
		() =>
			document.querySelector("#title")?.textContent === "Writing" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	await page.click("#take-control");
	await page.waitForFunction(() =>
		document.querySelector("#mode")?.textContent?.includes("Control ·"),
	);
	await page.reload();
	await page.waitForFunction(() =>
		document.querySelector("#message")?.textContent?.includes("Control is retained"),
	);
	assert.equal(controlEvents.length, 1, "Reload must not silently create another control grant.");
	await page.click("#release-control");
	await page.waitForFunction(() =>
		document.querySelector("#message")?.textContent?.includes("Release was not confirmed"),
	);
	assert.equal(
		await page.$eval("#release-control", (node) => (node as HTMLButtonElement).hidden),
		false,
	);
	rejectRelease = false;
	await page.click("#release-control");
	await page.waitForFunction(
		() =>
			document.querySelector("#mode")?.textContent === "View only" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.deepEqual(controlEvents, [
		"take:writing:writing-browser",
		"release:writing:writing-browser",
		"release:writing:writing-browser",
	]);
	assert.equal(await page.$(".toolbar"), null, "No duplicate control toolbar.");
	assert.equal(await page.$$eval(".profile-row", (rows) => rows.length), 3);
	await page.click("#group-profile");
	assert.equal(
		await page.$eval("#group-profile", (node) => node.getAttribute("aria-pressed")),
		"true",
	);
	await page.reload();
	await page.waitForFunction(
		() => document.querySelector("#group-profile")?.getAttribute("aria-pressed") === "true",
	);
	await page.click("#group-account");
	await page.click("#rail-toggle");
	await page.waitForFunction(
		() => document.querySelector("#workspace")?.getAttribute("data-collapsed") === "true",
	);
	assert.equal(await page.$eval("#rail", (node) => (node as HTMLElement).inert), true);
	await page.click("#rail-toggle");
	await page.waitForFunction(
		() => document.querySelector("#workspace")?.getAttribute("data-collapsed") === "false",
	);
	await page.waitForFunction(() => getComputedStyle(document.getElementById("rail") as HTMLElement).transform === "matrix(1, 0, 0, 1, 0, 0)");
	await page.click('[data-runtime-profile="dormant-runtime"] .wake');
	await page.waitForFunction(
		() =>
			document
				.querySelector('[data-runtime-profile="dormant-runtime"]')
				?.getAttribute("aria-current") === "true",
	);
	assert.equal(controlEvents.at(-1), "wake:dormant-runtime");
	assert.equal(await page.$('[data-runtime-profile="dormant-runtime"] .wake'), null);
	await page.screenshot({ path: "/tmp/auracall391-native-client.png", fullPage: true });
	await page.$eval('#desktops button[data-desktop="empty"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(() =>
		document.querySelector("#message")?.textContent?.includes("No AuraCall browsers"),
	);
	await page.$eval('#desktops button[data-desktop="unavailable"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(() =>
		document.querySelector("#message")?.textContent?.includes("Configured desktop route"),
	);
	assert.equal(
		await page.$eval("#root", (node) => (node as HTMLAnchorElement).href),
		"https://browser.example.test/root",
	);
	await page.$eval('#desktops button[data-desktop="constructor"]', (node) =>
		(node as HTMLButtonElement).click(),
	);
	await page.waitForFunction(
		() =>
			document.querySelector("#title")?.textContent === "Constructor desktop" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(await page.$eval("#mode", (node) => node.textContent), "View only");
	await page.click("#take-control");
	await page.waitForFunction(
		() =>
			document.querySelector("#mode")?.textContent === "View only" &&
			document.querySelector("#native-view section")?.getAttribute("data-state") === "ready",
	);
	assert.equal(
		await page.$eval("#release-control", (node) => (node as HTMLButtonElement).hidden),
		true,
	);
	assert.equal(
		await page.evaluate(() =>
			Object.hasOwn(
				JSON.parse(sessionStorage.getItem("auracall-desktop-claims") || "{}"),
				"constructor",
			),
		),
		false,
	);
	assert.deepEqual(errors, []);
	assert(
		frames.includes("research:research-browser") && frames.includes("writing:writing-browser"),
	);
	console.log(
		JSON.stringify({
			scope: "provider-free rendered client",
			passed: [
				"compact-profile-rows",
				"account-profile-toggle",
				"persisted-grouping",
				"svg-rail-collapse",
				"dormant-profile-wake",
				"single-control-header",
				"native-observe-embed",
				"constructor-desktop-observe",
				"refused-take-clears-only-unowned-claim",
				"explicit-control",
				"retained-control-reload",
				"failed-release-retains-claim",
				"explicit-release-to-observe",
				"two-desktop-navigation",
				"durable-selection-reload",
				"empty-state",
				"unavailable-state",
				"independent-root-link",
			],
			pageErrors: errors,
			installedDesktopAcceptance: false,
		}),
	);
} finally {
	await browser?.close();
	await server.close();
	setAuracallHomeDirOverrideForTest(null);
	await fs.rm(home, { recursive: true, force: true });
	const processList = await promisify(execFile)("ps", ["-eo", "pid,args"]);
	const remaining = browserProfileArgument
		? processList.stdout
				.split("\n")
				.filter((line) => line.includes(browserProfileArgument as string))
		: [];
	assert.equal(remaining.length, 0, "The smoke browser left an owned process running.");
	console.log(JSON.stringify({ freshOsReadback: true, remainingOwnedProcesses: remaining.length }));
}
