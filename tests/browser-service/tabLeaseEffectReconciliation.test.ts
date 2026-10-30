import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createFileBackedBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
const scope = {
	runtimeProfileId: "default",
	managedBrowserProfile: "managed-test",
	service: "grok",
	tenantKey: "synthetic-account",
};
it("requires exact unknown custody and immutable evidence, preserves its audit across restart, and allows one CAS winner", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "lease-reconcile-"));
	try {
		const registry = createFileBackedBrowserTabLeaseRegistry({ registryRoot: root });
		const now = "2026-10-25T20:00:00.000Z";
		const reserved = await registry.reserve({
			scope,
			targetId: "selected",
			workload: { kind: "ephemeral", operationId: "upload" },
			operationId: "operation",
			now,
			idleTtlMs: 60000,
			absoluteTtlMs: 3600000,
		});
		if (!reserved.ok) throw Error("reservation");
		const request = {
			leaseId: reserved.value.lease.leaseId,
			expectedRevision: reserved.value.lease.revision,
			scope,
			targetId: "selected",
			now,
			evidence: { artifactRef: "private/qualified-upload-receipt.json", sha256: "a".repeat(64) },
		};
		// Live ownership cannot be reconciled away even with a receipt.
		expect(await registry.reconcileEffect(request)).toMatchObject({ ok: false });
		const idle = await registry.idle({
			claim: reserved.value.claim,
			now,
			effectState: "outcome-unknown",
		});
		if (!idle.ok) throw Error("idle");
		request.expectedRevision = idle.value.revision;
		for (const invalid of [
			{ ...request, scope: { ...scope, tenantKey: "other" } },
			{ ...request, targetId: "other" },
			{ ...request, expectedRevision: 0 },
		])
			expect(await registry.reconcileEffect(invalid)).toMatchObject({ ok: false });
		await expect(
			registry.reconcileEffect({ ...request, evidence: { artifactRef: "", sha256: "bad" } }),
		).rejects.toThrow();
		expect(
			await registry.releasePreserved({
				leaseId: request.leaseId,
				expectedRevision: request.expectedRevision,
				now,
			}),
		).toMatchObject({ ok: false });
		const restarted = createFileBackedBrowserTabLeaseRegistry({ registryRoot: root });
		const attempts = await Promise.all([
			registry.reconcileEffect(request),
			restarted.reconcileEffect(request),
		]);
		expect(attempts.filter((r) => r.ok)).toHaveLength(1);
		const saved = (await restarted.list())[0];
		expect(saved).toMatchObject({
			state: "idle",
			effectState: "settled",
			targetId: "selected",
			effectReconciliations: [
				{ previousEffectState: "outcome-unknown", evidence: request.evidence },
			],
		});
		expect(saved.actionCounts.closes).toBe(0);
		const audit = saved.effectReconciliations?.[0];
		if (!audit) throw new Error("missing reconciliation audit");
		audit.evidence.sha256 = "b".repeat(64);
		expect((await registry.list())[0].effectReconciliations?.[0].evidence.sha256).toBe(
			"a".repeat(64),
		);
		expect(
			await restarted.releasePreserved({
				leaseId: saved.leaseId,
				expectedRevision: saved.revision,
				now,
			}),
		).toMatchObject({
			ok: true,
			value: { finalDisposition: "preserved", actionCounts: { closes: 0 } },
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("abandons only expired ownerless exact unknown custody while preserving uncertainty across restart", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "lease-abandon-"));
	try {
		const registry = createFileBackedBrowserTabLeaseRegistry({ registryRoot: root });
		const reserved = await registry.reserve({
			scope,
			targetId: "selected",
			workload: { kind: "ephemeral", operationId: "utility" },
			operationId: "operation",
			now: "2026-10-25T20:00:00.000Z",
			idleTtlMs: 60000,
			absoluteTtlMs: 3600000,
			exclusiveGroup: "utility",
		});
		if (!reserved.ok) throw Error("reserve");
		const request = {
			leaseId: reserved.value.lease.leaseId,
			expectedRevision: 1,
			scope,
			targetId: "selected",
			now: "2026-10-25T22:00:00.000Z",
			acknowledgeUnknownOutcome: true as const,
			evidence: { artifactRef: "private/operator-approval.json", sha256: "a".repeat(64) },
		};
		expect(await registry.abandonUnknownEffect(request)).toMatchObject({ ok: false });
		const idle = await registry.idle({
			claim: reserved.value.claim,
			now: "2026-10-25T20:01:00.000Z",
			effectState: "outcome-unknown",
		});
		if (!idle.ok) throw Error("idle");
		request.expectedRevision = idle.value.revision;
		for (const invalid of [
			{ ...request, targetId: "other" },
			{ ...request, scope: { ...scope, tenantKey: "other" } },
			{ ...request, expectedRevision: 0 },
			{ ...request, now: "2026-10-25T20:02:00.000Z" },
			{ ...request, acknowledgeUnknownOutcome: false as never },
		])
			expect(await registry.abandonUnknownEffect(invalid)).toMatchObject({ ok: false });
		const restarted = createFileBackedBrowserTabLeaseRegistry({ registryRoot: root });
		const results = await Promise.all([
			registry.abandonUnknownEffect(request),
			restarted.abandonUnknownEffect(request),
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		const saved = (await restarted.list())[0];
		expect(saved).toMatchObject({
			state: "released",
			effectState: "outcome-unknown",
			finalDisposition: "preserved",
			actionCounts: { closes: 0 },
			unknownEffectAbandonment: { evidence: request.evidence, acknowledgeUnknownOutcome: true },
		});
		expect(saved.effectReconciliations).toBeUndefined();
		if (!saved.unknownEffectAbandonment) throw Error("missing abandonment audit");
		saved.unknownEffectAbandonment.evidence.sha256 = "b".repeat(64);
		expect((await registry.list())[0].unknownEffectAbandonment?.evidence.sha256).toBe(
			"a".repeat(64),
		);
		expect(
			await restarted.reserve({
				...reserved.value.lease,
				scope,
				targetId: "next",
				operationId: "next",
				now: request.now,
				idleTtlMs: 60000,
				absoluteTtlMs: 3600000,
			}),
		).toMatchObject({ ok: true });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
