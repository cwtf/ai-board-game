<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { backOut, cubicIn } from 'svelte/easing';
  import TokenUsageBadge from '@/components/ai/TokenUsageBadge.svelte';
  import SettingsPanel from '@/components/ai/SettingsPanel.svelte';
  import ExplodingKittens3DView from '@/components/games/exploding-kittens/ExplodingKittens3DView.svelte';
  import { getProvider } from '@/lib/ai';
  import type { ProviderId } from '@/lib/ai';
  import {
    aiControlledSeatIndexes,
    HUMAN_SEAT_ID,
    normalizeSeatSelections,
    type LocalAISeatOption,
    type SeatSelections,
  } from '@/lib/games/shared/ai-seats';
  import {
    createGameLoop,
    type GameLoop,
    type LoopSnapshot,
  } from '@/lib/games/shared/loop';
  import { createRng } from '@/lib/games/shared/rng';
  import { hashWithSeed, seedFromHash } from '@/lib/games/shared/seed-url';
  import type { AIPlayerConfig, MoveRecord } from '@/lib/games/shared/types';
  import { explodingKittensAdapter } from '@/lib/games/exploding-kittens/ai-adapter';
  import { chooseEKBotMove } from '@/lib/games/exploding-kittens/bot';
  import {
    CARD_COLORS,
    CARD_LABELS,
    ALL_NAMED_KINDS,
    type CardKind,
    type EKMove,
    type EKState,
  } from '@/lib/games/exploding-kittens/state';
  import {
    getStoredKeys,
    hasProviderCredentials,
    providerEndpointFor,
    selectedProfileFor,
    type ProviderModelProfile,
    type StoredKeys,
  } from '@/lib/storage/keys';

  type Modal =
    | null
    | 'defuse'
    | 'give_favor'
    | 'favor_target'
    | 'cat_pair_select'
    | 'three_kind'
    | 'five_diff_pick'
    | 'five_diff'
    | 'nope_prompt';

  const LOCAL_BOT_PROFILE = '__ek_local_bot__';
  const localBotSeatOptions: LocalAISeatOption[] = [
    { id: LOCAL_BOT_PROFILE, label: 'Local bot' },
  ];
  const HUMAN_PLAYER_INDEX = 0;
  const CARD_EMOJI: Record<CardKind, string> = {
    defuse: '🔒',
    exploding: '💥',
    attack: '⚡',
    skip: '⏭',
    favor: '⭐',
    shuffle: '🔀',
    see_future: '👁',
    nope: '🚫',
    cat_tacocat: '🌮',
    cat_potato: '🥔',
    cat_cattermelon: '🍉',
    cat_beard: '🧔',
    cat_rainbow: '🌈',
  };

  let keys: StoredKeys = {};
  let loop: GameLoop<EKState, EKMove> | undefined;
  let unsubscribe: (() => void) | undefined;
  let playerCount = 3;
  let seed =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'kittens-table';
  let snapshot: LoopSnapshot<EKState, EKMove> | undefined = buildInitialSnapshot();
  let activeModal: Modal = null;
  let defusePosition = 0;
  let selectedCardForPlay: { kind: CardKind; handIndex: number } | null = null;
  let selectedCatKind: CardKind | null = null;
  let threeKindCard: CardKind | null = null;
  let threeKindTarget: number | null = null;
  let fiveDiffSelectedCards: CardKind[] = [];

  // Flying card animation overlay
  let view3D: { getScreenPositions(): { deck: { x: number; y: number }; discard: { x: number; y: number } } };
  interface FlyingCard { id: number; kind: CardKind | null; sx: number; sy: number; ex: number; ey: number; }
  let flyingCards: FlyingCard[] = [];
  let flyCardCounter = 0;

  function spawnFlyCard(kind: CardKind | null, sx: number, sy: number, ex: number, ey: number) {
    flyingCards = [...flyingCards, { id: flyCardCounter++, kind, sx, sy, ex, ey }];
  }

  function flyCardAction(node: HTMLElement, fc: FlyingCard) {
    const dx = fc.ex - fc.sx, dy = fc.ey - fc.sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const arc = -Math.min(dist * 0.28, 130);
    const rot = fc.kind === null ? -12 : 8;
    const anim = node.animate(
      [
        { transform: 'translate(0px,0px) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${dx/2}px,${dy/2 + arc}px) rotate(${rot/2}deg) scale(0.92)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(0.8)`, opacity: 0.15 },
      ],
      { duration: fc.kind === null ? 520 : 400, easing: 'ease-in-out', fill: 'forwards' },
    );
    anim.onfinish = () => { flyingCards = flyingCards.filter((c) => c.id !== fc.id); };
    return { destroy() { anim.cancel(); } };
  }

  function getPlayedCardKind(move: EKMove): CardKind | null {
    if (move.kind === 'play_single') return move.card;
    if (move.kind === 'play_favor') return 'favor';
    if (move.kind === 'play_cat_pair') return move.cardKind;
    if (move.kind === 'play_three_kind') return move.cardKind;
    if (move.kind === 'play_five_diff') return move.cards[0] ?? null;
    if (move.kind === 'nope') return 'nope';
    return null;
  }

  function getHandCardCenter(handIdx: number): { x: number; y: number } | null {
    if (typeof document === 'undefined') return null;
    const el = document.querySelector<HTMLElement>(`[data-hand-idx="${handIdx}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  let aiController: AbortController | undefined;
  let aiPaused = false;
  let gameOverDismissed = false;
  let moveLogOpen = false;
  let message = '';
  let seeFutureAcknowledged = false;
  let lastSeeFutureKey = '';
  let playerProfileSelections: SeatSelections = {
    [HUMAN_PLAYER_INDEX]: HUMAN_SEAT_ID,
  };

  function buildInitialSnapshot(): LoopSnapshot<EKState, EKMove> {
    const s = explodingKittensAdapter.init({ seed, playerCount, aiPlayerIndices: [] });
    return {
      state: s,
      status: 'idle',
      currentPlayer: 0,
      winner: null,
      log: [],
      totalUsage: { input: 0, output: 0 },
    };
  }

  $: state = snapshot?.state;
  $: currentPlayerIdx = snapshot?.currentPlayer ?? 0;
  $: humanCanAct =
    currentPlayerIdx === HUMAN_PLAYER_INDEX &&
    playerProfileSelections[HUMAN_PLAYER_INDEX] === HUMAN_SEAT_ID &&
    snapshot?.status !== 'thinking';
  $: legalMoves =
    state && humanCanAct
      ? explodingKittensAdapter.legalMoves(state, HUMAN_PLAYER_INDEX)
      : [];
  $: seeFutureCards = state?.knownTopN[HUMAN_PLAYER_INDEX] ?? null;
  $: showSeeFuture =
    seeFutureCards !== null && seeFutureCards.length > 0 && !seeFutureAcknowledged;
  $: selectedProfile = selectedProfileFor(keys);
  $: configuredProfiles = (keys.modelProfiles ?? []).filter((p) =>
    hasProviderCredentials(p.provider, keys),
  );
  $: defaultProfileId =
    configuredProfiles.find((p) => p.id === selectedProfile?.id)?.id ??
    configuredProfiles[0]?.id ??
    LOCAL_BOT_PROFILE;
  $: normalizePlayerProfileSelections(playerCount, defaultProfileId);
  $: aiPlayerIndexes = playerIndexesControlledByAI(playerProfileSelections);
  $: humanDelegated =
    playerProfileSelections[HUMAN_PLAYER_INDEX] !== HUMAN_SEAT_ID;
  $: gamePaused = humanDelegated && aiPaused;
  $: lastUsage = snapshot?.log.at(-1)?.usage;

  // Auto-open modals for sub-decisions that require human input
  $: if (humanCanAct && state?.pendingDefuse && activeModal !== 'defuse') {
    defusePosition = Math.floor((state.deck.length + 1) / 2);
    activeModal = 'defuse';
  }
  $: if (
    humanCanAct &&
    state?.pendingFavor?.to === HUMAN_PLAYER_INDEX &&
    activeModal !== 'give_favor'
  ) {
    activeModal = 'give_favor';
  }
  $: if (
    humanCanAct &&
    state?.pendingNope !== null &&
    activeModal !== 'nope_prompt'
  ) {
    activeModal = 'nope_prompt';
  }
  // Reset see-future acknowledgement when the card set changes (new peek)
  $: {
    const key = seeFutureCards ? seeFutureCards.join(',') : '';
    if (key && key !== lastSeeFutureKey) {
      lastSeeFutureKey = key;
      seeFutureAcknowledged = false;
    }
  }

  function refreshKeys() {
    keys = getStoredKeys();
  }

  function normalizePlayerProfileSelections(count: number, fallback: string) {
    const result = normalizeSeatSelections({
      playerCount: count,
      selections: playerProfileSelections,
      profileIds: configuredProfiles.map((p) => p.id),
      localSeatIds: localBotSeatOptions.map((o) => o.id),
      fallbackSeatId: fallback,
      humanSeatIndex: HUMAN_PLAYER_INDEX,
    });
    if (result.changed) {
      playerProfileSelections = result.selections;
      syncLoopAIPlayers();
    }
  }

  function playerIndexesControlledByAI(sel: SeatSelections): number[] {
    return aiControlledSeatIndexes({
      playerCount,
      selections: sel,
      profileIds: configuredProfiles.map((p) => p.id),
      localSeatIds: localBotSeatOptions.map((o) => o.id),
    });
  }

  function aiConfigForProfile(
    profile: ProviderModelProfile,
  ): AIPlayerConfig<EKState, EKMove> {
    return {
      provider: getProvider(profile.provider as ProviderId),
      model: profile.model,
      apiKey: keys[profile.provider as ProviderId],
      endpointUrl: providerEndpointFor(profile.provider as ProviderId, keys),
      temperature: 0.3,
      maxTokens: 300,
    };
  }

  function aiConfigForLocalBot(): AIPlayerConfig<EKState, EKMove> {
    return {
      kind: 'local',
      label: 'Local bot',
      model: 'local-bot',
      chooseMove({ state: s, player, legalMoves: moves, signal }) {
        if (signal?.aborted) {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          throw err;
        }
        return chooseEKBotMove(s, player, moves);
      },
    };
  }

  function aiConfigs(sel: SeatSelections = playerProfileSelections) {
    return Object.fromEntries(
      Array.from({ length: playerCount }, (_, i) => i).flatMap((pi) => {
        const id = sel[pi];
        if (id === HUMAN_SEAT_ID) return [];
        if (id === LOCAL_BOT_PROFILE) return [[pi, aiConfigForLocalBot()]];
        const profile = configuredProfiles.find((p) => p.id === id);
        return profile ? [[pi, aiConfigForProfile(profile)]] : [];
      }),
    );
  }

  function syncLoopAIPlayers() {
    loop?.setAIPlayers(aiConfigs());
  }

  function syncSeedHash(nextSeed: string) {
    const nextHash = hashWithSeed(globalThis.location?.hash ?? '', nextSeed);
    if (nextHash !== (globalThis.location?.hash ?? '')) {
      globalThis.history?.replaceState(null, '', nextHash || globalThis.location?.pathname);
    }
  }

  function selectPlayerProfile(playerIndex: number, profileId: string) {
    playerProfileSelections = { ...playerProfileSelections, [playerIndex]: profileId };
    selectedCardForPlay = null;
    activeModal = null;
    message = '';
    syncLoopAIPlayers();

    if (playerIndex === HUMAN_PLAYER_INDEX && profileId === HUMAN_SEAT_ID) {
      aiController?.abort();
      aiPaused = false;
      loop?.clearWarning();
      return;
    }
    if (playerIndex === HUMAN_PLAYER_INDEX && profileId !== HUMAN_SEAT_ID) {
      aiController?.abort();
      aiPaused = true;
      loop?.clearWarning();
      return;
    }
    if (profileId !== HUMAN_SEAT_ID && !aiPaused) {
      void runAI();
    }
  }

  function toggleAIPaused() {
    aiPaused = !aiPaused;
    message = '';
    if (aiPaused) { aiController?.abort(); return; }
    loop?.clearWarning();
    void runAI();
  }

  function startGame() {
    unsubscribe?.();
    aiController?.abort();
    seed =
      seed.trim() ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36));
    syncSeedHash(seed);
    selectedCardForPlay = null;
    activeModal = null;
    message = '';
    gameOverDismissed = false;
    moveLogOpen = false;
    seeFutureAcknowledged = false;
    normalizePlayerProfileSelections(playerCount, defaultProfileId);
    aiPaused = playerProfileSelections[HUMAN_PLAYER_INDEX] !== HUMAN_SEAT_ID;

    const initialState = explodingKittensAdapter.init({
      seed,
      playerCount,
      aiPlayerIndices: playerIndexesControlledByAI(playerProfileSelections),
    });
    loop = createGameLoop({
      adapter: explodingKittensAdapter,
      initialState,
      aiPlayers: aiConfigs(),
      rng: createRng(`${seed}:ek-ui`),
    });
    unsubscribe = loop.subscribe((next) => {
      snapshot = next;
    });
    void runAI();
  }

  async function runAI() {
    if (!loop || snapshot?.status === 'terminal') return;
    aiController?.abort();
    aiController = new AbortController();
    try {
      await loop.runUntilBlocked(aiController.signal);
    } catch {
      // aborted or provider error — already handled by loop
    }
  }

  function playMove(move: EKMove) {
    if (!loop || !humanCanAct) return;

    // Capture played card position before state mutates
    let playAnim: { kind: CardKind; sx: number; sy: number } | null = null;
    const playedKind = getPlayedCardKind(move);
    if (playedKind && state) {
      const handIdx = state.players[HUMAN_PLAYER_INDEX]!.hand.indexOf(playedKind);
      if (handIdx !== -1) {
        const center = getHandCardCenter(handIdx);
        if (center) playAnim = { kind: playedKind, ...center };
      }
    }

    try {
      loop.playHumanMove(move);
      selectedCardForPlay = null;
      activeModal = null;
      message = '';

      // Fly played card to discard pile
      if (playAnim) {
        const pos = view3D?.getScreenPositions();
        if (pos) spawnFlyCard(playAnim.kind, playAnim.sx, playAnim.sy, pos.discard.x, pos.discard.y);
      }
    } catch (e) {
      message = e instanceof Error ? e.message : 'Invalid move.';
    }
    void runAI();
  }

  function handleCardClick(cardKind: CardKind, handIndex: number) {
    if (!humanCanAct || !state) return;

    // If we're in give_favor, clicking the card IS the move
    if (activeModal === 'give_favor') {
      const m = legalMoves.find((mv) => mv.kind === 'give_favor' && mv.card === cardKind);
      if (m) playMove(m);
      return;
    }

    // Check what move options exist for this card
    const singleMove = legalMoves.find(
      (m) => m.kind === 'play_single' && m.card === cardKind,
    );
    const favorMoves = legalMoves.filter(
      (m) => m.kind === 'play_favor',
    );
    const catPairMoves = legalMoves.filter(
      (m) => m.kind === 'play_cat_pair' && m.cardKind === cardKind,
    );
    const threeKindMoves = legalMoves.filter(
      (m) => m.kind === 'play_three_kind' && m.cardKind === cardKind,
    );

    if (singleMove) {
      playMove(singleMove);
      return;
    }

    if (cardKind === 'favor' && favorMoves.length > 0) {
      selectedCardForPlay = { kind: cardKind, handIndex };
      activeModal = 'favor_target';
      return;
    }

    if (catPairMoves.length > 0) {
      selectedCardForPlay = { kind: cardKind, handIndex };
      selectedCatKind = cardKind;
      activeModal = 'cat_pair_select';
      return;
    }

    if (threeKindMoves.length > 0) {
      selectedCardForPlay = { kind: cardKind, handIndex };
      selectedCatKind = cardKind;
      threeKindTarget = null;
      threeKindCard = null;
      activeModal = 'three_kind';
      return;
    }

    const fiveDiffMoves = legalMoves.filter((m) => m.kind === 'play_five_diff');
    if (fiveDiffMoves.length > 0) {
      fiveDiffSelectedCards = [];
      activeModal = 'five_diff_pick';
      return;
    }

    message = 'No playable action for that card right now.';
  }

  async function handleDeckClick() {
    const draw = legalMoves.find((m) => m.kind === 'draw');
    if (!draw || !state) return;
    const deckPos = view3D?.getScreenPositions().deck;
    const handLenBefore = state.players[HUMAN_PLAYER_INDEX]!.hand.length;
    playMove(draw);
    if (deckPos) {
      await tick();
      const newLen = state?.players[HUMAN_PLAYER_INDEX]?.hand.length ?? 0;
      if (newLen > handLenBefore) {
        const dest = getHandCardCenter(newLen - 1);
        if (dest) spawnFlyCard(null, deckPos.x, deckPos.y, dest.x, dest.y);
      }
    }
  }

  function confirmFavorTarget(targetIndex: number) {
    const m = legalMoves.find(
      (mv) => mv.kind === 'play_favor' && mv.targetIndex === targetIndex,
    );
    if (m) playMove(m);
    else activeModal = null;
  }

  function confirmCatPairTarget(targetIndex: number) {
    if (!selectedCatKind) return;
    const m = legalMoves.find(
      (mv) =>
        mv.kind === 'play_cat_pair' &&
        mv.cardKind === selectedCatKind &&
        mv.targetIndex === targetIndex,
    );
    if (m) playMove(m);
    else activeModal = null;
  }

  function confirmThreeKind() {
    if (threeKindTarget === null || !threeKindCard || !selectedCatKind) return;
    const m = legalMoves.find(
      (mv) =>
        mv.kind === 'play_three_kind' &&
        mv.cardKind === selectedCatKind &&
        mv.targetIndex === threeKindTarget &&
        mv.namedCard === threeKindCard,
    );
    if (m) playMove(m);
    else activeModal = null;
  }

  function confirmFiveDiff(discardPick: CardKind) {
    playMove({
      id: `PLAY:five_diff:${discardPick}`,
      kind: 'play_five_diff',
      cards: fiveDiffSelectedCards,
      discardPick,
    });
  }

  function confirmDefuse() {
    const pos = Math.min(Math.max(0, defusePosition), state?.deck.length ?? 0);
    const m = legalMoves.find((mv) => mv.kind === 'defuse' && mv.insertAt === pos);
    if (m) {
      playMove(m);
    } else {
      // Find closest
      const sorted = legalMoves
        .filter((mv): mv is Extract<EKMove, { kind: 'defuse' }> => mv.kind === 'defuse')
        .sort((a, b) => Math.abs(a.insertAt - pos) - Math.abs(b.insertAt - pos));
      if (sorted[0]) playMove(sorted[0]);
    }
  }

  function playerLabel(idx: number): string {
    return idx === HUMAN_PLAYER_INDEX ? 'You' : `P${idx + 1}`;
  }

  function formatMoveLog(record: MoveRecord<EKMove>): string {
    const who = playerLabel(record.player);
    const m = record.move;
    if (m.kind === 'draw') return `${who} drew a card`;
    if (m.kind === 'defuse') return `${who} defused (pos ${m.insertAt})`;
    if (m.kind === 'give_favor') return `${who} gave ${CARD_LABELS[m.card]}`;
    if (m.kind === 'play_single') return `${who} played ${CARD_LABELS[m.card]}`;
    if (m.kind === 'play_favor') return `${who} played Favor on P${m.targetIndex + 1}`;
    if (m.kind === 'play_cat_pair')
      return `${who} stole from P${m.targetIndex + 1} (cat pair)`;
    if (m.kind === 'play_three_kind')
      return `${who} named ${CARD_LABELS[m.namedCard]} from P${m.targetIndex + 1}`;
    if (m.kind === 'play_five_diff')
      return `${who} took ${CARD_LABELS[m.discardPick]} from discard`;
    return who;
  }

  onMount(() => {
    keys = getStoredKeys();
    const hashSeed = seedFromHash(globalThis.location?.hash ?? '');
    if (hashSeed) seed = hashSeed;
    globalThis.addEventListener?.('storage', refreshKeys);
    startGame();
  });

  onDestroy(() => {
    unsubscribe?.();
    aiController?.abort();
    globalThis.removeEventListener?.('storage', refreshKeys);
  });
</script>

<!-- ── Layout ──────────────────────────────────────────────────── -->
<div class="flex h-full flex-col overflow-hidden bg-neutral-950 text-neutral-100">

  <!-- Top bar -->
  <div class="flex items-center gap-2 border-b border-neutral-800 px-4 py-2 text-sm">
    <span class="font-semibold text-red-400">💣 Exploding Kittens</span>
    <span class="flex-1" />

    {#if snapshot?.status === 'thinking'}
      <span class="animate-pulse text-xs text-neutral-400">AI thinking…</span>
    {/if}

    {#if lastUsage}
      <TokenUsageBadge usage={lastUsage} />
    {/if}

    {#if message}
      <span class="text-xs text-rose-400">{message}</span>
    {/if}

    <!-- AI pause / resume -->
    {#if aiPlayerIndexes.length > 0 && loop && snapshot?.status !== 'terminal'}
      <button
        class="rounded px-2 py-0.5 text-xs {aiPaused
          ? 'bg-emerald-800 text-emerald-200 hover:bg-emerald-700'
          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}"
        on:click={toggleAIPaused}
      >
        {aiPaused ? '▶ Resume AI' : '⏸ Pause AI'}
      </button>
    {/if}

    <!-- New game button -->
    <button
      class="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700"
      on:click={startGame}
    >
      New game
    </button>

    <!-- Move log toggle -->
    <button
      class="rounded px-2 py-0.5 text-xs {moveLogOpen
        ? 'bg-neutral-700 text-white'
        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
      on:click={() => (moveLogOpen = !moveLogOpen)}
    >
      Log
    </button>
  </div>

  <div class="flex min-h-0 flex-1 overflow-hidden">
    <!-- Left: seat config + setup -->
    <div class="flex w-52 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-neutral-800 p-3 text-xs">
      <!-- Player count -->
      <div>
        <div class="mb-1 font-semibold text-neutral-400">Players</div>
        <div class="flex gap-1">
          {#each [2, 3, 4, 5] as n}
            <button
              class="rounded px-2 py-0.5 {playerCount === n
                ? 'bg-red-700 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
              on:click={() => {
                playerCount = n;
                startGame();
              }}
            >
              {n}
            </button>
          {/each}
        </div>
      </div>

      <!-- Seed -->
      <div>
        <div class="mb-1 font-semibold text-neutral-400">Seed</div>
        <input
          type="text"
          bind:value={seed}
          class="w-full rounded bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-red-600"
          on:change={startGame}
        />
      </div>

      <!-- Seat assignments -->
      {#if state}
        <div>
          <div class="mb-1 font-semibold text-neutral-400">Seats</div>
          {#each Array.from({ length: playerCount }, (_, i) => i) as pi}
            <div class="mb-1.5">
              <div class="mb-0.5 text-neutral-400">
                {pi === HUMAN_PLAYER_INDEX ? '👤 You' : `🤖 P${pi + 1}`}
                {#if state.players[pi] && !state.players[pi]!.alive}
                  <span class="ml-1 text-rose-500">💀</span>
                {/if}
              </div>
              <select
                class="w-full rounded bg-neutral-800 py-1 pl-1 text-xs text-neutral-200"
                value={playerProfileSelections[pi] ?? HUMAN_SEAT_ID}
                on:change={(e) => selectPlayerProfile(pi, e.currentTarget.value)}
              >
                {#if pi === HUMAN_PLAYER_INDEX}
                  <option value={HUMAN_SEAT_ID}>Human</option>
                {/if}
                {#each localBotSeatOptions as opt}
                  <option value={opt.id}>{opt.label}</option>
                {/each}
                {#each configuredProfiles as profile}
                  <option value={profile.id}>{profile.label}</option>
                {/each}
              </select>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Hand size info -->
      {#if state}
        <div class="mt-1">
          <div class="mb-1 font-semibold text-neutral-400">Hand sizes</div>
          {#each state.players as player, pi}
            <div class="flex items-center gap-1 py-0.5">
              <span class="w-12 text-neutral-400">{playerLabel(pi)}</span>
              <span
                class:text-rose-500={!player.alive}
                class:text-neutral-200={player.alive}
              >
                {player.alive ? `${player.hand.length} cards` : '💀'}
              </span>
              {#if pi === state.current && !state.pendingFavor && !state.pendingDefuse}
                <span class="text-yellow-400">←</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="mt-1 rounded bg-neutral-800/60 p-2 text-neutral-400">
          <div>Deck: <span class="text-white">{state.deck.length}</span></div>
          <div>Discard: <span class="text-white">{state.discard.length}</span></div>
          {#if state.pendingTurns > 1}
            <div class="text-orange-400">×{state.pendingTurns} turns pending</div>
          {/if}
        </div>
      {/if}

      <!-- BYOK settings -->
      <details class="mt-auto">
        <summary class="cursor-pointer text-neutral-500 hover:text-neutral-300">
          API keys
        </summary>
        <div class="mt-2">
          <SettingsPanel on:change={refreshKeys} />
        </div>
      </details>
    </div>

    <!-- Center: 3D view -->
    <div class="relative min-h-0 flex-1 overflow-hidden">
      {#if state}
        <ExplodingKittens3DView
          bind:this={view3D}
          {state}
          {legalMoves}
          {humanCanAct}
          humanPlayerIndex={HUMAN_PLAYER_INDEX}
          onDeckClick={handleDeckClick}
        />

        <!-- Human hand strip (2D overlay at bottom) -->
        {#if state.players[HUMAN_PLAYER_INDEX]?.alive}
          <div class="absolute bottom-0 left-0 right-0 flex flex-col items-center bg-gradient-to-t from-black/80 to-transparent pb-3 pt-4">
            <!-- Current player indicator -->
            {#if state.pendingFavor?.to === HUMAN_PLAYER_INDEX}
              <div class="mb-1 text-xs font-semibold text-purple-300">
                Give a card to P{(state.pendingFavor.from ?? 0) + 1}
              </div>
            {:else if state.pendingDefuse}
              <div class="mb-1 text-xs font-semibold text-red-300">
                💥 You drew an Exploding Kitten! Play Defuse →
              </div>
            {:else if humanCanAct}
              <div class="mb-1 text-xs text-emerald-400">Your turn — play a card or draw</div>
            {:else if currentPlayerIdx !== HUMAN_PLAYER_INDEX}
              <div class="mb-1 text-xs text-neutral-500">Waiting for P{currentPlayerIdx + 1}…</div>
            {/if}

            <!-- Hand cards -->
            <div class="flex flex-nowrap justify-center px-4">
              {#each state.players[HUMAN_PLAYER_INDEX]!.hand as cardKind, idx (idx)}
                {@const playable =
                  humanCanAct &&
                  (legalMoves.some(
                    (m) =>
                      (m.kind === 'play_single' && m.card === cardKind) ||
                      (m.kind === 'play_favor' && cardKind === 'favor') ||
                      (m.kind === 'play_cat_pair' && m.cardKind === cardKind) ||
                      (m.kind === 'play_three_kind' && m.cardKind === cardKind) ||
                      (m.kind === 'play_five_diff') ||
                      (m.kind === 'give_favor' && m.card === cardKind),
                  ))}
                <button
                  in:fly={{ y: -160, duration: 420, easing: backOut }}
                  out:fly={{ y: -120, duration: 260, easing: cubicIn }}
                  animate:flip={{ duration: 220 }}
                  class="relative flex h-48 w-[8.25rem] flex-shrink-0 flex-col items-center justify-center rounded-lg border text-center text-base font-bold leading-tight shadow-md transition-[transform,box-shadow] duration-150
                    {playable
                      ? 'cursor-pointer border-white/30 hover:-translate-y-4 hover:z-10 hover:shadow-xl'
                      : 'cursor-default border-white/10 opacity-60'}
                  "
                  data-hand-idx={idx}
                  style:background-color={CARD_COLORS[cardKind]}
                  style:margin-left={idx === 0 ? '0' : '-3.5rem'}
                  disabled={!playable}
                  on:click={() => handleCardClick(cardKind, idx)}
                >
                  <span class="text-6xl leading-none">{CARD_EMOJI[cardKind]}</span>
                  <span class="mt-2 px-1 text-white/90">
                    {CARD_LABELS[cardKind].split(' ').slice(0, 2).join(' ')}
                  </span>
                </button>
              {/each}

              <!-- Draw button -->
              {#if humanCanAct && legalMoves.some((m) => m.kind === 'draw')}
                <button
                  in:scale={{ duration: 300, easing: backOut }}
                  out:scale={{ duration: 200, easing: cubicIn }}
                  class="relative flex h-48 w-[10.5rem] flex-shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-500 bg-neutral-800 text-base font-bold text-neutral-300 shadow transition-[transform,box-shadow] duration-150 hover:-translate-y-4 hover:z-10 hover:border-neutral-300 hover:shadow-xl"
                  style:margin-left={state.players[HUMAN_PLAYER_INDEX]!.hand.length > 0 ? '-3.5rem' : '0'}
                  on:click={handleDeckClick}
                >
                  <span class="text-6xl">🃏</span>
                  <span class="mt-2">Draw</span>
                </button>
              {/if}
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Right: move log -->
    {#if moveLogOpen}
      <div class="flex w-56 flex-shrink-0 flex-col overflow-hidden border-l border-neutral-800">
        <div class="border-b border-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-400">
          Move log
        </div>
        <div class="flex-1 overflow-y-auto p-2 text-xs text-neutral-400">
          {#each (snapshot?.log ?? []).slice().reverse() as record}
            <div class="border-b border-neutral-800/50 py-1 leading-snug">
              <span
                class:text-emerald-300={record.player === HUMAN_PLAYER_INDEX}
              >
                {formatMoveLog(record)}
              </span>
              {#if record.source === 'fallback'}
                <span class="ml-1 text-amber-500" title="AI fallback">⚠</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- ── See the Future overlay ─────────────────────────────────── -->
{#if showSeeFuture && seeFutureCards}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div class="rounded-xl border border-violet-700/50 bg-neutral-900 p-6 text-center shadow-2xl">
      <div class="mb-1 text-lg font-bold text-violet-300">👁 See the Future</div>
      <div class="mb-4 text-sm text-neutral-400">Top of the deck (position 1 = next draw):</div>
      <div class="mb-4 flex justify-center gap-3">
        {#each seeFutureCards as card, idx}
          <div
            class="flex h-20 w-14 flex-col items-center justify-center rounded-lg text-xs font-bold text-white shadow-md"
            style:background-color={CARD_COLORS[card]}
          >
            <div class="text-3xl leading-none">{CARD_EMOJI[card]}</div>
            <div class="mt-1 text-[10px] text-white/80">#{idx + 1}</div>
            <div class="mt-0.5 px-1 text-center leading-tight">
              {CARD_LABELS[card].split(' ').slice(0, 2).join(' ')}
            </div>
          </div>
        {/each}
      </div>
      <button
        class="rounded bg-violet-700 px-6 py-2 font-semibold text-white hover:bg-violet-600"
        on:click={() => (seeFutureAcknowledged = true)}
      >
        Got it
      </button>
    </div>
  </div>
{/if}

<!-- ── Game over overlay ──────────────────────────────────────── -->
{#if snapshot?.status === 'terminal' && !gameOverDismissed && state}
  {@const w = snapshot.winner}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
    <div class="rounded-xl border border-neutral-700 bg-neutral-900 p-8 text-center shadow-2xl">
      {#if w === null}
        <div class="text-2xl font-bold text-neutral-300">Draw!</div>
      {:else if w === HUMAN_PLAYER_INDEX}
        <div class="text-2xl font-bold text-emerald-400">You win! 🎉</div>
      {:else}
        <div class="text-2xl font-bold text-rose-400">P{w + 1} wins!</div>
      {/if}
      <div class="mt-2 text-sm text-neutral-400">
        {snapshot.log.length} moves · {snapshot.totalUsage.input + snapshot.totalUsage.output} tokens
      </div>
      <div class="mt-4 flex gap-3 justify-center">
        <button
          class="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
          on:click={startGame}
        >
          Play again
        </button>
        <button
          class="rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
          on:click={() => (gameOverDismissed = true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Modals ──────────────────────────────────────────────────── -->

<!-- Defuse: pick insert position -->
{#if activeModal === 'defuse' && state}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
    <div class="w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-2 text-lg font-bold text-red-400">💥 Defuse!</div>
      <div class="mb-4 text-sm text-neutral-300">
        Where do you want to put the Exploding Kitten back in the deck?
        <br />
        <span class="text-neutral-500">0 = top (next player draws it), {state.deck.length} = bottom.</span>
      </div>
      <div class="mb-4 flex items-center gap-3">
        <input
          type="range"
          min="0"
          max={state.deck.length}
          bind:value={defusePosition}
          class="flex-1"
        />
        <span class="w-8 text-center text-sm font-bold text-white">{defusePosition}</span>
      </div>
      <button
        class="w-full rounded bg-emerald-700 py-2 font-semibold text-white hover:bg-emerald-600"
        on:click={confirmDefuse}
      >
        Place Exploding Kitten at position {defusePosition}
      </button>
    </div>
  </div>
{/if}

<!-- Give favor: pick card to give -->
{#if activeModal === 'give_favor' && state?.pendingFavor && state.players[HUMAN_PLAYER_INDEX]}
  {@const requester = state.pendingFavor.from}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
    <div class="w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-2 text-lg font-bold text-purple-400">⭐ Favor requested</div>
      <div class="mb-4 text-sm text-neutral-300">
        P{requester + 1} wants a card. Choose one to give:
      </div>
      <div class="flex flex-wrap gap-2">
        {#each state.players[HUMAN_PLAYER_INDEX]!.hand as cardKind}
          <button
            class="flex h-14 w-10 flex-col items-center justify-center rounded text-[10px] font-bold text-white shadow hover:opacity-90 active:scale-95"
            style:background-color={CARD_COLORS[cardKind]}
            on:click={() => {
              const m = legalMoves.find(
                (mv) => mv.kind === 'give_favor' && mv.card === cardKind,
              );
              if (m) playMove(m);
            }}
          >
            <span class="text-lg">{CARD_EMOJI[cardKind]}</span>
            <span class="mt-0.5 px-0.5 leading-none">{CARD_LABELS[cardKind].split(' ')[0]}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Favor: pick target -->
{#if activeModal === 'favor_target' && state}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
    <div class="w-72 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-2 text-lg font-bold text-purple-400">⭐ Favor</div>
      <div class="mb-4 text-sm text-neutral-300">Choose a player to demand a card from:</div>
      <div class="flex flex-col gap-2">
        {#each state.players as player, pi}
          {#if pi !== HUMAN_PLAYER_INDEX && player.alive && player.hand.length > 0}
            <button
              class="rounded bg-neutral-800 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700"
              on:click={() => confirmFavorTarget(pi)}
            >
              P{pi + 1} · {player.hand.length} cards
            </button>
          {/if}
        {/each}
      </div>
      <button
        class="mt-3 w-full rounded bg-neutral-800 py-1 text-xs text-neutral-500 hover:text-neutral-300"
        on:click={() => (activeModal = null)}
      >
        Cancel
      </button>
    </div>
  </div>
{/if}

<!-- Cat pair: pick target -->
{#if activeModal === 'cat_pair_select' && state}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
    <div class="w-72 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-2 text-lg font-bold text-pink-400">🐱 Cat Pair</div>
      <div class="mb-4 text-sm text-neutral-300">Steal a random card from:</div>
      <div class="flex flex-col gap-2">
        {#each state.players as player, pi}
          {#if pi !== HUMAN_PLAYER_INDEX && player.alive && player.hand.length > 0}
            <button
              class="rounded bg-neutral-800 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700"
              on:click={() => confirmCatPairTarget(pi)}
            >
              P{pi + 1} · {player.hand.length} cards
            </button>
          {/if}
        {/each}
      </div>
      <button
        class="mt-3 w-full rounded bg-neutral-800 py-1 text-xs text-neutral-500 hover:text-neutral-300"
        on:click={() => (activeModal = null)}
      >
        Cancel
      </button>
    </div>
  </div>
{/if}

<!-- Three of a kind: pick target + card name -->
{#if activeModal === 'three_kind' && state}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
    <div class="w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-2 text-lg font-bold text-yellow-400">3-of-a-Kind Combo</div>
      {#if threeKindTarget === null}
        <div class="mb-4 text-sm text-neutral-300">Name a player to steal from:</div>
        <div class="flex flex-col gap-2">
          {#each state.players as player, pi}
            {#if pi !== HUMAN_PLAYER_INDEX && player.alive && player.hand.length > 0}
              <button
                class="rounded bg-neutral-800 px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700"
                on:click={() => (threeKindTarget = pi)}
              >
                P{pi + 1} · {player.hand.length} cards
              </button>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="mb-3 text-sm text-neutral-300">Name a card you want from P{threeKindTarget + 1}:</div>
        <div class="flex max-h-96 flex-wrap gap-2 overflow-y-scroll">
          {#each ALL_NAMED_KINDS as kind}
            <button
              class="flex h-24 w-20 flex-col items-center justify-center rounded-lg text-xs font-bold text-white transition hover:scale-105
                {threeKindCard === kind ? 'ring-2 ring-white' : ''}"
              style:background-color={CARD_COLORS[kind]}
              on:click={() => (threeKindCard = kind)}
            >
              <span class="text-4xl leading-none">{CARD_EMOJI[kind]}</span>
              <span class="mt-1 leading-none">{CARD_LABELS[kind].split(' ')[0]}</span>
            </button>
          {/each}
        </div>
        {#if threeKindCard}
          <button
            class="mt-3 w-full rounded bg-yellow-700 py-2 font-semibold text-white hover:bg-yellow-600"
            on:click={confirmThreeKind}
          >
            Steal {CARD_LABELS[threeKindCard]} from P{threeKindTarget + 1}
          </button>
        {/if}
      {/if}
      <button
        class="mt-2 w-full rounded bg-neutral-800 py-1 text-xs text-neutral-500 hover:text-neutral-300"
        on:click={() => {
          activeModal = null;
          threeKindTarget = null;
          threeKindCard = null;
        }}
      >
        Cancel
      </button>
    </div>
  </div>
{/if}

<!-- Five different: pick 5 card kinds from hand -->
{#if activeModal === 'five_diff_pick' && state}
  {@const uniqueKinds = [...new Set(state.players[HUMAN_PLAYER_INDEX]!.hand)]}
  {@const selectedSet = new Set(fiveDiffSelectedCards)}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
    <div class="w-96 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-2 text-lg font-bold text-blue-400">5-Card Combo</div>
      <div class="mb-4 text-sm text-neutral-300">
        Choose 5 different card kinds to discard:
        <span class="ml-1 font-bold text-white">{fiveDiffSelectedCards.length}/5</span>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each uniqueKinds as cardKind}
          {@const selected = selectedSet.has(cardKind)}
          {@const canAdd = fiveDiffSelectedCards.length < 5 && !selected}
          <button
            class="flex h-24 w-20 flex-col items-center justify-center rounded-lg border-2 text-xs font-bold text-white transition
              {selected
                ? 'scale-105 border-white ring-2 ring-white/60'
                : canAdd
                  ? 'border-white/30 hover:scale-105 hover:border-white/60'
                  : 'cursor-default border-white/10 opacity-40'}"
            style:background-color={CARD_COLORS[cardKind]}
            disabled={!selected && !canAdd}
            on:click={() => {
              if (selected) {
                fiveDiffSelectedCards = fiveDiffSelectedCards.filter((c) => c !== cardKind);
              } else {
                fiveDiffSelectedCards = [...fiveDiffSelectedCards, cardKind];
              }
            }}
          >
            <span class="text-4xl leading-none">{CARD_EMOJI[cardKind]}</span>
            <span class="mt-1 leading-none">{CARD_LABELS[cardKind].split(' ')[0]}</span>
          </button>
        {/each}
      </div>
      <div class="mt-4 flex gap-2">
        <button
          class="flex-1 rounded bg-neutral-800 py-1.5 text-xs text-neutral-500 hover:text-neutral-300"
          on:click={() => { activeModal = null; fiveDiffSelectedCards = []; }}
        >Cancel</button>
        <button
          class="flex-1 rounded py-1.5 text-xs font-bold transition
            {fiveDiffSelectedCards.length === 5
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'cursor-default bg-neutral-700 text-neutral-500'}"
          disabled={fiveDiffSelectedCards.length !== 5}
          on:click={() => { if (fiveDiffSelectedCards.length === 5) activeModal = 'five_diff'; }}
        >Next: Pick from discard →</button>
      </div>
    </div>
  </div>
{/if}

<!-- Five different: pick discard card -->
{#if activeModal === 'five_diff' && state && state.discard.length > 0}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
    <div class="w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-2 text-lg font-bold text-blue-400">5-Card Combo</div>
      <div class="mb-4 text-sm text-neutral-300">Take any card from the discard pile:</div>
      <div class="flex max-h-96 flex-wrap gap-2 overflow-y-scroll">
        {#each [...new Set(state.discard)] as kind}
          <button
            class="flex h-24 w-20 flex-col items-center justify-center rounded-lg text-xs font-bold text-white transition hover:scale-105"
            style:background-color={CARD_COLORS[kind]}
            on:click={() => confirmFiveDiff(kind)}
          >
            <span class="text-4xl leading-none">{CARD_EMOJI[kind]}</span>
            <span class="mt-1 leading-none">{CARD_LABELS[kind].split(' ')[0]}</span>
          </button>
        {/each}
      </div>
      <button
        class="mt-3 w-full rounded bg-neutral-800 py-1 text-xs text-neutral-500 hover:text-neutral-300"
        on:click={() => (activeModal = null)}
      >
        Cancel
      </button>
    </div>
  </div>
{/if}

<!-- Nope prompt -->
{#if activeModal === 'nope_prompt' && state?.pendingNope}
  {@const pending = state.pendingNope}
  {@const byName = `P${pending.byPlayer + 1}`}
  {@const action = pending.action}
  {@const baseDesc = (() => {
    if (action.kind === 'play_single') return `${byName} played ${CARD_LABELS[action.card]}`;
    if (action.kind === 'play_favor') return `${byName} played Favor targeting P${action.targetIndex + 1}`;
    if (action.kind === 'play_cat_pair') return `${byName} played a Cat Pair targeting P${action.targetIndex + 1}`;
    if (action.kind === 'play_three_kind') return `${byName} played 3-of-a-Kind, naming ${CARD_LABELS[action.namedCard]}`;
    if (action.kind === 'play_five_diff') return `${byName} played 5-Card Combo`;
    return `${byName} played a card`;
  })()}
  {@const goingThrough = pending.nopeCount % 2 === 0}
  {@const hasNope = legalMoves.some((m) => m.kind === 'nope')}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
    <div class="w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
      <div class="mb-1 text-lg font-bold text-neutral-100">⚡ Nope?</div>
      <div class="mb-1 text-sm text-neutral-300">{baseDesc}</div>
      {#if pending.nopeCount > 0}
        <div class="mb-3 flex items-center gap-1.5 text-xs">
          {#each Array(pending.nopeCount) as _, i}
            <span class="rounded bg-neutral-700 px-1.5 py-0.5 font-bold text-red-400">🚫 Nope</span>
          {/each}
          <span class="text-neutral-400">→</span>
          <span class="font-semibold {goingThrough ? 'text-green-400' : 'text-red-400'}">
            {goingThrough ? 'goes through' : 'cancelled'}
          </span>
        </div>
      {:else}
        <div class="mb-3"></div>
      {/if}
      <div class="flex gap-3">
        <button
          class="flex-1 rounded-lg py-3 text-sm font-bold transition
            {hasNope
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'cursor-default bg-neutral-700 text-neutral-500'}"
          disabled={!hasNope}
          on:click={() => {
            const m = legalMoves.find((mv) => mv.kind === 'nope');
            if (m) { activeModal = null; playMove(m); }
          }}
        >
          <div class="text-2xl">🚫</div>
          Nope!
        </button>
        <button
          class="flex-1 rounded-lg bg-neutral-700 py-3 text-sm font-bold text-neutral-200 transition hover:bg-neutral-600"
          on:click={() => {
            const m = legalMoves.find((mv) => mv.kind === 'pass_nope');
            if (m) { activeModal = null; playMove(m); }
          }}
        >
          <div class="text-2xl">✅</div>
          Let it happen
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Flying card overlay -->
{#each flyingCards as fc (fc.id)}
  <div
    class="pointer-events-none fixed z-[300] flex flex-col items-center justify-center rounded-lg border text-base font-bold leading-tight text-white shadow-2xl"
    style:width="8.25rem"
    style:height="12rem"
    style:left="{fc.sx - 66}px"
    style:top="{fc.sy - 96}px"
    style:background-color={fc.kind === null ? '#1a1a2e' : CARD_COLORS[fc.kind]}
    style:border-color={fc.kind === null ? '#444' : 'rgba(255,255,255,0.3)'}
    use:flyCardAction={fc}
  >
    {#if fc.kind === null}
      <span class="text-5xl leading-none">💣</span>
      <span class="mt-2 text-xs text-neutral-500">???</span>
    {:else}
      <span class="text-5xl leading-none">{CARD_EMOJI[fc.kind]}</span>
      <span class="mt-2 px-1">{CARD_LABELS[fc.kind].split(' ').slice(0, 2).join(' ')}</span>
    {/if}
  </div>
{/each}
