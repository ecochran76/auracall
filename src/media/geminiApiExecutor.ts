import { GoogleGenAI, type GenerateImagesResponse } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MediaGenerationExecutionError } from './service.js';
import type {
  MediaGenerationArtifact,
  MediaGenerationExecutor,
  MediaGenerationExecutorInput,
} from './types.js';

const DEFAULT_GEMINI_IMAGE_MODEL = 'imagen-4.0-generate-001';

export interface GeminiApiImageClient {
  generateImages(params: {
    model: string;
    prompt: string;
    config?: {
      numberOfImages?: number;
      aspectRatio?: string;
      imageSize?: string;
      includeRaiReason?: boolean;
    };
  }): Promise<GenerateImagesResponse>;
}

export interface GeminiApiMediaGenerationExecutorDeps {
  apiKey?: string | null;
  env?: NodeJS.ProcessEnv;
  client?: GeminiApiImageClient;
}

export function createGeminiApiMediaGenerationExecutor(
  deps: GeminiApiMediaGenerationExecutorDeps = {},
): MediaGenerationExecutor {
  return async (input) => executeGeminiApiMediaGeneration(input, deps);
}

async function executeGeminiApiMediaGeneration(
  input: MediaGenerationExecutorInput,
  deps: GeminiApiMediaGenerationExecutorDeps,
): Promise<{ artifacts: MediaGenerationArtifact[]; model?: string | null; metadata?: Record<string, unknown> | null }> {
  const { request } = input;
  if (request.provider !== 'gemini' || request.mediaType !== 'image' || request.transport !== 'api') {
    throw new MediaGenerationExecutionError(
      'media_provider_not_implemented',
      'Only Gemini API image generation is implemented by this executor.',
      {
        provider: request.provider,
        mediaType: request.mediaType,
        transport: request.transport ?? null,
      },
    );
  }

  const model = normalizeNonEmpty(request.model) ?? DEFAULT_GEMINI_IMAGE_MODEL;
  const count = Math.max(1, Math.min(request.count ?? 1, 4));
  const client = deps.client ?? createGeminiApiImageClient(resolveGeminiApiKey(deps));

  await input.emitTimeline?.({
    event: 'prompt_submitted',
    details: {
      apiMethod: 'models.generateImages',
      model,
      requestedImageCount: count,
      aspectRatio: request.aspectRatio ?? null,
      imageSize: request.size ?? null,
    },
  });

  let response: GenerateImagesResponse;
  try {
    response = await client.generateImages({
      model,
      prompt: request.prompt,
      config: {
        numberOfImages: count,
        includeRaiReason: true,
        ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
        ...(request.size ? { imageSize: request.size } : {}),
      },
    });
  } catch (error) {
    throw enrichGeminiApiError(error, model);
  }

  const generatedImages = response.generatedImages ?? [];
  await input.emitTimeline?.({
    event: 'image_visible',
    details: {
      apiMethod: 'models.generateImages',
      returnedImageCount: generatedImages.length,
      filteredReasons: generatedImages.map((image) => image.raiFilteredReason ?? null).filter(Boolean),
    },
  });

  const artifacts: MediaGenerationArtifact[] = [];
  for (const [index, generatedImage] of generatedImages.entries()) {
    const image = generatedImage.image;
    if (!image?.imageBytes && !image?.gcsUri) {
      continue;
    }
    const mimeType = image.mimeType ?? 'image/png';
    const artifactId = `gemini_api_image_${index + 1}`;
    if (image.imageBytes) {
      const fileName = `${artifactId}.${extensionForMimeType(mimeType)}`;
      const filePath = path.join(input.artifactDir, fileName);
      await fs.writeFile(filePath, Buffer.from(image.imageBytes, 'base64'));
      await input.emitTimeline?.({
        event: 'artifact_materialized',
        details: {
          providerArtifactId: artifactId,
          path: filePath,
          mimeType,
          materialization: 'gemini-api-inline-bytes',
          enhancedPrompt: generatedImage.enhancedPrompt ?? null,
          raiFilteredReason: generatedImage.raiFilteredReason ?? null,
        },
      });
      artifacts.push({
        id: artifactId,
        type: 'image',
        mimeType,
        fileName,
        path: filePath,
        uri: `file://${filePath}`,
        metadata: {
          materialization: 'gemini-api-inline-bytes',
          enhancedPrompt: generatedImage.enhancedPrompt ?? null,
          raiFilteredReason: generatedImage.raiFilteredReason ?? null,
          safetyAttributes: generatedImage.safetyAttributes ?? null,
        },
      });
      continue;
    }
    artifacts.push({
      id: artifactId,
      type: 'image',
      mimeType,
      uri: image.gcsUri,
      metadata: {
        materialization: 'gemini-api-gcs-uri',
        enhancedPrompt: generatedImage.enhancedPrompt ?? null,
        raiFilteredReason: generatedImage.raiFilteredReason ?? null,
        safetyAttributes: generatedImage.safetyAttributes ?? null,
      },
    });
  }

  if (artifacts.length === 0) {
    throw new MediaGenerationExecutionError(
      'media_generation_no_generated_output',
      'Gemini API image generation returned no materializable image artifacts.',
      {
        model,
        returnedImageCount: generatedImages.length,
        filteredReasons: generatedImages.map((image) => image.raiFilteredReason ?? null).filter(Boolean),
      },
    );
  }

  return {
    artifacts,
    model,
    metadata: {
      executor: 'gemini-api',
      apiMethod: 'models.generateImages',
      requestedImageCount: count,
      returnedImageCount: generatedImages.length,
    },
  };
}

function createGeminiApiImageClient(apiKey: string): GeminiApiImageClient {
  const client = new GoogleGenAI({ apiKey });
  return {
    generateImages: (params) => client.models.generateImages(params),
  };
}

function resolveGeminiApiKey(deps: GeminiApiMediaGenerationExecutorDeps): string {
  const apiKey = normalizeNonEmpty(deps.apiKey) ?? normalizeNonEmpty(deps.env?.GEMINI_API_KEY);
  if (!apiKey) {
    throw new MediaGenerationExecutionError(
      'gemini_api_key_missing',
      'Gemini API image generation requires GEMINI_API_KEY.',
    );
  }
  return apiKey;
}

function enrichGeminiApiError(error: unknown, model: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('404')) {
    return new MediaGenerationExecutionError(
      'gemini_api_model_unavailable',
      `Gemini image model not available to this API key/region. Confirm model access and model ID (${model}). Original: ${message}`,
      { model },
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  return 'png';
}

function normalizeNonEmpty(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}
