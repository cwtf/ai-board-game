import { describe, expect, it } from 'vitest';
import {
  getStoredKeys,
  hasProviderCredentials,
  providerEndpointFor,
  selectedModelFor,
} from '@/lib/storage/keys';

describe('key storage', () => {
  it('is SSR-safe without window localStorage', () => {
    expect(getStoredKeys()).toEqual({});
  });

  it('reads selected models and endpoint URLs from a stored shape', () => {
    const keys = {
      selectedModel: { openai: 'gpt-test' },
      llamaUrl: 'http://localhost:8080/v1',
    };

    expect(selectedModelFor('openai', keys)).toBe('gpt-test');
    expect(providerEndpointFor('llama', keys)).toBe('http://localhost:8080/v1');
  });

  it('treats Ollama as configured through its default local endpoint', () => {
    expect(hasProviderCredentials('ollama', {})).toBe(true);
  });
});
