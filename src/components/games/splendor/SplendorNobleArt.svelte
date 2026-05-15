<script lang="ts">
  import SplendorGemBadge from '@/components/games/splendor/SplendorGemBadge.svelte';
  import {
    GEMS,
    type Noble,
  } from '@/lib/games/splendor/state';

  export let noble: Noble;

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
    <div class="h-full border border-amber-300/40 bg-neutral-900"></div>
  {/if}

  <div
    class="pointer-events-none absolute inset-0 bg-gradient-to-b from-neutral-950/80 via-transparent to-neutral-950/90"
  >
    <div class="flex items-center justify-between gap-2 p-3">
      {#if imageFailed}
        <span class="font-medium text-amber-100 drop-shadow">{noble.id}</span>
      {:else}
        <span aria-hidden="true"></span>
      {/if}
      <span
        class="rounded-md bg-neutral-950/85 px-2 py-1 text-sm font-semibold text-amber-100 ring-1 ring-amber-200/20"
      >
        {noble.prestige}
      </span>
    </div>
    <div class="absolute bottom-2 left-1 flex flex-col items-start gap-1.5">
      {#each GEMS as gem (gem)}
        {#if noble.cost[gem]}
          <SplendorGemBadge {gem} amount={noble.cost[gem]} />
        {/if}
      {/each}
    </div>
  </div>
</div>
