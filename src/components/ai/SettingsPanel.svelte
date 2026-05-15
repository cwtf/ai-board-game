<script lang="ts">
  import { onMount } from 'svelte';
  import { getProvider, listProviders } from '@/lib/ai';
  import { AIProviderError, type ProviderId } from '@/lib/ai/types';
  import {
    clearProviderCredentials,
    clearStoredKeys,
    getStoredKeys,
    hasProviderCredentials,
    providerEndpointFor,
    selectedModelFor,
    setStoredKeys,
    type ProviderModelProfile,
    type StoredKeys,
  } from '@/lib/storage/keys';

  const providers = listProviders();

  let keys: StoredKeys = {};
  let draftKeys: Partial<Record<ProviderId, string>> = {};
  let draftUrls: Partial<Record<ProviderId, string>> = {};
  let testState: Partial<Record<ProviderId, { ok: boolean; message: string }>> =
    {};
  let modelListState: Partial<
    Record<ProviderId, { ok: boolean; message: string }>
  > = {};
  let providerModels: Partial<Record<ProviderId, string[]>> = {};
  let testing: ProviderId | null = null;
  let loadingModels: ProviderId | null = null;
  let modelListRequest = 0;
  let profileName = '';
  let profileNameTouched = false;
  let modelSearch = '';
  let modelPickerOpen = false;
  let successfulTestSignatures: Partial<Record<ProviderId, string>> = {};

  $: selectedProviderId = keys.selectedProvider ?? providers[0].id;
  $: activeProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    providers[0];
  $: activeModels = modelsFor(activeProvider, providerModels, keys);
  $: activeModel = selectedModelFor(activeProvider.id, keys);
  $: visibleModels = filterModels(activeModels, modelSearch, activeModel);
  $: modelProfiles = keys.modelProfiles ?? [];
  $: defaultProfile = modelProfiles.find(
    (profile) => profile.id === keys.selectedProfileId,
  );
  $: suggestedProfileName = defaultProfileLabel(
    activeProvider.id,
    selectedModelFor(activeProvider.id, keys),
  );
  $: if (!profileNameTouched && profileName !== suggestedProfileName) {
    profileName = suggestedProfileName;
  }
  $: activeProfileCanSave =
    testing !== activeProvider.id &&
    successfulTestSignatures[activeProvider.id] ===
      providerDraftSignature(activeProvider.id);

  function keyStatus(provider: (typeof providers)[number]): string {
    if (!provider.requiresApiKey) {
      return 'Not required';
    }

    return keys[provider.id]?.trim() ? 'Saved' : 'Missing';
  }

  function endpointStatus(provider: (typeof providers)[number]): string {
    if (!provider.requiresEndpointUrl) {
      return 'Provider default';
    }

    return (
      providerEndpointFor(provider.id, keys) ??
      provider.defaultEndpointUrl ??
      'Missing'
    );
  }

  function providerLabel(providerId: ProviderId): string {
    return getProvider(providerId).label;
  }

  function profileIdFor(providerId: ProviderId, model: string): string {
    return `${providerId}:${model}`;
  }

  function defaultProfileLabel(providerId: ProviderId, model: string): string {
    const provider = getProvider(providerId);
    return `${provider.label} - ${model}`;
  }

  function savedProviderShape(providerId: ProviderId): StoredKeys {
    const provider = getProvider(providerId);
    const selectedModel =
      selectedModelFor(providerId, keys) || provider.defaultModel;

    return {
      ...keys,
      [providerId]: draftKeys[providerId]?.trim() || undefined,
      llamaUrl:
        providerId === 'llama' ? draftUrls.llama?.trim() : keys.llamaUrl,
      ollamaUrl:
        providerId === 'ollama' ? draftUrls.ollama?.trim() : keys.ollamaUrl,
      deletedProviders: keys.deletedProviders?.filter(
        (deletedProvider) => deletedProvider !== providerId,
      ),
      selectedProvider: providerId,
      selectedModel: {
        ...keys.selectedModel,
        [providerId]: selectedModel,
      },
    };
  }

  function providerDraftSignature(providerId: ProviderId): string {
    const provider = getProvider(providerId);
    return JSON.stringify({
      provider: providerId,
      model: selectedModelFor(providerId, keys) || provider.defaultModel,
      apiKey: provider.requiresApiKey
        ? draftKeys[providerId]?.trim() ?? ''
        : '',
      endpoint:
        providerId === 'llama' || providerId === 'ollama'
          ? draftUrls[providerId]?.trim() || provider.defaultEndpointUrl || ''
          : providerEndpointFor(providerId, keys) ?? '',
    });
  }

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

  onMount(() => {
    refresh();
    void loadModelsFor(getStoredKeys().selectedProvider ?? providers[0].id);
  });

  function endpointFor(providerId: ProviderId): string | undefined {
    const provider = getProvider(providerId);
    return providerId === 'llama' || providerId === 'ollama'
      ? draftUrls[providerId]?.trim() || provider.defaultEndpointUrl
      : providerEndpointFor(providerId, keys);
  }

  function modelsFor(
    provider: (typeof providers)[number],
    fetchedByProvider: Partial<Record<ProviderId, string[]>>,
    storedKeys: StoredKeys,
  ): string[] {
    const fetchedModels = fetchedByProvider[provider.id];
    const baseModels = fetchedModels ?? provider.availableModels;
    const selectedModel = storedKeys.selectedModel?.[provider.id];

    if (selectedModel && !baseModels.includes(selectedModel)) {
      return [selectedModel, ...baseModels];
    }

    return baseModels;
  }

  function filterModels(models: string[], query: string, selectedModel: string) {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? models.filter((model) => model.toLowerCase().includes(normalized))
      : models;

    if (selectedModel && !filtered.includes(selectedModel)) {
      return [selectedModel, ...filtered];
    }

    return filtered;
  }

  function chooseModel(providerId: ProviderId, model: string) {
    setSelectedModel(providerId, model);
    modelSearch = '';
    modelPickerOpen = false;
  }

  async function loadModelsFor(providerId: ProviderId) {
    const provider = getProvider(providerId);
    if (!provider.listModels) {
      return;
    }

    const requestId = ++modelListRequest;
    loadingModels = providerId;

    try {
      const models = await provider.listModels({
        apiKey: draftKeys[providerId]?.trim(),
        endpointUrl: endpointFor(providerId),
      });
      if (requestId !== modelListRequest) {
        return;
      }

      providerModels = {
        ...providerModels,
        [providerId]: models,
      };

      const stored = getStoredKeys();
      const storedModel = stored.selectedModel?.[providerId];
      const shouldUseFirstFetchedModel =
        providerId === 'ollama' &&
        models.length &&
        (!storedModel ||
          (provider.availableModels.includes(storedModel) &&
            !models.includes(storedModel)));

      if (shouldUseFirstFetchedModel) {
        setStoredKeys({
          ...stored,
          selectedProvider: providerId,
          selectedModel: {
            ...stored.selectedModel,
            [providerId]: models[0],
          },
        });
        refresh();
      }

      modelListState = {
        ...modelListState,
        [providerId]: {
          ok: true,
          message: models.length
            ? `Found ${models.length} available model${models.length === 1 ? '' : 's'}.`
            : 'No models found.',
        },
      };
    } catch (error) {
      if (requestId !== modelListRequest) {
        return;
      }

      const nextModels = { ...providerModels };
      delete nextModels[providerId];
      providerModels = nextModels;
      modelListState = {
        ...modelListState,
        [providerId]: {
          ok: false,
          message: `${
            error instanceof AIProviderError || error instanceof Error
              ? error.message
              : 'Could not load models.'
          } Using fallback list.`,
        },
      };
    } finally {
      if (requestId === modelListRequest) {
        loadingModels = null;
      }
    }
  }

  function saveCurrentProfile() {
    const providerId = activeProvider.id;
    const model =
      selectedModelFor(providerId, keys) || activeProvider.defaultModel;
    const savedProvider = savedProviderShape(providerId);
    if (!activeProfileCanSave) {
      testState = {
        ...testState,
        [providerId]: {
          ok: false,
          message: 'Run a successful test before saving this model profile.',
        },
      };
      return;
    }

    if (!hasProviderCredentials(providerId, savedProvider)) {
      testState = {
        ...testState,
        [providerId]: {
          ok: false,
          message: activeProvider.requiresApiKey
            ? 'Enter an API key before saving this model profile.'
            : 'Enter the required endpoint before saving this model profile.',
        },
      };
      return;
    }

    const profile: ProviderModelProfile = {
      id: profileIdFor(providerId, model),
      label: profileName.trim() || defaultProfileLabel(providerId, model),
      provider: providerId,
      model,
    };
    const nextProfiles = [
      ...(keys.modelProfiles ?? []).filter((item) => item.id !== profile.id),
      profile,
    ];

    setStoredKeys({
      ...savedProvider,
      selectedProfileId: keys.selectedProfileId ?? profile.id,
      modelProfiles: nextProfiles,
    });
    profileNameTouched = false;
    refresh();
    void loadModelsFor(providerId);
    testState = {
      ...testState,
      [providerId]: { ok: true, message: 'Saved model profile.' },
    };
  }

  function setDefaultProfile(profile: ProviderModelProfile) {
    setStoredKeys({
      ...keys,
      selectedProvider: profile.provider,
      selectedProfileId: profile.id,
      selectedModel: {
        ...keys.selectedModel,
        [profile.provider]: profile.model,
      },
    });
    refresh();
    void loadModelsFor(profile.provider);
  }

  function deleteProfile(profileId: string) {
    const nextProfiles = modelProfiles.filter((profile) => profile.id !== profileId);
    const next: StoredKeys = {
      ...keys,
      modelProfiles: nextProfiles,
    };
    if (keys.selectedProfileId === profileId) {
      delete next.selectedProfileId;
    }

    setStoredKeys(next);
    refresh();
  }

  function clearProvider(providerId: ProviderId) {
    keys = clearProviderCredentials(providerId);
    const nextSignatures = { ...successfulTestSignatures };
    delete nextSignatures[providerId];
    successfulTestSignatures = nextSignatures;
    refresh();
    testState = {
      ...testState,
      [providerId]: { ok: true, message: 'Cleared.' },
    };
  }

  function setSelectedProvider(providerId: ProviderId) {
    profileNameTouched = false;
    setStoredKeys({
      ...keys,
      selectedProvider: providerId,
    });
    refresh();
    modelSearch = '';
    modelPickerOpen = false;
    void loadModelsFor(providerId);
  }

  function setSelectedModel(providerId: ProviderId, model: string) {
    profileNameTouched = false;
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
    testing = providerId;
    const provider = getProvider(providerId);
    const started = performance.now();
    const draftModel = selectedModelFor(providerId, keys) || provider.defaultModel;
    const draftSignature = providerDraftSignature(providerId);

    try {
      const result = await provider.complete({
        apiKey: draftKeys[providerId]?.trim(),
        endpointUrl:
          providerId === 'llama' || providerId === 'ollama'
            ? draftUrls[providerId]?.trim() || provider.defaultEndpointUrl
            : providerEndpointFor(providerId, keys),
        model: draftModel,
        system: 'You are a connection test. Reply only with valid JSON.',
        messages: [{ role: 'user', content: 'Reply with {"ok":true}' }],
        responseFormat: 'json',
        temperature: 0,
        maxTokens: 64,
      });

      const parsed = JSON.parse(result.text) as { ok?: boolean };
      const elapsed = Math.round(performance.now() - started);
      if (parsed.ok === true) {
        successfulTestSignatures = {
          ...successfulTestSignatures,
          [providerId]: draftSignature,
        };
      } else {
        const nextSignatures = { ...successfulTestSignatures };
        delete nextSignatures[providerId];
        successfulTestSignatures = nextSignatures;
      }
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
      const nextSignatures = { ...successfulTestSignatures };
      delete nextSignatures[providerId];
      successfulTestSignatures = nextSignatures;
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
    <div
      class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
    >
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-lg font-semibold">{activeProvider.label}</h2>
          {#if activeProvider.platformUrl}
            <a
              class="text-sm text-emerald-300 underline-offset-4 hover:text-emerald-200 hover:underline"
              href={activeProvider.platformUrl}
              target="_blank"
              rel="noreferrer"
            >
              API platform
            </a>
          {/if}
        </div>
        <p class="mt-1 text-sm text-neutral-400">
          Default model:
          <span class="text-neutral-200">{activeProvider.defaultModel}</span>
        </p>
        {#if defaultProfile}
          <p class="mt-1 text-sm text-neutral-400">
            Default profile:
            <span class="text-neutral-200">{defaultProfile.label}</span>
          </p>
        {/if}
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

      <div class="grid gap-2 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span class="text-neutral-300">Model</span>
          {#if activeProvider.listModels}
            <button
              class="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={loadingModels === activeProvider.id}
              on:click={() => loadModelsFor(activeProvider.id)}
            >
              {loadingModels === activeProvider.id ? 'Loading...' : 'Refresh'}
            </button>
          {/if}
        </div>
        <div class="relative">
          <button
            class="flex w-full items-center justify-between gap-3 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-left text-neutral-100 outline-none hover:border-neutral-500 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={activeModels.length === 0}
            on:click={() => {
              modelPickerOpen = !modelPickerOpen;
              modelSearch = '';
            }}
          >
            <span class="min-w-0 truncate">{activeModel || 'No models found'}</span>
            <span class="shrink-0 text-neutral-500">v</span>
          </button>

          {#if modelPickerOpen}
            <div
              class="absolute z-20 mt-2 w-full overflow-hidden rounded-md border border-neutral-700 bg-neutral-950 shadow-xl shadow-black/40"
            >
              <input
                class="w-full border-b border-neutral-800 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-emerald-400"
                autocomplete="off"
                placeholder={`Search ${activeModels.length} model${activeModels.length === 1 ? '' : 's'}`}
                bind:value={modelSearch}
                on:keydown={(event) => {
                  if (event.key === 'Escape') {
                    modelPickerOpen = false;
                    modelSearch = '';
                  }
                }}
              />
              <div class="max-h-72 overflow-y-auto py-1">
                {#if visibleModels.length}
                  {#each visibleModels as model (model)}
                    <button
                      class={`block w-full px-3 py-2 text-left text-sm hover:bg-neutral-800 ${
                        model === activeModel
                          ? 'bg-emerald-400/10 text-emerald-100'
                          : 'text-neutral-200'
                      }`}
                      type="button"
                      on:click={() => chooseModel(activeProvider.id, model)}
                    >
                      <span class="block truncate">{model}</span>
                    </button>
                  {/each}
                {:else}
                  <div class="px-3 py-4 text-sm text-neutral-500">
                    No models match that search.
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
        {#if modelListState[activeProvider.id]}
          <p
            class={modelListState[activeProvider.id]?.ok
              ? 'text-xs text-emerald-200'
              : 'text-xs text-amber-200'}
          >
            {modelListState[activeProvider.id]?.message}
          </p>
        {/if}
        {#if activeProvider.id === 'ollama'}
          <label class="grid gap-2">
            <span class="text-xs text-neutral-400">Custom model</span>
            <input
              class="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-400"
              value={selectedModelFor(activeProvider.id, keys)}
              placeholder="qwen3:8b"
              on:change={(event) =>
                setSelectedModel(
                  activeProvider.id,
                  event.currentTarget.value.trim(),
                )}
            />
          </label>
        {/if}
      </div>

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

    <div class="mt-5 rounded-md border border-neutral-800 bg-neutral-950 p-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label class="grid flex-1 gap-2 text-sm">
          <span class="text-neutral-300">Model profile name</span>
          <input
            class="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-400"
            value={profileName}
            placeholder={suggestedProfileName}
            on:input={(event) => {
              profileNameTouched = true;
              profileName = event.currentTarget.value;
            }}
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            class="rounded-md border border-emerald-400/60 px-3 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={!activeProfileCanSave}
            on:click={saveCurrentProfile}
          >
            Save model profile
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
      </div>
      <p class="mt-2 text-xs text-neutral-500">
        Profiles reuse this provider's saved credentials while pinning a model,
        so one OpenRouter key can back separate OpenAI, Anthropic, or Google
        model choices.
      </p>
    </div>
  </article>

  <button
    class="mt-6 rounded-md border border-red-400/50 px-3 py-2 text-sm text-red-200 hover:border-red-300"
    type="button"
    on:click={() => {
      clearStoredKeys();
      successfulTestSignatures = {};
      refresh();
    }}
  >
    Clear all provider settings
  </button>

  <article class="mt-6 rounded-lg border border-neutral-800 bg-neutral-900">
    <div
      class="flex flex-col gap-2 border-b border-neutral-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold">Saved model profiles</h2>
        <p class="mt-1 text-sm text-neutral-400">
          Each saved profile appears as one row. Provider credentials are kept
          as backing settings for the profiles that use them.
        </p>
      </div>
      <span class="text-sm text-neutral-400">
        {modelProfiles.length} saved
      </span>
    </div>

    {#if modelProfiles.length}
      <div class="overflow-x-auto">
        <table class="w-full min-w-[880px] text-left text-sm">
          <thead
            class="border-b border-neutral-800 text-xs uppercase text-neutral-500"
          >
            <tr>
              <th class="px-5 py-3 font-medium">Name</th>
              <th class="px-5 py-3 font-medium">Provider</th>
              <th class="px-5 py-3 font-medium">Model</th>
              <th class="px-5 py-3 font-medium">API key</th>
              <th class="px-5 py-3 font-medium">Endpoint</th>
              <th class="px-5 py-3 font-medium">Default</th>
              <th class="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-800">
            {#each modelProfiles as profile (profile.id)}
              {@const provider = getProvider(profile.provider)}
              <tr
                class={profile.id === keys.selectedProfileId
                  ? 'bg-emerald-400/5'
                  : 'bg-transparent'}
              >
                <td class="px-5 py-3 font-medium text-neutral-100">
                  {profile.label}
                </td>
                <td class="px-5 py-3 text-neutral-300">
                  {providerLabel(profile.provider)}
                </td>
                <td class="max-w-80 truncate px-5 py-3 text-neutral-300">
                  {profile.model}
                </td>
                <td class="px-5 py-3 text-neutral-300">
                  {keyStatus(provider)}
                </td>
                <td class="max-w-72 truncate px-5 py-3 text-neutral-300">
                  {endpointStatus(provider)}
                </td>
                <td class="px-5 py-3">
                  {#if profile.id === keys.selectedProfileId}
                    <span class="inline-flex items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-center text-xs leading-tight text-emerald-200">
                      Current default
                    </span>
                  {:else}
                    <button
                      class="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-500 hover:text-white"
                      type="button"
                      on:click={() => setDefaultProfile(profile)}
                    >
                      Set default
                    </button>
                  {/if}
                </td>
                <td class="px-5 py-3">
                  <button
                    class="rounded-md border border-red-400/50 px-2 py-1 text-xs text-red-200 hover:border-red-300 hover:text-red-100"
                    type="button"
                    on:click={() => deleteProfile(profile.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="px-5 py-6 text-sm text-neutral-400">
        No model profiles saved yet.
      </div>
    {/if}
  </article>
</section>
