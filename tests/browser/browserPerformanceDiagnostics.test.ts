import { expect, test } from "vitest";
import { BrowserPerformanceDiagnostics } from "../../src/browser/browserPerformanceDiagnostics.js";

test("reports background request churn beside inventory and admission timing without private request data", () => {
	let now = 0;
	const diagnostic = new BrowserPerformanceDiagnostics(() => now);
	diagnostic.stage("inventory");
	for (let index = 0; index < 153; index++) {
		diagnostic.request(
			String(index),
			"https://chatgpt.com/backend-api/private/account?token=secret",
		);
		diagnostic.response(String(index));
	}
	diagnostic.request(
		"installed",
		"https://chatgpt.com/backend-api/ps/plugins/installed?token=secret",
	);
	diagnostic.request(
		"linked",
		"https://chatgpt.com/backend-api/aip/connectors/links/list_accessible",
	);
	const admission = diagnostic.admission();
	now = 60000;
	admission("admitted");
	now = 65000;
	diagnostic.response("installed");
	diagnostic.stage("cleanup");
	now = 66000;
	const report = diagnostic.finish();
	expect(report).toMatchObject({
		elapsedMs: 66000,
		stages: [
			{ stage: "inventory", durationMs: 65000 },
			{ stage: "cleanup", durationMs: 1000 },
		],
		backendRequests: {
			total: 155,
			routes: { installed: 1, linked: 1, other: 153 },
			responses: 154,
			unresolved: 1,
			responseMs: { total: 65000, max: 65000 },
		},
		admission: {
			attempted: 1,
			admitted: 1,
			rejected: 0,
			pending: 0,
			durationMs: 60000,
			maxMs: 60000,
		},
	});
	expect(JSON.stringify(report)).not.toMatch(/secret|token|private|https:/);
});

test("keeps incomplete diagnostics bounded and excludes foreign traffic and arbitrary stage text", () => {
	let now = 0;
	const diagnostic = new BrowserPerformanceDiagnostics(() => now);
	diagnostic.stage("secret-account@example.test");
	diagnostic.request("foreign", "https://example.test/backend-api/secret");
	diagnostic.request("foreign2", "https://chatgpt.com.evil.test/backend-api/secret");
	diagnostic.request("malformed", "not a URL");
	for (let index = 0; index < 1001; index++)
		diagnostic.request(String(index), "https://chatgpt.com/backend-api/secret");
	const reject = diagnostic.admission();
	now = 20;
	reject("rejected");
	reject("admitted");
	now = 30;
	const first = diagnostic.finish();
	expect(first).toMatchObject({
		observedConnections: 0,
		stages: [{ stage: "other", durationMs: 30 }],
		backendRequests: { total: 1001, trackingLimitReached: true, unresolved: 1001 },
		admission: { attempted: 1, admitted: 0, rejected: 1, pending: 0, durationMs: 20, maxMs: 20 },
	});
	diagnostic.request("late", "https://chatgpt.com/backend-api/secret");
	diagnostic.response("0");
	diagnostic.stage("identity");
	diagnostic.admission()("admitted");
	expect(diagnostic.finish()).toEqual(first);
	expect(JSON.stringify(first)).not.toMatch(/secret|example|foreign/);
});
