import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  resetOpenRouterCatalogCacheForTests,
  resolveModelConfig,
  safeModelSlug,
  isOpenRouterBaseUrl,
} from '../src/oracle/modelResolver.js';

describe('OpenRouter helpers', () => {
  afterEach(() => {
    resetOpenRouterCatalogCacheForTests();
    vi.useRealTimers();
  });

  it('slugifies model ids with slashes', () => {
    expect(safeModelSlug('minimax/minimax-m2')).toBe('minimax__minimax-m2');
  });

  it('hydrates config from OpenRouter catalog', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'minimax/minimax-m2',
            context_length: 100000,
            pricing: { prompt: 2, completion: 3 },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const config = await resolveModelConfig('minimax/minimax-m2', {
      openRouterApiKey: 'dummy',
      fetcher,
    });

    expect(config.apiModel).toBe('minimax/minimax-m2');
    expect(config.inputLimit).toBe(100000);
    expect(config.pricing?.inputPerToken).toBeCloseTo(2 / 1_000_000);
    expect(config.pricing?.outputPerToken).toBeCloseTo(3 / 1_000_000);
  });

  it('falls back to OpenRouter when provider key is missing but OPENROUTER_API_KEY is present', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;

    const config = await resolveModelConfig('minimax/minimax-m2', {
      openRouterApiKey: 'dummy',
      fetcher,
    });

    expect(config.apiModel).toBe('minimax/minimax-m2');
    expect(isOpenRouterBaseUrl('https://openrouter.ai/api/v1/responses')).toBe(true);
  });

  it('detects OpenRouter base URLs', () => {
    expect(isOpenRouterBaseUrl('https://openrouter.ai/api/v1/responses')).toBe(true);
    expect(isOpenRouterBaseUrl('https://api.openai.com')).toBe(false);
  });

  it('keeps first-party model ids unprefixed when OpenRouter is inactive', async () => {
    const openai = await resolveModelConfig('gpt-5.1');
    const claude = await resolveModelConfig('claude-3-haiku-20240307');
    const grok = await resolveModelConfig('grok-4.20');

    expect(openai.apiModel ?? openai.model).toBe('gpt-5.1');
    expect(claude.apiModel ?? claude.model).toBe('claude-3-haiku-20240307');
    const grokId = grok.apiModel ?? grok.model;
    expect(grokId.includes('/')).toBe(false);
    expect(grokId.startsWith('grok-4')).toBe(true);
  });

  it('loads the current GPT-6 Astra API contract from the built-in model schema', async () => {
    const astra = await resolveModelConfig('gpt-6-astra');

    expect(astra).toMatchObject({
      model: 'gpt-6-astra',
      provider: 'openai',
      inputLimit: 1_050_000,
      reasoning: { effort: 'max' },
      pricing: {
        inputPerToken: 10 / 1_000_000,
        outputPerToken: 50 / 1_000_000,
      },
    });
  });

  it('resolves the durable OpenAI frontier alias to the current Astra API id', async () => {
    const frontier = await resolveModelConfig('openai:frontier');

    expect(frontier).toMatchObject({
      model: 'openai:frontier',
      apiModel: 'gpt-6-astra',
      provider: 'openai',
      reasoning: { effort: 'max' },
    });
  });

  it('expires stale OpenRouter catalog entries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;

    await resolveModelConfig('vendor/model', { openRouterApiKey: 'ttl-key', fetcher });
    await resolveModelConfig('vendor/model', { openRouterApiKey: 'ttl-key', fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await resolveModelConfig('vendor/model', { openRouterApiKey: 'ttl-key', fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds the OpenRouter catalog cache to twenty API keys', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;

    for (let index = 0; index < 21; index += 1) {
      await resolveModelConfig('vendor/model', { openRouterApiKey: `bounded-key-${index}`, fetcher });
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(fetcher).toHaveBeenCalledTimes(21);

    await resolveModelConfig('vendor/model', { openRouterApiKey: 'bounded-key-0', fetcher });
    expect(fetcher).toHaveBeenCalledTimes(22);
  });
});
