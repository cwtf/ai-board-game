<script lang="ts">
  import { onMount } from 'svelte';
  import { listProviders } from '@/lib/ai';
  import { games } from '@/lib/games/registry';
  import {
    getStoredKeys,
    hasProviderCredentials,
    selectedProfileFor,
    type StoredKeys,
  } from '@/lib/storage/keys';
  import GameCard from './GameCard.svelte';

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

  $: selectedProfile = selectedProfileFor(keys);
  $: selectedProvider =
    providers.find(
      (provider) =>
        provider.id === (selectedProfile?.provider ?? keys.selectedProvider),
    ) ?? providers[0];
  $: canPlay = selectedProvider
    ? hasProviderCredentials(selectedProvider.id, keys)
    : false;
</script>

<div class="grid gap-4 md:grid-cols-2">
  {#each games as game (game.id)}
    <GameCard {game} {canPlay} />
  {/each}
</div>
