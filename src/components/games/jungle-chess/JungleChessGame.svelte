<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import TokenUsageBadge from '@/components/ai/TokenUsageBadge.svelte';
  import JungleAnimalModel from '@/components/games/jungle-chess/JungleAnimalModel.svelte';
  import JungleChessBoard3D from '@/components/games/jungle-chess/JungleChessBoard3D.svelte';
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
  import { jungleChessAdapter } from '@/lib/games/jungle-chess/ai-adapter';
  import {
    chooseJungleBotMoveAsync,
    type JungleBotMoveOptions,
  } from '@/lib/games/jungle-chess/bot';
  import {
    coordinateLabel,
    formatJungleMove,
    pieceEmoji,
  } from '@/lib/games/jungle-chess/move-format';
  import {
    activePieces,
    terrainAt,
  } from '@/lib/games/jungle-chess/rules';
  import {
    BOARD_HEIGHT,
    BOARD_WIDTH,
    pieceLabels,
    type JungleMove,
    type JunglePiece,
    type JungleState,
    type Terrain,
  } from '@/lib/games/jungle-chess/state';
  import {
    getStoredKeys,
    hasProviderCredentials,
    providerEndpointFor,
    selectedProfileFor,
    type ProviderModelProfile,
    type StoredKeys,
  } from '@/lib/storage/keys';

  type LogEntry = {
    record: MoveRecord<JungleMove>;
    label: string;
  };

  const HUMAN_PLAYER_INDEX = 0;
  const PLAYER_COUNT = 2;
  const LOCAL_BOT_PROFILE = '__local_jungle_bot__';
  const localBotSeatOptions = [
    { id: LOCAL_BOT_PROFILE, label: 'Local bot' },
  ] satisfies LocalAISeatOption[];
  let keys: StoredKeys = {};
  let seed = 'jungle-table';
  let loop: GameLoop<JungleState, JungleMove> | undefined;
  let unsubscribe: (() => void) | undefined;
  let snapshot: LoopSnapshot<JungleState, JungleMove> | undefined =
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
  let pieceStyle: 'zh' | 'emoji' | '3d' = 'zh';

  let boardRotationX = 56;
  let boardRotationZ = -4;
  let boardScale = 1;
  let boardPanX = 0;
  let boardPanY = 0;
  let isDraggingBoard = false;
  let isPanningBoard = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialRotationX = 56;
  let initialRotationZ = -4;
  let initialPanX = 0;
  let initialPanY = 0;

  $: state = snapshot?.state;
  $: currentPlayer = snapshot?.currentPlayer ?? 0;
  $: selectedProfile = selectedProfileFor(keys);
  $: configuredProfiles = (keys.modelProfiles ?? []).filter((profile) =>
    hasProviderCredentials(profile.provider, keys),
  );
  $: defaultProfileId =
    configuredProfiles.find((profile) => profile.id === selectedProfile?.id)
      ?.id ??
    configuredProfiles[0]?.id ??
    LOCAL_BOT_PROFILE;
  $: normalizePlayerProfileSelections(defaultProfileId);
  $: aiPlayerIndexes = playerIndexesControlledByAI(playerProfileSelections);
  $: humanCanAct =
    currentPlayer === HUMAN_PLAYER_INDEX &&
    playerProfileSelections[HUMAN_PLAYER_INDEX] === HUMAN_SEAT_ID &&
    snapshot?.status !== 'thinking' &&
    snapshot?.status !== 'terminal';
  $: canUndo = (snapshot?.log.length ?? 0) > 0 && snapshot?.status !== 'thinking';
  $: legalMoves = state ? jungleChessAdapter.legalMoves(state, currentPlayer) : [];
  $: selectedPiece = state
    ? state.pieces.find((piece) => piece.id === selectedPieceId)
    : undefined;
  $: selectedMoves =
    humanCanAct && selectedPiece
      ? legalMoves.filter((move) => move.pieceId === selectedPiece.id)
      : [];
  $: logEntries = buildLogEntries(snapshot);
  $: lastUsage = snapshot?.log.at(-1)?.usage;
  $: terminalWinner = snapshot?.winner;
  $: redCaptured = state
    ? state.pieces.filter((piece) => piece.owner === 0 && piece.captured)
    : [];
  $: blueCaptured = state
    ? state.pieces.filter((piece) => piece.owner === 1 && piece.captured)
    : [];
  $: visiblePieces = state ? activePieces(state) : [];

  function createInitialSnapshot(): LoopSnapshot<JungleState, JungleMove> {
    const initialState = jungleChessAdapter.init({
      seed,
      playerCount: PLAYER_COUNT,
      aiPlayerIndices: [],
    });

    return {
      state: initialState,
      status: 'idle',
      currentPlayer: jungleChessAdapter.currentPlayer(initialState),
      winner: jungleChessAdapter.winner(initialState),
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
  ): AIPlayerConfig<JungleState, JungleMove> {
    const providerId = profile.provider as ProviderId;
    return {
      provider: getProvider(providerId),
      model: profile.model,
      apiKey: keys[providerId],
      endpointUrl: providerEndpointFor(providerId, keys),
      temperature: 0.15,
      maxTokens: 320,
    };
  }

  function aiConfigForLocalBot(): AIPlayerConfig<JungleState, JungleMove> {
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

        return await chooseJungleBotMoveAsync({
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
  ): Record<number, AIPlayerConfig<JungleState, JungleMove>> {
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
    seed = seed.trim() || 'jungle-table';
    syncSeedHash(seed);
    selectedPieceId = '';
    message = '';
    gameOverDismissed = false;
    normalizePlayerProfileSelections(defaultProfileId);
    aiPaused = playerProfileSelections[HUMAN_PLAYER_INDEX] !== HUMAN_SEAT_ID;

    const initialState = jungleChessAdapter.init({
      seed,
      playerCount: PLAYER_COUNT,
      aiPlayerIndices: playerIndexesControlledByAI(playerProfileSelections),
    });
    loop = createGameLoop({
      adapter: jungleChessAdapter,
      initialState,
      aiPlayers: aiConfigs(),
      rng: createRng(`${seed}:jungle-chess-ui`),
    });
    unsubscribe = loop.subscribe((next) => {
      snapshot = next;
      selectedPieceId = '';
    });
    void runAI();
  }

  function startShuffledGame() {
    seed = globalThis.crypto?.randomUUID?.() ?? `jungle-${Date.now()}`;
    startGame();
  }

  function selectPlayerProfile(playerIndex: number, profileId: string) {
    playerProfileSelections = {
      ...playerProfileSelections,
      [playerIndex]: profileId,
    };
    selectedPieceId = '';
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

  function undoMove() {
    if (!loop || !canUndo) return;
    aiController?.abort();
    loop.undo();
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
      setTimeout(() => resolve(), 300);
    });
    void runAI();
  }

  function pieceAt(x: number, y: number): JunglePiece | undefined {
    return state?.pieces.find(
      (piece) => !piece.captured && piece.x === x && piece.y === y,
    );
  }

  function targetMoveAt(x: number, y: number): JungleMove | undefined {
    return selectedMoves.find((move) => move.to.x === x && move.to.y === y);
  }

  function choosePiece(piece: JunglePiece) {
    if (!humanCanAct || piece.owner !== HUMAN_PLAYER_INDEX) {
      return;
    }

    selectedPieceId = selectedPieceId === piece.id ? '' : piece.id;
    message = '';
  }

  function chooseSquare(x: number, y: number) {
    const piece = pieceAt(x, y);
    if (piece && piece.owner === HUMAN_PLAYER_INDEX) {
      choosePiece(piece);
      return;
    }

    const move = targetMoveAt(x, y);
    if (!move || !loop || !humanCanAct) {
      return;
    }

    try {
      loop.playHumanMove(move);
      selectedPieceId = '';
      message = '';
      void runAIAfterBoardPaint();
    } catch (error) {
      message =
        error instanceof Error ? error.message : 'Move could not be played.';
    }
  }

  function squareClasses(terrain: Terrain, x: number, y: number): string {
    const target = Boolean(targetMoveAt(x, y));
    const base =
      terrain === 'water'
        ? 'border-sky-700/70 bg-sky-500/25'
        : terrain === 'trap'
          ? 'border-amber-300/70 bg-amber-300/20'
          : terrain === 'den'
            ? 'border-rose-300/70 bg-rose-400/20'
            : 'border-emerald-900/70 bg-lime-800/30';

    return `${base} ${target ? 'ring-2 ring-emerald-300 ring-offset-2 ring-offset-neutral-950' : ''}`;
  }

  function pieceTokenStyle(piece: JunglePiece): string {
    const leftPercent = (piece.x / BOARD_WIDTH) * 100;
    const leftGapOffset = (piece.x * 5) / BOARD_WIDTH;
    const topPercent = (piece.y / BOARD_HEIGHT) * 100;
    const topGapOffset = (piece.y * 5) / BOARD_HEIGHT;
    const widthPercent = 100 / BOARD_WIDTH;
    const widthGapOffset = ((BOARD_WIDTH - 1) * 5) / BOARD_WIDTH;
    const heightPercent = 100 / BOARD_HEIGHT;
    const heightGapOffset = ((BOARD_HEIGHT - 1) * 5) / BOARD_HEIGHT;

    return [
      `left: calc(${leftPercent}% + ${leftGapOffset}px)`,
      `top: calc(${topPercent}% + ${topGapOffset}px)`,
      `width: calc(${widthPercent}% - ${widthGapOffset}px)`,
      `height: calc(${heightPercent}% - ${heightGapOffset}px)`,
    ].join('; ');
  }

  function sideName(player: number): string {
    return player === 0 ? 'Red' : 'Blue';
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

  function capturedText(pieces: JunglePiece[]): string {
    return pieces.length
      ? pieces.map((piece) => pieceEmoji(piece)).join(' ')
      : '-';
  }

  function handleBoardPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return; // don't drag if clicking a square
    isDraggingBoard = true;
    isPanningBoard = e.button === 2 || e.button === 1 || e.shiftKey;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialRotationX = boardRotationX;
    initialRotationZ = boardRotationZ;
    initialPanX = boardPanX;
    initialPanY = boardPanY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
  }

  function handleBoardPointerMove(e: PointerEvent) {
    if (!isDraggingBoard) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (isPanningBoard) {
      boardPanX = initialPanX + dx / boardScale;
      boardPanY = initialPanY + dy / boardScale;
    } else {
      boardRotationX = Math.max(0, Math.min(80, initialRotationX - dy * 0.5));
      boardRotationZ = initialRotationZ + dx * 0.5;
    }
  }

  function handleBoardPointerUp(e: PointerEvent) {
    isDraggingBoard = false;
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
  }

  function handleBoardWheel(e: WheelEvent) {
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    boardScale = Math.max(0.4, Math.min(3, boardScale + delta));
  }

  function buildLogEntries(
    current: LoopSnapshot<JungleState, JungleMove> | undefined,
  ): LogEntry[] {
    if (!current) {
      return [];
    }

    return current.log
      .slice()
      .reverse()
      .map((record) => ({
        record,
        label: formatJungleMove(record.move, current.state),
      }));
  }

  function sourceLabel(record: MoveRecord<JungleMove>): string {
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
    <div class="flex min-h-0 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-900/70">
      <header
        class="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3"
      >
        <div>
          <h1 class="text-xl font-semibold tracking-normal">斗兽棋</h1>
          <p class="mt-1 text-sm text-neutral-400">
            {sideName(currentPlayer)} to move / Turn {state.turn + 1}
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
          {#if canUndo}
            <button
              class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 hover:text-white"
              type="button"
              on:click={undoMove}
            >
              Undo
            </button>
          {/if}
          <button
            class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
            type="button"
            on:click={startShuffledGame}
          >
            New game
          </button>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-[220px_minmax(520px,1fr)]">
        <aside class="space-y-3">
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

          <div class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
            <label class="text-xs font-medium text-neutral-400" for="piece-style">
              Piece Style
            </label>
            <select
              id="piece-style"
              class="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100"
              bind:value={pieceStyle}
            >
              <option value="zh">Chinese Characters</option>
              <option value="emoji">Emoji</option>
              <option value="3d">3D WebGL</option>
            </select>
          </div>

          {#each [0, 1] as player}
            <div
              class="rounded-md border border-neutral-800 bg-neutral-950 p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-semibold">{sideName(player)}</div>
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
                <span class="text-red-200">Red</span>
                <span class="text-neutral-400">{capturedText(redCaptured)}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-cyan-200">Blue</span>
                <span class="text-neutral-400">{capturedText(blueCaptured)}</span>
              </div>
            </div>
          </div>
        </aside>

        <div class="flex flex-col min-h-0">
        {#if pieceStyle === '3d'}
          <div class="relative min-h-[660px] w-full overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
            <JungleChessBoard3D
              {state}
              {selectedPieceId}
              {selectedMoves}
              onSquare={chooseSquare}
            />
            <div class="pointer-events-none absolute right-4 top-4 rounded-full border border-neutral-700/50 bg-neutral-900/80 px-4 py-2 text-xs text-neutral-300 shadow-xl backdrop-blur-sm">
              <span class="font-semibold text-neutral-100">Controls:</span> Left-Click + Drag to rotate &bull; Right-Click + Drag to pan &bull; Scroll to zoom
            </div>
          </div>
        {:else}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="relative flex min-h-[660px] items-center justify-center overflow-hidden rounded-md border border-neutral-800 theme-bg p-8"
          on:pointerdown={handleBoardPointerDown}
          on:pointermove={handleBoardPointerMove}
          on:pointerup={handleBoardPointerUp}
          on:pointercancel={handleBoardPointerUp}
          on:wheel|preventDefault={handleBoardWheel}
          on:contextmenu|preventDefault
          style={`cursor: ${isDraggingBoard ? 'grabbing' : 'grab'};`}
        >
          <div class="jungle-perspective">
            <div
              class="jungle-board"
              style={`transform: scale(${boardScale}) translate(${boardPanX}px, ${boardPanY}px) rotateX(${boardRotationX}deg) rotateZ(${boardRotationZ}deg); transition: transform ${isDraggingBoard ? '0s' : '0.15s ease-out'};`}
            >
              {#each Array.from({ length: BOARD_HEIGHT }) as _, y}
                {#each Array.from({ length: BOARD_WIDTH }) as _, x}
                  {@const terrain = terrainAt({ x, y })}
                  {@const piece = state ? pieceAt(x, y) : undefined}
                  {@const move = selectedMoves ? targetMoveAt(x, y) : undefined}
                  <button
                    class={`jungle-square relative border ${squareClasses(terrain, x, y)}`}
                    type="button"
                    aria-label={move
                      ? `Move to ${coordinateLabel(x, y)}`
                      : coordinateLabel(x, y)}
                    on:click={() => chooseSquare(x, y)}
                  >
                    <span class="absolute left-1 top-1 text-[10px] font-semibold text-white/45">
                      {coordinateLabel(x, y)}
                    </span>
                    {#if terrain === 'water'}
                      <span class="jungle-water"></span>
                    {:else if terrain === 'den'}
                      <span class="jungle-den">穴</span>
                    {:else if terrain === 'trap'}
                      <span class="jungle-trap">陷</span>
                    {/if}
                    {#if move}
                      {#if piece}
                        <span
                          class="absolute left-1/2 top-1/2 aspect-square w-[135%] rounded-full border-[4px] border-emerald-400/80 bg-emerald-400/20 shadow-[0_0_12px_rgba(52,211,153,0.5)]"
                          style="transform: translate(-50%, -50%) translateZ(8px);"
                        ></span>
                      {:else}
                        <span
                          class="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100 bg-emerald-300/70 shadow-lg"
                        ></span>
                      {/if}
                    {/if}
                  </button>
                {/each}
              {/each}
              <div class="jungle-piece-layer" aria-hidden="true">
                {#each visiblePieces as piece (piece.id)}
                  <span
                    class="jungle-piece-token"
                    style={pieceTokenStyle(piece)}
                  >
                    <JungleAnimalModel
                      type={piece.type}
                      owner={piece.owner}
                      selected={selectedPieceId === piece.id}
                      label={`${sideName(piece.owner)} ${pieceLabels[piece.type].en}`}
                      pieceStyle={pieceStyle}
                    />
                    <span
                      class={`jungle-piece-points ${piece.owner === 0 ? 'red' : 'blue'}`}
                      title={`${pieceLabels[piece.type].en} rank ${piece.rank}`}
                    >
                      {piece.rank}
                    </span>
                  </span>
                {/each}
              </div>
            </div>
          </div>
          <div class="pointer-events-none absolute right-4 top-4 rounded-full border border-neutral-700/50 bg-neutral-900/80 px-4 py-2 text-xs text-neutral-300 shadow-xl backdrop-blur-sm">
            <span class="font-semibold text-neutral-100">Controls:</span> Left-Click + Drag to rotate &bull; Right-Click + Drag to pan &bull; Scroll to zoom
          </div>
        </div>
        {/if}
      </div>
    </div>
  </div>

  <aside class="flex min-h-0 flex-col rounded-md border border-neutral-800 bg-neutral-900/70">
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
                  Turn {entry.record.turn + 1} / {sideName(entry.record.player)}
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

{#if snapshot?.status === 'terminal' && terminalWinner !== null && !gameOverDismissed}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <h2 class="text-xl font-semibold tracking-normal">Game Over</h2>
      <p class="mt-2 text-neutral-300">{sideName(terminalWinner)} wins.</p>
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

<style>
  .theme-bg {
    --theme-bg: linear-gradient(180deg, #0f172a, #020617);
    --board-bg: linear-gradient(135deg, rgba(101, 163, 13, 0.24), transparent 38%),
      linear-gradient(45deg, rgba(14, 165, 233, 0.2), transparent 60%), #1f2920;
    --board-border: rgba(163, 230, 53, 0.2);
    --water-bg: rgba(56, 189, 248, 0.24);
    --water-shadow: 0 0 18px rgba(56, 189, 248, 0.36);
    --den-color: rgba(255, 255, 255, 0.4);
    --trap-color: rgba(255, 255, 255, 0.4);
    background: var(--theme-bg, linear-gradient(180deg, #111827, #020617));
  }

  .jungle-perspective {
    perspective: 1100px;
    width: min(82vh, 680px);
    min-width: 520px;
    touch-action: none; /* Prevent scroll while dragging */
  }

  .jungle-board {
    position: relative;
    aspect-ratio: 7 / 9;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-template-rows: repeat(9, minmax(0, 1fr));
    gap: 5px;
    padding: 14px;
    border: 1px solid var(--board-border, rgba(148, 163, 184, 0.34));
    border-radius: 8px;
    background: var(--board-bg, #172018);
    box-shadow:
      0 38px 70px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transform-style: preserve-3d;
  }

  .jungle-board::after {
    content: '';
    position: absolute;
    inset: 14px;
    pointer-events: none;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    transform: translateZ(1px);
  }

  .jungle-square {
    min-width: 0;
    border-radius: 5px;
    transform-style: preserve-3d;
    transition:
      border-color 160ms ease,
      filter 160ms ease,
      transform 160ms ease;
  }

  .jungle-square:hover {
    filter: brightness(1.13);
    transform: translateZ(5px);
  }

  .jungle-piece-layer {
    position: absolute;
    inset: 14px;
    pointer-events: none;
    transform-style: preserve-3d;
    z-index: 2;
  }

  .jungle-piece-token {
    position: absolute;
    padding: 8px;
    transition:
      left 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
      top 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
    transform-style: preserve-3d;
  }

  .jungle-piece-points {
    position: absolute;
    right: -1px;
    top: 7px;
    z-index: 3;
    display: grid;
    height: 24px;
    min-width: 24px;
    place-items: center;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.78);
    background: rgba(15, 23, 42, 0.92);
    box-shadow:
      0 8px 12px rgba(0, 0, 0, 0.36),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
    color: white;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    transform: translateZ(56px) rotateZ(4deg) rotateX(-56deg);
  }

  .jungle-piece-points.red {
    border-color: rgba(254, 202, 202, 0.92);
    background: linear-gradient(145deg, #991b1b, #450a0a);
  }

  .jungle-piece-points.blue {
    border-color: rgba(186, 230, 253, 0.92);
    background: linear-gradient(145deg, #0369a1, #082f49);
  }

  .jungle-water {
    position: absolute;
    inset: 18%;
    border-radius: 999px;
    background: var(--water-bg, rgba(125, 211, 252, 0.24));
    box-shadow: var(--water-shadow, 0 0 18px rgba(56, 189, 248, 0.36));
    backdrop-filter: blur(4px);
  }

  .jungle-den,
  .jungle-trap {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--den-color, rgba(255, 255, 255, 0.32));
    font-size: 1.6rem;
    font-weight: 900;
    transform: translateZ(4px);
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  }

  @media (max-width: 900px) {
    .jungle-perspective {
      min-width: 420px;
      width: 92vw;
    }
  }
</style>
