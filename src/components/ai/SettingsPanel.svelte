<script lang="ts">
  import { onMount } from 'svelte';
  import { getProvider, listProviders } from '@/lib/ai';
  import { AIProviderError, type ProviderId } from '@/lib/ai/types';
  import {
    clearProviderCredentials,
    clearStoredKeys,
    getStoredKeys,
    providerEndpointFor,
    selectedModelFor,
    setStoredKeys,
    type StoredKeys,
  } from '@/lib/storage/keys';

  const providers = listProviders();

  let keys: StoredKeys = {};
  let draftKeys: Partial<Record<ProviderId, string>> = {};
  let draftUrls: Partial<Record<ProviderId, string>> = {};
  let testState: Partial<Record<ProviderId, { ok: boolean; message: string }>> =
    {};
  let testing: ProviderId | null = null;

  $: selectedProviderId = keys.selectedProvider ?? providers[0].id;
  $: activeProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0];

  function refresh() {
    keys = getStoredKeys();
    draftKeys = Object.fromEntries(
      providers.map((provider) => [provider.id, keys[provider.id] ?? '']),
    ) as Partial<Record<ProviderId, string>>;
    draftUrls = {
      llama: keys.llamaUrl ?? '',
      ollama: keys.ollamaUrl ?? 'http://localhost:11434',
    };
  }

  onMount(refresh);

  function saveProvider(providerId: ProviderId) {
    const provider = getProvider(providerId);
    const selectedModel =
      selectedModelFor(providerId, keys) || provider.defaultModel;

    setStoredKeys({
      ...keys,
      [providerId]: draftKeys[providerId]?.trim() || undefined,
      llamaUrl:
        providerId === 'llama' ? draftUrls.llama?.trim() : keys.llamaUrl,
      ollamaUrl:
        providerId === 'ollama' ? draftUrls.ollama?.trim() : keys.ollamaUrl,
      selectedProvider: providerId,
      selectedModel: {
        ...keys.selectedModel,
        [providerId]: selectedModel,
      },
    });
    refresh();
    testState = {
      ...testState,
      [providerId]: { ok: true, message: 'Saved.' },
    };
  }

  function clearProvider(providerId: ProviderId) {
    keys = clearProviderCredentials(providerId);
    refresh();
    testState = {
      ...testState,
      [providerId]: { ok: true, message: 'Cleared.' },
    };
  }

  function setSelectedProvider(providerId: ProviderId) {
    setStoredKeys({
      ...keys,
      selectedProvider: providerId,
    });
    refresh();
  }

  function setSelectedModel(providerId: ProviderId, model: string) {
    setStoredKeys({
      ...keys,
      selectedProvider: providerId,
      selectedModel: {
        ...keys.selectedModel,
        [providerId]: model,
      },
    });
    refresh();
  }

  async function testProvider(providerId: ProviderId) {
    saveProvider(providerId);
    testing = providerId;
    const provider = getProvider(providerId);
    const started = performance.now();

    try {
      const result = await provider.complete({
        apiKey: draftKeys[providerId]?.trim(),
        endpointUrl:
          providerId === 'llama' || providerId === 'ollama'
            ? draftUrls[providerId]?.trim() || provider.defaultEndpointUrl
            : providerEndpointFor(providerId, keys),
        model:
          selectedModelFor(providerId, getStoredKeys()) ||
          provider.defaultModel,
        system: 'You are a connection test. Reply only with valid JSON.',
        messages: [{ role: 'user', content: 'Reply with {"ok":true}' }],
        responseFormat: 'json',
        temperature: 0,
        maxTokens: 64,
      });

      const parsed = JSON.parse(result.text) as { ok?: boolean };
      const elapsed = Math.round(performance.now() - started);
      testState = {
        ...testState,
        [providerId]: {
          ok: parsed.ok === true,
          message:
            parsed.ok === true
              ? `Connected in ${elapsed}ms.`
              : 'Provider replied, but not with ok:true.',
        },
      };
    } catch (error) {
      testState = {
        ...testState,
        [providerId]: {
          ok: false,
          message:
            error instanceof AIProviderError || error instanceof Error
              ? error.message
              : 'Connection test failed.',
        },
      };
    } finally {
      testing = null;
    }
  }
