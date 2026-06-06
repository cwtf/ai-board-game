<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import TokenUsageBadge from '@/components/ai/TokenUsageBadge.svelte';
  import SplendorCardArt from '@/components/games/splendor/SplendorCardArt.svelte';
  import SplendorGemBadge from '@/components/games/splendor/SplendorGemBadge.svelte';
  import SplendorNobleArt from '@/components/games/splendor/SplendorNobleArt.svelte';
  import Splendor3DView from '@/components/games/splendor/Splendor3DView.svelte';
  import { getProvider } from '@/lib/ai';
  import type { ProviderId, TokenUsage } from '@/lib/ai';
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
  import type {
    AIPlayerConfig,
    GameAdapter,
    MoveRecord,
  } from '@/lib/games/shared/types';
  import { splendorAdapter } from '@/lib/games/splendor/ai-adapter';
  import {
    chooseSplendorBotMove,
    type SplendorBotDifficulty,
  } from '@/lib/games/splendor/bot';
  import {
    formatSplendorMove,
    splendorGemLabels,
  } from '@/lib/games/splendor/move-format';
  import { ALL_CARDS } from '@/lib/games/splendor/data/cards';
  import {
    applyMove as applySplendorMove,
    developmentCardsExhausted,
  } from '@/lib/games/splendor/rules';
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
    selectedProfileFor,
    type ProviderModelProfile,
    type StoredKeys,
  } from '@/lib/storage/keys';

  type Modal = 'gold' | 'discard' | 'noble' | null;
  type RectSnapshot = {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  type MoveAnimationIntent =
    | { kind: 'card'; playerIndex: number; card: Card; from: RectSnapshot }
    | { kind: 'noble'; playerIndex: number; noble: Noble; from: RectSnapshot }
    | { kind: 'gem'; playerIndex: number; gem: GemOrGold; from: RectSnapshot }
    | { kind: 'refill'; card: Card; from: RectSnapshot };
  type FlyingAsset = MoveAnimationIntent & {
    id: string;
    style: string;
  };
  type LoggedTokenAmount = { gem: GemOrGold; amount: number };
  type LoggedMoveView = {
    record: MoveRecord<SplendorMove>;
    card?: Card;
    action: string;
    discard: LoggedTokenAmount[];
    noble?: string;
  };

  const LOCAL_BOT_EASY_PROFILE = '__local_bot_easy__';
  const LOCAL_BOT_MEDIUM_PROFILE = '__local_bot_medium__';
  const LOCAL_BOT_HARD_PROFILE = '__local_bot_hard__';
  const localBotSeatOptions = [
    { id: LOCAL_BOT_HARD_PROFILE, label: 'Local bot - Hard' },
    { id: LOCAL_BOT_MEDIUM_PROFILE, label: 'Local bot - Medium' },
    { id: LOCAL_BOT_EASY_PROFILE, label: 'Local bot - Easy' },
  ] satisfies LocalAISeatOption[];
  const HUMAN_PLAYER_INDEX = 0;
  const MIN_TABLE_WIDTH = 2100;
  const TABLE_HEIGHT = 900;
  const TABLE_RIGHT_GUTTER = 24;
  const MOVE_LOG_PAGE_SIZE = 40;
  const allCardsById = new Map(ALL_CARDS.map((card) => [card.id, card]));
  const gemLabels = splendorGemLabels;
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
  let unsubscribe: (() => void) | undefined;
  let playerCount = 2;
  let seed = 'splendor-table';
  let snapshot: LoopSnapshot<SplendorState, SplendorMove> | undefined =
    createInitialSnapshot();
  let selectedGems: Gem[] = [];
  let pendingMove: SplendorMove | undefined;
  let activeModal: Modal = null;
  let discardDraft: Partial<Record<GemOrGold, number>> = {};
  let goldDraft: Partial<Record<Gem, number>> = {};
  let nobleDraft = '';
  let message = '';
  let aiController: ReturnType<typeof createAbortController> | undefined;
  let viewportEl: globalThis.HTMLElement;
  let viewMode: '3d' | 'stock' = '3d';
  let cameraView: 'default' | 'top' | 'isometric' | 'front' = 'default';
  let cameraZoom: number = 1;
  let tableWidth = MIN_TABLE_WIDTH;
  let tableScale = 1;
  let tableOffsetX = 0;
  let tableOffsetY = 0;
  let handledPointerSelection = false;
  let gameOverDismissed = false;
  let playUntilCardsExhausted = false;
  let moveLogOpen = false;
  let moveLogLimit = MOVE_LOG_PAGE_SIZE;
  let flyingAssets: FlyingAsset[] = [];
  let playerProfileSelections: SeatSelections = {
    [HUMAN_PLAYER_INDEX]: HUMAN_SEAT_ID,
  };
  let aiPaused = false;
  const supplyGemElements = new Map<GemOrGold, globalThis.HTMLElement>();
  const playerGemTargetElements = new Map<string, globalThis.HTMLElement>();
  const boardCardElements = new Map<string, globalThis.HTMLElement>();
  const deckElements = new Map<Tier, globalThis.HTMLElement>();
  const reservedCardElements = new Map<string, globalThis.HTMLElement>();
  const ownedCardElements = new Map<string, globalThis.HTMLElement>();
  const nobleElements = new Map<string, globalThis.HTMLElement>();
  const playerPanelElements = new Map<number, globalThis.HTMLElement>();
  const playerCardTargetElements = new Map<number, globalThis.HTMLElement>();
  const playerNobleTargetElements = new Map<number, globalThis.HTMLElement>();

  const gameAdapter: GameAdapter<SplendorState, SplendorMove> = {
    ...splendorAdapter,
    applyMove(current, move) {
      return applySplendorMove(current, move, {
        allowAfterTerminal: playUntilCardsExhausted,
      });
    },
    isTerminal: isTerminalForActiveMode,
    winner: winnerForActiveMode,
  };

  function createInitialSnapshot(): LoopSnapshot<SplendorState, SplendorMove> {
    const initialState = splendorAdapter.init({
      seed,
      playerCount,
      aiPlayerIndices: [],
    });

    return {
      state: initialState,
      status: 'idle',
      currentPlayer: splendorAdapter.currentPlayer(initialState),
      winner: splendorAdapter.winner(initialState),
      log: [],
      totalUsage: { input: 0, output: 0 },
    };
  }

  function scoreWinner(current: SplendorState): number | null {
    const bestPrestige = Math.max(
      ...current.players.map((player) => player.prestige),
    );
    const contenders = current.players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.prestige === bestPrestige);
    const fewestCards = Math.min(
      ...contenders.map(({ player }) => player.cards.length),
    );
    const winners = contenders.filter(
      ({ player }) => player.cards.length === fewestCards,
    );
    return winners.length === 1 ? winners[0].index : null;
  }

  function isTerminalForActiveMode(current: SplendorState): boolean {
    return playUntilCardsExhausted
      ? developmentCardsExhausted(current)
      : splendorAdapter.isTerminal(current);
  }

  function winnerForActiveMode(current: SplendorState): number | null {
    if (playUntilCardsExhausted && developmentCardsExhausted(current)) {
      return splendorAdapter.winner(current) ?? scoreWinner(current);
    }

    return splendorAdapter.winner(current);
  }

  $: state = snapshot?.state;
  $: currentPlayer = snapshot?.currentPlayer ?? 0;
  $: if (typeof window !== 'undefined' && (viewMode === 'stock' || viewMode === '3d')) {
    localStorage.setItem('splendor-view-mode', viewMode);
  }
  $: humanCanAct =
    currentPlayer === HUMAN_PLAYER_INDEX &&
    playerProfileSelections[HUMAN_PLAYER_INDEX] === HUMAN_SEAT_ID &&
    snapshot?.status !== 'thinking';
  $: legalMoves =
    state && humanCanAct
      ? splendorAdapter.legalMoves(state, HUMAN_PLAYER_INDEX)
      : [];
  $: selectedProfile = selectedProfileFor(keys);
  $: configuredProfiles = (keys.modelProfiles ?? []).filter((profile) =>
    hasProviderCredentials(profile.provider, keys),
  );
  $: defaultProfileId =
    configuredProfiles.find((profile) => profile.id === selectedProfile?.id)
      ?.id ??
    configuredProfiles[0]?.id ??
    LOCAL_BOT_MEDIUM_PROFILE;
  $: normalizePlayerProfileSelections(playerCount, defaultProfileId);
  $: aiPlayerIndexes = playerIndexesControlledByAI(playerProfileSelections);
  $: humanDelegated =
    playerProfileSelections[HUMAN_PLAYER_INDEX] !== HUMAN_SEAT_ID;
  $: gamePaused = humanDelegated && aiPaused;
  $: lastUsage = snapshot?.log.at(-1)?.usage;
  $: moveLogEntries = (snapshot?.log.slice().reverse() ?? []).map(
    moveLogView,
  );
  $: visibleMoveLogEntries = moveLogEntries.slice(0, moveLogLimit);
  $: terminalWinner = state ? winnerForActiveMode(state) : null;
  $: canContinueToCardExhaustion = Boolean(
    state &&
      snapshot?.status === 'terminal' &&
      splendorAdapter.isTerminal(state) &&
      !playUntilCardsExhausted &&
      !developmentCardsExhausted(state),
  );
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

  function resizeTable() {
    if (!viewportEl) {
      return;
    }

    const style = window.getComputedStyle(viewportEl);
    const horizontalPadding =
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight);
    const verticalPadding =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom);
    const availableWidth = Math.max(
      1,
      viewportEl.clientWidth - horizontalPadding,
    );
    const availableHeight = Math.max(
      1,
      viewportEl.clientHeight - verticalPadding,
    );
    const heightScale = Math.min(availableHeight / TABLE_HEIGHT, 1);
    const usableWidth = Math.max(1, availableWidth - TABLE_RIGHT_GUTTER);
    tableWidth = Math.max(MIN_TABLE_WIDTH, usableWidth / heightScale);
    const scale = Math.min(usableWidth / tableWidth, heightScale, 1);
    tableScale = scale;
    tableOffsetX = Math.max(0, horizontalPadding / 2);
    tableOffsetY = Math.max(0, verticalPadding / 2);
  }

  async function resizeTableAfterRender() {
    await tick();
    resizeTable();
    globalThis.requestAnimationFrame(resizeTable);
  }

  function createAbortController() {
    return new globalThis.AbortController();
  }

  function trackElement<K>(
    map: Map<K, globalThis.HTMLElement>,
    node: globalThis.HTMLElement,
    key: K,
  ) {
    map.set(key, node);
    return {
      update(nextKey: K) {
        if (nextKey !== key) {
          map.delete(key);
          key = nextKey;
          map.set(key, node);
        }
      },
      destroy() {
        if (map.get(key) === node) {
          map.delete(key);
        }
      },
    };
  }

  function registerBoardCard(node: globalThis.HTMLElement, cardId: string) {
    return trackElement(boardCardElements, node, cardId);
  }

  function registerDeck(node: globalThis.HTMLElement, tier: Tier) {
    return trackElement(deckElements, node, tier);
  }

  function registerSupplyGem(node: globalThis.HTMLElement, gem: GemOrGold) {
    return trackElement(supplyGemElements, node, gem);
  }

  function registerPlayerGemTarget(node: globalThis.HTMLElement, key: string) {
    return trackElement(playerGemTargetElements, node, key);
  }

  function registerReservedCard(node: globalThis.HTMLElement, key: string) {
    return trackElement(reservedCardElements, node, key);
  }

  function registerOwnedCard(node: globalThis.HTMLElement, cardId: string) {
    return trackElement(ownedCardElements, node, cardId);
  }

  function registerNoble(node: globalThis.HTMLElement, nobleId: string) {
    return trackElement(nobleElements, node, nobleId);
  }

  function registerPlayerPanel(
    node: globalThis.HTMLElement,
    playerIndex: number,
  ) {
    return trackElement(playerPanelElements, node, playerIndex);
  }

  function registerPlayerCardTarget(
    node: globalThis.HTMLElement,
    playerIndex: number,
  ) {
    return trackElement(playerCardTargetElements, node, playerIndex);
  }

  function registerPlayerNobleTarget(
    node: globalThis.HTMLElement,
    playerIndex: number,
  ) {
    return trackElement(playerNobleTargetElements, node, playerIndex);
  }

  function elementRect(
    element: globalThis.HTMLElement | undefined,
  ): RectSnapshot | undefined {
    if (!element) {
      return undefined;
    }

    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function centeredTargetRect(
    target: RectSnapshot,
    source: RectSnapshot,
  ): RectSnapshot {
    const width = Math.max(
      42,
      Math.min(source.width, target.width || source.width),
    );
    const height = width * (source.height / Math.max(1, source.width));

    return {
      left: target.left + target.width / 2 - width / 2,
      top: target.top + target.height / 2 - height / 2,
      width,
      height,
    };
  }

  function animationStyle(from: RectSnapshot, to: RectSnapshot): string {
    return [
      `left: ${from.left}px`,
      `top: ${from.top}px`,
      `width: ${from.width}px`,
      `height: ${from.height}px`,
      `--fly-x: ${to.left - from.left}px`,
      `--fly-y: ${to.top - from.top}px`,
      `--fly-scale-x: ${to.width / Math.max(1, from.width)}`,
      `--fly-scale-y: ${to.height / Math.max(1, from.height)}`,
    ].join('; ');
  }

  function cardIds(cards: Card[]): Set<string> {
    return new Set(cards.map((card) => card.id));
  }

  function nobleIds(nobles: Noble[]): Set<string> {
    return new Set(nobles.map((noble) => noble.id));
  }

  function playerGemTargetKey(playerIndex: number, gem: GemOrGold): string {
    return `${playerIndex}:${gem}`;
  }

  function collectMoveAnimationIntents(
    previous: LoopSnapshot<SplendorState, SplendorMove> | undefined,
    next: LoopSnapshot<SplendorState, SplendorMove>,
  ): MoveAnimationIntent[] {
    if (!previous || previous.state.turn === next.state.turn) {
      return [];
    }

    const record = next.log.at(-1);
    if (!record) {
      return [];
    }

    const playerIndex = record.player;
    const before = previous.state.players[playerIndex];
    const after = next.state.players[playerIndex];
    const previousCards = cardIds(before.cards);
    const previousNobles = nobleIds(before.nobles);
    const intents: MoveAnimationIntent[] = [];

    if (record.move.kind === 'take') {
      for (const gem of record.move.gems) {
        const from = elementRect(supplyGemElements.get(gem));
        if (from) {
          intents.push({ kind: 'gem', playerIndex, gem, from });
        }
      }
    }

    const tookReserveGold =
      record.move.kind === 'reserve' && after.tokens.gold > before.tokens.gold;
    if (tookReserveGold) {
      const from = elementRect(supplyGemElements.get('gold'));
      if (from) {
        intents.push({ kind: 'gem', playerIndex, gem: 'gold', from });
      }
    }

    const boughtCard =
      record.move.kind === 'buy'
        ? after.cards.find((card) => !previousCards.has(card.id))
        : undefined;
    if (boughtCard) {
      const sourceKey = `${playerIndex}:${boughtCard.id}`;
      const from =
        elementRect(boardCardElements.get(boughtCard.id)) ??
        elementRect(reservedCardElements.get(sourceKey)) ??
        elementRect(playerCardTargetElements.get(playerIndex)) ??
        elementRect(playerPanelElements.get(playerIndex));

      if (from) {
        intents.push({ kind: 'card', playerIndex, card: boughtCard, from });
      }
    }

    if (
      (record.move.kind === 'buy' || record.move.kind === 'reserve') &&
      record.move.source === 'board'
    ) {
      const beforeSlot = ([1, 2, 3] as const)
        .flatMap((tier) =>
          previous.state.board[boardKey(tier)].map((card, index) => ({
            tier,
            index,
            card,
          })),
        )
        .find((slot) => slot.card?.id === record.move.cardId);

      if (beforeSlot) {
        const replacement =
          next.state.board[boardKey(beforeSlot.tier)][beforeSlot.index];
        const from = elementRect(deckElements.get(beforeSlot.tier));
        if (replacement && replacement.id !== record.move.cardId && from) {
          intents.push({ kind: 'refill', card: replacement, from });
        }
      }
    }

    const claimedNoble = after.nobles.find(
      (noble) => !previousNobles.has(noble.id),
    );
    if (claimedNoble) {
      const from =
        elementRect(nobleElements.get(claimedNoble.id)) ??
        elementRect(playerPanelElements.get(playerIndex));

      if (from) {
        intents.push({ kind: 'noble', playerIndex, noble: claimedNoble, from });
      }
    }

    return intents;
  }

  async function queueMoveAnimations(intents: MoveAnimationIntent[]) {
    if (intents.length === 0) {
      return;
    }

    await tick();

    const nextAssets = intents.flatMap((intent) => {
      const targetElement =
        intent.kind === 'card'
          ? (ownedCardElements.get(intent.card.id) ??
            playerCardTargetElements.get(intent.playerIndex) ??
            playerPanelElements.get(intent.playerIndex))
          : intent.kind === 'refill'
            ? boardCardElements.get(intent.card.id)
            : intent.kind === 'gem'
              ? (playerGemTargetElements.get(
                  playerGemTargetKey(intent.playerIndex, intent.gem),
                ) ?? playerPanelElements.get(intent.playerIndex))
              : (playerNobleTargetElements.get(intent.playerIndex) ??
                playerPanelElements.get(intent.playerIndex));
      const target = elementRect(targetElement);

      if (!target) {
        return [];
      }

      const to =
        intent.kind === 'refill'
          ? target
          : centeredTargetRect(target, intent.from);
      return [
        {
          ...intent,
          id: `${intent.kind}-${intent.kind === 'card' || intent.kind === 'refill' ? intent.card.id : intent.kind === 'noble' ? intent.noble.id : intent.gem}-${Date.now()}-${Math.random()}`,
          style: animationStyle(intent.from, to),
        },
      ];
    });

    if (nextAssets.length === 0) {
      return;
    }

    flyingAssets = [...flyingAssets, ...nextAssets];
    window.setTimeout(() => {
      const completed = new Set(nextAssets.map((asset) => asset.id));
      flyingAssets = flyingAssets.filter((asset) => !completed.has(asset.id));
    }, 780);
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

  function localBotDifficulty(profileId: string): SplendorBotDifficulty {
    if (profileId === LOCAL_BOT_EASY_PROFILE) {
      return 'easy';
    }

    return profileId === LOCAL_BOT_HARD_PROFILE ? 'hard' : 'medium';
  }

  function localBotLabel(profileId: string): string {
    return (
      localBotSeatOptions.find((option) => option.id === profileId)?.label ??
      'Local bot'
    );
  }

  function normalizePlayerProfileSelections(
    count: number,
    fallbackProfileId: string,
  ) {
    const result = normalizeSeatSelections({
      playerCount: count,
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
      playerCount,
      selections,
      profileIds: configuredProfiles.map((profile) => profile.id),
      localSeatIds: localBotSeatOptions.map((option) => option.id),
    });
  }

  function aiConfigForProfile(
    profile: ProviderModelProfile,
  ): AIPlayerConfig<SplendorState, SplendorMove> {
    const providerId = profile.provider as ProviderId;
    return {
      provider: getProvider(providerId),
      model: profile.model,
      apiKey: keys[providerId],
      endpointUrl: providerEndpointFor(providerId, keys),
      temperature: 0.2,
      maxTokens: 500,
    };
  }

  function aiConfigForLocalBot(
    profileId: string,
  ): AIPlayerConfig<SplendorState, SplendorMove> {
    const difficulty = localBotDifficulty(profileId);
    return {
      kind: 'local',
      label: localBotLabel(profileId),
      model: localBotLabel(profileId),
      chooseMove({ state: currentState, player, legalMoves: moves, signal }) {
        if (signal?.aborted) {
          const error = new Error('AI move aborted.');
          error.name = 'AbortError';
          throw error;
        }

        return chooseSplendorBotMove(currentState, player, moves, {
          difficulty,
        });
      },
    };
  }

  function aiConfigs(
    selections: SeatSelections = playerProfileSelections,
  ): Record<number, AIPlayerConfig<SplendorState, SplendorMove>> {
    return Object.fromEntries(
      Array.from({ length: playerCount }, (_, index) => index).flatMap(
        (player) => {
          const profileId = selections[player];
          if (profileId === HUMAN_SEAT_ID) {
            return [];
          }

          if (isLocalBotProfileId(profileId)) {
            return [[player, aiConfigForLocalBot(profileId)]];
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

  function selectPlayerProfile(playerIndex: number, profileId: string) {
    playerProfileSelections = {
      ...playerProfileSelections,
      [playerIndex]: profileId,
    };
    selectedGems = [];
    pendingMove = undefined;
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
    if (aiPaused) {
      aiController?.abort();
      return;
    }

    loop?.clearWarning();
    void runAI();
  }

  function startGame() {
    unsubscribe?.();
    aiController?.abort();
    seed = seed.trim() || 'splendor-table';
    syncSeedHash(seed);
    selectedGems = [];
    pendingMove = undefined;
    activeModal = null;
    message = '';
    gameOverDismissed = false;
    playUntilCardsExhausted = false;
    moveLogOpen = false;
    flyingAssets = [];
    normalizePlayerProfileSelections(playerCount, defaultProfileId);
    aiPaused = playerProfileSelections[HUMAN_PLAYER_INDEX] !== HUMAN_SEAT_ID;

    const initialState = splendorAdapter.init({
      seed,
      playerCount,
      aiPlayerIndices: playerIndexesControlledByAI(playerProfileSelections),
    });
    loop = createGameLoop({
      adapter: gameAdapter,
      initialState,
      aiPlayers: aiConfigs(),
      rng: createRng(`${seed}:splendor-ui`),
    });
    unsubscribe = loop.subscribe((next) => {
      const wereCardsExhausted = snapshot?.state
        ? developmentCardsExhausted(snapshot.state)
        : false;
      const moveAnimations = collectMoveAnimationIntents(snapshot, next);
      snapshot = next;
      if (
        playUntilCardsExhausted &&
        !wereCardsExhausted &&
        developmentCardsExhausted(next.state)
      ) {
        gameOverDismissed = false;
      }
      void queueMoveAnimations(moveAnimations);
    });
    void runAI();
    void resizeTableAfterRender();
  }

  function startShuffledGame() {
    seed = globalThis.crypto?.randomUUID?.() ?? `splendor-${Date.now()}`;
    startGame();
  }

  function openMoveLog() {
    moveLogLimit = MOVE_LOG_PAGE_SIZE;
    moveLogOpen = true;
  }

  function continueToCardExhaustion() {
    playUntilCardsExhausted = true;
    gameOverDismissed = true;
    message = 'Continuing until every development card is exhausted.';
    loop?.clearWarning();
    void runAI();
  }

  async function runAI() {
    if (!loop || aiPaused) {
      return;
    }

    const current = loop.getSnapshot();
    if (current.status === 'thinking') {
      return;
    }

    const player = current.currentPlayer;
    if (
      !aiPlayerIndexes.includes(player) ||
      isTerminalForActiveMode(current.state)
    ) {
      return;
    }

    aiController = createAbortController();
    try {
      await loop.runUntilBlocked(aiController.signal);
    } catch (error) {
      if (aiPaused) {
        loop.clearWarning();
        message = '';
        return;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        message = 'AI move aborted.';
      } else {
        message =
          error instanceof Error
            ? error.message
            : 'AI move failed unexpectedly.';
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

  function canCompleteTakeMove(gems: Gem[]): boolean {
    const normalized = normalizeGemSelection(gems);
    if (normalized.length === 0) {
      return false;
    }
    if (findTakeMove(normalized)) {
      return true;
    }
    if (normalized.length >= 3) {
      return false;
    }
    if (new Set(normalized).size !== normalized.length) {
      return false;
    }

    return legalMoves.some(
      (move) =>
        move.kind === 'take' &&
        move.gems.length > normalized.length &&
        normalized.every((gem) => move.gems.includes(gem)),
    );
  }

  function normalizeGemSelection(gems: Gem[]): Gem[] {
    return [...gems].sort(
      (left, right) => GEMS.indexOf(left) - GEMS.indexOf(right),
    );
  }

  function selectGem(gem: Gem) {
    if (!state || !humanCanAct) {
      return;
    }

    message = '';
    const sameGem = selectedGems.length === 1 && selectedGems[0] === gem;
    const next = sameGem
      ? [gem, gem]
      : selectedGems.includes(gem)
        ? selectedGems.filter((item) => item !== gem)
        : [...selectedGems, gem];

    const normalized = normalizeGemSelection(next.length > 3 ? [gem] : next);
    selectedGems = canCompleteTakeMove(normalized) ? normalized : [gem];
  }

  function selectGemFromPointer(gem: Gem) {
    handledPointerSelection = true;
    selectGem(gem);
  }

  function selectGemFromClick(gem: Gem) {
    if (handledPointerSelection) {
      handledPointerSelection = false;
      return;
    }
    selectGem(gem);
  }

  function removeSelectedGem(index: number) {
    selectedGems = selectedGems.filter(
      (_, selectedIndex) => selectedIndex !== index,
    );
    message = '';
  }

  function clearSelectedGems() {
    selectedGems = [];
    message = '';
  }

  function beginMove(move: SplendorMove) {
    if (!loop || !state || !humanCanAct) {
      return;
    }

    pendingMove = move;
    discardDraft = {};
    goldDraft = {};
    nobleDraft = '';
    message = '';

    const goldRange = move.kind === 'buy' ? goldRangesFor(state, move) : [];
    if (goldRange.some((range) => range.min > 0)) {
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
      message =
        error instanceof Error ? error.message : 'Move could not be played.';
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
    const next = Math.max(
      0,
      Math.min(pendingProjectedTokens[gem], current + delta),
    );
    discardDraft = { ...discardDraft, [gem]: next };
  }

  function adjustGold(gem: Gem, delta: number) {
    if (!state || !pendingMove || pendingMove.kind !== 'buy') {
      return;
    }

    const range = goldRangesFor(state, pendingMove).find(
      (item) => item.gem === gem,
    );
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

  function findCard(
    current: SplendorState,
    move: SplendorMove,
  ): Card | undefined {
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

  function goldRangesFor(
    current: SplendorState,
    move: Extract<SplendorMove, { kind: 'buy' }>,
  ) {
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

  function projectedTokensAfter(
    current: SplendorState,
    move: SplendorMove,
  ): TokenSet {
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
      const remaining = Math.max(
        0,
        costValue(card, gem) - current.players[currentPlayer].bonuses[gem],
      );
      const goldForGem =
        move.goldUsedFor?.[gem] ?? Math.max(0, remaining - tokens[gem]);
      tokens[gem] -= remaining - goldForGem;
      tokens.gold -= goldForGem;
    }

    return tokens;
  }

  function projectedBonusesAfter(
    current: SplendorState,
    move: SplendorMove,
  ): BonusSet {
    const bonuses = { ...current.players[currentPlayer].bonuses };
    if (move.kind === 'buy') {
      const card = findCard(current, move);
      if (card) {
        bonuses[card.bonus] += 1;
      }
    }
    return bonuses;
  }

  function eligibleNoblesAfter(
    current: SplendorState,
    move: SplendorMove,
  ): Noble[] {
    const bonuses = projectedBonusesAfter(current, move);
    return current.noblesInPlay.filter((noble) =>
      GEMS.every((gem) => bonuses[gem] >= (noble.cost[gem] ?? 0)),
    );
  }

  function legalBuy(card: Card, source: 'board' | 'reserved') {
    return legalMoves.find(
      (move) =>
        move.kind === 'buy' &&
        move.source === source &&
        move.cardId === card.id,
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
      (move) =>
        move.kind === 'reserve' && move.source === 'deck' && move.tier === tier,
    );
  }

  function cardsForBonus(cards: Card[], gem: Gem): Card[] {
    return cards.filter((card) => card.bonus === gem);
  }

  function playerLabel(index: number): string {
    const profileId = playerProfileSelections[index] ?? HUMAN_SEAT_ID;
    if (index === 0) {
      return profileId === HUMAN_SEAT_ID
        ? 'Player 1 (You)'
        : `Player 1 (${isLocalBotProfileId(profileId) ? localBotLabel(profileId) : 'AI'})`;
    }

    return isLocalBotProfileId(profileId)
      ? `Player ${index + 1} (${localBotLabel(profileId)})`
      : `Player ${index + 1}`;
  }

  function formatMove(move: SplendorMove): string {
    return formatSplendorMove(move);
  }

  function cardForLoggedMove(move: SplendorMove): Card | undefined {
    return 'cardId' in move ? allCardsById.get(move.cardId) : undefined;
  }

  function loggedCardImageSrc(card: Card): string {
    return `/assets/splendor/cards/${card.id}.png`;
  }

  function loggedCardAlt(card: Card): string {
    return `Splendor ${card.id}, ${card.prestige} prestige, ${gemLabels[card.bonus]} bonus`;
  }

  function loggedMoveAction(move: SplendorMove): string {
    if (move.kind === 'take') {
      return 'Take';
    }

    if (move.kind === 'buy') {
      return move.source === 'reserved' ? 'Buy reserved card' : 'Buy card';
    }

    if (move.kind === 'reserve') {
      return move.source === 'deck'
        ? `Reserve face-down tier ${move.tier}`
        : 'Reserve card';
    }
    return formatMove(move);
  }

  function loggedTokenEntries(
    tokens: Partial<Record<GemOrGold, number>> | undefined,
  ): LoggedTokenAmount[] {
    if (!tokens) {
      return [];
    }

    return ([...GEMS, 'gold'] as const)
      .map((gem) => ({ gem, amount: tokens[gem] ?? 0 }))
      .filter(({ amount }) => amount > 0);
  }

  function moveLogView(record: MoveRecord<SplendorMove>): LoggedMoveView {
    return {
      record,
      card: cardForLoggedMove(record.move),
      action: loggedMoveAction(record.move),
      discard: loggedTokenEntries(record.move.discard),
      noble: record.move.noble,
    };
  }

  function moveSourceLabel(record: MoveRecord<SplendorMove>): string {
    if (record.source === 'human') {
      return 'Human';
    }

    if (record.source === 'fallback') {
      return 'Fallback';
    }

    return record.providerId
      ? `${record.providerId}${record.model ? `:${record.model}` : ''}`
      : (record.model ?? 'Local bot');
  }

  function moveLogMeta(record: MoveRecord<SplendorMove>): string {
    return `#${record.turn + 1} - ${playerLabel(record.player)} - ${moveSourceLabel(record)}`;
  }

  onMount(() => {
    refreshKeys();
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('splendor-view-mode');
      if (stored === 'stock' || stored === '3d') {
        viewMode = stored;
      }
    }
    window.addEventListener('storage', refreshKeys);
    window.addEventListener('byok-keys-changed', refreshKeys);
    window.addEventListener('resize', resizeTable);
    const sharedSeed = seedFromHash(globalThis.location.hash);
    if (sharedSeed) {
      seed = sharedSeed;
      startGame();
    } else {
      startShuffledGame();
    }
    void resizeTableAfterRender();
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', refreshKeys);
      window.removeEventListener('byok-keys-changed', refreshKeys);
      window.removeEventListener('resize', resizeTable);
    }
    unsubscribe?.();
    aiController?.abort();
  });
</script>

{#if state}
  <section
    bind:this={viewportEl}
    class="h-full w-full overflow-hidden bg-neutral-950 p-2"
  >
    <div
      class="flex origin-top-left h-full flex-col overflow-hidden"
      style={`width: ${tableWidth}px; height: ${TABLE_HEIGHT}px; transform: translate(${tableOffsetX}px, ${tableOffsetY}px) scale(${tableScale});`}
    >
      <div
        class="grid min-h-0 flex-1 grid-cols-[1120px_416px_minmax(560px,1fr)] gap-3"
      >
        {#if viewMode === '3d'}
          <div class="relative h-full w-[1120px] rounded-md border border-neutral-800 bg-neutral-950 overflow-hidden">
            <Splendor3DView
              state={snapshot?.state}
              {legalMoves}
              {humanCanAct}
              {selectedGems}
              {cameraView}
              bind:cameraZoom
              onSelectGem={selectGem}
              onBeginMove={beginMove}
            />
            
            <div class="absolute left-3 top-3 z-40 flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950/85 p-3 shadow-lg backdrop-blur-sm ring-1 ring-white/5 w-60">
              <div class="flex items-center justify-between">
                <h1 class="text-xl font-bold tracking-tight text-white">Splendor</h1>
                <span class="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">3D</span>
              </div>
              <p class="text-[11px] text-neutral-400">
                Turn {state.turn + 1}, player {currentPlayer + 1}
                {state.finalRoundTriggered ? ' - final round' : ''}
              </p>
              
              <div class="mt-1">
                <TokenUsageBadge
                  lastUsage={lastUsage as TokenUsage | undefined}
                  totalUsage={snapshot?.totalUsage ?? { input: 0, output: 0 }}
                />
              </div>

              <div class="mt-2 flex flex-col gap-1.5 border-t border-neutral-800/60 pt-2">
                <label class="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">View Mode</label>
                <select
                  class="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-neutral-500"
                  bind:value={viewMode}
                >
                  <option value="3d">3D Rendered</option>
                  <option value="stock">2D Stock UI</option>
                </select>


              </div>

              <button
                class="mt-1 w-full rounded border border-neutral-700 bg-neutral-900/40 px-2 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
                type="button"
                on:click={openMoveLog}
              >
                Move log ({snapshot?.log.length ?? 0})
              </button>
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
          <div class="grid min-h-0 grid-cols-[180px_1fr] gap-2">
            <section class="flex min-h-0 flex-col gap-2">
              <div
                class="rounded-md border border-neutral-800 bg-neutral-950 p-2"
              >
                <h1 class="text-2xl font-semibold tracking-normal text-white">
                  Splendor
                </h1>
                <p class="text-xs text-neutral-400">
                  Turn {state.turn + 1}, player {currentPlayer + 1}
                  {state.finalRoundTriggered ? ' - final round' : ''}
                </p>
                <div class="mt-2">
                  <TokenUsageBadge
                    lastUsage={lastUsage as TokenUsage | undefined}
                    totalUsage={snapshot?.totalUsage ?? { input: 0, output: 0 }}
                  />
                </div>
                
                <div class="mt-2 flex flex-col gap-1">
                  <label class="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">View Mode</label>
                  <select
                    class="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-neutral-500"
                    bind:value={viewMode}
                  >
                    <option value="3d">3D Rendered</option>
                    <option value="stock">2D Stock UI</option>
                  </select>


                </div>

                <button
                  class="mt-2 w-full rounded-md border border-neutral-700 px-2 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500 hover:text-white"
                  type="button"
                  on:click={openMoveLog}
                >
                  Move log ({snapshot?.log.length ?? 0})
                </button>
              </div>

              <section
                class="min-h-0 flex-1 rounded-md border border-neutral-800 bg-neutral-950 p-2"
              >
                <div class="mb-1 flex items-center justify-between">
                  <h2 class="text-sm font-semibold tracking-normal">Nobles</h2>
                  <span class="text-xs text-neutral-500"
                    >{state.noblesInPlay.length} available</span
                  >
                </div>
                <div class="flex flex-col gap-2 overflow-hidden">
                  {#each state.noblesInPlay as noble (noble.id)}
                    <article
                      class="rounded-md border border-amber-300/40 bg-neutral-900 p-1"
                      use:registerNoble={noble.id}
                    >
                      <SplendorNobleArt {noble} />
                    </article>
                  {/each}
                </div>
              </section>
            </section>

            <div class="flex min-h-0 flex-col gap-2">
              <section
                class="grid min-h-0 flex-1 grid-rows-[repeat(3,minmax(0,1fr))] gap-2"
              >
                {#each [3, 2, 1] as tier (tier)}
                  <div
                    class="min-h-0 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 p-2"
                  >
                    <div
                      class="mb-1.5 flex h-8 items-center justify-between gap-2"
                    >
                      <h2 class="text-sm font-semibold tracking-normal">
                        Tier {tier}
                      </h2>
                      <span class="text-xs text-neutral-500"
                        >{state.decks[deckKey(tier as Tier)].length} in deck</span
                      >
                    </div>
                    <div
                      class="grid h-[calc(100%-2.375rem)] grid-cols-[repeat(5,10.5rem)] items-start justify-center gap-x-1 gap-y-2 overflow-hidden"
                    >
                      <button
                        class="group relative aspect-[5/7] w-[10.5rem] overflow-hidden rounded-md border bg-neutral-950 p-1 text-left shadow disabled:cursor-not-allowed {legalReserveDeck(
                          tier as Tier,
                        )
                          ? 'border-amber-300/60 hover:border-amber-200 hover:bg-amber-300/10'
                          : 'border-neutral-800 opacity-60'}"
                        type="button"
                        use:registerDeck={tier as Tier}
                        aria-label={`Reserve a face-down tier ${tier} card`}
                        disabled={!legalReserveDeck(tier as Tier) || !humanCanAct}
                        on:click={() => {
                          const move = legalReserveDeck(tier as Tier);
                          if (move) beginMove(move);
                        }}
                      >
                        <div
                          class="absolute inset-1 rounded-md border border-amber-300/30 bg-[radial-gradient(circle_at_50%_35%,rgba(251,191,36,0.16),transparent_36%),linear-gradient(135deg,rgba(23,23,23,1),rgba(3,7,18,1))]"
                        ></div>
                        <div
                          class="absolute inset-4 rounded-md border border-amber-200/20"
                        ></div>
                        <div
                          class="absolute left-2 right-2 top-2 flex items-center justify-between gap-2 rounded-md bg-neutral-950/75 px-2 py-1 text-[10px] text-amber-100/90 ring-1 ring-amber-200/15"
                        >
                          <span>Deck</span>
                          <span>{state.decks[deckKey(tier as Tier)].length}</span>
                        </div>
                        <div
                          class="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center"
                        >
                          <span
                            class="grid size-10 rotate-45 place-items-center border border-amber-200/45 bg-neutral-950/80 shadow-inner"
                          >
                            <span
                              class="-rotate-45 text-sm font-semibold text-amber-100"
                              >{tier}</span
                            >
                          </span>
                        </div>
                      </button>
                      {#each state.board[boardKey(tier as Tier)] as card, cardIndex (card?.id ?? `${tier}-${cardIndex}`)}
                        {#if card}
                          <article
                            class="relative w-[10.5rem] rounded-md border bg-neutral-900 p-1 {legalBuy(
                              card,
                              'board',
                            ) || legalReserve(card)
                              ? 'border-emerald-400/50'
                              : 'border-neutral-800'}"
                            use:registerBoardCard={card.id}
                          >
                            <SplendorCardArt {card} board />
                            <div
                              class="absolute bottom-1.5 right-1.5 flex flex-col gap-1"
                            >
                              <button
                                class="rounded-md bg-emerald-500/95 px-2 py-0.5 text-[10px] font-medium text-neutral-950 shadow disabled:cursor-not-allowed disabled:bg-neutral-800/90 disabled:text-neutral-600"
                                type="button"
                                disabled={!legalBuy(card, 'board') ||
                                  !humanCanAct}
                                on:click={() => {
                                  const move = legalBuy(card, 'board');
                                  if (move) beginMove(move);
                                }}
                              >
                                Buy
                              </button>
                              <button
                                class="rounded-md border border-amber-300/70 bg-neutral-950/90 px-2 py-0.5 text-[10px] text-amber-100 shadow disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
                                type="button"
                                disabled={!legalReserve(card) || !humanCanAct}
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
                          <div
                            class="aspect-[5/7] w-[10.5rem] rounded-md border border-dashed border-neutral-800 bg-neutral-950"
                          ></div>
                        {/if}
                      {/each}
                    </div>
                  </div>
                {/each}
              </section>
            </div>
          </div>
        {/if}

        <aside class="flex min-h-0 flex-col gap-2">
          <section
            class="rounded-md border border-neutral-800 bg-neutral-950 p-2"
          >
            <div class="flex flex-wrap justify-end gap-1.5">
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
                  class="ml-2 w-28 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
                  bind:value={seed}
                  disabled={snapshot?.status === 'thinking'}
                  on:change={startGame}
                />
              </label>
              <button
                class="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-100 hover:border-neutral-500"
                type="button"
                on:click={startShuffledGame}
                disabled={snapshot?.status === 'thinking'}
              >
                New game
              </button>
            </div>

            {#if configuredProfiles.length === 0}
              <div
                class="mt-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100"
              >
                Local bots are available. Save a model profile to use provider
                turns.
              </div>
            {/if}

            {#if gamePaused}
              <div
                class="mt-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1.5 text-xs text-emerald-100"
              >
                <span class="font-semibold">Game Paused.</span> Resume Player 1, or
                switch Player 1 back to brain control.
              </div>
            {/if}

            {#if snapshot?.warning || message}
              <div
                class="mt-2 rounded-md border border-rose-400/40 bg-rose-400/10 px-2 py-1.5 text-xs text-rose-100"
              >
                {message || snapshot?.warning}
              </div>
            {/if}

            {#if snapshot?.status === 'thinking'}
              <div
                class="mt-2 flex items-center justify-between gap-2 rounded-md border border-sky-400/40 bg-sky-400/10 px-2 py-1.5 text-xs text-sky-100"
              >
                <span>Player {currentPlayer + 1} thinking</span>
                <button
                  class="rounded-md border border-sky-300/50 px-2 py-1 text-xs hover:bg-sky-300/10"
                  type="button"
                  on:click={abortAI}
                >
                  Abort
                </button>
              </div>
            {/if}
          </section>

          <section
            class="rounded-md border border-neutral-800 bg-neutral-950 p-2"
          >
            <h2 class="text-sm font-semibold tracking-normal">Token Supply</h2>
            <div class="mt-2 grid grid-cols-3 gap-1">
              {#each GEMS as gem (gem)}
                <button
                  class={`flex min-h-14 w-full flex-col items-start justify-between rounded-md border px-1.5 py-1.5 text-left ${gemClasses[gem]} disabled:cursor-not-allowed disabled:opacity-40`}
                  type="button"
                  disabled={state.tokenPool[gem] === 0 || !humanCanAct}
                  on:pointerdown|preventDefault={() =>
                    selectGemFromPointer(gem)}
                  on:click={() => selectGemFromClick(gem)}
                >
                  <span
                    class="pointer-events-none block"
                    use:registerSupplyGem={gem}
                  >
                    <SplendorGemBadge {gem} label={gemLabels[gem]} />
                  </span>
                  <span class="pointer-events-none text-[10px] opacity-80"
                    >Supply {state.tokenPool[gem]}</span
                  >
                </button>
              {/each}
              <div
                class={`flex min-h-14 w-full flex-col items-start justify-between rounded-md border px-1.5 py-1.5 ${gemClasses.gold}`}
              >
                <span class="block" use:registerSupplyGem={'gold'}>
                  <SplendorGemBadge gem="gold" label="Gold" />
                </span>
                <span class="text-[10px] opacity-80"
                  >Supply {state.tokenPool.gold}</span
                >
              </div>
            </div>
            <div
              class="mt-2 rounded-md border border-neutral-800 bg-neutral-900 p-2"
            >
              <div
                class="flex min-h-7 items-start justify-between gap-2 text-xs text-neutral-300"
              >
                <div class="flex flex-wrap items-center gap-1">
                  {#if selectedGems.length}
                    {#each selectedGems as gem, index (`${gem}-${index}`)}
                      <button
                        class="rounded-full transition hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        title={`Remove ${gemLabels[gem]}`}
                        disabled={!humanCanAct}
                        on:click={() => removeSelectedGem(index)}
                      >
                        <SplendorGemBadge {gem} compact />
                      </button>
                    {/each}
                  {:else}
                    Select tokens to take
                  {/if}
                </div>
                {#if selectedGems.length}
                  <button
                    class="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-[10px] font-medium text-neutral-300 hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    disabled={!humanCanAct}
                    on:click={clearSelectedGems}
                  >
                    Clear
                  </button>
                {/if}
              </div>
              <button
                class="mt-2 w-full rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
                type="button"
                disabled={!takeMove || !humanCanAct}
                on:click={() => {
                  if (takeMove) beginMove(takeMove);
                }}
              >
                {takeMove ? formatMove(takeMove) : 'No legal take selected'}
              </button>
            </div>
          </section>

          <section class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {#each state.players as player, index (index)}
              {#if index !== 0}
                <article
                  class="shrink-0 rounded-md border {index === currentPlayer
                    ? 'border-emerald-400/60'
                    : 'border-neutral-800'} bg-neutral-950 p-2"
                  use:registerPlayerPanel={index}
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <h2 class="text-sm font-semibold tracking-normal">
                        {playerLabel(index)}
                      </h2>
                      <select
                        class="mt-1 max-w-44 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-100"
                        value={playerProfileSelections[index] ?? ''}
                        disabled={snapshot?.status === 'thinking'}
                        on:change={(event) =>
                          selectPlayerProfile(index, event.currentTarget.value)}
                      >
                        <option value={LOCAL_BOT_HARD_PROFILE}>
                          🤖 Local bot - Hard
                        </option>
                        <option value={LOCAL_BOT_MEDIUM_PROFILE}>
                          🤖 Local bot - Medium
                        </option>
                        <option value={LOCAL_BOT_EASY_PROFILE}>
                          🤖 Local bot - Easy
                        </option>
                        {#if configuredProfiles.length}
                          {#each configuredProfiles as profile (profile.id)}
                            <option value={profile.id}>
                              {profileLabel(profile)}
                            </option>
                          {/each}
                        {/if}
                      </select>
                    </div>
                    <span class="text-xs text-neutral-300"
                      >{player.prestige} prestige</span
                    >
                  </div>
                  <div class="mt-1.5">
                    <div
                      class="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500"
                    >
                      Gems
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each [...GEMS, 'gold'] as gem (gem)}
                        <span
                          use:registerPlayerGemTarget={playerGemTargetKey(
                            index,
                            gem,
                          )}
                        >
                          <SplendorGemBadge
                            {gem}
                            amount={player.tokens[gem]}
                            compact
                          />
                        </span>
                      {/each}
                    </div>
                  </div>
                  <div class="mt-1.5">
                    <div
                      class="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500"
                    >
                      Bought card bonuses
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {#each GEMS as gem (gem)}
                        <SplendorGemBadge
                          {gem}
                          amount={player.bonuses[gem]}
                          compact
                        />
                      {/each}
                    </div>
                  </div>
                  <div
                    class="mt-1.5 text-[10px] text-neutral-500"
                    use:registerPlayerNobleTarget={index}
                  >
                    Cards {player.cards.length} - Reserved {player.reserved
                      .length} - Nobles {player.nobles.length}
                  </div>
                  <div
                    class="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px] text-neutral-400"
                  >
                    <div
                      class="rounded-md border border-neutral-800 bg-neutral-900/50 px-2 py-1"
                      use:registerPlayerCardTarget={index}
                    >
                      <span class="text-neutral-500">Cards Bought</span>
                      <span class="float-right text-neutral-200"
                        >{player.cards.length}</span
                      >
                    </div>
                    <div
                      class="rounded-md border border-neutral-800 bg-neutral-900/50 px-2 py-1"
                    >
                      <span class="text-neutral-500">Cards Reserved</span>
                      <span class="float-right text-neutral-200"
                        >{player.reserved.length}</span
                      >
                    </div>
                  </div>
                </article>
              {/if}
            {/each}
          </section>
        </aside>

        <aside class="min-h-0 w-full">
          {#each [state.players[0]] as player (player)}
            <article
              class="flex h-full min-h-0 w-full flex-col rounded-md border {currentPlayer ===
              HUMAN_PLAYER_INDEX
                ? 'border-emerald-400/60'
                : 'border-neutral-800'} bg-neutral-950 p-2"
              use:registerPlayerPanel={0}
            >
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-sm font-semibold tracking-normal">
                      {playerLabel(0)}
                    </h2>
                    {#if humanDelegated}
                      <button
                        class="rounded-md border border-emerald-400/50 px-2 py-0.5 text-[10px] font-medium text-emerald-100 hover:border-emerald-300"
                        type="button"
                        on:click={toggleAIPaused}
                      >
                        {aiPaused ? 'Resume' : 'Pause'}
                      </button>
                    {/if}
                  </div>
                  <select
                    class="mt-1 max-w-56 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-100"
                    value={playerProfileSelections[0] ?? HUMAN_SEAT_ID}
                    on:change={(event) =>
                      selectPlayerProfile(0, event.currentTarget.value)}
                  >
                    <option value={HUMAN_SEAT_ID}>🧠 Human</option>
                    <option value={LOCAL_BOT_HARD_PROFILE}>
                      🤖 Local bot - Hard
                    </option>
                    <option value={LOCAL_BOT_MEDIUM_PROFILE}>
                      🤖 Local bot - Medium
                    </option>
                    <option value={LOCAL_BOT_EASY_PROFILE}>
                      🤖 Local bot - Easy
                    </option>
                    {#each configuredProfiles as profile (profile.id)}
                      <option value={profile.id}>
                        {profileLabel(profile)}
                      </option>
                    {/each}
                  </select>
                </div>
                <span class="text-xs text-neutral-300"
                  >{player.prestige} prestige</span
                >
              </div>
              <div class="mt-1.5">
                <div
                  class="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500"
                >
                  Gems
                </div>
                <div class="flex flex-wrap gap-1">
                  {#each [...GEMS, 'gold'] as gem (gem)}
                    <span
                      use:registerPlayerGemTarget={playerGemTargetKey(0, gem)}
                    >
                      <SplendorGemBadge
                        {gem}
                        amount={player.tokens[gem]}
                        compact
                      />
                    </span>
                  {/each}
                </div>
              </div>
              <div class="mt-1.5">
                <div
                  class="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500"
                >
                  Bought card bonuses
                </div>
                <div class="flex flex-wrap gap-1">
                  {#each GEMS as gem (gem)}
                    <SplendorGemBadge
                      {gem}
                      amount={player.bonuses[gem]}
                      compact
                    />
                  {/each}
                </div>
              </div>
              <div
                class="mt-1.5 text-[10px] text-neutral-500"
                use:registerPlayerNobleTarget={0}
              >
                Cards {player.cards.length} - Reserved {player.reserved.length} -
                Nobles {player.nobles.length}
              </div>

              <div
                class="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
              >
                <section
                  class="rounded-md border border-neutral-800 bg-neutral-900/50 p-2"
                  use:registerPlayerCardTarget={0}
                >
                  <h3
                    class="text-xs font-semibold tracking-normal text-neutral-200"
                  >
                    Cards Bought
                  </h3>
                  {#if player.cards.length}
                    <div class="mt-2 space-y-2">
                      {#each GEMS as gem (gem)}
                        {#each [cardsForBonus(player.cards, gem)] as stack (stack)}
                          {#if stack.length}
                            <div>
                              <div class="mb-1 flex items-center gap-1.5">
                                <SplendorGemBadge
                                  {gem}
                                  amount={stack.length}
                                  compact
                                />
                              </div>
                              <div class="flex gap-2 overflow-x-auto pb-1">
                                {#each stack as card (card.id)}
                                  <div
                                    class="w-44 shrink-0 rounded-md border border-neutral-800 bg-neutral-900 p-1"
                                    use:registerOwnedCard={card.id}
                                  >
                                    <SplendorCardArt {card} board />
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/if}
                        {/each}
                      {/each}
                    </div>
                  {:else}
                    <div
                      class="mt-2 rounded-md border border-dashed border-neutral-800 px-3 py-4 text-center text-xs text-neutral-600"
                    >
                      No bought cards yet
                    </div>
                  {/if}
                </section>

                {#if player.reserved.length}
                  <section
                    class="rounded-md border border-neutral-800 bg-neutral-900/50 p-2"
                  >
                    <h3
                      class="text-xs font-semibold tracking-normal text-neutral-200"
                    >
                      Cards Reserved
                    </h3>
                    <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {#each player.reserved as card (card.id)}
                        <div
                          class="relative w-44 shrink-0 rounded-md border border-neutral-800 bg-neutral-900 p-1"
                          use:registerReservedCard={`${0}:${card.id}`}
                        >
                          <SplendorCardArt {card} board />
                          <button
                            class="absolute bottom-2 right-2 rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-neutral-950 shadow disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
                            type="button"
                            disabled={!legalBuy(card, 'reserved') ||
                              !humanCanAct}
                            on:click={() => {
                              const move = legalBuy(card, 'reserved');
                              if (move) beginMove(move);
                            }}
                          >
                            Buy
                          </button>
                        </div>
                      {/each}
                    </div>
                  </section>
                {/if}

                {#if player.nobles.length}
                  <section
                    class="rounded-md border border-neutral-800 bg-neutral-900/50 p-2"
                  >
                    <h3
                      class="text-xs font-semibold tracking-normal text-neutral-200"
                    >
                      Nobles Acquired
                    </h3>
                    <div class="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {#each player.nobles as noble (noble.id)}
                        <div
                          class="w-40 shrink-0 rounded-md border border-amber-300/40 bg-neutral-900 p-1"
                        >
                          <SplendorNobleArt {noble} />
                        </div>
                      {/each}
                    </div>
                  </section>
                {/if}
              </div>
            </article>
          {/each}
        </aside>
      </div>
    </div>
  </section>
{/if}

{#each flyingAssets as asset (asset.id)}
  <div
    class="splendor-flying-asset pointer-events-none fixed z-50 {asset.kind ===
    'gem'
      ? 'rounded-full bg-transparent p-0 shadow-lg'
      : 'overflow-hidden rounded-md border border-emerald-300/60 bg-neutral-950 p-1 shadow-2xl'}"
    style={asset.style}
  >
    {#if asset.kind === 'card' || asset.kind === 'refill'}
      <SplendorCardArt card={asset.card} board />
    {:else if asset.kind === 'noble'}
      <SplendorNobleArt noble={asset.noble} />
    {:else}
      <SplendorGemBadge gem={asset.gem} label={gemLabels[asset.gem]} />
    {/if}
  </div>
{/each}

{#if moveLogOpen && snapshot}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold tracking-normal">Move Log</h2>
          <p class="mt-1 text-sm text-neutral-400">
            {snapshot.log.length} recorded moves
          </p>
        </div>
        <button
          class="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 hover:text-white"
          type="button"
          on:click={() => {
            moveLogOpen = false;
          }}
        >
          Close
        </button>
      </div>

      {#if moveLogEntries.length}
        <ol class="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
          {#each visibleMoveLogEntries as entry (entry.record.turn)}
            <li
              class="rounded-md border border-neutral-800 bg-neutral-900/70 p-3"
              style="content-visibility: auto;"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-medium text-neutral-400">
                  {moveLogMeta(entry.record)}
                </span>
                {#if entry.record.usage}
                  <span class="text-[10px] text-neutral-500">
                    {entry.record.usage.input} in / {entry.record.usage.output} out
                  </span>
                {/if}
              </div>
              <div class="mt-2 leading-snug text-neutral-100">
                {#if entry.card}
                  <div class="flex items-start gap-3">
                    <div
                      class="relative aspect-[5/7] w-24 shrink-0 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950"
                    >
                      <img
                        class="h-full w-full object-cover"
                        src={loggedCardImageSrc(entry.card)}
                        alt={loggedCardAlt(entry.card)}
                        loading="lazy"
                        decoding="async"
                      />
                      <div
                        class="pointer-events-none absolute inset-0 bg-gradient-to-b from-neutral-950/40 via-transparent to-neutral-950/50"
                      ></div>
                      <div
                        class="pointer-events-none absolute inset-0 flex flex-col justify-between p-1.5"
                      >
                        <div class="flex items-start justify-between gap-1">
                          <span
                            class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-neutral-950/85"
                            title={gemLabels[entry.card.bonus]}
                            aria-label={gemLabels[entry.card.bonus]}
                          >
                            <img
                              class="h-5 w-5"
                              src={`/assets/splendor/gems/${entry.card.bonus}.svg`}
                              alt=""
                              aria-hidden="true"
                            />
                          </span>
                          <span
                            class="rounded-md bg-neutral-950/85 px-2 py-1 text-xs font-semibold text-neutral-100 ring-1 ring-white/10"
                            title={`${entry.card.prestige} prestige`}
                          >
                            {entry.card.prestige}
                          </span>
                        </div>
                        <div class="flex flex-col items-start gap-1">
                          {#each GEMS as gem (gem)}
                            {#if entry.card.cost[gem]}
                              <span
                                class="inline-flex items-center gap-1 rounded-full border border-white/15 bg-neutral-950/85 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-100"
                                title={`${entry.card.cost[gem]} ${gemLabels[gem]}`}
                              >
                                <img
                                  class="h-3.5 w-3.5"
                                  src={`/assets/splendor/gems/${gem}.svg`}
                                  alt=""
                                  aria-hidden="true"
                                />
                                {entry.card.cost[gem]}
                              </span>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    </div>
                    <div class="min-w-0 pt-1">
                      <div class="font-medium">
                        {entry.action}
                      </div>
                      {#if entry.discard.length || entry.noble}
                        <div
                          class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400"
                        >
                          {#if entry.discard.length}
                            <span>Discard</span>
                            {#each entry.discard as token (`${token.gem}:${token.amount}`)}
                              <SplendorGemBadge
                                gem={token.gem}
                                amount={token.amount}
                                compact
                              />
                            {/each}
                          {/if}
                          {#if entry.noble}
                            <span>Claim {entry.noble}</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {:else if entry.record.move.kind === 'take'}
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="font-medium">{entry.action}</span>
                    {#each entry.record.move.gems as gem, index (`${gem}:${index}`)}
                      <SplendorGemBadge {gem} compact />
                    {/each}
                  </div>
                  {#if entry.discard.length || entry.noble}
                    <div
                      class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400"
                    >
                      {#if entry.discard.length}
                        <span>Discard</span>
                        {#each entry.discard as token (`${token.gem}:${token.amount}`)}
                          <SplendorGemBadge
                            gem={token.gem}
                            amount={token.amount}
                            compact
                          />
                        {/each}
                      {/if}
                      {#if entry.noble}
                        <span>Claim {entry.noble}</span>
                      {/if}
                    </div>
                  {/if}
                {:else}
                  <div>{entry.action}</div>
                  {#if entry.discard.length || entry.noble}
                    <div
                      class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400"
                    >
                      {#if entry.discard.length}
                        <span>Discard</span>
                        {#each entry.discard as token (`${token.gem}:${token.amount}`)}
                          <SplendorGemBadge
                            gem={token.gem}
                            amount={token.amount}
                            compact
                          />
                        {/each}
                      {/if}
                      {#if entry.noble}
                        <span>Claim {entry.noble}</span>
                      {/if}
                    </div>
                  {/if}
                {/if}
              </div>
              {#if entry.record.error}
                <div class="mt-1 text-xs text-amber-200">
                  {entry.record.error}
                </div>
              {/if}
            </li>
          {/each}
          {#if visibleMoveLogEntries.length < moveLogEntries.length}
            <li class="pt-1">
              <button
                class="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-600 hover:text-white"
                type="button"
                on:click={() => {
                  moveLogLimit += MOVE_LOG_PAGE_SIZE;
                }}
              >
                Show older moves
              </button>
            </li>
          {/if}
        </ol>
      {:else}
        <p
          class="mt-4 rounded-md border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400"
        >
          No moves recorded yet.
        </p>
      {/if}
    </div>
  </div>
{/if}

{#if activeModal === 'gold' && pendingMove?.kind === 'buy' && state}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="w-full max-w-lg rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <h2 class="text-xl font-semibold tracking-normal">Allocate Gold</h2>
      <div class="mt-4 space-y-3">
        {#each goldRangesFor(state, pendingMove) as range (range.gem)}
          <div
            class="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3"
          >
            <SplendorGemBadge gem={range.gem} />
            <div class="flex items-center gap-2">
              <button
                class="rounded-md border border-neutral-700 px-2 py-1"
                type="button"
                on:click={() => adjustGold(range.gem, -1)}>-</button
              >
              <span class="w-8 text-center"
                >{goldDraft[range.gem] ?? range.min}</span
              >
              <button
                class="rounded-md border border-neutral-700 px-2 py-1"
                type="button"
                on:click={() => adjustGold(range.gem, 1)}>+</button
              >
            </div>
          </div>
        {/each}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button
          class="rounded-md border border-neutral-700 px-3 py-2 text-sm"
          type="button"
          on:click={cancelModal}>Cancel</button
        >
        <button
          class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950"
          type="button"
          on:click={confirmGold}>Confirm</button
        >
      </div>
    </div>
  </div>
{/if}

{#if activeModal === 'noble' && pendingMove && state}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="w-full max-w-2xl rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <h2 class="text-xl font-semibold tracking-normal">Choose Noble</h2>
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {#each eligibleNoblesAfter(state, pendingMove) as noble (noble.id)}
          <button
            class="rounded-md border bg-neutral-900 p-1 text-left transition {nobleDraft ===
            noble.id
              ? 'border-amber-300 ring-2 ring-amber-300/30'
              : 'border-neutral-800 hover:border-amber-300/60'}"
            type="button"
            aria-pressed={nobleDraft === noble.id}
            on:click={() => {
              nobleDraft = noble.id;
            }}
            on:dblclick={() => {
              nobleDraft = noble.id;
              confirmNoble();
            }}
          >
            <SplendorNobleArt {noble} />
          </button>
        {/each}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button
          class="rounded-md border border-neutral-700 px-3 py-2 text-sm"
          type="button"
          on:click={cancelModal}>Cancel</button
        >
        <button
          class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950"
          type="button"
          on:click={confirmNoble}>Confirm</button
        >
      </div>
    </div>
  </div>
{/if}

{#if activeModal === 'discard' && pendingProjectedTokens}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="w-full max-w-lg rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <h2 class="text-xl font-semibold tracking-normal">Discard Tokens</h2>
      <p class="mt-1 text-sm text-neutral-400">
        Discard {discardNeeded} token{discardNeeded === 1 ? '' : 's'} to return to
        10.
      </p>
      <div class="mt-4 space-y-3">
        {#each [...GEMS, 'gold'] as gem (gem)}
          <div
            class="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3"
          >
            <SplendorGemBadge {gem} amount={pendingProjectedTokens[gem]} />
            <div class="flex items-center gap-2">
              <button
                class="rounded-md border border-neutral-700 px-2 py-1"
                type="button"
                on:click={() => adjustDiscard(gem, -1)}>-</button
              >
              <span class="w-8 text-center">{discardDraft[gem] ?? 0}</span>
              <button
                class="rounded-md border border-neutral-700 px-2 py-1"
                type="button"
                on:click={() => adjustDiscard(gem, 1)}>+</button
              >
            </div>
          </div>
        {/each}
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button
          class="rounded-md border border-neutral-700 px-3 py-2 text-sm"
          type="button"
          on:click={cancelModal}>Cancel</button
        >
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

{#if snapshot?.status === 'terminal' && state && !gameOverDismissed}
  <div
    class="fixed inset-0 z-10 flex items-center justify-center bg-neutral-950/80 px-4"
  >
    <div
      class="w-full max-w-xl rounded-md border border-neutral-700 bg-neutral-950 p-5 shadow-xl"
    >
      <h2 class="text-xl font-semibold tracking-normal">
        {playUntilCardsExhausted && developmentCardsExhausted(state)
          ? 'Cards Exhausted'
          : 'Game Over'}
      </h2>
      <p class="mt-1 text-sm text-neutral-400">
        {playUntilCardsExhausted && developmentCardsExhausted(state)
          ? 'All development cards have left the market.'
          : 'The standard end game condition has been met.'}
      </p>
      <p class="mt-1 text-sm text-neutral-300">
        {terminalWinner === null
          ? 'Shared victory'
          : `Player ${terminalWinner + 1} wins`}
      </p>
      <div class="mt-4 space-y-2">
        {#each state.players as player, index (index)}
          <div
            class="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 p-3"
          >
            <span>{playerLabel(index)}</span>
            <span>{player.prestige} prestige - {player.cards.length} cards</span
            >
          </div>
        {/each}
      </div>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button
          class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 hover:text-white"
          type="button"
          on:click={() => {
            gameOverDismissed = true;
          }}
        >
          View board
        </button>
        {#if canContinueToCardExhaustion}
          <button
            class="rounded-md border border-emerald-400/60 px-3 py-2 text-sm font-medium text-emerald-100 hover:border-emerald-300 hover:text-white"
            type="button"
            on:click={continueToCardExhaustion}
          >
            Continue to card exhaustion
          </button>
        {/if}
        <button
          class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950"
          type="button"
          on:click={startShuffledGame}>New game</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .splendor-flying-asset {
    animation: splendor-fly-to-pile 760ms cubic-bezier(0.18, 0.78, 0.22, 1)
      forwards;
    transform-origin: top left;
    will-change: transform, opacity;
  }

  @keyframes splendor-fly-to-pile {
    0% {
      opacity: 0.98;
      transform: translate3d(0, 0, 0) scale(1);
    }

    52% {
      opacity: 1;
      transform: translate3d(
          calc(var(--fly-x) * 0.72),
          calc(var(--fly-y) * 0.72 - 28px),
          0
        )
        scale(1.05);
    }

    100% {
      opacity: 0;
      transform: translate3d(var(--fly-x), var(--fly-y), 0)
        scale(var(--fly-scale-x), var(--fly-scale-y));
    }
  }
</style>
