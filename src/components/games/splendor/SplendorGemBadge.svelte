<script lang="ts">
  import type { GemOrGold } from '@/lib/games/splendor/state';

  export let gem: GemOrGold;
  export let amount: number | undefined = undefined;
  export let label = '';
  export let compact = false;

  const gemLabels: Record<GemOrGold, string> = {
    emerald: 'Emerald',
    sapphire: 'Sapphire',
    ruby: 'Ruby',
    diamond: 'Diamond',
    onyx: 'Onyx',
    gold: 'Gold',
  };
  const gemClasses: Record<GemOrGold, string> = {
    emerald: 'border-emerald-300/70 bg-emerald-950/70 text-emerald-50',
    sapphire: 'border-sky-300/70 bg-sky-950/70 text-sky-50',
    ruby: 'border-rose-300/70 bg-rose-950/70 text-rose-50',
    diamond: 'border-stone-100/70 bg-stone-900/70 text-stone-50',
    onyx: 'border-zinc-400/70 bg-zinc-950/80 text-zinc-50',
    gold: 'border-amber-200/80 bg-amber-950/70 text-amber-50',
  };

  $: title =
    amount === undefined
      ? gemLabels[gem]
      : `${amount} ${gemLabels[gem]}${amount === 1 ? '' : 's'}`;
</script>

<span
  class={`inline-flex items-center gap-1 rounded-full border ${compact ? 'px-1.5 py-1 text-[10px]' : 'px-2 py-1 text-xs'} ${gemClasses[gem]}`}
  title={title}
  aria-label={title}
>
  <img
    class={compact ? 'h-4 w-4' : 'h-5 w-5'}
    src={`/assets/splendor/gems/${gem}.svg`}
    alt=""
    aria-hidden="true"
  />
  {#if amount !== undefined}
    <span class="font-semibold leading-none">{amount}</span>
  {/if}
  {#if label}
    <span class="leading-none">{label}</span>
  {/if}
</span>
