<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import TokenUsageBadge from '@/components/ai/TokenUsageBadge.svelte';
  import ChessBoard3D from '@/components/games/chess/ChessBoard3D.svelte';
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
  import { chessAdapter } from '@/lib/games/chess/ai-adapter';
  import { chooseChessBotMoveAsync } from '@/lib/games/chess/bot';
  import { formatChessMove } from '@/lib/games/chess/move-format';
  import { legalMoves, pieceAt } from '@/lib/games/chess/rules';
  import {
    pieceGlyph,
    pieceLabels,
    sideName,
    type ChessMove,
    type ChessPiece,
    type ChessState,
    type PieceType,
  } from '@/lib/games/chess/state';
  import {
    getStoredKeys,
    hasProviderCredentials,
    providerEndpointFor,
    selectedProfileFor,
    type ProviderModelProfile,
    type StoredKeys,
  } from '@/lib/storage/keys';

  type LogEntry = {
    record: MoveRecord<ChessMove>;
    label: string;
  };

  const HUMAN_PLAYER_INDEX = 0;
  const PLAYER_COUNT = 2;
  const LOCAL_BOT_PROFILE = '__local_chess_bot__';
  const localBotSeatOptions = [
    { id: LOCAL_BOT_PROFILE, label: 'Local bot' },
  ] satisfies LocalAISeatOption[];

  let keys: StoredKeys = {};
  let seed = 'chess-table';
  let loop: GameLoop<ChessState, ChessMove> | undefined;
  let unsubscribe: (() => void) | undefined;
  let snapshot: LoopSnapshot<ChessState, ChessMove> | undefined =
    createInitialSnapshot();
  let playerProfileSelections: SeatSelections = {
    [HUMAN_PLAYER_INDEX]: HUMAN_SEAT_ID,
    1: LOCAL_BOT_PROFILE,
  };
  let selectedPieceId = '';
  let message = '';
  let aiPaused = false;
  let aiController: globalThis.AbortController | undefined;
  let gameOverDismissed = false;
  let pendingPromotionMoves: ChessMove[] = [];

  $: state = snapshot?.state;
  $: currentPlayer = snapshot?.currentPlayer ?? 0;
  $: selectedProfile = selectedProfileFor(keys);
  $: configuredProfiles = (keys.modelProfiles ?? []).filter((profile) =>
    hasProviderCredentials(profile.provider, keys),
  );
  $: defaultProfileId =
    configuredProfiles.find((profile) => profile.id === selectedProfile?.id)?.id ??
    configuredProfiles[0]?.id ??
    LOCAL_BOT_PROFILE;
  $: normalizePlayerProfileSelections(defaultProfileId);
  $: aiPlayerIndexes = playerIndexesControlledByAI(playerProfileSelections);
  $: humanCanAct =
    currentPlayer === HUMAN_PLAYER_INDEX &&
    playerProfileSelections[HUMAN_PLAYER_INDEX] === HUMAN_SEAT_ID &&
    snapshot?.status !== 'thinking' &&
    snapshot?.status !== 'terminal';
  $: allLegalMoves = state ? legalMoves(state, currentPlayer) : [];
  $: selectedPiece = state
    ? state.pieces.find((piece) => piece.id === selectedPieceId)
    : undefined;
  $: selectedMoves =
    humanCanAct && selectedPiece
      ? allLegalMoves.filter((move) => move.fromSquare === selectedPiece.square)
      : [];
  $: logEntries = buildLogEntries(snapshot);
  $: lastUsage = snapshot?.log.at(-1)?.usage;
  $: terminalWinner = snapshot?.winner;
  $: whiteCaptures = capturedPieceTypes(snapshot, 0);
  $: blackCaptures = capturedPieceTypes(snapshot, 1);

  function createInitialSnapshot(): LoopSnapshot<ChessState, ChessMove> {
    const initialState = chessAdapter.init({
      seed,
      playerCount: PLAYER_COUNT,
      aiPlayerIndices: [],
    });

    return {
      state: initialState,
      status: 'idle',
      currentPlayer: chessAdapter.currentPlayer(initialState),
      winner: chessAdapter.winner(initialState),
      log: [],
      totalUsage: { input: 0, output: 0 },
    };
  }

  function refreshKeys() {
    keys = getStoredKeys();
  }

  function configuredProfileById(
    profileId: string,
  ): ProviderModelProfile | undefined {
    return configuredProfiles.find((profile) => profile.id === profileId);
  }

  function profileLabel(profile: ProviderModelProfile): string {
    return `${profile.label} (${getProvider(profile.provider).label})`;
  }

  function isLocalBotProfileId(profileId: string): boolean {
    return localBotSeatOptions.some((option) => option.id === profileId);
  }

  function normalizePlayerProfileSelections(fallbackProfileId: string) {
    const result = normalizeSeatSelections({
      playerCount: PLAYER_COUNT,
      selections: playerProfileSelections,
      profileIds: configuredProfiles.map((profile) => profile.id),
      localSeatIds: localBotSeatOptions.map((option) => option.id),
      fallbackSeatId: fallbackProfileId,
      humanSeatIndex: HUMAN_PLAYER_INDEX,
    });

    if (result.changed) {
      playerProfileSelections = result.selections;
      syncLoopAIPlayers();
    }
  }

  function playerIndexesControlledByAI(selections: SeatSelections): number[] {
    return aiControlledSeatIndexes({
      playerCount: PLAYER_COUNT,
      selections,
      profileIds: configuredProfiles.map((profile) => profile.id),
      localSeatIds: localBotSeatOptions.map((option) => option.id),
    });
  }

  function aiConfigForProfile(
    profile: ProviderModelProfile,
  ): AIPlayerConfig<ChessState, ChessMove> {
    const providerId = profile.provider as ProviderId;
    return {
      provider: getProvider(providerId),
      model: profile.model,
      apiKey: keys[providerId],
      endpointUrl: providerEndpointFor(providerId, keys),
      temperature: 0.15,
      maxTokens: 500,
    };
  }

  function aiConfigForLocalBot(): AIPlayerConfig<ChessState, ChessMove> {
    return {
      kind: 'local',
      label: 'Local bot',
      model: 'Local bot',
      async chooseMove({ state: currentState, player, legalMoves: moves, signal }) {
        if (signal?.aborted) {
          const error = new Error('AI move aborted.');
          error.name = 'AbortError';
          throw error;
        }

        return chooseChessBotMoveAsync({
          state: currentState,
          player,
          legalMoves: moves,
          signal,
        });
      },
    };
  }

  function aiConfigs(
    selections: SeatSelections = playerProfileSelections,
  ): Record<number, AIPlayerConfig<ChessState, ChessMove>> {
    return Object.fromEntries(
      Array.from({ length: PLAYER_COUNT }, (_, player) => player).flatMap(
        (player) => {
          const profileId = selections[player];
          if (profileId === HUMAN_SEAT_ID) {
            return [];
          }

          if (isLocalBotProfileId(profileId)) {
            return [[player, aiConfigForLocalBot()]];
          }

          const profile = configuredProfileById(profileId);
          return profile ? [[player, aiConfigForProfile(profile)]] : [];
        },
      ),
    );
  }

  function syncLoopAIPlayers() {
    loop?.setAIPlayers(aiConfigs());
  }

  function syncSeedHash(nextSeed: string) {
    const nextHash = hashWithSeed(globalThis.location.hash, nextSeed);
    if (nextHash !== globalThis.location.hash) {
      globalThis.history.replaceState(
        null,
        '',
        nextHash || globalThis.location.pathname,
      );
    }
  }

  function startGame() {
    unsubscribe?.();
    aiController?.abort();
    seed = seed.trim() || 'chess-table';
    syncSeedHash(seed);
    selectedPieceId = '';
    pendingPromotionMoves = [];
    message = '';
    gameOverDismissed = false;
    normalizePlayerProfileSelections(defaultProfileId);
    aiPaused = playerProfileSelections[HUMAN_PLAYER_INDEX] !== HUMAN_SEAT_ID;

    const initialState = chessAdapter.init({
      seed,
      playerCount: PLAYER_COUNT,
      aiPlayerIndices: playerIndexesControlledByAI(playerProfileSelections),
    });
    loop = createGameLoop({
      adapter: chessAdapter,
      initialState,
      aiPlayers: aiConfigs(),
      rng: createRng(`${seed}:chess-ui`),
    });
    unsubscribe = loop.subscribe((next) => {
      snapshot = next;
      selectedPieceId = '';
      pendingPromotionMoves = [];
    });
    void runAI();
  }

  function startShuffledGame() {
    seed = globalThis.crypto?.randomUUID?.() ?? `chess-${Date.now()}`;
    startGame();
  }

  function selectPlayerProfile(playerIndex: number, profileId: string) {
    playerProfileSelections = {
      ...playerProfileSelections,
      [playerIndex]: profileId,
    };
    selectedPieceId = '';
    pendingPromotionMoves = [];
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
    if (aiPaused) {
      aiController?.abort();
      return;
    }

    loop?.clearWarning();
    void runAI();
  }

  function abortAI() {
    aiController?.abort();
  }

  async function runAI() {
    if (!loop || aiPaused) {
      return;
    }

    const current = loop.getSnapshot();
    if (current.status === 'thinking' || current.status === 'terminal') {
      return;
    }

    if (!aiPlayerIndexes.includes(current.currentPlayer)) {
      return;
    }

    aiController = new globalThis.AbortController();
    try {
      await loop.runUntilBlocked(aiController.signal);
    } catch (error) {
      if (aiPaused) {
        loop.clearWarning();
        message = '';
        return;
      }

      message =
        error instanceof Error ? error.message : 'AI move failed unexpectedly.';
    } finally {
      aiController = undefined;
    }
  }

  async function runAIAfterBoardPaint() {
    await tick();
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(() => resolve(), 300);
    });
    void runAI();
  }

  function pieceAtSquare(x: number, y: number): ChessPiece | undefined {
    return state ? pieceAt(state, { x, y }) : undefined;
  }

  function targetMovesAt(x: number, y: number): ChessMove[] {
    return selectedMoves.filter((move) => move.to.x === x && move.to.y === y);
  }

  function choosePiece(piece: ChessPiece) {
    if (!humanCanAct || piece.owner !== HUMAN_PLAYER_INDEX) {
      return;
    }

    selectedPieceId = selectedPieceId === piece.id ? '' : piece.id;
    pendingPromotionMoves = [];
    message = '';
  }

  function playMove(move: ChessMove) {
    if (!loop || !humanCanAct) {
      return;
    }

    try {
      loop.playHumanMove(move);
      selectedPieceId = '';
      pendingPromotionMoves = [];
      message = '';
      void runAIAfterBoardPaint();
    } catch (error) {
      message =
        error instanceof Error ? error.message : 'Move could not be played.';
    }
  }

  function chooseSquare(x: number, y: number) {
    const piece = pieceAtSquare(x, y);
    if (piece && piece.owner === HUMAN_PLAYER_INDEX) {
      choosePiece(piece);
      return;
    }

    const moves = targetMovesAt(x, y);
    if (!moves.length || !humanCanAct) {
      return;
    }

    const promotionMoves = moves.filter((move) => move.isPromotion);
    if (promotionMoves.length > 1) {
      pendingPromotionMoves = promotionMoves;
      message = '';
      return;
    }

    playMove(moves[0]!);
  }

  function playerLabel(player: number): string {
    const profileId = playerProfileSelections[player] ?? HUMAN_SEAT_ID;
    if (profileId === HUMAN_SEAT_ID) {
      return player === HUMAN_PLAYER_INDEX ? 'You' : 'Human';
    }

    if (isLocalBotProfileId(profileId)) {
      return 'Local bot';
    }

    const profile = configuredProfileById(profileId);
    return profile ? profileLabel(profile) : 'AI';
  }

  function sideLabel(player: number): 'White' | 'Black' {
    return sideName(player === 0 ? 0 : 1);
  }

  function capturedPieceTypes(
    currentSnapshot: LoopSnapshot<ChessState, ChessMove> | undefined,
    player: number,
  ): PieceType[] {
    return (
      currentSnapshot?.log
        .filter((record) => record.player === player && record.move.captured)
        .map((record) => record.move.captured!)
    ) ?? [];
  }

  function capturedText(types: PieceType[], capturedOwner: 0 | 1): string {
    return types.length
      ? types
          .map((type) =>
            pieceGlyph({
              owner: capturedOwner,
              type,
            }),
          )
          .join(' ')
      : '-';
  }

  function statusText(currentState: ChessState | undefined): string {
    if (!currentState) {
      return '';
    }

    const labels: Record<ChessState['status'], string> = {
      active: currentState.isCheck ? 'Check' : '',
      checkmate: 'Checkmate',
      stalemate: 'Stalemate',
      draw: 'Draw',
      'insufficient-material': 'Draw by insufficient material',
      'threefold-repetition': 'Draw by threefold repetition',
      'fifty-move-rule': 'Draw by fifty-move rule',
    };
    return labels[currentState.status];
  }

  function terminalText(): string {
    if (!state) {
      return 'Game over.';
    }
    if (terminalWinner !== null) {
      return `${sideLabel(terminalWinner)} wins by checkmate.`;
    }
    return statusText(state) || 'Game drawn.';
  }

  function buildLogEntries(
    current: LoopSnapshot<ChessState, ChessMove> | undefined,
  ): LogEntry[] {
    if (!current) {
      return [];
    }

    return current.log
      .slice()
      .reverse()
      .map((record) => ({
        record,
        label: formatChessMove(record.move),
      }));
  }

  function sourceLabel(record: MoveRecord<ChessMove>): string {
    if (record.source === 'human') {
      return 'Human';
    }
    if (record.source === 'fallback') {
      return 'Fallback';
    }
    return record.model ?? 'AI';
  }

  onMount(() => {
    refreshKeys();
    const hashSeed = seedFromHash(globalThis.location.hash);
    if (hashSeed) {
      seed = hashSeed;
    }
    startGame();

    const handleStorage = () => {
      refreshKeys();
      syncLoopAIPlayers();
    };
    window.addEventListener('byok-keys-changed', handleStorage);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('byok-keys-changed', handleStorage);
      window.removeEventListener('storage', handleStorage);
    };
  });

  onDestroy(() => {
    aiController?.abort();
    unsubscribe?.();
  });
