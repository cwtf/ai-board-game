<script lang="ts">
  import { onMount } from 'svelte';
  import { listProviders } from '@/lib/ai';
  import {
    getStoredKeys,
    hasProviderCredentials,
    selectedModelFor,
    selectedProfileFor,
    type StoredKeys,
  } from '@/lib/storage/keys';

  const providers = listProviders();
  export let backHref: string | undefined = undefined;
  export let backLabel = 'Back to home';
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

  $: selectedProfile = selectedProfileFor(keys);
  $: selectedProvider =
    providers.find(
      (provider) =>
        provider.id === (selectedProfile?.provider ?? keys.selectedProvider),
    ) ?? providers[0];
  $: configured = selectedProvider
    ? hasProviderCredentials(selectedProvider.id, keys)
    : false;
  $: selectedModel =
    selectedProfile?.model ?? selectedModelFor(selectedProvider.id, keys);
</script>

<header
  class="border-b border-neutral-800/80 bg-neutral-950/60 text-neutral-100 backdrop-blur"
>
  <div
    class="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-4"
  >
    <div class="flex items-center justify-start">
      {#if backHref}
        <a
          class="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
          href={backHref}
        >
          {backLabel}
        </a>
      {/if}
    </div>
    <a href="/" class="inline-flex items-center gap-2 text-base font-semibold">
      <svg
        class="h-5 w-5 text-emerald-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      </svg>
      AI Board Games
    </a>
    <nav class="flex items-center justify-end gap-3 text-sm">
      <a class="text-neutral-300 hover:text-white" href="/settings">Settings</a>
      <span
        class={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
          configured
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
            : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
        }`}
        title={configured && selectedProvider
          ? `${selectedProvider.label} · ${selectedModel}`
          : 'No provider configured — AI seats unavailable until you add one in settings'}
      >
        <span
          class={`h-1.5 w-1.5 rounded-full ${
            configured ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
        ></span>
        {configured && selectedProvider
          ? selectedProvider.label
          : 'No provider'}
      </span>
    </nav>
  </div>
</header>
