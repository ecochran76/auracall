import { describe, expect, test } from 'vitest';
import { normalizeGrokIdentityProbe } from '../../src/browser/providers/grokAdapter.js';

describe('normalizeGrokIdentityProbe', () => {
  test('drops generic settings labels from guest-like pages', () => {
    expect(
      normalizeGrokIdentityProbe({
        name: 'Settings',
        source: 'dom-label',
        guestAuthCta: true,
      }),
    ).toBeNull();
  });

  test('keeps real identity fields when present', () => {
    expect(
      normalizeGrokIdentityProbe({
        id: 'user-123',
        name: 'Eric Cochran',
        email: 'eric@example.com',
        source: 'next-data',
        guestAuthCta: false,
      }),
    ).toEqual({
      id: 'user-123',
      name: 'Eric Cochran',
      email: 'eric@example.com',
      handle: undefined,
      source: 'next-data',
    });
  });

  test('drops low-signal site handles without stronger identity fields', () => {
    expect(
      normalizeGrokIdentityProbe({
        handle: '@grok',
        source: 'dom-handle',
      }),
    ).toBeNull();
  });

  test('drops prompt-like at-text from DOM handle fallback', () => {
    expect(
      normalizeGrokIdentityProbe({
        handle: "@google calendar what's on my schedule today?",
        source: 'dom-handle',
      }),
    ).toBeNull();
  });

  test('keeps plausible Grok handles from DOM handle fallback', () => {
    expect(
      normalizeGrokIdentityProbe({
        handle: '@SwantonDoug',
        source: 'dom-handle',
      }),
    ).toEqual({
      id: undefined,
      name: undefined,
      email: undefined,
      handle: '@SwantonDoug',
      source: 'dom-handle',
    });
  });

  test('drops cookie preference text from settings-dialog fallback', () => {
    expect(
      normalizeGrokIdentityProbe({
        name: 'cookies settings, opens the preference center dialog',
        source: 'settings-dialog',
        guestAuthCta: false,
      }),
    ).toBeNull();
  });
});

import { checkGrokBrowserAuthPreflight } from "../../src/browser/providers/grokAdapter.js";
import {
	detectGrokSignedInIdentity,
	GROK_IDENTITY_PROBE_EXPRESSION,
	GROK_SERIALIZED_IDENTITY_SCRIPTS_EXPRESSION,
} from "../../src/browser/providers/grokIdentity.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import type { ChromeClient } from "../../src/browser/types.js";
const stableScripts = [
	JSON.stringify({
		initialData: {
			user: {
				userId: "fixture-user",
				email: "operator@example.test",
				xUsername: "fixture_user",
				givenName: "Fixture",
				familyName: "Operator",
			},
		},
	}),
];
function identityRuntime(probe: Record<string, unknown>, scripts: string[] = stableScripts) {
 let scriptReads=0;
 const runtime={evaluate:async({expression}:{expression:string})=>{
  if(expression===GROK_IDENTITY_PROBE_EXPRESSION)return {result:{value:probe}};
  if(expression===GROK_SERIALIZED_IDENTITY_SCRIPTS_EXPRESSION){scriptReads++;return {result:{value:scripts}};}
  return {result:{value:{href:"https://grok.com/",title:"Grok",bodyText:"Ready",guestAuthCta:false}}};
 }} as unknown as ChromeClient["Runtime"];
 return {runtime,scriptReads:()=>scriptReads};
}

function authorization(identity: {email?:string;handle?:string} = {email:"operator@example.test",handle:"@fixture_user"}) {
	const authority = createProviderSessionAuthority({
		auracallProfile: "default",
		services: { grok: { identity } },
	});
	const context = {
		providerId: "grok" as const,
		auracallRuntimeProfile: "default",
		browserProfile: "fixture",
		managedBrowserProfile: "/managed/grok",
		browserProcessId: 12345,
		browserTargetId: "fixture-target",
	};
	return { authority, context, expectation: authority.resolveExpectation(context) };
}
test("same-transport preflight resolves stable serialized identity after a name-only DOM label", async () => {
	const f = identityRuntime({
		name: "Account preferences",
		source: "dom-label",
		guestAuthCta: false,
	});
	const result = await checkGrokBrowserAuthPreflight(f.runtime, {
		providerSessionAuthorization: authorization(),
	});
	expect(result).toMatchObject({
		ok: true,
		actualIdentity: {
			id: "fixture-user",
			email: "operator@example.test",
			handle: "@fixture_user",
			source: "next-flight",
		},
	});
	expect(f.scriptReads()).toBe(1);
});
test("preserves a name-only fallback when serialized scripts contain no account identity", async () => {
	const f = identityRuntime({ name: "Display label", source: "dom-label", guestAuthCta: false }, [
		"non-identity bootstrap",
	]);
	expect(await detectGrokSignedInIdentity(f.runtime)).toMatchObject({
		identity: { name: "Display label", source: "dom-label" },
	});
	expect(f.scriptReads()).toBe(1);
});
test("does not use serialized identity to override a direct stable account conflict", async () => {
	const f = identityRuntime({
		email: "other@example.test",
		handle: "@other_user",
		source: "next-data",
		guestAuthCta: false,
	});
	expect(
		await checkGrokBrowserAuthPreflight(f.runtime, {
			providerSessionAuthorization: authorization(),
		}),
	).toMatchObject({ ok: false, reason: "provider_session_dimension_conflict" });
	expect(f.scriptReads()).toBe(0);
});
test("retains the guest CTA boundary instead of reading serialized account data", async () => {
	const f = identityRuntime({ name: "Display label", source: "dom-label", guestAuthCta: true });
	expect(await detectGrokSignedInIdentity(f.runtime)).toMatchObject({
		identity: { name: "Display label" },
		guestAuthCta: true,
	});
	expect(f.scriptReads()).toBe(0);
});

