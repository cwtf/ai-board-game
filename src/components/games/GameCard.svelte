<script lang="ts">
  import type { GameMeta } from '@/lib/games/registry';

  export let game: GameMeta;
  export let canPlay = false;

  $: playerCount =
    game.minPlayers === game.maxPlayers
      ? `${game.minPlayers} players`
      : `${game.minPlayers}-${game.maxPlayers} players`;
</script>

<article
  class="flex min-h-64 flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-5"
>
  <div class="flex items-start justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold tracking-normal text-white">
        {game.name}
      </h2>
      <p class="mt-1 text-sm text-neutral-400">{playerCount}</p>
    </div>
    <span
      class={`rounded-full border px-2.5 py-1 text-xs ${
        game.hiddenInformation
          ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
          : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
      }`}
    >
      {game.hiddenInformation ? 'Hidden info' : 'Open info'}
    </span>
  </div>

  <p class="mt-5 flex-1 text-sm leading-6 text-neutral-300">
    {game.description}
  </p>

  <div class="mt-5 text-xs text-neutral-500">
    Estimated AI turn: ~{game.estimatedAITurnTokens} tokens
  </div>

  <div class="mt-5 flex flex-wrap gap-3">
    {#if canPlay}
      <a
        class="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        href={`/${game.id}`}
      >
        Play
      </a>
    {:else}
      <button
        class="cursor-not-allowed rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400"
        type="button"
        disabled
        title="Set up your AI key first"
      >
        Play
      </button>
    {/if}
    <a
      class="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500"
      href={`/${game.docPath}`}
      target="_blank"
      rel="noreferrer"
    >
      View rules
    </a>
  </div>
</article>
