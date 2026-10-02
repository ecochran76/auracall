import type { ConversationArtifact } from "./domain.js";

export const CHATGPT_MISSING_LIVE_CONTROL_REASON = "missing_live_control" as const;

export interface ChatgptArtifactControlExpectation {
	title: string;
	uri: string | null;
	uriFileName: string | null;
	turnId: string | null;
	messageId: string | null;
	messageIndex: number | null;
	buttonIndex: number | null;
}

export interface ChatgptArtifactControlCandidate {
	title: string;
	href: string;
	turnId: string;
	messageId: string;
	messageIndex: number;
	buttonIndex: number | null;
}

function readMetadataString(artifact: ConversationArtifact, key: string): string | null {
	const value = artifact.metadata?.[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataNumber(artifact: ConversationArtifact, key: string): number | null {
	const value = artifact.metadata?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function artifactFileName(uri: string | null | undefined): string | null {
	const normalized = String(uri ?? "").trim();
	if (!normalized) return null;
	const withoutQuery = normalized.split(/[?#]/, 1)[0] ?? "";
	const finalSegment = withoutQuery.split("/").filter(Boolean).at(-1);
	if (!finalSegment) return null;
	try {
		return decodeURIComponent(finalSegment);
	} catch {
		return finalSegment;
	}
}

export function buildChatgptArtifactControlExpectation(
	artifact: ConversationArtifact,
): ChatgptArtifactControlExpectation {
	const liveControlUri = readMetadataString(artifact, "liveControlUri");
	return {
		title: artifact.title,
		uri: liveControlUri ?? artifact.uri ?? null,
		uriFileName: artifactFileName(artifact.uri),
		turnId: readMetadataString(artifact, "turnId"),
		messageId: artifact.messageId?.trim() || null,
		messageIndex:
			typeof artifact.messageIndex === "number" && Number.isFinite(artifact.messageIndex)
				? artifact.messageIndex
				: null,
		buttonIndex: readMetadataNumber(artifact, "buttonIndex"),
	};
}

/**
 * Pure resolver shared by provider-free admission and the in-page click path.
 * Keep this function self-contained: its source is serialized into Runtime.evaluate.
 */
export function resolveChatgptArtifactControlCandidate(
	expected: ChatgptArtifactControlExpectation,
	candidates: ReadonlyArray<ChatgptArtifactControlCandidate>,
): ChatgptArtifactControlCandidate | null {
	const normalize = (value: unknown) =>
		String(value ?? "")
			.replace(/\s+/g, " ")
			.trim();
	const titleKey = (value: unknown) => normalize(value).toLowerCase().replace(/\s+/g, "");
	const titleMatches = (candidateTitle: unknown, expectedTitle: unknown) => {
		const expectedNormalized = normalize(expectedTitle).toLowerCase();
		if (!expectedNormalized) return true;
		const candidateNormalized = normalize(candidateTitle).toLowerCase();
		if (candidateNormalized === expectedNormalized) return true;
		const candidateKey = titleKey(candidateNormalized);
		const expectedKey = titleKey(expectedNormalized);
		if (candidateKey === expectedKey) return true;
		const expectedStem = expectedKey.replace(/\.[^.]+$/, "");
		return expectedStem.length > 3 && candidateKey.startsWith(expectedStem);
	};
	const expectedTitle = normalize(expected.title).toLowerCase();
	const expectedUri = normalize(expected.uri).toLowerCase();
	const expectedUriFileName = normalize(expected.uriFileName).toLowerCase();
	const expectedTurnId = normalize(expected.turnId);
	const expectedMessageId = normalize(expected.messageId);

	for (const candidate of candidates) {
		const candidateTitle = normalize(candidate.title).toLowerCase();
		const candidateHref = normalize(candidate.href).toLowerCase();
		const titleMatch =
			Boolean(candidateTitle) &&
			(!expectedTitle ||
				titleMatches(candidateTitle, expectedTitle) ||
				Boolean(expectedUriFileName && titleMatches(candidateTitle, expectedUriFileName)));
		const uriMatch = Boolean(expectedUri && candidateHref && candidateHref === expectedUri);
		if (!titleMatch && !uriMatch) continue;
		if (expectedTurnId && normalize(candidate.turnId) !== expectedTurnId) continue;
		if (
			!expectedTurnId &&
			expectedMessageId &&
			normalize(candidate.messageId) !== expectedMessageId &&
			normalize(candidate.turnId) !== expectedMessageId
		)
			continue;
		if (
			!expectedTurnId &&
			!expectedMessageId &&
			typeof expected.messageIndex === "number" &&
			candidate.messageIndex !== expected.messageIndex
		)
			continue;
		if (typeof expected.buttonIndex === "number" && candidate.buttonIndex !== expected.buttonIndex)
			continue;
		return candidate;
	}
	return null;
}

function isDomDownloadControl(artifact: ConversationArtifact): boolean {
	return (
		artifact.metadata?.extraction === "dom-behavior-button" ||
		artifact.uri?.trim().toLowerCase().startsWith("chatgpt://download-button/") === true
	);
}

function requiresLiveDownloadControl(artifact: ConversationArtifact): boolean {
	return (
		artifact.kind === "download" &&
		artifact.uri?.trim().toLowerCase().startsWith("sandbox:") === true
	);
}

function controlCandidate(artifact: ConversationArtifact): ChatgptArtifactControlCandidate {
	return {
		title: artifact.title,
		href: artifact.uri ?? "",
		turnId: readMetadataString(artifact, "turnId") ?? "",
		messageId: artifact.messageId?.trim() ?? "",
		messageIndex:
			typeof artifact.messageIndex === "number" && Number.isFinite(artifact.messageIndex)
				? artifact.messageIndex
				: -1,
		buttonIndex: readMetadataNumber(artifact, "buttonIndex"),
	};
}

export function reconcileChatgptPayloadDownloadControls(
	artifacts: ReadonlyArray<ConversationArtifact>,
): ConversationArtifact[] {
	const controls = artifacts.filter(isDomDownloadControl);
	const candidates = controls.map(controlCandidate);
	const matchedControlIds = new Set<string>();
	const reconciled = artifacts.map((artifact) => {
		if (!requiresLiveDownloadControl(artifact)) return artifact;
		const match = resolveChatgptArtifactControlCandidate(
			buildChatgptArtifactControlExpectation(artifact),
			candidates,
		);
		const control = match ? controls[candidates.indexOf(match)] : null;
		if (control) {
			matchedControlIds.add(control.id);
			return {
				...artifact,
				messageIndex: control.messageIndex ?? artifact.messageIndex,
				messageId: control.messageId ?? artifact.messageId,
				metadata: {
					...(artifact.metadata ?? {}),
					liveControlState: "available",
					recoverabilityState: "downloadable_now",
					liveControlUri: control.uri ?? null,
					liveControlArtifactId: control.id,
					...(readMetadataString(control, "turnId")
						? { turnId: readMetadataString(control, "turnId") }
						: {}),
					...(readMetadataNumber(control, "buttonIndex") !== null
						? { buttonIndex: readMetadataNumber(control, "buttonIndex") }
						: {}),
				},
			};
		}
		if (artifact.metadata?.liveControlState === "available" && controls.length === 0) {
			return artifact;
		}
		const metadata = { ...(artifact.metadata ?? {}) };
		delete metadata.liveControlUri;
		delete metadata.liveControlArtifactId;
		return {
			...artifact,
			metadata: {
				...metadata,
				liveControlState: "missing",
				liveControlReason: CHATGPT_MISSING_LIVE_CONTROL_REASON,
				recoverabilityState: "repair_prompt_candidate",
			},
		};
	});
	return reconciled.filter(
		(artifact) => !isDomDownloadControl(artifact) || !matchedControlIds.has(artifact.id),
	);
}

export function isChatgptArtifactMissingLiveControl(artifact: ConversationArtifact): boolean {
	return (
		requiresLiveDownloadControl(artifact) &&
		artifact.metadata?.liveControlState === "missing" &&
		artifact.metadata?.liveControlReason === CHATGPT_MISSING_LIVE_CONTROL_REASON
	);
}
