<script lang="ts">
  import {
    GEMS,
    type Card,
    type Gem,
    type GemOrGold,
  } from '@/lib/games/splendor/state';

  export let card: Card;
  export let compact = false;

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
    <div class="flex h-full flex-col border border-neutral-800 p-3">
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class={`inline-flex rounded-full border px-2 py-1 text-xs ${gemClasses[card.bonus]}`}>
            {gemLabels[card.bonus]}
          </div>
          <h3 class="mt-2 font-medium text-white">{card.id}</h3>
        </div>
        <span class="rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-100">
          {card.prestige}
        </span>
      </div>
      <div class="mt-auto flex flex-wrap gap-2">
        {#each GEMS as gem (gem)}
          {#if card.cost[gem]}
            <span class={`rounded-full border px-2 py-1 text-xs ${gemClasses[gem]}`}>
              {compact ? gemLabels[gem][0] : gemLabels[gem]} {card.cost[gem]}
            </span>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
