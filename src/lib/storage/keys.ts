import { listProviders } from '@/lib/ai';
import type { ProviderId } from '@/lib/ai/types';

export const KEY_STORAGE_KEY = 'byok.keys.v1';

export type StoredKeys = Partial<Record<ProviderId, string>> & {
  llamaUrl?: string;
  ollamaUrl?: string;
  selectedProvider?: ProviderId;
  selectedModel?: Partial<Record<ProviderId, string>>;
};

const providerIds = new Set<ProviderId>(
  listProviders().map((provider) => provider.id),
);

function hasLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  );
}

function sanitize(value: unknown): StoredKeys {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const stored: StoredKeys = {};

  for (const provider of providerIds) {
    if (typeof raw[provider] === 'string') {
      stored[provider] = raw[provider];
    }
  }

  if (typeof raw.llamaUrl === 'string') {
    stored.llamaUrl = raw.llamaUrl;
  }

  if (typeof raw.ollamaUrl === 'string') {
    stored.ollamaUrl = raw.ollamaUrl;
  }

  if (
    typeof raw.selectedProvider === 'string' &&
    providerIds.has(raw.selectedProvider as ProviderId)
  ) {
    stored.selectedProvider = raw.selectedProvider as ProviderId;
  }

  if (raw.selectedModel && typeof raw.selectedModel === 'object') {
    stored.selectedModel = {};
    for (const [provider, model] of Object.entries(raw.selectedModel)) {
      if (
        providerIds.has(provider as ProviderId) &&
        typeof model === 'string'
      ) {
        stored.selectedModel[provider as ProviderId] = model;
      }
    }
  }

  return stored;
}

export function getStoredKeys(): StoredKeys {
  if (!hasLocalStorage()) {
    return {};
  }

  const value = window.localStorage.getItem(KEY_STORAGE_KEY);
  if (!value) {
    return {};
  }

  try {
    return sanitize(JSON.parse(value));
  } catch {
    return {};
  }
}

export function setStoredKeys(keys: StoredKeys): void {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(sanitize(keys)));
  window.dispatchEvent(new CustomEvent('byok-keys-changed'));
}

export function updateStoredKeys(
  updater: (keys: StoredKeys) => StoredKeys,
): StoredKeys {
  const next = sanitize(updater(getStoredKeys()));
  setStoredKeys(next);
  return next;
}

export function clearStoredKeys(): void {
  if (!hasLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(KEY_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('byok-keys-changed'));
}

export function clearProviderCredentials(provider: ProviderId): StoredKeys {
  return updateStoredKeys((keys) => {
    const next = { ...keys };
    delete next[provider];
    if (provider === 'llama') {
      delete next.llamaUrl;
    }
    if (provider === 'ollama') {
      delete next.ollamaUrl;
    }
    return next;
  });
}

export function selectedModelFor(
  provider: ProviderId,
  keys: StoredKeys,
): string {
  return (
    keys.selectedModel?.[provider] ??
    listProviders().find((item) => item.id === provider)?.defaultModel ??
    ''
  );
}

export function providerEndpointFor(
  provider: ProviderId,
  keys: StoredKeys,
): string | undefined {
  if (provider === 'llama') {
    return keys.llamaUrl;
  }
  if (provider === 'ollama') {
    return keys.ollamaUrl;
  }
  return undefined;
}

export function hasProviderCredentials(
  provider: ProviderId,
  keys: StoredKeys = getStoredKeys(),
): boolean {
  const meta = listProviders().find((item) => item.id === provider);
  if (!meta) {
    return false;
  }

  const hasKey = !meta.requiresApiKey || Boolean(keys[provider]?.trim());
  const endpoint =
    providerEndpointFor(provider, keys) ?? meta.defaultEndpointUrl;
  const hasEndpoint = !meta.requiresEndpointUrl || Boolean(endpoint?.trim());
  return hasKey && hasEndpoint;
}
