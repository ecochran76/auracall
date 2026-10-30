import puppeteer from "puppeteer-core";
import { expect, test } from "vitest";
import { renderDesktopClientPage } from "../src/http/desktopClientPage.js";

test("browser rail hides allocation records, groups browser profiles and launches dormant browsers without a desktop pin", async () => {
	const browser = await puppeteer.launch({
		executablePath: "/usr/bin/google-chrome",
		headless: true,
		args: ["--no-sandbox"],
	});
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(String(error)));
		const launches: unknown[] = [];
		let launched = false;
		let recallable = false;
		const recalls: unknown[] = [];
		await page.setRequestInterception(true);
		page.on("request", (request) => {
			const url = new URL(request.url());
			if (url.pathname === "/desktops")
				return void request.respond({
					status: 200,
					contentType: "text/html",
					body: renderDesktopClientPage(),
				});
			if (url.pathname.endsWith("/recall")) {
				recalls.push(JSON.parse(request.postData() ?? "{}"));
				recallable = false;
				launched = true;
				return void request.respond({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ desktopName: "running", browserId: "browser-two" }),
				});
			}
			if (url.pathname.endsWith("/wake")) {
				launches.push(JSON.parse(request.postData() ?? "{}"));
				launched = true;
				return void request.respond({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ desktopName: "running", browserId: "browser-two" }),
				});
			}
			if (url.pathname === "/v1/desktops")
				return void request.respond({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						automaticPlacement: true,
						defaultDesktop: "empty",
						desktops: [
							{ name: "empty", label: "Empty allocation", state: "empty", browsers: [] },
							{ name: "broken", label: "Stale allocation", state: "unavailable", browsers: [] },
							{
								name: "running",
								presentation: "native",
								label: "Internal desktop",
								state: "ready",
								browsers: [
									{ browserId: "browser-one" },
									...(launched ? [{ browserId: "browser-two" }] : []),
								],
							},
						],
						runtimeProfiles: [
							{
								runtimeProfileId: "chat",
								browserProfileId: "personal-chrome",
								provider: "chatgpt",
								accountKey: "account",
								accountLabel: "Personal account",
								state: "ready",
								wakeable: false,
								desktopName: "running",
								browserId: "browser-one",
							},
							{
								runtimeProfileId: "grok",
								browserProfileId: "personal-chrome",
								provider: "grok",
								accountKey: "account",
								accountLabel: "Personal account",
								state: recallable ? "unavailable" : launched ? "ready" : "dormant",
								...(recallable ? { recallToken: "a".repeat(64) } : {}),
								wakeable: !launched,
								...(launched ? { desktopName: "running", browserId: "browser-two" } : {}),
							},
						],
					}),
				});
			if (url.pathname.endsWith("/view"))
				return void request.respond({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						url: "https://viewer.test/embed/11111111-1111-4111-8111-111111111111",
						capability: "observe",
					}),
				});
			return void request.respond({
				status: 403,
				contentType: "text/html",
				body: "Authentication required",
			});
		});
		await page.goto("http://auracall.test/desktops");
		await page.waitForSelector('[data-runtime-profile="grok"]');
		expect(await page.$$eval("#desktops .desktop", (nodes) => nodes.length)).toBe(0);
		expect(await page.$eval("#desktops", (node) => node.textContent)).not.toMatch(
			/allocation|Internal desktop/,
		);
		expect(
			await page.$$eval(".group-label", (nodes) => nodes.map((node) => node.textContent)),
		).toEqual(["Personal account"]);
		expect(
			await page.$eval('[data-runtime-profile="grok"] .wake', (node) => node.textContent),
		).toBe("Launch");
		await page.click("#group-profile");
		expect(
			await page.$$eval(".group-label", (nodes) => nodes.map((node) => node.textContent)),
		).toEqual(["personal-chrome"]);
		await page.click('[data-runtime-profile="grok"] .wake');
		await page.waitForFunction(
			() => !document.querySelector('[data-runtime-profile="grok"] .wake'),
		);
		expect(launches).toEqual([{}]);
		await page.waitForSelector("#native-view section[data-state=unavailable]", { timeout: 7000 });
		expect(
			await page.$eval("#native-view section>a", (node) => getComputedStyle(node).display),
		).toBe("block");
		expect(await page.$eval("#native-view iframe", (node) => getComputedStyle(node).display)).toBe(
			"none",
		);
		expect(await page.$eval(".retry-view", (node) => getComputedStyle(node).display)).toBe("block");
		await page.click(".retry-view");
		await page.waitForSelector("#native-view section[data-state=connecting]");
		recallable = true;
		launched = false;
		await page.reload();
		await page.waitForSelector('[data-runtime-profile="grok"] .recall');
		page.once("dialog", (dialog) => void dialog.dismiss());
		await page.click('[data-runtime-profile="grok"] .recall');
		expect(recalls).toEqual([]);
		page.once("dialog", (dialog) => void dialog.accept());
		await page.click('[data-runtime-profile="grok"] .recall');
		await page.waitForFunction(
			() => !document.querySelector('[data-runtime-profile="grok"] .recall'),
		);
		expect(recalls).toEqual([{ recallToken: "a".repeat(64), confirmed: true }]);
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}, 15000);
