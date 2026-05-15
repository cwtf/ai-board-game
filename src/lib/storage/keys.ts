import { listProviders } from '@/lib/ai';
import type { ProviderId } from '@/lib/ai/types';

export const KEY_STORAGE_KEY = 'byok.keys.v1';

export interface ProviderModelProfile {
  id: string;
  label: string;
  provider: ProviderId;
  model: string;
}

export type StoredKeys = Partial<Record<ProviderId, string>> & {
  llamaUrl?: string;
  ollamaUrl?: string;
  selectedProvider?: ProviderId;
  selectedModel?: Partial<Record<ProviderId, string>>;
  selectedProfileId?: string;
  modelProfiles?: ProviderModelProfile[];
  deletedProviders?: ProviderId[];
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

  if (Array.isArray(raw.modelProfiles)) {
    stored.modelProfiles = raw.modelProfiles.flatMap((profile) => {
      if (!profile || typeof profile !== 'object') {
        return [];
      }

      const item = profile as Record<string, unknown>;
      if (
        typeof item.id !== 'string' ||
        typeof item.label !== 'string' ||
        typeof item.provider !== 'string' ||
        typeof item.model !== 'string' ||
        !providerIds.has(item.provider as ProviderId)
      ) {
        return [];
      }

      return [
        {
          id: item.id,
          label: item.label,
          provider: item.provider as ProviderId,
          model: item.model,
        },
      ];
    });
  }

  if (
    typeof raw.selectedProfileId === 'string' &&
    stored.modelProfiles?.some((profile) => profile.id === raw.selectedProfileId)
  ) {
    stored.selectedProfileId = raw.selectedProfileId;
  }

  if (Array.isArray(raw.deletedProviders)) {
    stored.deletedProviders = raw.deletedProviders.filter(
      (provider): provider is ProviderId =>
        typeof provider === 'string' && providerIds.has(provider as ProviderId),
    );
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
    next.selectedModel = { ...next.selectedModel };
    delete next.selectedModel[provider];
    next.modelProfiles = next.modelProfiles?.filter(
      (profile) => profile.provider !== provider,
    );
    if (
      next.selectedProfileId &&
      !next.modelProfiles?.some((profile) => profile.id === next.selectedProfileId)
    ) {
      delete next.selectedProfileId;
    }
    if (provider === 'llama') {
      delete next.llamaUrl;
    }
    if (provider === 'ollama') {
      delete next.ollamaUrl;
    }
    next.deletedProviders = Array.from(
      new Set([...(next.deletedProviders ?? []), provider]),
    );
    if (next.selectedProvider === provider) {
      delete next.selectedProvider;
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

export function selectedProfileFor(
  keys: StoredKeys = getStoredKeys(),
): ProviderModelProfile | undefined {
  return keys.modelProfiles?.find(
    (profile) => profile.id === keys.selectedProfileId,
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
  if (keys.deletedProviders?.includes(provider)) {
    return false;
  }

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
