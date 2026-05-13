<script lang="ts">
  import { onMount } from 'svelte';
  import { listProviders } from '@/lib/ai';
  import {
    getStoredKeys,
    hasProviderCredentials,
    selectedModelFor,
    type StoredKeys,
  } from '@/lib/storage/keys';

  const providers = listProviders();
  let keys: StoredKeys = {};

  function refresh() {
    keys = getStoredKeys();
  }

  onMount(() => {
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('byok-keys-changed', refresh);

    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('byok-keys-changed', refresh);
    };
  });

  $: selectedProvider =
    providers.find((provider) => provider.id === keys.selectedProvider) ??
    providers[0];
  $: configured = selectedProvider
    ? hasProviderCredentials(selectedProvider.id, keys)
    : false;
  $: selectedModel = selectedProvider
    ? selectedModelFor(selectedProvider.id, keys)
    : '';
</script>

<header class="border-b border-neutral-800 bg-neutral-950/90 text-neutral-100">
  <div
    class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4"
  >
    <a href="/" class="text-base font-semibold">AI Board Games</a>
    <nav class="flex items-center gap-3 text-sm">
      <a class="text-neutral-300 hover:text-white" href="/settings">Settings</a>
      <span
        class={`rounded-full border px-3 py-1 ${
          configured
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
            : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
        }`}
      >
        {#if selectedProvider}
          {configured
            ? `Provider: ${selectedProvider.label} (${selectedModel})`
            : 'Provider: not configured'}
        {:else}
          Provider: not configured
        {/if}
      </span>
    </nav>
  </div>
</header>
