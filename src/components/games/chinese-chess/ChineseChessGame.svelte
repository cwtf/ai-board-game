<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import TokenUsageBadge from '@/components/ai/TokenUsageBadge.svelte';
  import ChinesePieceToken from '@/components/games/chinese-chess/ChinesePieceToken.svelte';
  import ChineseChessBoard3D from '@/components/games/chinese-chess/ChineseChessBoard3D.svelte';
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
  import { chineseChessAdapter } from '@/lib/games/chinese-chess/ai-adapter';
  import { chooseChineseChessBotMove } from '@/lib/games/chinese-chess/bot';
  import {
    coordinateLabel,
    formatChineseChessMove,
    pieceChar,
  } from '@/lib/games/chinese-chess/move-format';
  import { activePieces } from '@/lib/games/chinese-chess/rules';
  import {
    BOARD_HEIGHT,
    BOARD_WIDTH,
    pieceLabels,
    type ChineseChessMove,
    type ChineseChessPiece,
    type ChineseChessState,
  } from '@/lib/games/chinese-chess/state';
  import {
    getStoredKeys,
    hasProviderCredentials,
    providerEndpointFor,
    selectedProfileFor,
    type ProviderModelProfile,
    type StoredKeys,
  } from '@/lib/storage/keys';

  type LogEntry = {
    record: MoveRecord<ChineseChessMove>;
    label: string;
  };

  const HUMAN_PLAYER_INDEX = 0;
  const PLAYER_COUNT = 2;
  const LOCAL_BOT_PROFILE = '__local_chinese_chess_bot__';
  const localBotSeatOptions = [
    { id: LOCAL_BOT_PROFILE, label: 'Local bot' },
  ] satisfies LocalAISeatOption[];

  let keys: StoredKeys = {};
  let seed = 'chinese-chess-table';
  let loop: GameLoop<ChineseChessState, ChineseChessMove> | undefined;
  let unsubscribe: (() => void) | undefined;
  let snapshot: LoopSnapshot<ChineseChessState, ChineseChessMove> | undefined =
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
  let pieceStyle: 'zh' | 'emoji' | '3d' | 'zh-3d' = 'zh';
  let cameraView: 'default' | 'top' | 'isometric' | 'front' = 'default';
  let cameraZoom: number = 1;

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

  $: boardScale = cameraZoom;

  function applyCameraView(view: typeof cameraView) {
    if (view === 'top') {
      boardRotationX = 0;
      boardRotationZ = 0;
    } else if (view === 'isometric') {
      boardRotationX = 60;
      boardRotationZ = 45;
    } else if (view === 'front') {
      boardRotationX = 75;
      boardRotationZ = 0;
    } else {
      boardRotationX = 56;
      boardRotationZ = -4;
    }
  }

  $: applyCameraView(cameraView);
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
  $: canUndo = (snapshot?.log.length ?? 0) > 0 && snapshot?.status !== 'thinking';
  $: legalMoves = state ? chineseChessAdapter.legalMoves(state, currentPlayer) : [];
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
  $: blackCaptured = state
    ? state.pieces.filter((piece) => piece.owner === 1 && piece.captured)
    : [];
  $: visiblePieces = state ? activePieces(state) : [];

  function createInitialSnapshot(): LoopSnapshot<ChineseChessState, ChineseChessMove> {
    const initialState = chineseChessAdapter.init({
      seed,
      playerCount: PLAYER_COUNT,
      aiPlayerIndices: [],
    });

    return {
      state: initialState,
      status: 'idle',
      currentPlayer: chineseChessAdapter.currentPlayer(initialState),
      winner: chineseChessAdapter.winner(initialState),
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
  ): AIPlayerConfig<ChineseChessState, ChineseChessMove> {
    const providerId = profile.provider as ProviderId;
    return {
      provider: getProvider(providerId),
      model: profile.model,
      apiKey: keys[providerId],
      endpointUrl: providerEndpointFor(providerId, keys),
      temperature: 0.15,
      maxTokens: 400,
    };
  }

  function aiConfigForLocalBot(): AIPlayerConfig<ChineseChessState, ChineseChessMove> {
    return {
      kind: 'local',
      label: 'Local bot',
      model: 'Local bot',
      chooseMove({ state: currentState, player, legalMoves: moves, signal }) {
        if (signal?.aborted) {
          const error = new Error('AI move aborted.');
          error.name = 'AbortError';
          throw error;
        }

        return chooseChineseChessBotMove({
          state: currentState,
          player,
          legalMoves: moves,
        });
      },
    };
  }

  function aiConfigs(
    selections: SeatSelections = playerProfileSelections,
  ): Record<number, AIPlayerConfig<ChineseChessState, ChineseChessMove>> {
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
    seed = seed.trim() || 'chinese-chess-table';
    syncSeedHash(seed);
    selectedPieceId = '';
    message = '';
    gameOverDismissed = false;
    normalizePlayerProfileSelections(defaultProfileId);
    aiPaused = playerProfileSelections[HUMAN_PLAYER_INDEX] !== HUMAN_SEAT_ID;

    const initialState = chineseChessAdapter.init({
      seed,
      playerCount: PLAYER_COUNT,
      aiPlayerIndices: playerIndexesControlledByAI(playerProfileSelections),
    });
    loop = createGameLoop({
      adapter: chineseChessAdapter,
      initialState,
      aiPlayers: aiConfigs(),
      rng: createRng(`${seed}:chinese-chess-ui`),
    });
    unsubscribe = loop.subscribe((next) => {
      snapshot = next;
      selectedPieceId = '';
    });
    void runAI();
  }

  function startShuffledGame() {
    seed = globalThis.crypto?.randomUUID?.() ?? `chinese-chess-${Date.now()}`;
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

  function pieceAt(x: number, y: number): ChineseChessPiece | undefined {
    return state?.pieces.find(
      (piece) => !piece.captured && piece.x === x && piece.y === y,
    );
  }

  function targetMoveAt(x: number, y: number): ChineseChessMove | undefined {
    return selectedMoves.find((move) => move.to.x === x && move.to.y === y);
  }

  function choosePiece(piece: ChineseChessPiece) {
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

  function intersectionStyle(x: number, y: number): string {
    return [
      `left: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * ${x} / ${BOARD_WIDTH - 1})`,
      `top: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * ${y} / ${BOARD_HEIGHT - 1})`,
    ].join('; ');
  }

  function pieceTokenStyle(piece: ChineseChessPiece): string {
    const leftPercent = (piece.x / (BOARD_WIDTH - 1)) * 100;
    const topPercent = (piece.y / (BOARD_HEIGHT - 1)) * 100;

    return [
      `left: ${leftPercent}%`,
      `top: ${topPercent}%`,
    ].join('; ');
  }

  function sideName(player: number): string {
    return player === 0 ? 'Red' : 'Black';
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

  function capturedText(pieces: ChineseChessPiece[]): string {
    return pieces.length
      ? pieces.map((piece) => pieceChar(piece)).join(' ')
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
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    cameraZoom = Math.max(0.25, Math.min(2, cameraZoom + delta));
  }

  function buildLogEntries(
    current: LoopSnapshot<ChineseChessState, ChineseChessMove> | undefined,
  ): LogEntry[] {
    if (!current) {
      return [];
    }

    return current.log
      .slice()
      .reverse()
      .map((record) => ({
        record,
        label: formatChineseChessMove(record.move, current.state),
      }));
  }

  function sourceLabel(record: MoveRecord<ChineseChessMove>): string {
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
          <h1 class="text-xl font-semibold tracking-normal">象棋</h1>
          <p class="mt-1 text-sm text-neutral-400">
            {sideName(currentPlayer)} to move / Turn {state.turn + 1}
            {#if state.isCheck}
              <span class="ml-2 rounded-full border border-rose-300/60 bg-rose-300/10 px-2 py-0.5 text-xs text-rose-100">
                Check
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
              <option value="zh-3d">Chinese Board with 3D Pieces</option>
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
                <span class="text-gray-300">Black</span>
                <span class="text-neutral-400">{capturedText(blackCaptured)}</span>
              </div>
            </div>
          </div>
        </aside>

        {#if pieceStyle === '3d' || pieceStyle === 'zh-3d'}
          <div class="relative min-h-[660px] w-full overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
            <ChineseChessBoard3D
              {state}
              {selectedPieceId}
              {selectedMoves}
              {cameraView}
              {cameraZoom}
              boardStyle={pieceStyle === 'zh-3d' ? 'zh' : '3d'}
              onSquare={chooseSquare}
            />
            <div class="pointer-events-none absolute right-4 top-4 rounded-full border border-neutral-700/50 bg-neutral-900/80 px-4 py-2 text-xs text-neutral-300 shadow-xl backdrop-blur-sm">
              <span class="font-semibold text-neutral-100">Controls:</span> Left-Click + Drag to rotate &bull; Right-Click + Drag to pan &bull; Scroll to zoom
            </div>
            <div class="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/80 px-2 py-1.5 shadow-xl backdrop-blur-sm pointer-events-auto">
              <label class="text-xs font-medium text-neutral-300" for="camera-view-3d">View:</label>
              <select id="camera-view-3d" class="bg-transparent text-xs text-neutral-100 outline-none cursor-pointer" bind:value={cameraView}>
                <option value="default" class="bg-neutral-900">Default</option>
                <option value="top" class="bg-neutral-900">Top</option>
                <option value="isometric" class="bg-neutral-900">Isometric</option>
                <option value="front" class="bg-neutral-900">Front</option>
              </select>
            </div>
            <div class="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/80 px-2 py-1.5 shadow-xl backdrop-blur-sm pointer-events-auto">
              <label class="text-xs font-medium text-neutral-300" for="camera-zoom-3d">Zoom:</label>
              <select id="camera-zoom-3d" class="bg-transparent text-xs text-neutral-100 outline-none cursor-pointer" bind:value={cameraZoom}>
                <option value={0.25} class="bg-neutral-900">25%</option>
                <option value={0.5} class="bg-neutral-900">50%</option>
                <option value={0.75} class="bg-neutral-900">75%</option>
                <option value={1} class="bg-neutral-900">100%</option>
                <option value={1.25} class="bg-neutral-900">125%</option>
                <option value={1.5} class="bg-neutral-900">150%</option>
                <option value={1.75} class="bg-neutral-900">175%</option>
                <option value={2} class="bg-neutral-900">200%</option>
              </select>
            </div>
          </div>

        {:else}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="relative flex min-h-[660px] items-center justify-center overflow-hidden rounded-md border border-neutral-800 bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,#111827,#020617)] p-8"
            on:pointerdown={handleBoardPointerDown}
            on:pointermove={handleBoardPointerMove}
            on:pointerup={handleBoardPointerUp}
            on:pointercancel={handleBoardPointerUp}
            on:wheel|preventDefault={handleBoardWheel}
            on:contextmenu|preventDefault
            style={`cursor: ${isDraggingBoard ? 'grabbing' : 'grab'};`}
          >
            <div class="chinese-perspective">
              <div
                class="chinese-board"
                style={`transform: scale(${boardScale}) translate(${boardPanX}px, ${boardPanY}px) rotateX(${boardRotationX}deg) rotateZ(${boardRotationZ}deg); transition: transform ${isDraggingBoard ? '0s' : '0.15s ease-out'};`}
              >
              {#each Array.from({ length: BOARD_HEIGHT }) as _, y}
                {#each Array.from({ length: BOARD_WIDTH }) as _, x}
                  {@const piece = state ? pieceAt(x, y) : undefined}
                  {@const move = selectedMoves ? targetMoveAt(x, y) : undefined}
                  <button
                    class={`chinese-square ${move ? 'target' : ''}`}
                    style={intersectionStyle(x, y)}
                    type="button"
                    aria-label={move
                      ? `Move to ${coordinateLabel(x, y)}`
                      : coordinateLabel(x, y)}
                    on:click={() => chooseSquare(x, y)}
                  >
                    {#if (x === 3 || x === 5) && (y === 0 || y === 2 || y === 7 || y === 9)}
                      <span class="palace-mark"></span>
                    {/if}
                    {#if x === 4 && (y === 1 || y === 8)}
                      <span class="palace-center"></span>
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
              <!-- River band overlay -->
              <div class="river-band" aria-hidden="true">
                <span class="river-label">楚 河</span>
                <span class="river-label">漢 界</span>
              </div>
              <!-- Palace diagonals -->
              <div class="palace-diagonal palace-top-left" aria-hidden="true"></div>
              <div class="palace-diagonal palace-top-right" aria-hidden="true"></div>
              <div class="palace-diagonal palace-bottom-left" aria-hidden="true"></div>
              <div class="palace-diagonal palace-bottom-right" aria-hidden="true"></div>

              <div class="chinese-piece-layer" aria-hidden="true">
                {#each visiblePieces as piece (piece.id)}
                  <span
                    class="chinese-piece-token"
                    style={pieceTokenStyle(piece)}
                  >
                    <ChinesePieceToken
                      type={piece.type}
                      owner={piece.owner}
                      selected={selectedPieceId === piece.id}
                      label={`${sideName(piece.owner)} ${pieceLabels[piece.type].en}`}
                      pieceStyle={pieceStyle}
                    />
                  </span>
                {/each}
              </div>
            </div>
          </div>
          <div class="pointer-events-none absolute right-4 top-4 rounded-full border border-neutral-700/50 bg-neutral-900/80 px-4 py-2 text-xs text-neutral-300 shadow-xl backdrop-blur-sm">
            <span class="font-semibold text-neutral-100">Controls:</span> Left-Click + Drag to rotate &bull; Right-Click + Drag to pan &bull; Scroll to zoom
          </div>
          <div class="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/80 px-2 py-1.5 shadow-xl backdrop-blur-sm pointer-events-auto">
            <label class="text-xs font-medium text-neutral-300" for="camera-view-2d">View:</label>
            <select id="camera-view-2d" class="bg-transparent text-xs text-neutral-100 outline-none cursor-pointer" bind:value={cameraView}>
              <option value="default" class="bg-neutral-900">Default</option>
              <option value="top" class="bg-neutral-900">Top</option>
              <option value="isometric" class="bg-neutral-900">Isometric</option>
              <option value="front" class="bg-neutral-900">Front</option>
            </select>
          </div>
          <div class="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/80 px-2 py-1.5 shadow-xl backdrop-blur-sm pointer-events-auto">
            <label class="text-xs font-medium text-neutral-300" for="camera-zoom-2d">Zoom:</label>
            <select id="camera-zoom-2d" class="bg-transparent text-xs text-neutral-100 outline-none cursor-pointer" bind:value={cameraZoom}>
              <option value={0.25} class="bg-neutral-900">25%</option>
              <option value={0.5} class="bg-neutral-900">50%</option>
              <option value={0.75} class="bg-neutral-900">75%</option>
              <option value={1} class="bg-neutral-900">100%</option>
              <option value={1.25} class="bg-neutral-900">125%</option>
              <option value={1.5} class="bg-neutral-900">150%</option>
              <option value={1.75} class="bg-neutral-900">175%</option>
              <option value={2} class="bg-neutral-900">200%</option>
            </select>
          </div>
        </div>
        {/if}
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
  .chinese-perspective {
    perspective: 1100px;
    width: min(82vh, 680px);
    min-width: 520px;
  }

  .chinese-board {
    --board-inset: 42px;
    position: relative;
    aspect-ratio: 8 / 9;
    padding: var(--board-inset);
    border: 1px solid rgba(180, 140, 80, 0.45);
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(180, 140, 80, 0.18), transparent 38%),
      linear-gradient(45deg, rgba(120, 90, 50, 0.14), transparent 60%),
      #1a1510;
    box-shadow:
      0 38px 70px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    transform-style: preserve-3d;
  }

  .chinese-board::before {
    content: '';
    position: absolute;
    inset: var(--board-inset);
    pointer-events: none;
    background-image:
      linear-gradient(to right, rgba(245, 198, 125, 0.46) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(245, 198, 125, 0.46) 1px, transparent 1px);
    background-size:
      calc(100% / 8) 100%,
      100% calc(100% / 9);
    border-right: 1px solid rgba(245, 198, 125, 0.46);
    border-bottom: 1px solid rgba(245, 198, 125, 0.46);
    transform: translateZ(1px);
  }

  .chinese-board::after {
    content: '';
    position: absolute;
    inset: var(--board-inset);
    pointer-events: none;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    transform: translateZ(1px);
  }

  .chinese-square {
    position: absolute;
    width: clamp(42px, 9%, 62px);
    aspect-ratio: 1;
    border: 0;
    padding: 0;
    background: transparent;
    min-width: 0;
    border-radius: 999px;
    transform: translate(-50%, -50%) translateZ(3px);
    transform-style: preserve-3d;
    transition:
      border-color 160ms ease,
      filter 160ms ease,
      transform 160ms ease;
    z-index: 3;
  }

  .chinese-square:hover {
    filter: brightness(1.13);
    transform: translate(-50%, -50%) translateZ(7px);
  }

  .palace-mark,
  .palace-center {
    display: none;
  }

  .palace-mark {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    background: rgba(180, 140, 70, 0.08);
  }

  .palace-center {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(180, 140, 70, 0.12);
  }

  .river-band {
    position: absolute;
    left: var(--board-inset);
    right: var(--board-inset);
    top: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 4 / 9);
    height: calc((100% - var(--board-inset) * 2) / 9);
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    background:
      linear-gradient(90deg, rgba(56, 189, 248, 0.05), rgba(56, 189, 248, 0.12), rgba(56, 189, 248, 0.05));
    border-top: 1px solid rgba(56, 189, 248, 0.2);
    border-bottom: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 4px;
  }

  .river-label {
    font-size: 0.85rem;
    font-weight: 700;
    color: rgba(125, 211, 252, 0.35);
    letter-spacing: 0.15em;
    font-family: "Noto Serif SC", "Songti SC", serif;
  }

  .palace-diagonal {
    position: absolute;
    pointer-events: none;
    border-top: 1px solid rgba(180, 140, 70, 0.25);
    transform-origin: left center;
    z-index: 1;
  }

  .palace-top-left {
    left: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 3 / 8);
    top: var(--board-inset);
    width: calc((100% - var(--board-inset) * 2) * 2 / 8 * 1.414);
    transform: rotate(45deg);
  }

  .palace-top-right {
    left: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 3 / 8);
    top: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 2 / 9);
    width: calc((100% - var(--board-inset) * 2) * 2 / 8 * 1.414);
    transform: rotate(-45deg);
  }

  .palace-bottom-left {
    left: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 3 / 8);
    top: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 9 / 9);
    width: calc((100% - var(--board-inset) * 2) * 2 / 8 * 1.414);
    transform: rotate(-45deg);
  }

  .palace-bottom-right {
    left: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 3 / 8);
    top: calc(var(--board-inset) + (100% - var(--board-inset) * 2) * 7 / 9);
    width: calc((100% - var(--board-inset) * 2) * 2 / 8 * 1.414);
    transform: rotate(45deg);
  }

  .chinese-piece-layer {
    position: absolute;
    inset: var(--board-inset);
    pointer-events: none;
    transform-style: preserve-3d;
    z-index: 2;
  }

  .chinese-piece-token {
    position: absolute;
    width: clamp(44px, 10%, 66px);
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    transition:
      left 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
      top 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
    transform-style: preserve-3d;
  }

  @media (max-width: 900px) {
    .chinese-perspective {
      min-width: 420px;
      width: 92vw;
    }
  }
</style>
