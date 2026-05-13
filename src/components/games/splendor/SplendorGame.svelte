<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import TokenUsageBadge from '@/components/ai/TokenUsageBadge.svelte';
  import { getProvider, listProviders } from '@/lib/ai';
  import type { ProviderId, TokenUsage } from '@/lib/ai';
  import { createGameLoop, type GameLoop, type LoopSnapshot } from '@/lib/games/shared/loop';
  import { createRng } from '@/lib/games/shared/rng';
  import type { AIPlayerConfig } from '@/lib/games/shared/types';
  import { splendorAdapter } from '@/lib/games/splendor/ai-adapter';
  import {
    boardKey,
    deckKey,
    GEMS,
    type BonusSet,
    type Card,
    type Gem,
    type GemOrGold,
    type Noble,
    type SplendorMove,
    type SplendorState,
    type Tier,
    type TokenSet,
  } from '@/lib/games/splendor/state';
  import {
    getStoredKeys,
    hasProviderCredentials,
    providerEndpointFor,
    selectedModelFor,
    type StoredKeys,
  } from '@/lib/storage/keys';

  type Modal = 'gold' | 'discard' | 'noble' | null;

  const providers = listProviders();
  const gemLabels: Record<GemOrGold, string> = {
    emerald: 'Emerald',
    sapphire: 'Sapphire',
    ruby: 'Ruby',
    diamond: 'Diamond',
    onyx: 'Onyx',
    gold: 'Gold',
  };
  const gemClasses: Record<GemOrGold, string> = {
    emerald: 'border-emerald-400/70 bg-emerald-400/15 text-emerald-100',
    sapphire: 'border-sky-400/70 bg-sky-400/15 text-sky-100',
    ruby: 'border-rose-400/70 bg-rose-400/15 text-rose-100',
    diamond: 'border-stone-200/70 bg-stone-200/15 text-stone-100',
    onyx: 'border-zinc-500 bg-zinc-900 text-zinc-100',
    gold: 'border-amber-300/80 bg-amber-300/15 text-amber-100',
  };

  let keys: StoredKeys = {};
  let loop: GameLoop<SplendorState, SplendorMove> | undefined;
  let snapshot: LoopSnapshot<SplendorState, SplendorMove> | undefined;
  let unsubscribe: (() => void) | undefined;
  let playerCount = 2;
  let seed = 'splendor-table';
  let selectedGems: Gem[] = [];
  let pendingMove: SplendorMove | undefined;
  let activeModal: Modal = null;
  let discardDraft: Partial<Record<GemOrGold, number>> = {};
  let goldDraft: Partial<Record<Gem, number>> = {};
  let nobleDraft = '';
  let message = '';
  let aiController: ReturnType<typeof createAbortController> | undefined;

  $: state = snapshot?.state;
  $: currentPlayer = snapshot?.currentPlayer ?? 0;
  $: legalMoves = state ? splendorAdapter.legalMoves(state, currentPlayer) : [];
  $: selectedProvider =
    providers.find((provider) => provider.id === keys.selectedProvider) ??
    providers[0];
  $: configured = selectedProvider
    ? hasProviderCredentials(selectedProvider.id, keys)
    : false;
  $: selectedModel = selectedProvider
    ? selectedModelFor(selectedProvider.id, keys)
    : '';
  $: aiPlayerIndexes = Array.from(
    { length: Math.max(0, playerCount - 1) },
    (_, index) => index + 1,
  );
  $: lastUsage = snapshot?.log.at(-1)?.usage;
  $: takeMove = findTakeMove(selectedGems);
  $: discardTotal = tokenTotal(discardDraft);
  $: pendingProjectedTokens =
    state && pendingMove ? projectedTokensAfter(state, pendingMove) : undefined;
  $: discardNeeded = pendingProjectedTokens
    ? Math.max(0, tokenTotal(pendingProjectedTokens) - 10)
    : 0;

  function refreshKeys() {
    keys = getStoredKeys();
  }

  function createAbortController() {
    return new globalThis.AbortController();
  }

  function aiConfigs(): Record<number, AIPlayerConfig> {
    if (!selectedProvider || !configured) {
      return {};
    }

    const providerId = selectedProvider.id as ProviderId;
    const ai: AIPlayerConfig = {
      provider: getProvider(providerId),
      model: selectedModel,
      apiKey: keys[providerId],
      endpointUrl: providerEndpointFor(providerId, keys),
      temperature: 0.2,
      maxTokens: 500,
    };

    return Object.fromEntries(aiPlayerIndexes.map((player) => [player, ai]));
  }

  function startGame() {
    unsubscribe?.();
    aiController?.abort();
    selectedGems = [];
    pendingMove = undefined;
    activeModal = null;
    message = '';

    const initialState = splendorAdapter.init({
      seed: seed.trim() || 'splendor-table',
      playerCount,
      aiPlayerIndices: aiPlayerIndexes,
    });
    loop = createGameLoop({
      adapter: splendorAdapter,
      initialState,
      aiPlayers: aiConfigs(),
      rng: createRng(`${seed}:splendor-ui`),
    });
    unsubscribe = loop.subscribe((next) => {
      snapshot = next;
    });
    void runAI();
  }

  async function runAI() {
    if (!loop || !selectedProvider || !configured) {
      return;
    }

    const current = loop.getSnapshot();
    if (current.status === 'thinking') {
      return;
    }

    const player = current.currentPlayer;
    if (!aiPlayerIndexes.includes(player) || current.status === 'terminal') {
      return;
    }

    aiController = createAbortController();
    try {
      await loop.runUntilBlocked(aiController.signal);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        message = 'AI move aborted.';
      } else {
        message =
          error instanceof Error ? error.message : 'AI move failed unexpectedly.';
      }
    } finally {
      aiController = undefined;
    }
  }

  function abortAI() {
    aiController?.abort();
  }

  function findTakeMove(gems: Gem[]): SplendorMove | undefined {
    const normalized = normalizeGemSelection(gems);
    if (gems.length === 0) {
      return undefined;
    }

    return legalMoves.find(
      (move) =>
        move.kind === 'take' &&
        move.gems.length === normalized.length &&
        move.gems.every((gem, index) => gem === normalized[index]),
    );
  }

  function normalizeGemSelection(gems: Gem[]): Gem[] {
    return [...gems].sort((left, right) => GEMS.indexOf(left) - GEMS.indexOf(right));
  }

  function selectGem(gem: Gem) {
    if (!state || snapshot?.status === 'thinking') {
      return;
    }

    message = '';
    const sameGem = selectedGems.length === 1 && selectedGems[0] === gem;
    const next = sameGem
      ? [gem, gem]
      : selectedGems.includes(gem)
        ? selectedGems.filter((item) => item !== gem)
        : [...selectedGems, gem];

    selectedGems = normalizeGemSelection(next.length > 3 ? [gem] : next);
    if (!findTakeMove(selectedGems)) {
      selectedGems = [gem];
    }
  }

  function beginMove(move: SplendorMove) {
    if (!loop || !state || snapshot?.status === 'thinking') {
      return;
    }

    pendingMove = move;
    discardDraft = {};
    goldDraft = {};
    nobleDraft = '';
    message = '';

    const goldRange = move.kind === 'buy' ? goldRangesFor(state, move) : [];
    if (goldRange.some((range) => range.max > 0)) {
      goldDraft = Object.fromEntries(
        goldRange.map((range) => [range.gem, range.min]),
      );
      activeModal = 'gold';
      return;
    }

    continuePendingMove();
  }

  function continuePendingMove() {
    if (!state || !pendingMove) {
      return;
    }

    const nobles = eligibleNoblesAfter(state, pendingMove);
    if (nobles.length > 1 && !pendingMove.noble) {
      nobleDraft = nobles[0].id;
      activeModal = 'noble';
      return;
    }

    const projected = projectedTokensAfter(state, pendingMove);
    if (tokenTotal(projected) > 10 && !pendingMove.discard) {
      activeModal = 'discard';
      return;
    }

    playPendingMove();
  }

  function confirmGold() {
    if (!pendingMove || pendingMove.kind !== 'buy' || !state) {
      return;
    }

    const ranges = goldRangesFor(state, pendingMove);
    const totalGold = tokenTotal(goldDraft);
    const availableGold = state.players[currentPlayer].tokens.gold;
    const invalid = ranges.some((range) => {
      const amount = goldDraft[range.gem] ?? 0;
      return amount < range.min || amount > range.max;
    });

    if (invalid || totalGold > availableGold) {
      message = 'Gold allocation does not match the card cost.';
      return;
    }

    pendingMove.goldUsedFor = { ...goldDraft };
    activeModal = null;
    continuePendingMove();
  }

  function confirmNoble() {
    if (!pendingMove) {
      return;
    }

    pendingMove.noble = nobleDraft;
    activeModal = null;
    continuePendingMove();
  }

  function confirmDiscard() {
    if (!pendingMove || !pendingProjectedTokens) {
      return;
    }

    const invalid = ([...GEMS, 'gold'] as const).some(
      (gem) => (discardDraft[gem] ?? 0) > pendingProjectedTokens[gem],
    );
    if (invalid || discardTotal !== discardNeeded) {
      message = `Discard exactly ${discardNeeded} token${discardNeeded === 1 ? '' : 's'}.`;
      return;
    }

    pendingMove.discard = { ...discardDraft };
    activeModal = null;
    playPendingMove();
  }

  function playPendingMove() {
    if (!loop || !pendingMove) {
      return;
    }

    try {
      loop.playHumanMove(pendingMove);
      selectedGems = [];
      pendingMove = undefined;
      activeModal = null;
      void runAI();
    } catch (error) {
      message = error instanceof Error ? error.message : 'Move could not be played.';
    }
  }

  function cancelModal() {
    activeModal = null;
    pendingMove = undefined;
    discardDraft = {};
    goldDraft = {};
    nobleDraft = '';
  }

  function adjustDiscard(gem: GemOrGold, delta: number) {
    if (!pendingProjectedTokens) {
      return;
    }

    const current = discardDraft[gem] ?? 0;
    const next = Math.max(0, Math.min(pendingProjectedTokens[gem], current + delta));
    discardDraft = { ...discardDraft, [gem]: next };
  }

  function adjustGold(gem: Gem, delta: number) {
    if (!state || !pendingMove || pendingMove.kind !== 'buy') {
      return;
    }

    const range = goldRangesFor(state, pendingMove).find((item) => item.gem === gem);
    if (!range) {
      return;
    }

    const current = goldDraft[gem] ?? range.min;
    const next = Math.max(range.min, Math.min(range.max, current + delta));
    goldDraft = { ...goldDraft, [gem]: next };
  }

  function tokenTotal(tokens: Partial<Record<GemOrGold, number>>): number {
    return Object.values(tokens).reduce((sum, value) => sum + (value ?? 0), 0);
  }

  function costValue(card: Card, gem: Gem): number {
    return card.cost[gem] ?? 0;
  }

  function findCard(current: SplendorState, move: SplendorMove): Card | undefined {
    if (move.kind !== 'buy') {
      return undefined;
    }

    if (move.source === 'reserved') {
      return current.players[currentPlayer].reserved.find(
        (card) => card.id === move.cardId,
      );
    }

    return ([1, 2, 3] as const)
      .flatMap((tier) => current.board[boardKey(tier)])
      .find((card): card is Card => card?.id === move.cardId);
  }

  function goldRangesFor(current: SplendorState, move: Extract<SplendorMove, { kind: 'buy' }>) {
    const card = findCard(current, move);
    const player = current.players[currentPlayer];
    if (!card) {
      return [];
    }

    return GEMS.map((gem) => {
      const remaining = Math.max(0, costValue(card, gem) - player.bonuses[gem]);
      return {
        gem,
        remaining,
        min: Math.max(0, remaining - player.tokens[gem]),
        max: Math.min(remaining, player.tokens.gold),
      };
    }).filter((range) => range.remaining > 0);
  }

  function projectedTokensAfter(current: SplendorState, move: SplendorMove): TokenSet {
    const tokens = { ...current.players[currentPlayer].tokens };

    if (move.kind === 'take') {
      for (const gem of move.gems) {
        tokens[gem] += 1;
      }
      return tokens;
    }

    if (move.kind === 'reserve') {
      if (current.tokenPool.gold > 0) {
        tokens.gold += 1;
      }
      return tokens;
    }

    const card = findCard(current, move);
    if (!card) {
      return tokens;
    }

    for (const gem of GEMS) {
      const remaining = Math.max(0, costValue(card, gem) - current.players[currentPlayer].bonuses[gem]);
      const goldForGem =
        move.goldUsedFor?.[gem] ?? Math.max(0, remaining - tokens[gem]);
      tokens[gem] -= remaining - goldForGem;
      tokens.gold -= goldForGem;
    }

    return tokens;
  }

  function projectedBonusesAfter(current: SplendorState, move: SplendorMove): BonusSet {
    const bonuses = { ...current.players[currentPlayer].bonuses };
    if (move.kind === 'buy') {
      const card = findCard(current, move);
      if (card) {
        bonuses[card.bonus] += 1;
      }
    }
    return bonuses;
  }

  function eligibleNoblesAfter(current: SplendorState, move: SplendorMove): Noble[] {
    const bonuses = projectedBonusesAfter(current, move);
    return current.noblesInPlay.filter((noble) =>
      GEMS.every((gem) => bonuses[gem] >= (noble.cost[gem] ?? 0)),
    );
  }

  function legalBuy(card: Card, source: 'board' | 'reserved') {
    return legalMoves.find(
      (move) =>
        move.kind === 'buy' && move.source === source && move.cardId === card.id,
    );
  }

  function legalReserve(card: Card) {
    return legalMoves.find(
      (move) =>
        move.kind === 'reserve' &&
        move.source === 'board' &&
        move.cardId === card.id,
    );
  }

  function legalReserveDeck(tier: Tier) {
    return legalMoves.find(
      (move) => move.kind === 'reserve' && move.source === 'deck' && move.tier === tier,
    );
  }

  function formatMove(move: SplendorMove): string {
    if (move.kind === 'take') {
      return `Take ${move.gems.map((gem) => gemLabels[gem]).join(', ')}`;
    }
    if (move.kind === 'reserve') {
      return move.source === 'deck'
        ? `Reserve blind tier ${move.tier}`
        : `Reserve ${move.cardId}`;
    }
    return `Buy ${move.cardId}`;
  }

  onMount(() => {
    refreshKeys();
    window.addEventListener('storage', refreshKeys);
    window.addEventListener('byok-keys-changed', refreshKeys);
    startGame();
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', refreshKeys);
      window.removeEventListener('byok-keys-changed', refreshKeys);
    }
    unsubscribe?.();
    aiController?.abort();
  });