</script>

{#if state}
  <section
    class="grid h-full min-h-0 gap-4 overflow-hidden bg-neutral-950 p-4 text-neutral-100 xl:grid-cols-[minmax(760px,1fr)_380px]"
  >
    <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-900/70">
      <header
        class="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3"
      >
        <div>
          <h1 class="text-xl font-semibold tracking-normal">Chess</h1>
          <p class="mt-1 text-sm text-neutral-400">
            {sideLabel(currentPlayer)} to move / Move {Math.floor(state.turn / 2) + 1}
            {#if statusText(state)}
              <span class="ml-2 rounded-full border border-amber-300/60 bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">
                {statusText(state)}
              </span>
            {/if}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <TokenUsageBadge
            {lastUsage}
            totalUsage={snapshot?.totalUsage ?? { input: 0, output: 0 }}
          />
          {#if snapshot?.status === 'thinking'}
            <button
              class="rounded-md border border-amber-300/60 px-3 py-2 text-sm text-amber-100 hover:border-amber-200"
              type="button"
              on:click={abortAI}
            >
              Stop
            </button>
          {/if}
          <button
            class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 hover:text-white"
            type="button"
            on:click={toggleAIPaused}
          >
            {aiPaused ? 'Resume AI' : 'Pause AI'}
          </button>
          <button
            class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
            type="button"
            on:click={startShuffledGame}
          >
            New game
          </button>
        </div>
      </header>

      <div class="grid min-h-0 min-w-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside class="order-2 min-w-0 space-y-3 lg:order-none">
          <div class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
            <label class="text-xs font-medium text-neutral-400" for="seed">
              Seed
            </label>
            <div class="mt-2 flex gap-2">
              <input
                id="seed"
                class="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100"
                bind:value={seed}
              />
              <button
                class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
                type="button"
                on:click={startGame}
              >
                Start
              </button>
            </div>
          </div>

          {#each [0, 1] as player (player)}
            <div
              class="rounded-md border border-neutral-800 bg-neutral-950 p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-semibold">{sideLabel(player)}</div>
                  <div class="mt-0.5 text-xs text-neutral-500">
                    {playerLabel(player)}
                  </div>
                </div>
                <span
                  class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${
                    currentPlayer === player
                      ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-100'
                      : 'border-neutral-700 text-neutral-500'
                  }`}
                >
                  {currentPlayer === player ? 'Active' : 'Waiting'}
                </span>
              </div>
              <select
                class="mt-3 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100"
                value={playerProfileSelections[player] ?? HUMAN_SEAT_ID}
                on:change={(event) =>
                  selectPlayerProfile(
                    player,
                    event.currentTarget.value,
                  )}
              >
                {#if player === HUMAN_PLAYER_INDEX}
                  <option value={HUMAN_SEAT_ID}>Human - You</option>
                {/if}
                {#each localBotSeatOptions as option (option.id)}
                  <option value={option.id}>{option.label}</option>
                {/each}
                {#each configuredProfiles as profile (profile.id)}
                  <option value={profile.id}>{profileLabel(profile)}</option>
                {/each}
              </select>
            </div>
          {/each}

          <div class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
            <div class="text-xs font-medium uppercase text-neutral-500">
              Captured
            </div>
            <div class="mt-2 space-y-2 text-sm">
              <div class="flex justify-between gap-3">
                <span class="text-neutral-200">White</span>
                <span class="text-neutral-400">{capturedText(whiteCaptures, 1)}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-neutral-400">Black</span>
                <span class="text-neutral-400">{capturedText(blackCaptures, 0)}</span>
              </div>
            </div>
          </div>

          {#if state.lastMove}
            <div class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <div class="text-xs font-medium uppercase text-neutral-500">
                Last Move
              </div>
              <div class="mt-2 text-sm text-neutral-200">
                {state.lastMove.san}
              </div>
              <div class="mt-1 text-xs text-neutral-500">
                {state.lastMove.fromSquare} to {state.lastMove.toSquare}
              </div>
            </div>
          {/if}
        </aside>

        <div class="order-first flex min-h-[430px] min-w-0 items-center justify-center overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 p-3 sm:min-h-[560px] lg:order-none lg:min-h-[660px] lg:p-5">
          <ChessBoard3D
            {state}
            {selectedPieceId}
            {selectedMoves}
            onSquare={chooseSquare}
          />
        </div>
      </div>
    </div>

    <aside class="flex min-h-0 min-w-0 flex-col rounded-md border border-neutral-800 bg-neutral-900/70">
      <div class="border-b border-neutral-800 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold tracking-normal">Move Log</h2>
            <p class="mt-1 text-sm text-neutral-400">
              {snapshot?.log.length ?? 0} recorded moves
            </p>
          </div>
          {#if snapshot?.status === 'thinking'}
            <span
              class="rounded-full border border-amber-300/60 bg-amber-300/10 px-2 py-1 text-xs text-amber-100"
            >
              Thinking
            </span>
          {/if}
        </div>
        {#if snapshot?.warning || message}
          <p class="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-2 text-sm text-amber-100">
            {snapshot?.warning ?? message}
          </p>
        {/if}
      </div>

      <ol class="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 text-sm">
        {#if logEntries.length}
          {#each logEntries as entry (entry.record.turn)}
            <li class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs font-medium text-neutral-500">
                  Turn {entry.record.turn + 1} / {sideLabel(entry.record.player)}
                </span>
                <span class="text-xs text-neutral-500">
                  {sourceLabel(entry.record)}
                </span>
              </div>
              <div class="mt-2 leading-snug text-neutral-100">
                {entry.label}
              </div>
              {#if entry.record.error}
                <div class="mt-1 text-xs text-amber-200">
                  {entry.record.error}
                </div>
              {/if}
            </li>
          {/each}
        {:else}
          <li class="rounded-md border border-neutral-800 bg-neutral-950 p-4 text-neutral-400">
            No moves recorded yet.
          </li>
        {/if}
      </ol>
    </aside>
  </section>
{/if}

{#if pendingPromotionMoves.length}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <h2 class="text-xl font-semibold tracking-normal">Promotion</h2>
      <div class="mt-5 grid grid-cols-2 gap-2">
        {#each pendingPromotionMoves as move (move.id)}
          <button
            class="rounded-md border border-neutral-700 px-3 py-3 text-sm text-neutral-200 hover:border-emerald-300 hover:text-white"
            type="button"
            on:click={() => playMove(move)}
          >
            {move.promotion ? pieceLabels[move.promotion].en : 'Queen'}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if snapshot?.status === 'terminal' && !gameOverDismissed}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <h2 class="text-xl font-semibold tracking-normal">Game Over</h2>
      <p class="mt-2 text-neutral-300">{terminalText()}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 hover:text-white"
          type="button"
          on:click={() => {
            gameOverDismissed = true;
          }}
        >
          View board
        </button>
        <button
          class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
          type="button"
          on:click={startShuffledGame}
        >
          New game
        </button>
      </div>
    </div>
  </div>
{/if}