</script>

<section class="mx-auto max-w-6xl px-6 py-10 text-neutral-100">
  <div class="mb-8 max-w-3xl">
    <p class="text-sm font-medium uppercase tracking-wide text-emerald-300">
      BYOK settings
    </p>
    <h1 class="mt-3 text-3xl font-semibold tracking-normal">AI providers</h1>
    <p class="mt-3 text-neutral-300">
      Your API key is stored only in your browser. It is sent only to the AI
      provider you select, over HTTPS. Anyone with access to this device or
      browser profile can read it. Clear the key when you're done if this is a
      shared machine.
    </p>
  </div>

  <article class="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 class="text-lg font-semibold">{activeProvider.label}</h2>
        <p class="mt-1 text-sm text-neutral-400">
          Default model:
          <span class="text-neutral-200">{activeProvider.defaultModel}</span>
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm">
        {#if testState[activeProvider.id]}
          <span
            class={`h-2.5 w-2.5 rounded-full ${
              testState[activeProvider.id]?.ok ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          ></span>
          <span
            class={testState[activeProvider.id]?.ok
              ? 'text-emerald-200'
              : 'text-red-200'}
          >
            {testState[activeProvider.id]?.message}
          </span>
        {/if}
      </div>
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <label class="grid gap-2 text-sm">
        <span class="text-neutral-300">Provider</span>
        <select
          class="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-400"
          value={activeProvider.id}
          on:change={(event) =>
            setSelectedProvider(event.currentTarget.value as ProviderId)}
        >
          {#each providers as provider (provider.id)}
            <option value={provider.id}>{provider.label}</option>
          {/each}
        </select>
      </label>

      <label class="grid gap-2 text-sm">
        <span class="text-neutral-300">Model</span>
        <select
          class="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-400"
          value={selectedModelFor(activeProvider.id, keys)}
          on:change={(event) =>
            setSelectedModel(activeProvider.id, event.currentTarget.value)}
        >
          {#each activeProvider.availableModels as model (model)}
            <option value={model}>{model}</option>
          {/each}
        </select>
      </label>

      {#if activeProvider.requiresApiKey}
        <label class="grid gap-2 text-sm">
          <span class="text-neutral-300">API key</span>
          <input
            class="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-400"
            type="password"
            autocomplete="off"
            bind:value={draftKeys[activeProvider.id]}
            placeholder="Paste key"
          />
        </label>
      {:else}
        <div
          class="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-400"
        >
          No API key required by default.
        </div>
      {/if}

      {#if activeProvider.id === 'llama' || activeProvider.id === 'ollama'}
        <label class="grid gap-2 text-sm">
          <span class="text-neutral-300">
            {activeProvider.endpointLabel ?? 'Endpoint URL'}
          </span>
          <input
            class="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-400"
            type="url"
            bind:value={draftUrls[activeProvider.id]}
            placeholder={activeProvider.defaultEndpointUrl ??
              'https://example.com/v1'}
          />
        </label>
      {/if}
    </div>

    <div class="mt-5 flex flex-wrap gap-2">
      <button
        class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={testing === activeProvider.id}
        on:click={() => saveProvider(activeProvider.id)}
      >
        Save
      </button>
      <button
        class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={testing === activeProvider.id}
        on:click={() => testProvider(activeProvider.id)}
      >
        {testing === activeProvider.id ? 'Testing...' : 'Test'}
      </button>
      <button
        class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
        type="button"
        on:click={() => clearProvider(activeProvider.id)}
      >
        Clear
      </button>
    </div>
  </article>

  <button
    class="mt-6 rounded-md border border-red-400/50 px-3 py-2 text-sm text-red-200 hover:border-red-300"
    type="button"
    on:click={() => {
      clearStoredKeys();
      refresh();
    }}
  >
    Clear all provider settings
  </button>
</section>
