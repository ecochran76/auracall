import { randomUUID, createHash } from "node:crypto";
import { createGrokConnectorClient, type GrokConnectorRuntime } from "./grokConnectors.js";
export interface GrokConnectorInstallationInput {
	kind: "custom" | "catalog";
	name: string;
	endpoint?: string;
	connectorId?: string;
	accountRef?: string;
}
export interface GrokConnectorInstallationPrepared {
	token: string;
	input: GrokConnectorInstallationInput;
	providerAccountRef: string;
}
export interface GrokConnectorInstallationOutcome {
	status:
		| "prepared"
		| "already-connected"
		| "unsupported"
		| "account-gated"
		| "unconfirmed"
		| "awaiting-human"
		| "completed"
		| "failed";
	code: string;
	input: GrokConnectorInstallationInput;
	providerAccountRef: string;
	effectDispatched: boolean;
	prepared?: GrokConnectorInstallationPrepared;
	connector?: {
		id: string | null;
		name: string;
		endpoint: string | null;
		accountRef: string | null;
		tools: string[];
		grantedScopes: string[];
		grantedScopesObserved: boolean;
	};
}
const hasControlCharacters = (value: string) =>
	[...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export function validateGrokConnectorInstallationInput(
	input: GrokConnectorInstallationInput,
): GrokConnectorInstallationInput {
	if (
		!input ||
		!["custom", "catalog"].includes(input.kind) ||
		typeof input.name !== "string" ||
		input.name !== input.name.trim() ||
		!input.name ||
		input.name.length > 100 ||
		hasControlCharacters(input.name)
	)
		throw new Error("grok_connector_install_invalid_name");
	if (input.kind === "custom" || input.endpoint !== undefined) {
		let url: URL;
		try {
			url = new URL(input.endpoint || "");
		} catch {
			throw new Error("grok_connector_install_invalid_endpoint");
		}
		if (
			url.protocol !== "https:" ||
			!url.hostname ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			input.endpoint !== url.href
		)
			throw new Error("grok_connector_install_invalid_endpoint");
	}
	if (
		input.accountRef &&
		(typeof input.accountRef !== "string" || !/^[a-f0-9]{64}$/.test(input.accountRef))
	)
		throw new Error("grok_connector_install_invalid_account_ref");
	if (
		input.connectorId &&
		(typeof input.connectorId !== "string" ||
			input.connectorId.length > 200 ||
			hasControlCharacters(input.connectorId))
	)
		throw new Error("grok_connector_install_invalid_connector_id");
	return {
		kind: input.kind,
		name: input.name,
		...(input.endpoint ? { endpoint: input.endpoint } : {}),
		...(input.connectorId ? { connectorId: input.connectorId } : {}),
		...(input.accountRef ? { accountRef: input.accountRef } : {}),
	};
}
const HELPERS = `
 const visible=e=>e && e.getAttribute('aria-hidden')!=='true' && getComputedStyle(e).display!=='none' && getComputedStyle(e).visibility!=='hidden' && e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0;
 const text=e=>String(e?.innerText||e?.textContent||'').trim();
 const dialogs=()=>Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
 const buttons=r=>Array.from(r.querySelectorAll('button,[role="button"]')).filter(visible);
 const plugins=()=>dialogs().find(d=>Array.from(d.querySelectorAll('[role="tab"]')).some(t=>text(t)==='Connectors'));
 const forms=()=>dialogs().filter(d=>d!==plugins() && Array.from(d.querySelectorAll('input')).some(i=>i.getAttribute('placeholder')==='My Connector'));
`;
const expr = (body: string) => `(()=>{${HELPERS}\n${body}})()`;
export function createGrokConnectorInstallationClient(
	runtime: GrokConnectorRuntime,
	options: {
		providerAccountRef: string;
		abortSignal?: AbortSignal;
		beforeCommit?: () => Promise<void>;
	},
) {
	const preparedTokens = new Map<
		string,
		{ prepared: GrokConnectorInstallationPrepared; inventory: string }
	>();
	const consumed = new Set<string>();
	const uncertainInputs = new Set<string>();
	const inputKey = (input: GrokConnectorInstallationInput) =>
		JSON.stringify([
			options.providerAccountRef,
			input.kind,
			input.name,
			input.endpoint ?? null,
			input.accountRef ?? null,
		]);
	const discovery = createGrokConnectorClient(runtime, { abortSignal: options.abortSignal });
	async function evaluate<T>(expression: string): Promise<T> {
		options.abortSignal?.throwIfAborted();
		const result = await runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
		if (result.exceptionDetails || result.result.value === undefined)
			throw new Error("grok_connector_install_dom_failed");
		options.abortSignal?.throwIfAborted();
		return result.result.value as T;
	}
	function outcome(
		input: GrokConnectorInstallationInput,
		status: GrokConnectorInstallationOutcome["status"],
		code: string,
		effectDispatched = false,
	): GrokConnectorInstallationOutcome {
		return {
			input,
			providerAccountRef: options.providerAccountRef,
			status,
			code,
			effectDispatched,
		};
	}
	async function duplicate(
		input: GrokConnectorInstallationInput,
	): Promise<GrokConnectorInstallationOutcome | null> {
		const inventory = await discovery.list();
		if (inventory.status === "account-gated")
			return outcome(input, "account-gated", inventory.code);
		if (inventory.status === "failed" || inventory.coverage.reason === "row-limit")
			return outcome(input, "unsupported", "grok_connector_install_inventory_incomplete");
		for (const row of inventory.installed.slice(0, 10)) {
			const detail = await discovery.inspect({ name: row.name, kind: "installed" });
			if (!detail.endpointRef)
				return outcome(input, "unsupported", "grok_connector_install_existing_endpoint_unobserved");
			const sameEndpoint =
				input.endpoint &&
				detail.endpointRef === createHash("sha256").update(input.endpoint).digest("hex");
			if (row.name === input.name || sameEndpoint) {
				const exact =
					row.name === input.name &&
					Boolean(detail.connector?.id) &&
					(!input.connectorId || input.connectorId === detail.connector?.id) &&
					detail.auth === "connected" &&
					detail.coverage.complete &&
					sameEndpoint &&
					input.accountRef &&
					input.accountRef === detail.accountRef;
				return {
					...outcome(
						input,
						exact ? "already-connected" : "unconfirmed",
						exact
							? "grok_connector_install_existing_exact"
							: "grok_connector_install_existing_identity_conflict",
					),
					connector: {
						id: detail.connector?.id ?? null,
						name: row.name,
						endpoint: detail.endpoint,
						accountRef: detail.accountRef,
						tools: detail.tools,
						grantedScopes: [],
						grantedScopesObserved: false,
					},
				};
			}
		}
		if (inventory.installed.length > 10)
			return outcome(input, "unsupported", "grok_connector_install_inventory_incomplete");
		return null;
	}
	async function reconcile(
		raw: GrokConnectorInstallationInput,
	): Promise<GrokConnectorInstallationOutcome> {
		const input = validateGrokConnectorInstallationInput(raw);
		// Human OAuth is observational only. No OAuth links, consent or reauthenticate clicks.
		const human = await evaluate<boolean>(
			expr(
				`return forms().some(d=>{const inputs=Array.from(d.querySelectorAll('input'));return inputs.find(i=>i.getAttribute('placeholder')==='My Connector')?.value===${JSON.stringify(input.name)} && inputs.find(i=>i.getAttribute('placeholder')==='https://mcp.example.com/sse')?.value===${JSON.stringify(input.endpoint)} && /authentication required|authorization required|complete authentication|continue in your browser|sign in to connect/i.test(text(d));});`,
			),
		);
		if (human) return outcome(input, "awaiting-human", "grok_connector_install_awaiting_human");
		const existing = await duplicate(input);
		if (existing)
			return existing.status === "unsupported" ? { ...existing, status: "unconfirmed" } : existing;
		return outcome(input, "unconfirmed", "grok_connector_install_saved_identity_not_observed");
	}
	return {
		async prepare(raw: GrokConnectorInstallationInput): Promise<GrokConnectorInstallationOutcome> {
			const input = validateGrokConnectorInstallationInput(raw);
			if (uncertainInputs.has(inputKey(input)))
				return outcome(input, "unconfirmed", "grok_connector_install_reconcile_required");
			if (!options.providerAccountRef)
				return outcome(input, "failed", "grok_connector_install_provider_account_required");
			// The survey did not establish a stable built-in catalog entity identity or consent flow.
			if (input.kind === "catalog")
				return outcome(
					input,
					"unsupported",
					"grok_connector_install_catalog_identity_not_observed",
				);
			const existing = await duplicate(input);
			if (existing) return existing;
			const token = randomUUID();
			const result = await evaluate<{ ok: boolean; inventory: string }>(
				expr(`
    const root=plugins();if(!root || dialogs().some(d=>d!==root))return {ok:false,inventory:''};
    const inventory=text(root);
    if(buttons(root).some(b=>/^(load more|show more|next)$/i.test(text(b))))return {ok:false,inventory:''};
    const matches=buttons(root).filter(b=>b.getAttribute('aria-label')==='New Connector'||text(b)==='New Connector');
    if(matches.length!==1)return {ok:false,inventory:''};
    matches[0].click();return {ok:true,inventory};`),
			);
			if (!result.ok)
				return outcome(input, "unsupported", "grok_connector_install_custom_form_unavailable");
			const filled = await evaluate<boolean>(
				expr(`
    const matches=forms();if(matches.length!==1)return false;const root=matches[0];
    const inputs=Array.from(root.querySelectorAll('input')).filter(visible);
    const names=inputs.filter(i=>i.getAttribute('placeholder')==='My Connector');
    const urls=inputs.filter(i=>i.getAttribute('placeholder')==='https://mcp.example.com/sse');
    if(names.length!==1||urls.length!==1)return false;
    for(const [node,value] of [[names[0],${JSON.stringify(input.name)}],[urls[0],${JSON.stringify(input.endpoint)}]]){
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
      if(setter)setter.call(node,value);else node.value=value;
      node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
    }
    root.setAttribute('data-auracall-install-owner',${JSON.stringify(token)});
    return names[0].value===${JSON.stringify(input.name)}&&urls[0].value===${JSON.stringify(input.endpoint)};`),
			);
			if (!filled)
				return outcome(input, "unsupported", "grok_connector_install_custom_form_unverified");
			const prepared = { token, input, providerAccountRef: options.providerAccountRef };
			preparedTokens.set(token, {
				prepared: structuredClone(prepared),
				inventory: result.inventory,
			});
			return { ...outcome(input, "prepared", "grok_connector_install_prepared"), prepared };
		},
		async commit(
			prepared: GrokConnectorInstallationPrepared,
		): Promise<GrokConnectorInstallationOutcome> {
			const input = validateGrokConnectorInstallationInput(prepared.input);
			const saved = preparedTokens.get(prepared.token);
			if (consumed.has(prepared.token))
				return outcome(input, "unconfirmed", "grok_connector_install_reconcile_required");
			if (!saved || JSON.stringify(saved.prepared) !== JSON.stringify(prepared))
				return outcome(input, "failed", "grok_connector_install_prepared_identity_changed");
			// Reserve synchronously: another caller must not pass while admission awaits.
			consumed.add(prepared.token);
			preparedTokens.delete(prepared.token);
			await options.beforeCommit?.();
			options.abortSignal?.throwIfAborted();
			let dispatched = false;
			try {
				// A transport exception can follow a committed click: consume the token BEFORE dispatch.
				dispatched = true;
				uncertainInputs.add(inputKey(input));
				const clicked = await evaluate<boolean>(
					expr(`
     const matches=forms();if(matches.length!==1)return false;const root=matches[0];
     if(dialogs().some(d=>d!==root && d!==plugins()))return false;
     if(root.getAttribute('data-auracall-install-owner')!==${JSON.stringify(prepared.token)} || text(plugins())!==${JSON.stringify(saved.inventory)})return false;
     const inputs=Array.from(root.querySelectorAll('input')).filter(visible);
     if(inputs.find(i=>i.getAttribute('placeholder')==='My Connector')?.value!==${JSON.stringify(input.name)} || inputs.find(i=>i.getAttribute('placeholder')==='https://mcp.example.com/sse')?.value!==${JSON.stringify(input.endpoint)})return false;
     const add=buttons(root).filter(b=>text(b)==='Add Connector' && !b.disabled && b.getAttribute('aria-disabled')!=='true');
     if(add.length!==1)return false;add[0].click();return true;`),
				);
				if (!clicked) {
					uncertainInputs.delete(inputKey(input));
					return outcome(input, "failed", "grok_connector_install_form_changed", false);
				}
				return { ...(await reconcile(input)), effectDispatched: true };
			} catch {
				return outcome(
					input,
					"unconfirmed",
					"grok_connector_install_reconcile_required",
					dispatched,
				);
			}
		},
		reconcile,
	};
}