</script>

{#if state}
  <section class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-semibold tracking-normal text-white">Splendor</h1>
        <p class="mt-1 text-sm text-neutral-400">
          Turn {state.turn + 1}, player {currentPlayer + 1}
          {state.finalRoundTriggered ? ' - final round' : ''}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-xs text-neutral-400">
          Players
          <select
            class="ml-2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            bind:value={playerCount}
            disabled={snapshot?.status === 'thinking'}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label class="text-xs text-neutral-400">
          Seed
          <input
            class="ml-2 w-36 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
            bind:value={seed}
            disabled={snapshot?.status === 'thinking'}
          />
        </label>
        <button
          class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500"
          type="button"
          on:click={startGame}
          disabled={snapshot?.status === 'thinking'}
        >
          New game
        </button>
      </div>
    </div>

    {#if !configured}
      <div class="mb-4 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
        Configure a provider in settings to let players 2-{playerCount} take AI turns.
        Until then, the board still accepts local human moves.
      </div>
    {/if}

    {#if snapshot?.warning || message}
      <div class="mb-4 rounded-md border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
        {message || snapshot?.warning}
      </div>
    {/if}

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <TokenUsageBadge
        lastUsage={lastUsage as TokenUsage | undefined}
        totalUsage={snapshot?.totalUsage ?? { input: 0, output: 0 }}
      />
      {#if snapshot?.status === 'thinking'}
        <div class="flex items-center gap-3 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
          <span>Player {currentPlayer + 1} thinking with {selectedProvider.label} ({selectedModel})</span>
          <button
            class="rounded-md border border-sky-300/50 px-2 py-1 text-xs hover:bg-sky-300/10"
            type="button"
            on:click={abortAI}
          >
            Abort
          </button>
        </div>
      {/if}
    </div>

    <div class="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div class="space-y-5">
        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-4">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-lg font-semibold tracking-normal">Nobles</h2>
            <span class="text-xs text-neutral-500">{state.noblesInPlay.length} available</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each state.noblesInPlay as noble (noble.id)}
              <article class="rounded-md border border-amber-300/40 bg-neutral-900 p-3">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-amber-100">{noble.id}</span>
                  <span class="text-sm text-amber-200">{noble.prestige} prestige</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  {#each GEMS as gem (gem)}
                    {#if noble.cost[gem]}
                      <span class={`rounded-full border px-2 py-1 text-xs ${gemClasses[gem]}`}>
                        {gemLabels[gem]} {noble.cost[gem]}
                      </span>
                    {/if}
                  {/each}
                </div>
              </article>
            {/each}
          </div>
        </section>

        <section class="space-y-4">
          {#each [3, 2, 1] as tier (tier)}
            <div class="rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-semibold tracking-normal">Tier {tier}</h2>
                <button
                  class="rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600 {legalReserveDeck(tier as Tier) ? 'border-amber-300/60 text-amber-100 hover:bg-amber-300/10' : 'border-neutral-800 text-neutral-600'}"
                  type="button"
                  disabled={!legalReserveDeck(tier as Tier) || snapshot?.status === 'thinking'}
                  on:click={() => {
                    const move = legalReserveDeck(tier as Tier);
                    if (move) beginMove(move);
                  }}
                >
                  Reserve deck ({state.decks[deckKey(tier as Tier)].length})
                </button>
              </div>
              <div class="grid gap-3 md:grid-cols-4">
                {#each state.board[boardKey(tier as Tier)] as card, cardIndex (card?.id ?? `${tier}-${cardIndex}`)}
                  {#if card}
                    <article
                      class="min-h-56 rounded-md border bg-neutral-900 p-3 {legalBuy(card, 'board') || legalReserve(card) ? 'border-emerald-400/50' : 'border-neutral-800'}"
                    >
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
                      <div class="mt-4 flex flex-wrap gap-2">
                        {#each GEMS as gem (gem)}
                          {#if card.cost[gem]}
                            <span class={`rounded-full border px-2 py-1 text-xs ${gemClasses[gem]}`}>
                              {gemLabels[gem]} {card.cost[gem]}
                            </span>
                          {/if}
                        {/each}
                      </div>
                      <div class="mt-4 flex flex-wrap gap-2">
                        <button
                          class="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
                          type="button"
                          disabled={!legalBuy(card, 'board') || snapshot?.status === 'thinking'}
                          on:click={() => {
                            const move = legalBuy(card, 'board');
                            if (move) beginMove(move);
                          }}
                        >
                          Buy
                        </button>
                        <button
                          class="rounded-md border border-amber-300/60 px-3 py-1.5 text-sm text-amber-100 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
                          type="button"
                          disabled={!legalReserve(card) || snapshot?.status === 'thinking'}
                          on:click={() => {
                            const move = legalReserve(card);
                            if (move) beginMove(move);
                          }}
                        >
                          Reserve
                        </button>
                      </div>
                    </article>
                  {:else}
                    <div class="min-h-56 rounded-md border border-dashed border-neutral-800 bg-neutral-950"></div>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </section>
      </div>

      <aside class="space-y-5">
        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-4">
          <h2 class="text-lg font-semibold tracking-normal">Token Supply</h2>
          <div class="mt-3 grid grid-cols-2 gap-2">
            {#each GEMS as gem (gem)}
              <button
                class={`rounded-md border px-3 py-3 text-left ${gemClasses[gem]} disabled:cursor-not-allowed disabled:opacity-40`}
                type="button"
                disabled={state.tokenPool[gem] === 0 || snapshot?.status === 'thinking'}
                on:click={() => selectGem(gem)}
              >
                <span class="block text-sm font-medium">{gemLabels[gem]}</span>
                <span class="text-xs opacity-80">Supply {state.tokenPool[gem]}</span>
              </button>
            {/each}
            <div class={`rounded-md border px-3 py-3 ${gemClasses.gold}`}>
              <span class="block text-sm font-medium">Gold</span>
              <span class="text-xs opacity-80">Supply {state.tokenPool.gold}</span>
            </div>
          </div>
          <div class="mt-4 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <div class="text-sm text-neutral-300">
              {selectedGems.length ? selectedGems.map((gem) => gemLabels[gem]).join(', ') : 'Select tokens to take'}
            </div>
            <button
              class="mt-3 w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
              type="button"
              disabled={!takeMove || snapshot?.status === 'thinking'}
              on:click={() => {
                if (takeMove) beginMove(takeMove);
              }}
            >
              {takeMove ? formatMove(takeMove) : 'No legal take selected'}
            </button>
          </div>
        </section>

        <section class="space-y-3">
          {#each state.players as player, index (index)}
            <article class="rounded-md border {index === currentPlayer ? 'border-emerald-400/60' : 'border-neutral-800'} bg-neutral-950 p-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-semibold tracking-normal">Player {index + 1}</h2>
                <span class="text-sm text-neutral-300">{player.prestige} prestige</span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                {#each [...GEMS, 'gold'] as gem (gem)}
                  <span class={`rounded-full border px-2 py-1 text-xs ${gemClasses[gem]}`}>
                    {gemLabels[gem]} {player.tokens[gem]}
                  </span>
                {/each}
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                {#each GEMS as gem (gem)}
                  <span class={`rounded-full border px-2 py-1 text-xs ${gemClasses[gem]}`}>
                    +{player.bonuses[gem]} {gemLabels[gem]}
                  </span>
                {/each}
              </div>
              <div class="mt-3 text-xs text-neutral-500">
                Cards {player.cards.length} - Reserved {player.reserved.length} - Nobles {player.nobles.length}
              </div>
              {#if player.reserved.length}
                <div class="mt-3 space-y-2">
                  {#each player.reserved as card (card.id)}
                    <div class="rounded-md border border-neutral-800 bg-neutral-900 p-2">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-sm text-neutral-200">{card.id}</span>
                        {#if index === currentPlayer}
                          <button
                            class="rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
                            type="button"
                            disabled={!legalBuy(card, 'reserved') || snapshot?.status === 'thinking'}
                            on:click={() => {
                              const move = legalBuy(card, 'reserved');
                              if (move) beginMove(move);
                            }}
                          >
                            Buy
                          </button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
        </section>
      </aside>
    </div>
  </section>
{/if}

{#if activeModal === 'gold' && pendingMove?.kind === 'buy' && state}
  <div class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4">
    <div class="w-full max-w-lg rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl">
      <h2 class="text-xl font-semibold tracking-normal">Allocate Gold</h2>
      <div class="mt-4 space-y-3">
        {#each goldRangesFor(state, pendingMove) as range (range.gem)}
          <div class="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <span class="text-sm text-neutral-200">{gemLabels[range.gem]}</span>
            <div class="flex items-center gap-2">
              <button class="rounded-md border border-neutral-700 px-2 py-1" type="button" on:click={() => adjustGold(range.gem, -1)}>-</button>
              <span class="w-8 text-center">{goldDraft[range.gem] ?? range.min}</span>
              <button class="rounded-md border border-neutral-700 px-2 py-1" type="button" on:click={() => adjustGold(range.gem, 1)}>+</button>
            </div>
          </div>
        {/each}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="rounded-md border border-neutral-700 px-3 py-2 text-sm" type="button" on:click={cancelModal}>Cancel</button>
        <button class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950" type="button" on:click={confirmGold}>Confirm</button>
      </div>
    </div>
  </div>
{/if}

{#if activeModal === 'noble' && pendingMove && state}
  <div class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4">
    <div class="w-full max-w-lg rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl">
      <h2 class="text-xl font-semibold tracking-normal">Choose Noble</h2>
      <div class="mt-4 space-y-2">
        {#each eligibleNoblesAfter(state, pendingMove) as noble (noble.id)}
          <label class="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <span>{noble.id}</span>
            <input type="radio" bind:group={nobleDraft} value={noble.id} />
          </label>
        {/each}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="rounded-md border border-neutral-700 px-3 py-2 text-sm" type="button" on:click={cancelModal}>Cancel</button>
        <button class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950" type="button" on:click={confirmNoble}>Confirm</button>
      </div>
    </div>
  </div>
{/if}

{#if activeModal === 'discard' && pendingProjectedTokens}
  <div class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4">
    <div class="w-full max-w-lg rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl">
      <h2 class="text-xl font-semibold tracking-normal">Discard Tokens</h2>
      <p class="mt-1 text-sm text-neutral-400">Discard {discardNeeded} token{discardNeeded === 1 ? '' : 's'} to return to 10.</p>
      <div class="mt-4 space-y-3">
        {#each [...GEMS, 'gold'] as gem (gem)}
          <div class="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <span class="text-sm text-neutral-200">{gemLabels[gem]} ({pendingProjectedTokens[gem]})</span>
            <div class="flex items-center gap-2">
              <button class="rounded-md border border-neutral-700 px-2 py-1" type="button" on:click={() => adjustDiscard(gem, -1)}>-</button>
              <span class="w-8 text-center">{discardDraft[gem] ?? 0}</span>
              <button class="rounded-md border border-neutral-700 px-2 py-1" type="button" on:click={() => adjustDiscard(gem, 1)}>+</button>
            </div>
          </div>
        {/each}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="rounded-md border border-neutral-700 px-3 py-2 text-sm" type="button" on:click={cancelModal}>Cancel</button>
        <button
          class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
          type="button"
          disabled={discardTotal !== discardNeeded}
          on:click={confirmDiscard}
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}

{#if snapshot?.status === 'terminal' && state}
  <div class="fixed inset-0 z-10 flex items-center justify-center bg-neutral-950/80 px-4">
    <div class="w-full max-w-xl rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl">
      <h2 class="text-xl font-semibold tracking-normal">Game Over</h2>
      <p class="mt-1 text-sm text-neutral-400">
        {snapshot.winner === null ? 'Shared victory' : `Player ${snapshot.winner + 1} wins`}
      </p>
      <div class="mt-4 space-y-2">
        {#each state.players as player, index (index)}
          <div class="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 p-3">
            <span>Player {index + 1}</span>
            <span>{player.prestige} prestige - {player.cards.length} cards</span>
          </div>
        {/each}
      </div>
      <div class="mt-5 flex justify-end">
        <button class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950" type="button" on:click={startGame}>New game</button>
      </div>
    </div>
  </div>
{/if}