import { runInNewContext } from "node:vm";
import { extractGrokIdentityFromSerializedScripts } from "../../src/browser/providers/grokIdentity.js";
test("captures bounded account fields from an escaped user subtree beyond the old 16k prefix", () => {
	const user = {
		userId: "fixture-user",
		email: "operator@example.test",
		xUsername: "fixture_user",
		sessionId: "PRIVATE_SESSION_NOT_FOR_EXPORT",
	};
	const payload =
		"0:" +
		JSON.stringify("x".repeat(200000)) +
		"\n1:" +
		JSON.stringify({
			metadata: { userId: "unrelated-user", email: "unrelated@example.test" },
			initialData: { user },
		});
	const script = `self.__next_f.push(${JSON.stringify([1, payload])})`;
	const values = runInNewContext(GROK_SERIALIZED_IDENTITY_SCRIPTS_EXPRESSION, {
		document: { scripts: [{ textContent: script }] },
	}) as string[];
	expect(extractGrokIdentityFromSerializedScripts(values)).toMatchObject({
		id: "fixture-user",
		email: "operator@example.test",
		handle: "@fixture_user",
	});
	expect(values.join("").length).toBeLessThan(16000);
	expect(values.join("")).not.toContain("PRIVATE_SESSION_NOT_FOR_EXPORT");
});
test("does not mix unrelated serialized fields with the observed initialData.user identity", () => {
	const raw = JSON.stringify({
		metadata: { userId: "unrelated-user", email: "unrelated@example.test" },
		initialData: {
			user: { userId: "fixture-user", email: "operator@example.test", xUsername: "fixture_user" },
		},
	});
	expect(extractGrokIdentityFromSerializedScripts([raw])).toMatchObject({
		id: "fixture-user",
		email: "operator@example.test",
		handle: "@fixture_user",
	});
});
test("refuses conflicting serialized user subtrees instead of choosing one account", () => {
	const other = JSON.stringify({
		initialData: {
			user: { userId: "other", email: "other@example.test", xUsername: "other_user" },
		},
	});
	expect(extractGrokIdentityFromSerializedScripts([...stableScripts, other])).toBeNull();
});
test('refuses a prior valid user when traversal depth hides conflicting account evidence',()=>{
 let nested:unknown={initialData:{user:{userId:'other',email:'other@example.test'}}};
 for(let depth=0;depth<60;depth++)nested={child:nested};
 const raw=JSON.stringify({initialData:{user:{userId:'fixture-user',email:'operator@example.test'}},deep:nested});
 expect(extractGrokIdentityFromSerializedScripts([raw])).toBeNull();
});

test.each(["dom-label","dom-handle","dom-avatar"])("trusted bootstrap outranks an unscoped %s handle from picker content",async source=>{
 const f=identityRuntime({name:"Account controls",handle:"@owned_bot",source,guestAuthCta:false});
 const result=await checkGrokBrowserAuthPreflight(f.runtime,{providerSessionAuthorization:authorization()});
 expect(result).toMatchObject({ok:true,actualIdentity:{email:"operator@example.test",handle:"@fixture_user",source:"next-flight"}});
 expect(f.scriptReads()).toBe(1);
});
test("a coincidentally matching unscoped DOM handle cannot authorize a configured account",async()=>{
 const f=identityRuntime({name:"Account controls",handle:"@fixture_user",source:"dom-handle",guestAuthCta:false},["non-identity bootstrap"]);
 const result=await checkGrokBrowserAuthPreflight(f.runtime,{providerSessionAuthorization:authorization({handle:"@fixture_user"})});
 expect(result).toMatchObject({ok:false,reason:"provider_session_observation_missing"});
 expect(result.actualIdentity?.handle).toBeUndefined();
});
