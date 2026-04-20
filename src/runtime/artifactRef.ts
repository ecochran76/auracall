import type { TeamRunArtifactRef } from '../teams/types.js';

export function normalizeTeamRunArtifactRef(value: unknown): TeamRunArtifactRef | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.kind !== 'string') {
    return null;
  }

  return {
    id: value.id,
    kind: value.kind,
    path: typeof value.path === 'string' ? value.path : null,
    uri: typeof value.uri === 'string' ? value.uri : null,
    title: typeof value.title === 'string' ? value.title : null,
  };
}

export function normalizeTeamRunArtifactRefs(value: unknown): TeamRunArtifactRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate) => {
    const artifact = normalizeTeamRunArtifactRef(candidate);
    return artifact ? [artifact] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
