export interface NormalizedTaskTransferRequestedOutput {
  label: string | null;
  kind: string | null;
  destination: string | null;
  required: boolean;
}

export interface NormalizedTaskTransferInputArtifact {
  id: string | null;
  kind: string | null;
  title: string | null;
  path: string | null;
  uri: string | null;
}

export interface NormalizedTaskTransfer {
  title: string | null;
  objective: string | null;
  successCriteria: string[];
  requestedOutputs: NormalizedTaskTransferRequestedOutput[];
  inputArtifacts: NormalizedTaskTransferInputArtifact[];
}

export function normalizeTaskTransfer(value: unknown): NormalizedTaskTransfer | null {
  if (!isRecord(value)) {
    return null;
  }

  const normalized: NormalizedTaskTransfer = {
    title: typeof value.title === 'string' ? value.title : null,
    objective: typeof value.objective === 'string' ? value.objective : null,
    successCriteria: Array.isArray(value.successCriteria)
      ? value.successCriteria.filter((candidate): candidate is string => typeof candidate === 'string')
      : [],
    requestedOutputs: Array.isArray(value.requestedOutputs)
      ? value.requestedOutputs.flatMap((candidate) => {
          if (!isRecord(candidate)) {
            return [];
          }
          return [
            {
              label: typeof candidate.label === 'string' ? candidate.label : null,
              kind: typeof candidate.kind === 'string' ? candidate.kind : null,
              destination: typeof candidate.destination === 'string' ? candidate.destination : null,
              required: candidate.required === true,
            },
          ];
        })
      : [],
    inputArtifacts: Array.isArray(value.inputArtifacts)
      ? value.inputArtifacts.flatMap((candidate) => {
          if (!isRecord(candidate)) {
            return [];
          }
          return [
            {
              id: typeof candidate.id === 'string' ? candidate.id : null,
              kind: typeof candidate.kind === 'string' ? candidate.kind : null,
              title: typeof candidate.title === 'string' ? candidate.title : null,
              path: typeof candidate.path === 'string' ? candidate.path : null,
              uri: typeof candidate.uri === 'string' ? candidate.uri : null,
            },
          ];
        })
      : [],
  };

  if (
    !normalized.title &&
    !normalized.objective &&
    normalized.successCriteria.length === 0 &&
    normalized.requestedOutputs.length === 0 &&
    normalized.inputArtifacts.length === 0
  ) {
    return null;
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
