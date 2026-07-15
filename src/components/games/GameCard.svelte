<script lang="ts">
  import type { GameMeta } from '@/lib/games/registry';

  export let game: GameMeta;

  $: playerCount =
    game.minPlayers === game.maxPlayers
      ? `${game.minPlayers} players`
      : `${game.minPlayers}-${game.maxPlayers} players`;
  $: rulesHref = /^https?:\/\//.test(game.docPath)
    ? game.docPath
    : `/${game.docPath}`;
  $: videoHref = game.videoPath
    ? /^https?:\/\//.test(game.videoPath)
      ? game.videoPath
      : `/${game.videoPath}`
    : '';
  $: implemented =
    game.id === 'splendor' ||
    game.id === 'secret-hitler' ||
    game.id === 'jungle-chess' ||
    game.id === 'chinese-chess' ||
    game.id === 'chess' ||
    game.id === 'exploding-kittens';
  $: playable = implemented;
  $: accent = game.accent ?? '#34d399';
</script>

<article
  class="game-card relative flex min-h-60 flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80 p-5 transition-all duration-200 hover:-translate-y-1"
  style={`--accent: ${accent}`}
>
  <div
    class="pointer-events-none absolute inset-x-0 top-0 h-1 opacity-70"
    style={`background: linear-gradient(90deg, ${accent}, transparent 70%)`}
  ></div>

  <div class="flex items-start justify-between gap-3">
    <h2 class="text-xl font-semibold tracking-normal text-white">
      {game.name}
    </h2>
    <span
      class="mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs text-neutral-400"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="7" r="4" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
      </svg>
      {playerCount}
    </span>
  </div>

  <p class="mt-4 flex-1 text-sm leading-6 text-neutral-300">
    {game.description}
  </p>

  <div
    class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500"
  >
    {#if game.hasLocalBots}
      <span
        class="inline-flex items-center gap-1"
        title="Playable offline with built-in bots; no API key needed"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="5" width="14" height="14" rx="1" />
          <rect x="9" y="9" width="6" height="6" />
          <path
            d="M3 10h2M3 14h2M10 3v2M14 3v2M21 10h-2M21 14h-2M10 21v-2M14 21v-2"
          />
        </svg>
        Local bots
      </span>
    {:else}
      <span
        class="inline-flex items-center gap-1 text-amber-500/90"
        title="AI seats need a provider API key configured in settings"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="15" r="4" />
          <path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
        </svg>
        API key needed
      </span>
    {/if}
    <span
      class="inline-flex items-center gap-1"
      title={game.hiddenInformation
        ? 'Players hold hidden information (hands, roles)'
        : 'All game information is visible to every player'}
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0-4 0" />
        <path
          d="M21 12c-2.4 4-5.4 6-9 6c-3.6 0-6.6-2-9-6c2.4-4 5.4-6 9-6c3.6 0 6.6 2 9 6"
        />
        {#if game.hiddenInformation}
          <path d="M3 3l18 18" />
        {/if}
      </svg>
      {game.hiddenInformation ? 'Hidden info' : 'Open info'}
    </span>
    <span
      class="inline-flex items-center gap-1"
      title="Estimated tokens per AI turn"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M13 3v7h6l-8 11v-7H5l8-11" />
      </svg>
      ~{game.estimatedAITurnTokens} tok/turn
    </span>
  </div>

  <div class="mt-5 flex flex-wrap items-center gap-4">
    {#if playable}
      <a
        class="rounded-md bg-emerald-500 px-5 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
        href={`/${game.id}`}
      >
        Play
      </a>
    {:else}
      <button
        class="cursor-not-allowed rounded-md bg-neutral-700 px-5 py-2 text-sm font-medium text-neutral-400"
        type="button"
        disabled
        title="Coming soon"
      >
        Coming Soon
      </button>
    {/if}
    <a
      class="text-sm text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline"
      href={rulesHref}
      target="_blank"
      rel="noreferrer"
    >
      Rules
    </a>
    {#if videoHref}
      <a
        class="text-sm text-neutral-400 underline-offset-4 hover:text-neutral-200 hover:underline"
        href={videoHref}
        target="_blank"
        rel="noreferrer"
      >
        Video (3 min)
      </a>
    {/if}
  </div>
</article>

<style>
  .game-card:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    box-shadow: 0 12px 32px -16px
      color-mix(in srgb, var(--accent) 55%, transparent);
  }
</style>
