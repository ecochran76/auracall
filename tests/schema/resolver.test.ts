import { describe, it, expect, vi } from 'vitest';
import { resolveConfig } from '../../src/schema/resolver.js';
import * as configModule from '../../src/config.js';

describe('Config Resolver', () => {
  it('should resolve default values when no config/cli provided', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {} as any,
      path: '/tmp/config.json',
      loaded: false
    });

    const result = await resolveConfig({});
    
    expect(result.model).toBe('gpt-5.2-pro');
    expect(result.browser.headless).toBe(undefined);
  });

  it('should override defaults with file config', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-4', browser: { headless: true } },
      path: '/tmp/config.json',
      loaded: true
    });

    const result = await resolveConfig({});
    
    expect(result.model).toBe('gpt-4');
    expect(result.browser.headless).toBe(true);
  });

  it('should override file config with CLI flags', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-4', browser: { headless: true } },
      path: '/tmp/config.json',
      loaded: true
    });

    const cliOptions = {
      browserHeadless: false,
      model: 'gpt-5-pro'
    };
    
    const result = await resolveConfig(cliOptions);
    
    expect(result.model).toBe('gpt-5-pro');
    expect(result.browser.headless).toBe(false);
  });
});
