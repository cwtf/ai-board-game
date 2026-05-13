<script lang="ts">
  import {
    GEMS,
    type Gem,
    type GemOrGold,
    type Noble,
  } from '@/lib/games/splendor/state';

  export let noble: Noble;

  const gemLabels: Record<GemOrGold, string> = {
    emerald: 'Emerald',
    sapphire: 'Sapphire',
    ruby: 'Ruby',
    diamond: 'Diamond',
    onyx: 'Onyx',
    gold: 'Gold',
  };
  const gemClasses: Record<Gem, string> = {
    emerald: 'border-emerald-400/70 bg-emerald-400/15 text-emerald-100',
    sapphire: 'border-sky-400/70 bg-sky-400/15 text-sky-100',
    ruby: 'border-rose-400/70 bg-rose-400/15 text-rose-100',
    diamond: 'border-stone-200/70 bg-stone-200/15 text-stone-100',
    onyx: 'border-zinc-500 bg-zinc-900 text-zinc-100',
  };

  let imageFailed = false;

  function imageSrc(noble: Noble): string {
    return `/assets/splendor/nobles/${noble.id}.png`;
  }

  function imageAlt(noble: Noble): string {
    return `Splendor noble ${noble.id}, ${noble.prestige} prestige`;
  }
</script>

<div class="relative aspect-[5/4] overflow-hidden rounded-md bg-neutral-900">
  {#if !imageFailed}
    <img
      class="h-full w-full object-cover"
      src={imageSrc(noble)}
      alt={imageAlt(noble)}
      loading="lazy"
      decoding="async"
      on:error={() => {
        imageFailed = true;
      }}
    />
  {:else}
    <div class="flex h-full flex-col border border-amber-300/40 p-3">
      <div class="flex items-center justify-between">
        <span class="font-medium text-amber-100">{noble.id}</span>
        <span class="text-sm text-amber-200">{noble.prestige} prestige</span>
      </div>
      <div class="mt-auto flex flex-wrap gap-2">
        {#each GEMS as gem (gem)}
          {#if noble.cost[gem]}
            <span class={`rounded-full border px-2 py-1 text-xs ${gemClasses[gem]}`}>
              {gemLabels[gem]} {noble.cost[gem]}
            </span>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
