<script lang="ts">
  import SplendorGemBadge from '@/components/games/splendor/SplendorGemBadge.svelte';
  import {
    GEMS,
    type Card,
    type GemOrGold,
  } from '@/lib/games/splendor/state';

  export let card: Card;
  export let compact = false;
  export let board = false;

  const gemLabels: Record<GemOrGold, string> = {
    emerald: 'Emerald',
    sapphire: 'Sapphire',
    ruby: 'Ruby',
    diamond: 'Diamond',
    onyx: 'Onyx',
    gold: 'Gold',
  };
  let imageFailed = false;

  function imageSrc(card: Card): string {
    return `/assets/splendor/cards/${card.id}.png`;
  }

  function imageAlt(card: Card): string {
    return `Splendor ${card.id}, ${card.prestige} prestige, ${gemLabels[card.bonus]} bonus`;
  }
</script>

<div class="relative aspect-[5/7] overflow-hidden rounded-md bg-neutral-900">
  {#if !imageFailed}
    <img
      class="h-full w-full object-cover"
      src={imageSrc(card)}
      alt={imageAlt(card)}
      loading="lazy"
      decoding="async"
      on:error={() => {
        imageFailed = true;
      }}
    />
  {:else}
    <div class="h-full border border-neutral-800 bg-neutral-900"></div>
  {/if}

  <div
    class="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-neutral-950/80 via-transparent to-neutral-950/90 {compact ? 'p-1.5' : board ? 'p-2' : 'p-3'}"
  >
    <div class="flex items-start justify-between gap-2">
      <div>
        <div class="inline-flex">
          <SplendorGemBadge gem={card.bonus} {compact} {board} />
        </div>
        {#if imageFailed && !compact}
          <h3 class="mt-2 text-sm font-medium text-white drop-shadow">
            {card.id}
          </h3>
        {/if}
      </div>
      <span
        class="rounded-md bg-neutral-950/85 px-2 py-1 {compact ? 'text-xs' : 'text-sm'} font-semibold text-neutral-100 ring-1 ring-white/10"
      >
        {card.prestige}
      </span>
    </div>

    <div class="flex flex-col items-start gap-1.5">
      {#each GEMS as gem (gem)}
        {#if card.cost[gem]}
          <SplendorGemBadge {gem} amount={card.cost[gem]} {compact} {board} />
        {/if}
      {/each}
    </div>
  </div>
</div>
