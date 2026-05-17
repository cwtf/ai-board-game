<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getProvider } from '@/lib/ai';
  import type { ProviderId, TokenUsage } from '@/lib/ai';
  import {
    secretHitlerAdapter,
    type SecretHitlerChatMessage,
    type SecretHitlerMove,
    type SecretHitlerState,
  } from '@/lib/games/secret-hitler/ai-adapter';
  import { createRng } from '@/lib/games/shared/rng';
  import {
    getStoredKeys,
    hasProviderCredentials,
    providerEndpointFor,
    selectedProfileFor,
    type ProviderModelProfile,
    type StoredKeys,
  } from '@/lib/storage/keys';

  type Party = 'liberal' | 'fascist';
  type Role = 'liberal' | 'fascist' | 'hitler';
  type Policy = Party;
  type Vote = 'ja' | 'nein' | null;
  type Phase =
    | 'nomination'
    | 'voting'
    | 'president-discard'
    | 'chancellor-discard'
    | 'veto'
    | 'policy-peek'
    | 'investigate'
    | 'special-election'
    | 'execution'
    | 'game-over';
  type ExecutivePower =
    | 'none'
    | 'policy-peek'
    | 'investigate'
    | 'special-election'
    | 'execution';

  interface Player {
    id: number;
    name: string;
    role: Role;
    roleAsset: string;
    alive: boolean;
  }

  interface ChatMessage {
    id: string;
    playerId: number;
    playerName: string;
    body: string;
    turn: number;
    phase: Phase;
  }

  type RelationshipStatus = 'trust' | 'neutral' | 'suspicious' | 'accused';

  interface RelationshipEdge {
    from: number;
    to: number;
    status: RelationshipStatus;
    summary: string;
  }

  interface ParsedTableRead {
    edges: RelationshipEdge[];
    rejectedCount: number;
    returnedPairCount: number;
  }

  type PlayerProfileSelections = Record<number, string>;

  const HUMAN_PROFILE = '__human__';
  const HUMAN_PLAYER_INDEX = 0;
  const roleCounts: Record<number, { liberals: number; fascists: number }> = {
    5: { liberals: 3, fascists: 1 },
    6: { liberals: 4, fascists: 1 },
    7: { liberals: 4, fascists: 2 },
    8: { liberals: 5, fascists: 2 },
    9: { liberals: 5, fascists: 3 },
    10: { liberals: 6, fascists: 3 },
  };
  const liberalSpaces = [
    'Policy',
    'Policy',
    'Policy',
    'Policy',
    'Liberals win',
  ];
  const fascistPowersByPlayerCount: Record<number, ExecutivePower[]> = {
    5: ['none', 'none', 'policy-peek', 'execution', 'execution', 'none'],
    6: ['none', 'none', 'policy-peek', 'execution', 'execution', 'none'],
    7: [
      'none',
      'investigate',
      'special-election',
      'execution',
      'execution',
      'none',
    ],
    8: [
      'none',
      'investigate',
      'special-election',
      'execution',
      'execution',
      'none',
    ],
    9: [
      'investigate',
      'investigate',
      'special-election',
      'execution',
      'execution',
      'none',
    ],
    10: [
      'investigate',
      'investigate',
      'special-election',
      'execution',
      'execution',
      'none',
    ],
  };
  const powerLabels: Record<ExecutivePower, string> = {
    none: 'No power',
    'policy-peek': 'Policy peek',
    investigate: 'Investigate',
    'special-election': 'Special election',
    execution: 'Execution',
  };
  const relationshipLegend: RelationshipStatus[] = [
    'trust',
    'suspicious',
    'accused',
    'neutral',
  ];
  const germanPlayerNames = [
    'Klara',
    'Lukas',
    'Greta',
    'Felix',
    'Anja',
    'Hans',
    'Marta',
    'Otto',
    'Heidi',
    'Klaus',
  ];
  const playerNameColorClasses = [
    'text-sky-300',
    'text-emerald-300',
    'text-amber-300',
    'text-fuchsia-300',
    'text-lime-300',
    'text-orange-300',
    'text-violet-300',
    'text-cyan-300',
    'text-rose-300',
    'text-teal-300',
  ];
  const playerNameColors = [
    '#7dd3fc',
    '#6ee7b7',
    '#fcd34d',
    '#f0abfc',
    '#bef264',
    '#fdba74',
    '#c4b5fd',
    '#67e8f9',
    '#fda4af',
    '#5eead4',
  ];
  const secretHitlerAssetBase = '/assets/secret-hitler';
  const ballotAssets: Record<Exclude<Vote, null>, string> = {
    ja: `${secretHitlerAssetBase}/ballots/ja.png`,
    nein: `${secretHitlerAssetBase}/ballots/nein.png`,
  };
  const policyAssets: Record<Policy, string> = {
    liberal: `${secretHitlerAssetBase}/policies/liberal.png`,
    fascist: `${secretHitlerAssetBase}/policies/fascist.png`,
  };
  const liberalRoleAssets = [
    `${secretHitlerAssetBase}/roles/liberal-cat.png`,
    `${secretHitlerAssetBase}/roles/liberal-chicken.png`,
    `${secretHitlerAssetBase}/roles/liberal-dog.png`,
    `${secretHitlerAssetBase}/roles/liberal-panda.png`,
    `${secretHitlerAssetBase}/roles/liberal-parrot.png`,
    `${secretHitlerAssetBase}/roles/liberal-racoon.png`,
    `${secretHitlerAssetBase}/roles/liberal-rat.png`,
  ];
  const fascistRoleAssets = [
    `${secretHitlerAssetBase}/roles/fascist-crocodile.png`,
    `${secretHitlerAssetBase}/roles/fascist-lizard.png`,
    `${secretHitlerAssetBase}/roles/fascist-snake.png`,
  ];
  const hitlerRoleAsset = `${secretHitlerAssetBase}/roles/hitler-velociraptor.png`;
  const partyAssets: Record<Party, string> = {
    liberal: `${secretHitlerAssetBase}/party/liberal.png`,
    fascist: `${secretHitlerAssetBase}/party/fascist.png`,
  };
  const dossierBackAsset = `${secretHitlerAssetBase}/backs/dossier-back.png`;
  const electionTrackerAsset = `${secretHitlerAssetBase}/tokens/election-tracker.png`;
  const liberalBoardAsset = `${secretHitlerAssetBase}/boards/liberal-board.png`;
  const fascistBoardAsset = `${secretHitlerAssetBase}/boards/fascist-board.png`;

  let keys: StoredKeys = {};
  let playerCount = 5;
  let seed = '';
  let players: Player[] = [];
  let president = 0;
  let nominee: number | null = null;
  let previousPresident: number | null = null;
  let previousChancellor: number | null = null;
  let specialReturnPresident: number | null = null;
  let electionTracker = 0;
  let liberalPolicies = 0;
  let fascistPolicies = 0;
  let drawPile: Policy[] = [];
  let discardPile: Policy[] = [];
  let presidentHand: Policy[] = [];
  let chancellorHand: Policy[] = [];
  let peekedPolicies: Policy[] = [];
  let votes: Record<number, Vote> = {};
  let ballotRevealPending = false;
  let phase: Phase = 'nomination';
  let identityViewer = HUMAN_PLAYER_INDEX;
  let investigationResult = '';
  let message = '';
  let winner = '';
  let turn = 1;
  let chatDraft = '';
  let chatMessages: ChatMessage[] = [];
  let tableReadProfileId = '';
  let tableReadEdges: RelationshipEdge[] = [];
  let tableReadThinking = false;
  let tableReadWarning = '';
  let tableReadStatus = '';
  let lastSuccessfulTableReadKey = '';
  let lastAutoTableReadKey = '';
  let lastExecutionNotice = '';
  let lastExecutivePowerNotice = '';
  let aiThinking = false;
  let aiWarning = '';
  let aiController: globalThis.AbortController | undefined;
  let chatReplyController: globalThis.AbortController | undefined;
  let tableReadController: globalThis.AbortController | undefined;
  let lastUsage: TokenUsage | undefined;
  let totalUsage: TokenUsage = { input: 0, output: 0 };
  const answeredQuestionKeys = new Set<string>();
  let playerProfileSelections: PlayerProfileSelections = {
    [HUMAN_PLAYER_INDEX]: HUMAN_PROFILE,
  };

  $: alivePlayers = players.filter((player) => player.alive);
  $: presidentPlayer = players[president];
  $: nomineePlayer = nominee === null ? undefined : players[nominee];
  $: presidentName = presidentPlayer?.name ?? germanPlayerName(0);
  $: nomineeName = nomineePlayer?.name ?? 'Not nominated';
  $: jaVotes = alivePlayers.filter(
    (player) => votes[player.id] === 'ja',
  ).length;
  $: neinVotes = alivePlayers.filter(
    (player) => votes[player.id] === 'nein',
  ).length;
  $: allVotesCast = alivePlayers.every((player) => votes[player.id]);
  $: governmentPasses = jaVotes > alivePlayers.length / 2;
  $: vetoUnlocked = fascistPolicies >= 5;
  $: selectedProfile = selectedProfileFor(keys);
  $: configuredProfiles = (keys.modelProfiles ?? []).filter((profile) =>
    hasProviderCredentials(profile.provider, keys),
  );
  $: defaultProfileId =
    configuredProfiles.find((profile) => profile.id === selectedProfile?.id)
      ?.id ??
    configuredProfiles[0]?.id ??
    '';
  $: normalizePlayerProfileSelections(playerCount, defaultProfileId);
  $: normalizeIdentityViewer(playerCount);
  $: normalizeTableReadProfile(defaultProfileId);
  $: currentActor = players.length
    ? secretHitlerAdapter.currentPlayer(toAdapterState())
    : HUMAN_PLAYER_INDEX;
  $: currentActorProfile = configuredProfileById(
    playerProfileSelections[currentActor] ?? HUMAN_PROFILE,
  );
  $: humanPlayer = players[HUMAN_PLAYER_INDEX];
  $: humanCanChat = Boolean(humanPlayer?.alive);
  $: humanIsPresident = president === HUMAN_PLAYER_INDEX;
  $: relationshipEdges = completeRelationshipEdges(players, tableReadEdges);
  $: activeRelationshipEdges = relationshipEdges.filter(
    (edge) => edge.status !== 'neutral',
  );

  function refreshKeys() {
    keys = getStoredKeys();
  }

  function createGameSeed(): string {
    return `game-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  function toAdapterState(): SecretHitlerState {
    return {
      seed,
      players,
      president,
      nominee,
      previousPresident,
      previousChancellor,
      specialReturnPresident,
      electionTracker,
      liberalPolicies,
      fascistPolicies,
      drawPile,
      discardPile,
      presidentHand,
      chancellorHand,
      peekedPolicies,
      votes,
      phase,
      investigationResult,
      winner: winner ? (winner.startsWith('Liberals') ? 0 : 1) : null,
      winnerText: winner,
      turn,
      chatMessages: chatMessages.map(
        ({ id: _id, ...item }) => item,
      ) satisfies SecretHitlerChatMessage[],
    };
  }

  function statePlayerRoleAsset(
    player: SecretHitlerState['players'][number],
  ): string | undefined {
    return 'roleAsset' in player && typeof player.roleAsset === 'string'
      ? player.roleAsset
      : undefined;
  }

  function fallbackRoleAsset(role: Role): string {
    if (role === 'hitler') {
      return hitlerRoleAsset;
    }

    return role === 'fascist' ? fascistRoleAssets[0] : liberalRoleAssets[0];
  }

  function hydratePlayersWithRoleAssets(
    nextPlayers: SecretHitlerState['players'],
  ): Player[] {
    const currentRoleAssets = new Map(
      players.map((player) => [player.id, player.roleAsset]),
    );

    return nextPlayers.map((player) => ({
      ...player,
      roleAsset:
        statePlayerRoleAsset(player) ??
        currentRoleAssets.get(player.id) ??
        fallbackRoleAsset(player.role),
    }));
  }

  function loadAdapterState(state: SecretHitlerState) {
    players = hydratePlayersWithRoleAssets(state.players);
    president = state.president;
    nominee = state.nominee;
    previousPresident = state.previousPresident;
    previousChancellor = state.previousChancellor;
    specialReturnPresident = state.specialReturnPresident;
    electionTracker = state.electionTracker;
    liberalPolicies = state.liberalPolicies;
    fascistPolicies = state.fascistPolicies;
    drawPile = state.drawPile;
    discardPile = state.discardPile;
    presidentHand = state.presidentHand;
    chancellorHand = state.chancellorHand;
    peekedPolicies = state.peekedPolicies;
    votes = state.votes;
    phase = state.phase;
    investigationResult = state.investigationResult;
    winner = state.winnerText;
    turn = state.turn;
    chatMessages = state.chatMessages.map((item, index) => ({
      id: `chat-${index}-${item.turn}-${item.playerId}-${item.phase}`,
      ...item,
    }));
    message = state.winnerText || messageForState(state);
    const latestChat = chatMessages.at(-1);
    if (latestChat) {
      maybeRequestQuestionReplies(latestChat);
    }
  }

  function allBallotsSubmitted(state: SecretHitlerState): boolean {
    return state.players
      .filter((player) => player.alive)
      .every((player) => state.votes[player.id]);
  }

  function stateWithTableTalk(
    state: SecretHitlerState,
    playerId: number,
    tableTalk?: string,
  ): SecretHitlerState {
    const body = tableTalk?.trim();
    const speaker = state.players[playerId];
    if (!body || !speaker) {
      return state;
    }

    return {
      ...state,
      chatMessages: [
        ...state.chatMessages,
        {
          playerId: speaker.id,
          playerName: speaker.name,
          body: body.slice(0, 500),
          turn: state.turn,
          phase: state.phase,
        },
      ],
    };
  }

  function pauseForBallotReveal() {
    ballotRevealPending = true;
    message = 'All ballots are in. Review the votes, then press Next.';
  }

  function continueAfterBallotReveal() {
    if (!ballotRevealPending) {
      return;
    }

    ballotRevealPending = false;
    resolveVote();
  }

  function messageForState(state: SecretHitlerState): string {
    const statePresident = state.players[state.president]?.name ?? 'President';
    const stateNominee =
      state.nominee === null
        ? 'Chancellor'
        : (state.players[state.nominee]?.name ?? 'Chancellor');

    switch (state.phase) {
      case 'nomination':
        return `${statePresident} nominates a Chancellor.`;
      case 'voting':
        return `Vote on ${statePresident} and ${stateNominee}.`;
      case 'president-discard':
        return `${statePresident} privately discards one policy.`;
      case 'chancellor-discard':
        return `${stateNominee} privately enacts one policy.`;
      case 'veto':
        return `${statePresident} responds to ${stateNominee}'s veto request.`;
      case 'policy-peek':
        return `${statePresident} privately peeks at the top policies.`;
      case 'investigate':
        return state.investigationResult
          ? `${statePresident} has an investigation result.`
          : `${statePresident} investigates a player.`;
      case 'special-election':
        return `${statePresident} chooses a special election President.`;
      case 'execution':
        return `${statePresident} executes a player.`;
      case 'game-over':
        return state.winnerText;
    }
  }

  function shuffle<T>(items: T[], salt: string): T[] {
    const rng = createRng(`${seed}:${salt}`);
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = rng.int(index + 1);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function rolesFor(count: number): Role[] {
    const counts = roleCounts[count];
    return shuffle(
      [
        ...Array.from({ length: counts.liberals }, () => 'liberal' as const),
        ...Array.from({ length: counts.fascists }, () => 'fascist' as const),
        'hitler' as const,
      ],
      'roles',
    );
  }

  function createPolicyDeck(): Policy[] {
    return shuffle(
      [
        ...Array.from({ length: 6 }, () => 'liberal' as const),
        ...Array.from({ length: 11 }, () => 'fascist' as const),
      ],
      'policies',
    );
  }

  function roleAssetForRole(
    role: Role,
    liberalAssets: string[],
    fascistAssets: string[],
  ): string {
    if (role === 'hitler') {
      return hitlerRoleAsset;
    }

    if (role === 'fascist') {
      return fascistAssets.shift() ?? fascistRoleAssets[0];
    }

    return liberalAssets.shift() ?? liberalRoleAssets[0];
  }

  function startGame() {
    seed = createGameSeed();
    const roles = rolesFor(playerCount);
    const shuffledLiberalAssets = shuffle(
      liberalRoleAssets,
      'liberal-portraits',
    );
    const shuffledFascistAssets = shuffle(
      fascistRoleAssets,
      'fascist-portraits',
    );
    players = roles.map((role, index) => ({
      id: index,
      name:
        index === HUMAN_PLAYER_INDEX
          ? `${germanPlayerName(index)} (You)`
          : germanPlayerName(index),
      role,
      roleAsset: roleAssetForRole(
        role,
        shuffledLiberalAssets,
        shuffledFascistAssets,
      ),
      alive: true,
    }));
    president = 0;
    nominee = null;
    previousPresident = null;
    previousChancellor = null;
    specialReturnPresident = null;
    electionTracker = 0;
    liberalPolicies = 0;
    fascistPolicies = 0;
    drawPile = createPolicyDeck();
    discardPile = [];
    presidentHand = [];
    chancellorHand = [];
    peekedPolicies = [];
    votes = {};
    ballotRevealPending = false;
    phase = 'nomination';
    identityViewer = HUMAN_PLAYER_INDEX;
    investigationResult = '';
    message = 'Nominate a Chancellor.';
    winner = '';
    turn = 1;
    chatDraft = '';
    chatMessages = [];
    tableReadEdges = [];
    tableReadWarning = '';
    lastAutoTableReadKey = '';
    lastSuccessfulTableReadKey = '';
    lastExecutionNotice = '';
    lastExecutivePowerNotice = '';
    answeredQuestionKeys.clear();
    aiWarning = '';
    lastUsage = undefined;
    totalUsage = { input: 0, output: 0 };
    if (typeof window !== 'undefined') {
      window.setTimeout(() => void runAI(), 0);
    }
  }

  function roleLabel(role: Role): string {
    if (role === 'hitler') {
      return 'Hitler';
    }
    return role === 'liberal' ? 'Liberal' : 'Fascist';
  }

  function executivePowerFor(policyCount: number): ExecutivePower {
    return (
      fascistPowersByPlayerCount[playerCount][Math.max(0, policyCount - 1)] ??
      'none'
    );
  }

  function partyLabel(role: Role): string {
    return role === 'liberal' ? 'Liberal' : 'Fascist';
  }

  function policyLabel(policy: Policy): string {
    return policy === 'liberal' ? 'Liberal' : 'Fascist';
  }

  function configuredProfileById(
    profileId: string,
  ): ProviderModelProfile | undefined {
    return configuredProfiles.find((profile) => profile.id === profileId);
  }

  function normalizeTableReadProfile(fallbackProfileId: string) {
    if (!tableReadProfileId && fallbackProfileId) {
      tableReadProfileId = fallbackProfileId;
      tableReadWarning = '';
      tableReadStatus = '';
      lastSuccessfulTableReadKey = '';
      return;
    }

    if (
      tableReadProfileId &&
      !configuredProfiles.some((profile) => profile.id === tableReadProfileId)
    ) {
      tableReadProfileId = fallbackProfileId;
      tableReadEdges = [];
      tableReadWarning = '';
      tableReadStatus = '';
      lastSuccessfulTableReadKey = '';
    }
  }

  function profileLabel(profile: ProviderModelProfile): string {
    return `${profile.label} (${getProvider(profile.provider).label})`;
  }

  function addUsage(left: TokenUsage, right?: TokenUsage): TokenUsage {
    return {
      input: left.input + (right?.input ?? 0),
      output: left.output + (right?.output ?? 0),
    };
  }

  function modelProfileForPlayer(playerIndex: number) {
    const profileId = playerProfileSelections[playerIndex] ?? HUMAN_PROFILE;
    if (profileId === HUMAN_PROFILE) {
      return undefined;
    }
    return configuredProfileById(profileId);
  }

  function aiCanAct(playerIndex: number): boolean {
    return Boolean(modelProfileForPlayer(playerIndex));
  }

  function isExecutivePhase(value: Phase): boolean {
    return (
      value === 'policy-peek' ||
      value === 'investigate' ||
      value === 'special-election' ||
      value === 'execution'
    );
  }

  function canContinueAIExecutivePower(): boolean {
    return isExecutivePhase(phase) && aiCanAct(president) && !aiThinking;
  }

  function createAbortController() {
    return new globalThis.AbortController();
  }

  async function requestAIAction(
    state: SecretHitlerState,
    player: number,
    legalMoves: SecretHitlerMove[],
    profile: ProviderModelProfile,
    signal?: AbortSignal,
  ): Promise<SecretHitlerMove> {
    const providerId = profile.provider as ProviderId;
    const provider = getProvider(providerId);
    const messages = [
      {
        role: 'user' as const,
        content: secretHitlerAdapter.serializeForAI(state, player, legalMoves),
      },
    ];
    let lastError = '';

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await provider.complete({
        apiKey: keys[providerId],
        endpointUrl: providerEndpointFor(providerId, keys),
        model: profile.model,
        system: secretHitlerAdapter.systemPrompt(),
        messages,
        responseFormat: 'json',
        temperature: 0.7,
        maxTokens: 700,
        signal,
      });

      lastUsage = result.usage;
      totalUsage = addUsage(totalUsage, result.usage);
      const parsed = secretHitlerAdapter.parseAIMove(result.text, legalMoves);
      if (parsed.ok) {
        return parsed.move;
      }

      lastError = parsed.error;
      messages.push(
        { role: 'assistant' as const, content: result.text },
        {
          role: 'user' as const,
          content: `Invalid response: ${parsed.error}. Return exactly one JSON object with a legal moveId from the legalMoves list and optional tableTalk.`,
        },
      );
    }

    throw new Error(lastError || 'AI did not return a valid move.');
  }

  function fallbackAIExecutiveMove(
    state: SecretHitlerState,
    legalMoves: SecretHitlerMove[],
  ): SecretHitlerMove | undefined {
    if (!isExecutivePhase(state.phase)) {
      return undefined;
    }

    if (state.phase === 'investigate' && state.investigationResult) {
      return legalMoves.find((move) => move.kind === 'complete-investigation');
    }

    return legalMoves[0];
  }

  function playerNameClasses(playerId: number): string {
    return playerNameColorClasses[playerId % playerNameColorClasses.length];
  }

  function playerNameColor(playerId: number): string {
    return playerNameColors[playerId % playerNameColors.length];
  }

  function lifeBadgeClasses(player: Player): string {
    return player.alive
      ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-100'
      : 'border-red-400/50 bg-red-500/10 text-red-100';
  }

  function lifeBadgeLabel(player: Player): string {
    return player.alive ? 'Alive' : 'Dead';
  }

  function germanPlayerName(playerId: number): string {
    return germanPlayerNames[playerId % germanPlayerNames.length];
  }

  function displayNameFor(playerId: number): string {
    return players[playerId]?.name ?? germanPlayerName(playerId);
  }

  function relationshipSummary(edge: RelationshipEdge): string {
    if (edge.status === 'neutral') {
      return `${displayNameFor(edge.from)} -> ${displayNameFor(edge.to)}: Neutral`;
    }
    return `${displayNameFor(edge.from)} -> ${displayNameFor(edge.to)}: ${edge.summary}`;
  }

  function completeRelationshipEdges(
    tablePlayers: Player[],
    analystEdges: RelationshipEdge[],
  ): RelationshipEdge[] {
    const analystReads = new Map<string, RelationshipEdge>();
    for (const edge of analystEdges) {
      const existing = analystReads.get(relationshipKey(edge.from, edge.to));
      if (
        !existing ||
        relationshipRank(edge.status) >= relationshipRank(existing.status)
      ) {
        analystReads.set(relationshipKey(edge.from, edge.to), edge);
      }
    }

    const edges: RelationshipEdge[] = [];
    for (let from = 0; from < tablePlayers.length; from += 1) {
      for (let to = 0; to < tablePlayers.length; to += 1) {
        if (from === to) {
          continue;
        }
        edges.push(
          analystReads.get(relationshipKey(from, to)) ?? {
            from,
            to,
            status: 'neutral',
            summary: 'Neutral read',
          },
        );
      }
    }

    return edges;
  }

  function relationshipKey(from: number, to: number): string {
    return `${from}->${to}`;
  }

  function mergeTableReadEdges(
    savedEdges: RelationshipEdge[],
    newEdges: RelationshipEdge[],
  ): RelationshipEdge[] {
    const merged = new Map<string, RelationshipEdge>();
    for (const edge of completeRelationshipEdges(players, savedEdges)) {
      merged.set(relationshipKey(edge.from, edge.to), edge);
    }

    for (const edge of newEdges) {
      const key = relationshipKey(edge.from, edge.to);
      if (edge.status === 'neutral') {
        const existing = merged.get(key);
        if (!existing || existing.status === 'neutral') {
          merged.set(key, edge);
        }
        continue;
      }

      merged.set(key, edge);
    }

    return Array.from(merged.values()).sort(
      (left, right) => left.from - right.from || left.to - right.to,
    );
  }

  function normalizeRelationshipStatus(
    value: unknown,
  ): RelationshipStatus | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase().replace(/[_-]/g, ' ');
    if (normalized === 'trust' || normalized === 'trusting') {
      return 'trust';
    }
    if (normalized === 'neutral') {
      return 'neutral';
    }
    if (normalized === 'suspicious' || normalized === 'suspect') {
      return 'suspicious';
    }
    if (
      normalized === 'accused' ||
      normalized === 'accusing fascist' ||
      normalized === 'accuses fascist' ||
      normalized === 'fascist accusation'
    ) {
      return 'accused';
    }
    return undefined;
  }

  function numericPlayerId(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      return Number(value);
    }
    return undefined;
  }

  function relationshipPairCount(count: number): number {
    return count * (count - 1);
  }

  function tableReadSnapshotKey(profile: ProviderModelProfile): string {
    return JSON.stringify({
      profileId: profile.id,
      provider: profile.provider,
      model: profile.model,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        alive: player.alive,
      })),
      publicChat: chatMessages.map(
        ({ playerId, playerName, body, turn, phase }) => ({
          playerId,
          playerName,
          body,
          turn,
          phase,
        }),
      ),
    });
  }

  function parseTableReadResponse(response: string): ParsedTableRead {
    const payload = JSON.parse(extractJsonObject(response)) as {
      relationships?: unknown;
    };
    if (!Array.isArray(payload.relationships)) {
      throw new Error('Table read response must include relationships.');
    }

    const playerIds = new Set(players.map((player) => player.id));
    const edges = new Map<string, RelationshipEdge>();
    let rejectedCount = 0;
    for (const item of payload.relationships) {
      if (!item || typeof item !== 'object') {
        rejectedCount += 1;
        continue;
      }

      const candidate = item as {
        from?: unknown;
        to?: unknown;
        status?: unknown;
        summary?: unknown;
      };
      const from = numericPlayerId(candidate.from);
      const to = numericPlayerId(candidate.to);
      const status = normalizeRelationshipStatus(candidate.status);
      if (
        from === undefined ||
        to === undefined ||
        from === to ||
        !playerIds.has(from) ||
        !playerIds.has(to) ||
        !status
      ) {
        rejectedCount += 1;
        continue;
      }

      const key = relationshipKey(from, to);
      const existing = edges.get(key);
      const nextEdge = {
        from,
        to,
        status,
        summary:
          typeof candidate.summary === 'string' && candidate.summary.trim()
            ? candidate.summary.trim().slice(0, 120)
            : relationshipLabel(status),
      };
      if (
        !existing ||
        relationshipRank(nextEdge.status) >= relationshipRank(existing.status)
      ) {
        edges.set(key, nextEdge);
      }
    }

    if (edges.size === 0 && rejectedCount > 0) {
      throw new Error(
        `Table read response had ${rejectedCount} invalid relationship entr${rejectedCount === 1 ? 'y' : 'ies'}.`,
      );
    }

    return {
      edges: Array.from(edges.values()),
      rejectedCount,
      returnedPairCount: edges.size,
    };
  }

  function extractJsonObject(response: string): string {
    const trimmed = response.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced?.[1]?.trim() ?? trimmed;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return candidate;
    }
    return candidate.slice(start, end + 1);
  }

  function selectTableReadProfile(profileId: string) {
    tableReadProfileId = profileId;
    tableReadWarning = '';
    tableReadStatus = '';
    tableReadEdges = [];
    lastSuccessfulTableReadKey = '';
    tableReadController?.abort();
    if (profileId && chatMessages.length) {
      void requestTableReads();
    }
  }

  function maybeAutoReadRoom() {
    if (!tableReadProfileId || chatMessages.length === 0 || tableReadThinking) {
      return;
    }

    const key = `${turn}:${phase}:${chatMessages.length}`;
    if (lastAutoTableReadKey === key) {
      return;
    }

    lastAutoTableReadKey = key;
    void requestTableReads({ silent: true });
  }

  async function requestTableReads(opts: { silent?: boolean } = {}) {
    const profile = configuredProfileById(tableReadProfileId);
    if (!profile || tableReadThinking) {
      return;
    }
    if (chatMessages.length === 0) {
      tableReadEdges = [];
      lastSuccessfulTableReadKey = '';
      if (!opts.silent) {
        tableReadWarning = 'No public chat yet.';
        tableReadStatus = '';
      }
      return;
    }

    const snapshotKey = tableReadSnapshotKey(profile);
    if (snapshotKey === lastSuccessfulTableReadKey && tableReadEdges.length) {
      if (!opts.silent) {
        tableReadWarning = '';
        tableReadStatus =
          'Room read is already up to date for the current chat.';
      }
      return;
    }

    tableReadThinking = true;
    tableReadWarning = '';
    tableReadStatus = opts.silent ? 'Auto-reading room...' : 'Reading room...';
    tableReadController?.abort();
    tableReadController = createAbortController();
    const providerId = profile.provider as ProviderId;
    const expectedPairCount = relationshipPairCount(players.length);
    const messages = [
      {
        role: 'user' as const,
        content: JSON.stringify({
          game: 'secret-hitler',
          players: players.map((player) => ({
            id: player.id,
            name: player.name,
            alive: player.alive,
          })),
          savedRoomState: completeRelationshipEdges(
            players,
            tableReadEdges,
          ).map((edge) => ({
            from: edge.from,
            to: edge.to,
            status: edge.status,
            summary: edge.summary,
          })),
          publicChat: chatMessages
            .slice(-40)
            .map(({ id: _id, ...item }) => item),
          expectedRelationships: expectedPairCount,
          instructions: [
            'Update the savedRoomState using only new public evidence from chat.',
            'Return exactly one directed relationship entry for every ordered player pair where from and to are different.',
            'A from->to read means what the from player appears to feel or signal toward the to player; it does not imply the reverse direction.',
            'Use neutral when there is no new finding for a directed pair; neutral will not erase an existing non-neutral saved read.',
            'Return trust, suspicious, or accused only when public chat supports a new or changed directed association.',
            'Do not omit quiet directed pairs.',
            'Keep summaries under 80 characters.',
          ],
          responseSchema: {
            relationships: [
              {
                from: 0,
                to: 1,
                status: 'trust | neutral | suspicious | accused',
                summary: 'short public reason',
              },
            ],
          },
        }),
      },
    ];
    let lastError = '';

    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = await getProvider(providerId).complete({
          apiKey: keys[providerId],
          endpointUrl: providerEndpointFor(providerId, keys),
          model: profile.model,
          system: [
            'You are a neutral table-read analyst for a Secret Hitler game.',
            'Use only public chat and public player names. Do not infer from hidden roles, private hands, or secret information.',
            'You are updating a saved room-state graph. Preserve prior non-neutral associations unless newer public chat supports changing them.',
            'Relationships are directional: A trusting B does not mean B trusts A. Analyze each ordered from->to direction independently.',
            'A neutral output means no new finding for that directed pair; it must not be used to erase prior trust, suspicion, or accusation.',
            `Return exactly ${expectedPairCount} relationship entries: one for every ordered player pair where from and to are different.`,
            'Use neutral for unclear, quiet, unsupported, or unchanged directed pairs. Do not omit pairs.',
            'Return pairs in stable ascending order by from, then to.',
            'Statuses are trust, neutral, suspicious, or accused. accused means a player is being treated as Fascist/Hitler, not merely discussing Fascist policies.',
            'Return exactly one complete minified JSON object: {"relationships":[{"from":0,"to":1,"status":"neutral","summary":"no clear read"}]}.',
            'No markdown, no code fences, no prose, no trailing commas.',
          ].join(' '),
          messages,
          responseFormat: 'json',
          temperature: 0,
          maxTokens: 3200,
          signal: tableReadController.signal,
        });

        lastUsage = result.usage;
        totalUsage = addUsage(totalUsage, result.usage);

        try {
          const parsed = parseTableReadResponse(result.text);
          if (parsed.returnedPairCount < expectedPairCount && attempt < 3) {
            lastError = `Only ${parsed.returnedPairCount}/${expectedPairCount} directed reads were returned.`;
            messages.push(
              {
                role: 'assistant' as const,
                content: result.text.slice(0, 4000),
              },
              {
                role: 'user' as const,
                content: `Partial relationship map: ${lastError}. Return all ${expectedPairCount} ordered directed player pairs where from and to differ. Use neutral for directed pairs with no new finding; neutral will not erase saved non-neutral reads. Return exactly one JSON object with {"relationships":[...]}.`,
              },
            );
            continue;
          }

          const mergedEdges = mergeTableReadEdges(tableReadEdges, parsed.edges);
          const preservedCount = mergedEdges.filter((edge) => {
            const incoming = parsed.edges.find(
              (item) =>
                relationshipKey(item.from, item.to) ===
                relationshipKey(edge.from, edge.to),
            );
            return (
              edge.status !== 'neutral' &&
              (!incoming || incoming.status === 'neutral')
            );
          }).length;
          tableReadEdges = mergedEdges;
          lastSuccessfulTableReadKey = snapshotKey;
          tableReadWarning = '';
          tableReadStatus =
            parsed.returnedPairCount >= expectedPairCount
              ? `Room read updated with all ${expectedPairCount} directed reads mapped; ${preservedCount} saved non-neutral read${preservedCount === 1 ? '' : 's'} preserved.`
              : `Room read updated with ${parsed.returnedPairCount}/${expectedPairCount} directed reads; saved non-neutral reads were preserved.`;
          return;
        } catch (error) {
          lastError =
            error instanceof Error ? error.message : 'Invalid table-read JSON.';
          messages.push(
            { role: 'assistant' as const, content: result.text.slice(0, 4000) },
            {
              role: 'user' as const,
              content: `Invalid JSON: ${lastError}. Return exactly one complete JSON object with ${expectedPairCount} relationship entries, one for every ordered directed player pair where from and to differ. Use this shape: {"relationships":[{"from":0,"to":1,"status":"neutral","summary":"no new finding"}]}. Valid statuses: trust, neutral, suspicious, accused. Neutral means no new finding and will not erase saved non-neutral reads.`,
            },
          );
        }
      }

      throw new Error(lastError || 'Analyst did not return valid JSON.');
    } catch (error) {
      if (!tableReadController.signal.aborted) {
        tableReadWarning =
          error instanceof Error
            ? `Read Room failed: ${error.message}`
            : 'Read Room failed.';
        tableReadStatus =
          'Last read failed. Try again, or select a stricter model.';
      }
    } finally {
      tableReadThinking = false;
    }
  }

  function relationshipRank(status: RelationshipStatus): number {
    if (status === 'accused') {
      return 3;
    }
    if (status === 'suspicious') {
      return 2;
    }
    if (status === 'trust') {
      return 1;
    }
    return 0;
  }

  function relationshipLabel(status: RelationshipStatus): string {
    if (status === 'accused') {
      return 'Accusing fascist';
    }
    if (status === 'suspicious') {
      return 'Suspicious';
    }
    if (status === 'trust') {
      return 'Trusting';
    }
    return 'Neutral';
  }

  function relationshipStroke(status: RelationshipStatus): string {
    if (status === 'accused') {
      return '#f87171';
    }
    if (status === 'suspicious') {
      return '#fbbf24';
    }
    if (status === 'trust') {
      return '#34d399';
    }
    return '#525252';
  }

  function relationshipStrokeWidth(status: RelationshipStatus): number {
    return status === 'neutral' ? 0.4 : 1.6;
  }

  function relationshipOpacity(status: RelationshipStatus): number {
    return status === 'neutral' ? 0.22 : 0.78;
  }

  function relationshipMarkerId(status: RelationshipStatus): string {
    return `relationship-arrow-${status}`;
  }

  function relationshipPath(edge: RelationshipEdge, count: number): string {
    const fromPosition = relationshipNodePosition(edge.from, count);
    const toPosition = relationshipNodePosition(edge.to, count);
    const deltaX = toPosition.x - fromPosition.x;
    const deltaY = toPosition.y - fromPosition.y;
    const distance = Math.hypot(deltaX, deltaY) || 1;
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    const nodePadding = 7.2;
    const startX = fromPosition.x + unitX * nodePadding;
    const startY = fromPosition.y + unitY * nodePadding;
    const endX = toPosition.x - unitX * nodePadding;
    const endY = toPosition.y - unitY * nodePadding;
    const curveOffset = edge.status === 'neutral' ? 4.8 : 6.2;
    const controlX = (startX + endX) / 2 + -unitY * curveOffset;
    const controlY = (startY + endY) / 2 + unitX * curveOffset;

    return `M ${startX.toFixed(2)} ${startY.toFixed(2)} Q ${controlX.toFixed(
      2,
    )} ${controlY.toFixed(2)} ${endX.toFixed(2)} ${endY.toFixed(2)}`;
  }

  function relationshipNodePosition(index: number, count: number) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, count);
    return {
      x: 50 + Math.cos(angle) * 38,
      y: 50 + Math.sin(angle) * 38,
    };
  }

  function isQuestion(body: string): boolean {
    return body.includes('?') || body.includes('？');
  }

  function questionKey(item: ChatMessage): string {
    return `${item.playerId}:${item.turn}:${item.phase}:${item.body}`;
  }

  function appendChatMessage(author: Player, body: string): ChatMessage {
    const item = {
      id: `chat-${Date.now()}-${chatMessages.length}`,
      playerId: author.id,
      playerName: author.name,
      body,
      turn,
      phase,
    };
    chatMessages = [...chatMessages, item];
    return item;
  }

  function parseTableTalkResponse(response: string): string | undefined {
    try {
      const payload = JSON.parse(response) as { tableTalk?: unknown };
      return typeof payload.tableTalk === 'string'
        ? payload.tableTalk.trim().slice(0, 500)
        : undefined;
    } catch {
      return undefined;
    }
  }

  async function requestQuestionReplies(question: string, askerId: number) {
    const responders = players.filter(
      (player) =>
        player.alive &&
        player.id !== askerId &&
        Boolean(modelProfileForPlayer(player.id)),
    );
    if (responders.length === 0) {
      return;
    }

    chatReplyController?.abort();
    chatReplyController = createAbortController();
    const signal = chatReplyController.signal;

    for (const responder of responders) {
      const profile = modelProfileForPlayer(responder.id);
      if (!profile || signal.aborted) {
        continue;
      }

      try {
        const providerId = profile.provider as ProviderId;
        const responderContext = JSON.parse(
          secretHitlerAdapter.serializeForAI(
            toAdapterState(),
            responder.id,
            [],
          ),
        ) as {
          rules: unknown;
          state: unknown;
        };
        const result = await getProvider(providerId).complete({
          apiKey: keys[providerId],
          endpointUrl: providerEndpointFor(providerId, keys),
          model: profile.model,
          system: [
            secretHitlerAdapter.systemPrompt(),
            'You are replying to a public table-chat question in Secret Hitler. Do not choose or announce a game move.',
            'Answer briefly as your assigned player. Keep hidden information hidden, avoid revealing private policy choices or future tactical intent, and use suspicion or uncertainty when appropriate.',
            'Return exactly one JSON object: {"tableTalk":"your public reply"}.',
          ].join(' '),
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                game: 'secret-hitler',
                player: responder.id,
                questionFrom: players[askerId]?.name ?? 'another player',
                question,
                rules: responderContext.rules,
                state: responderContext.state,
                publicChat: chatMessages.slice(-20),
                responseSchema: { tableTalk: 'brief public reply' },
              }),
            },
          ],
          responseFormat: 'json',
          temperature: 0.8,
          maxTokens: 220,
          signal,
        });

        lastUsage = result.usage;
        totalUsage = addUsage(totalUsage, result.usage);
        const reply = parseTableTalkResponse(result.text);
        if (reply) {
          appendChatMessage(responder, reply);
        }
      } catch (error) {
        if (!signal.aborted) {
          aiWarning =
            error instanceof Error ? error.message : 'AI chat reply failed.';
        }
      }
    }
  }

  function maybeRequestQuestionReplies(item: ChatMessage) {
    if (!isQuestion(item.body)) {
      return;
    }

    const key = questionKey(item);
    if (answeredQuestionKeys.has(key)) {
      return;
    }

    answeredQuestionKeys.add(key);
    void requestQuestionReplies(item.body, item.playerId);
  }

  async function runAI() {
    if (aiThinking || ballotRevealPending || phase === 'game-over' || winner) {
      return;
    }

    aiThinking = true;
    aiWarning = '';
    aiController?.abort();
    aiController = createAbortController();

    try {
      for (let step = 0; step < 30; step += 1) {
        const state = toAdapterState();
        if (secretHitlerAdapter.isTerminal(state)) {
          loadAdapterState(state);
          break;
        }

        const player = secretHitlerAdapter.currentPlayer(state);
        const profile = modelProfileForPlayer(player);
        if (!profile) {
          break;
        }

        const legalMoves = secretHitlerAdapter.legalMoves(state, player);
        if (legalMoves.length === 0) {
          aiWarning = `${state.players[player]?.name ?? 'AI player'} has no legal moves.`;
          break;
        }

        let move: SecretHitlerMove;
        try {
          move = await requestAIAction(
            state,
            player,
            legalMoves,
            profile,
            aiController.signal,
          );
        } catch (error) {
          const fallbackMove = fallbackAIExecutiveMove(state, legalMoves);
          if (!fallbackMove) {
            throw error;
          }

          move = fallbackMove;
          aiWarning = `${
            state.players[player]?.name ?? 'AI player'
          } did not return a valid executive move, so a legal fallback was used.`;
        }

        if (state.phase === 'voting' && move.kind === 'vote') {
          const voted = {
            ...stateWithTableTalk(state, player, move.tableTalk),
            votes: { ...state.votes, [player]: move.vote },
          };
          if (allBallotsSubmitted(voted)) {
            loadAdapterState(voted);
            pauseForBallotReveal();
            break;
          }
        }

        const nextState = secretHitlerAdapter.applyMove(state, move);
        loadAdapterState(nextState);
        if (move.kind === 'execute') {
          const target = state.players[move.playerId];
          if (target) {
            lastExecutionNotice = `${target.name} was executed.`;
            message =
              target.role === 'hitler'
                ? 'Hitler was executed. Liberals win.'
                : `${target.name} was executed.`;
          }
        }
        if (
          state.phase !== nextState.phase &&
          isExecutivePhase(nextState.phase)
        ) {
          lastExecutivePowerNotice = `${
            powerLabels[nextState.phase as ExecutivePower]
          } unlocked from Fascist policy ${nextState.fascistPolicies}.`;
        }
        if (
          nextState.phase === 'nomination' &&
          (nextState.turn !== state.turn || state.phase === 'veto')
        ) {
          maybeAutoReadRoom();
        }
        if (
          state.phase !== nextState.phase &&
          isExecutivePhase(nextState.phase)
        ) {
          break;
        }
      }
    } catch (error) {
      if (!aiController.signal.aborted) {
        aiWarning =
          error instanceof Error ? error.message : 'AI request failed.';
      }
    } finally {
      aiThinking = false;
    }
  }

  function normalizePlayerProfileSelections(
    count: number,
    fallbackProfileId: string,
  ) {
    const validProfileIds = new Set(
      configuredProfiles.map((profile) => profile.id),
    );
    const next: PlayerProfileSelections = {};

    for (let index = 0; index < count; index += 1) {
      const current = playerProfileSelections[index];
      if (index === HUMAN_PLAYER_INDEX) {
        next[index] =
          current === HUMAN_PROFILE || validProfileIds.has(current)
            ? current
            : HUMAN_PROFILE;
        continue;
      }

      next[index] = validProfileIds.has(current) ? current : fallbackProfileId;
    }

    const changed =
      Object.keys(playerProfileSelections).length !== count ||
      Array.from({ length: count }).some(
        (_, index) => playerProfileSelections[index] !== next[index],
      );

    if (changed) {
      playerProfileSelections = next;
    }
  }

  function selectPlayerProfile(playerIndex: number, profileId: string) {
    playerProfileSelections = {
      ...playerProfileSelections,
      [playerIndex]: profileId,
    };
    aiWarning = '';
    if (profileId === HUMAN_PROFILE) {
      aiController?.abort();
    } else {
      void runAI();
    }
  }

  function normalizeIdentityViewer(count: number) {
    if (identityViewer >= count) {
      identityViewer = HUMAN_PLAYER_INDEX;
    }
  }

  function visibleRoleFor(viewerId: number, target: Player): Role | null {
    if (phase === 'game-over' || winner) {
      return target.role;
    }

    const viewer = players[viewerId];
    if (!viewer) {
      return null;
    }

    if (viewer.id === target.id) {
      return target.role;
    }

    if (viewer.role === 'fascist') {
      return target.role === 'fascist' || target.role === 'hitler'
        ? target.role
        : null;
    }

    if (
      viewer.role === 'hitler' &&
      playerCount <= 6 &&
      target.role === 'fascist'
    ) {
      return target.role;
    }

    return null;
  }

  function nextAliveAfter(index: number): number {
    for (let offset = 1; offset <= players.length; offset += 1) {
      const candidate = (index + offset) % players.length;
      if (players[candidate]?.alive) {
        return candidate;
      }
    }
    return index;
  }

  function isEligibleChancellor(player: Player): boolean {
    if (!player.alive || player.id === president) {
      return false;
    }
    if (player.id === previousChancellor) {
      return false;
    }
    if (alivePlayers.length > 5 && player.id === previousPresident) {
      return false;
    }
    return true;
  }

  function canNominate(player: Player): boolean {
    return phase === 'nomination' && !winner && isEligibleChancellor(player);
  }

  function nominate(playerId: number) {
    const player = players[playerId];
    if (!player || !canNominate(player)) {
      return;
    }

    nominee = playerId;
    votes = Object.fromEntries(alivePlayers.map((item) => [item.id, null]));
    ballotRevealPending = false;
    phase = 'voting';
    message = `${presidentName} nominated ${player.name}. Cast votes.`;
    void runAI();
  }

  function recordVote(playerId: number, vote: Exclude<Vote, null>) {
    const player = players[playerId];
    if (phase !== 'voting' || !player?.alive || !(playerId in votes)) {
      return;
    }
    votes = { ...votes, [playerId]: vote };
  }

  function castHumanVote(vote: Exclude<Vote, null>) {
    recordVote(HUMAN_PLAYER_INDEX, vote);
    if (alivePlayers.every((player) => votes[player.id])) {
      pauseForBallotReveal();
      return;
    }
    void runAI();
  }

  function canManuallyVote(player: Player): boolean {
    return (
      phase === 'voting' &&
      !ballotRevealPending &&
      player.id === HUMAN_PLAYER_INDEX &&
      player.alive
    );
  }

  function voteLabel(vote: Vote): string {
    if (vote === 'ja') {
      return 'Ja';
    }
    if (vote === 'nein') {
      return 'Nein';
    }
    return 'Awaiting';
  }

  function voteRevealClasses(vote: Vote): string {
    if (vote === 'ja') {
      return 'border-emerald-300/60 bg-emerald-400/15 text-emerald-100';
    }
    if (vote === 'nein') {
      return 'border-red-300/60 bg-red-400/15 text-red-100';
    }
    return 'border-neutral-700 bg-neutral-950 text-neutral-500';
  }

  function reshuffleIfNeeded() {
    if (drawPile.length >= 3 || discardPile.length === 0) {
      return;
    }

    drawPile = shuffle(
      [...drawPile, ...discardPile],
      `reshuffle:${turn}:${discardPile.length}`,
    );
    discardPile = [];
  }

  function drawThreePolicies(): Policy[] | undefined {
    reshuffleIfNeeded();
    if (drawPile.length < 3) {
      return undefined;
    }

    const drawn = drawPile.slice(0, 3);
    drawPile = drawPile.slice(3);
    return drawn;
  }

  function resolveVote() {
    const submitted = alivePlayers.every((player) => votes[player.id]);
    const passed =
      alivePlayers.filter((player) => votes[player.id] === 'ja').length >
      alivePlayers.length / 2;

    if (phase !== 'voting' || !submitted || nominee === null) {
      return;
    }

    ballotRevealPending = false;

    if (!passed) {
      failElection('Government rejected.');
      void runAI();
      return;
    }

    previousPresident = president;
    previousChancellor = nominee;

    if (fascistPolicies >= 3 && players[nominee]?.role === 'hitler') {
      winner = 'Fascists win by electing Hitler Chancellor.';
      phase = 'game-over';
      message = winner;
      return;
    }

    const drawn = drawThreePolicies();
    if (!drawn) {
      message = 'Not enough policies to draw.';
      return;
    }

    presidentHand = drawn;
    chancellorHand = [];
    phase = 'president-discard';
    message = `${presidentName} draws three policies and discards one.`;
    void runAI();
  }

  function failElection(reason: string) {
    electionTracker += 1;
    votes = {};
    ballotRevealPending = false;
    nominee = null;
    presidentHand = [];
    chancellorHand = [];

    if (electionTracker >= 3) {
      enactTopPolicyFromDeck();
      return;
    }

    message = `${reason} Election tracker advanced.`;
    advancePresident();
    phase = 'nomination';
    maybeAutoReadRoom();
  }

  function enactTopPolicyFromDeck() {
    reshuffleIfNeeded();
    const [topPolicy, ...rest] = drawPile;
    if (!topPolicy) {
      message = 'Election tracker filled, but no policy was available.';
      return;
    }

    drawPile = rest;
    enactPolicy(topPolicy, { chaos: true });
    electionTracker = 0;
    nominee = null;
    previousPresident = null;
    previousChancellor = null;
    presidentHand = [];
    chancellorHand = [];

    if (!winner) {
      message = `Election tracker filled. Top ${policyLabel(topPolicy)} policy enacted with no executive power.`;
      advancePresident();
      phase = 'nomination';
      maybeAutoReadRoom();
    }
  }

  function presidentDiscard(index: number) {
    if (
      phase !== 'president-discard' ||
      identityViewer !== president ||
      !presidentHand[index]
    ) {
      return;
    }

    discardPile = [...discardPile, presidentHand[index]];
    chancellorHand = presidentHand.filter((_, item) => item !== index);
    presidentHand = [];
    phase = 'chancellor-discard';
    message = `${nomineeName} receives two policies and enacts one.`;
    void runAI();
  }

  function chancellorEnact(index: number) {
    if (
      phase !== 'chancellor-discard' ||
      identityViewer !== nominee ||
      !chancellorHand[index]
    ) {
      return;
    }

    const policy = chancellorHand[index];
    discardPile = [
      ...discardPile,
      ...chancellorHand.filter((_, item) => item !== index),
    ];
    chancellorHand = [];
    enactPolicy(policy);
    if (!isExecutivePhase(phase)) {
      void runAI();
    }
  }

  function requestVeto() {
    if (
      phase !== 'chancellor-discard' ||
      identityViewer !== nominee ||
      !vetoUnlocked
    ) {
      return;
    }

    phase = 'veto';
    message = `${nomineeName} requested a veto. President must approve or reject.`;
    void runAI();
  }

  function approveVeto() {
    if (phase !== 'veto' || identityViewer !== president) {
      return;
    }

    discardPile = [...discardPile, ...chancellorHand];
    chancellorHand = [];
    failElection('Agenda vetoed.');
    void runAI();
  }

  function rejectVeto() {
    if (phase !== 'veto' || identityViewer !== president) {
      return;
    }

    phase = 'chancellor-discard';
    message = 'Veto rejected. Chancellor must enact one policy.';
    void runAI();
  }

  function enactPolicy(policy: Policy, opts: { chaos?: boolean } = {}) {
    if (policy === 'liberal') {
      liberalPolicies += 1;
      if (liberalPolicies >= 5) {
        winner = 'Liberals win by passing five policies.';
      }
    } else {
      fascistPolicies += 1;
      if (fascistPolicies >= 6) {
        winner = 'Fascists win by passing six policies.';
      }
    }

    electionTracker = 0;

    if (winner) {
      phase = 'game-over';
      message = winner;
      return;
    }

    if (policy === 'fascist' && !opts.chaos) {
      const power = executivePowerFor(fascistPolicies);
      if (power !== 'none') {
        phase = power;
        message = `${presidentName} must resolve ${powerLabels[power]}.`;
        lastExecutivePowerNotice = `${powerLabels[power]} unlocked from Fascist policy ${fascistPolicies}.`;
        if (power === 'policy-peek') {
          peekedPolicies = drawPile.slice(0, 3);
        }
        return;
      }
    }

    if (policy === 'fascist' && opts.chaos) {
      lastExecutivePowerNotice = `Fascist policy ${fascistPolicies} was enacted by the election tracker, so no executive power resolves.`;
    } else if (policy === 'fascist') {
      lastExecutivePowerNotice = `Fascist policy ${fascistPolicies} has no executive power for ${playerCount} players.`;
    }

    message = `${policyLabel(policy)} policy enacted.`;
    finishLegislativeTurn();
  }

  function finishLegislativeTurn() {
    nominee = null;
    votes = {};
    presidentHand = [];
    chancellorHand = [];
    peekedPolicies = [];
    investigationResult = '';
    advancePresident();
    phase = 'nomination';
    turn += 1;
    maybeAutoReadRoom();
  }

  function advancePresident() {
    if (specialReturnPresident !== null) {
      const returnPresident = specialReturnPresident;
      specialReturnPresident = null;

      if (players[returnPresident]?.alive) {
        president = returnPresident;
        return;
      }

      president = nextAliveAfter(returnPresident);
      return;
    }

    president = nextAliveAfter(president);
  }

  function completePolicyPeek() {
    if (phase !== 'policy-peek' || identityViewer !== president) {
      return;
    }
    message = 'Policy peek resolved.';
    finishLegislativeTurn();
    void runAI();
  }

  function investigate(playerId: number) {
    const player = players[playerId];
    if (
      phase !== 'investigate' ||
      !humanIsPresident ||
      !player ||
      player.id === president
    ) {
      return;
    }

    investigationResult = `${player.name} is on the ${partyLabel(player.role)} team.`;
    message = investigationResult;
  }

  function completeInvestigation() {
    if (phase !== 'investigate' || !investigationResult) {
      return;
    }
    finishLegislativeTurn();
    void runAI();
  }

  function chooseSpecialPresident(playerId: number) {
    const player = players[playerId];
    if (
      phase !== 'special-election' ||
      !humanIsPresident ||
      !player?.alive ||
      player.id === president
    ) {
      return;
    }

    specialReturnPresident = nextAliveAfter(president);
    president = playerId;
    nominee = null;
    votes = {};
    phase = 'nomination';
    turn += 1;
    message = `${player.name} is special election President. Presidency returns afterward.`;
    void runAI();
  }

  function executePlayer(playerId: number) {
    const player = players[playerId];
    if (
      phase !== 'execution' ||
      !humanIsPresident ||
      !player?.alive ||
      player.id === president
    ) {
      return;
    }

    players = players.map((item) =>
      item.id === playerId ? { ...item, alive: false } : item,
    );
    lastExecutionNotice = `${player.name} was executed.`;

    if (player.role === 'hitler') {
      winner = 'Liberals win because Hitler was executed.';
      phase = 'game-over';
      message = winner;
      return;
    }

    message = `${player.name} was executed.`;
    if (nominee === playerId) {
      nominee = null;
    }
    if (previousPresident === playerId) {
      previousPresident = null;
    }
    if (previousChancellor === playerId) {
      previousChancellor = null;
    }
    finishLegislativeTurn();
    void runAI();
  }

  function policyClasses(policy: Policy): string {
    return policy === 'liberal'
      ? 'border-blue-200/70 bg-blue-950/50 text-blue-100'
      : 'border-red-200/70 bg-red-950/50 text-red-100';
  }

  function hiddenPolicyClasses(): string {
    return 'border-amber-100/20 bg-neutral-950 text-neutral-400';
  }

  function partyForRole(role: Role): Party {
    return role === 'liberal' ? 'liberal' : 'fascist';
  }

  function policyAsset(policy: Policy): string {
    return policyAssets[policy];
  }

  function partyAssetForRole(role: Role): string {
    return partyAssets[partyForRole(role)];
  }

  function roleAssetForPlayer(
    player: Player,
    visibleRole: Role | null,
  ): string {
    if (!visibleRole) {
      return dossierBackAsset;
    }

    if (visibleRole === 'hitler') {
      return hitlerRoleAsset;
    }

    return player.roleAsset;
  }

  function roleCardLabel(role: Role | null): string {
    return role ? roleLabel(role) : 'Hidden dossier';
  }

  function voteAsset(vote: Vote): string {
    return vote ? ballotAssets[vote] : dossierBackAsset;
  }

  function voteCardLabel(vote: Vote): string {
    return vote ? `${voteLabel(vote)} ballot` : 'Hidden ballot';
  }

  function canViewPresidentCards(): boolean {
    return identityViewer === president;
  }

  function canViewChancellorCards(): boolean {
    return nominee !== null && identityViewer === nominee;
  }

  function roleBadgeClasses(role: Role | null): string {
    if (!role) {
      return 'border-neutral-700 bg-neutral-900 text-neutral-300';
    }
    if (role === 'liberal') {
      return 'border-blue-300/60 bg-blue-400/10 text-blue-100';
    }
    return 'border-red-300/60 bg-red-400/10 text-red-100';
  }

  function playerStatus(player: Player): string {
    if (!player.alive) {
      return 'Executed';
    }
    if (player.id === president) {
      return 'President';
    }
    if (player.id === nominee) {
      return phase === 'nomination' ? 'Nominated' : 'Chancellor';
    }
    if (isEligibleChancellor(player)) {
      return 'Eligible';
    }
    return 'Ineligible';
  }

  function sendChatMessage() {
    const body = chatDraft.trim();
    const author = players[HUMAN_PLAYER_INDEX];
    if (!body || !author?.alive) {
      return;
    }

    const item = appendChatMessage(author, body);
    chatDraft = '';
    maybeRequestQuestionReplies(item);
  }

  startGame();

  onMount(() => {
    refreshKeys();
    window.addEventListener('storage', refreshKeys);
    window.addEventListener('byok-keys-changed', refreshKeys);
    void runAI();
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', refreshKeys);
      window.removeEventListener('byok-keys-changed', refreshKeys);
    }
    aiController?.abort();
    chatReplyController?.abort();
    tableReadController?.abort();
  });
</script>

<section class="h-full overflow-auto bg-neutral-950 px-6 py-6 text-neutral-100">
  <div
    class="mx-auto grid max-w-[2050px] items-stretch gap-4 xl:grid-cols-[1fr_520px_360px]"
  >
    <section class="rounded-md border border-neutral-800 bg-neutral-900 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-normal">Secret Hitler</h1>
          <p class="mt-1 text-sm text-neutral-400">
            Turn {turn} - {phase.replaceAll('-', ' ')}
          </p>
          <p class="mt-1 text-sm text-neutral-400">
            President: {presidentName} - Chancellor: {nomineeName}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <label class="text-xs text-neutral-400">
            Players
            <select
              class="ml-2 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
              bind:value={playerCount}
              on:change={startGame}
            >
              {#each [5, 6, 7, 8, 9, 10] as count}
                <option value={count}>{count}</option>
              {/each}
            </select>
          </label>
          <label class="text-xs text-neutral-400">
            Seed
            <input
              class="ml-2 w-32 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
              bind:value={seed}
              readonly
            />
          </label>
          <button
            class="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-100 hover:border-neutral-500"
            type="button"
            on:click={startGame}
          >
            New game
          </button>
        </div>
      </div>

      {#if winner}
        <div
          class="mt-4 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100"
        >
          {winner}
        </div>
      {:else if message}
        <div
          class="mt-4 rounded-md border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100"
        >
          {message}
        </div>
      {/if}

      {#if lastExecutionNotice}
        <div
          class="mt-3 rounded-md border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100"
        >
          Execution resolved: {lastExecutionNotice}
        </div>
      {/if}

      {#if lastExecutivePowerNotice}
        <div
          class="mt-3 rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100"
        >
          {lastExecutivePowerNotice}
        </div>
      {/if}

      {#if aiThinking}
        <div
          class="mt-3 rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100"
        >
          {players[currentActor]?.name ?? 'AI player'} is thinking with
          {currentActorProfile?.label ?? 'configured model'}.
        </div>
      {:else if aiWarning}
        <div
          class="mt-3 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-100"
        >
          {aiWarning}
        </div>
      {/if}

      <div class="mt-5 grid gap-4 xl:grid-cols-2">
        <section
          class="overflow-hidden rounded-md border border-blue-200/30 bg-neutral-950"
        >
          <div
            class="flex items-center justify-between border-b border-blue-200/10 px-3 py-2"
          >
            <h2 class="text-sm font-semibold text-blue-100">Liberal Track</h2>
            <span class="text-xs text-blue-200">{liberalPolicies}/5</span>
          </div>
          <div class="relative aspect-[16/9] overflow-hidden bg-blue-950">
            <img
              class="absolute inset-0 h-full w-full object-cover"
              src={liberalBoardAsset}
              alt=""
              aria-hidden="true"
            />
            <div
              class="absolute left-[13.6%] top-[27.5%] grid h-[42.3%] w-[72.2%] grid-cols-5 gap-[1.35%]"
            >
              {#each liberalSpaces as space, index}
                <div class="relative min-w-0 overflow-hidden rounded-sm">
                  {#if index < liberalPolicies}
                    <img
                      class="h-full w-full rounded-sm border border-blue-100/80 object-cover shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
                      src={policyAsset('liberal')}
                      alt="Enacted Liberal policy"
                    />
                  {:else}
                    <div
                      class="flex h-full items-end justify-center rounded-sm border border-blue-100/25 bg-blue-950/15 px-1 pb-2 text-center text-[10px] font-semibold uppercase leading-tight text-blue-50/90 backdrop-blur-[1px]"
                    >
                      {space}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </section>

        <section
          class="overflow-hidden rounded-md border border-red-200/30 bg-neutral-950"
        >
          <div
            class="flex items-center justify-between border-b border-red-200/10 px-3 py-2"
          >
            <h2 class="text-sm font-semibold text-red-100">Fascist Track</h2>
            <span class="text-xs text-red-200">{fascistPolicies}/6</span>
          </div>
          <div class="relative aspect-[16/9] overflow-hidden bg-red-950">
            <img
              class="absolute inset-0 h-full w-full object-cover"
              src={fascistBoardAsset}
              alt=""
              aria-hidden="true"
            />
            <div
              class="absolute left-[13.35%] top-[40.1%] grid h-[36.8%] w-[73.2%] grid-cols-6 gap-[0.75%]"
            >
              {#each fascistPowersByPlayerCount[playerCount] as power, index}
                <div class="relative min-w-0 overflow-hidden rounded-sm">
                  {#if index < fascistPolicies}
                    <img
                      class="h-full w-full rounded-sm border border-red-100/80 object-cover shadow-[0_8px_18px_rgba(0,0,0,0.5)]"
                      src={policyAsset('fascist')}
                      alt="Enacted Fascist policy"
                    />
                  {:else}
                    <div
                      class="flex h-full items-end justify-center rounded-sm border border-red-100/20 bg-black/15 px-1 pb-2 text-center text-[9px] font-semibold uppercase leading-tight text-red-50/90 backdrop-blur-[1px]"
                    >
                      {index === 5 ? 'Fascists win' : powerLabels[power]}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </section>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <section
          class="rounded-md border border-neutral-800 bg-neutral-950 p-3"
        >
          <h2 class="text-sm font-semibold">Election Tracker</h2>
          <div class="mt-3 grid grid-cols-3 gap-2">
            {#each [0, 1, 2] as step}
              <div
                class={`flex h-12 items-center justify-center rounded-md border ${
                  step < electionTracker
                    ? 'border-amber-200/70 bg-amber-200/10'
                    : 'border-neutral-700 bg-neutral-900/70'
                }`}
              >
                {#if step < electionTracker}
                  <img
                    class="h-9 w-9 rounded-full object-cover drop-shadow"
                    src={electionTrackerAsset}
                    alt={`Failed election ${step + 1}`}
                  />
                {/if}
              </div>
            {/each}
          </div>
          <div class="mt-3 text-xs text-neutral-500">
            Three failed governments enact the top policy.
          </div>
        </section>

        <section
          class="rounded-md border border-neutral-800 bg-neutral-950 p-3"
        >
          <h2 class="text-sm font-semibold">Policy Deck</h2>
          <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div
              class="rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <div class="flex items-center gap-3">
                <img
                  class="h-16 w-11 rounded object-cover shadow"
                  src={dossierBackAsset}
                  alt=""
                  aria-hidden="true"
                />
                <div>
                  <div class="text-xs uppercase text-neutral-500">Draw</div>
                  <div class="mt-1 text-2xl font-semibold">
                    {drawPile.length}
                  </div>
                </div>
              </div>
            </div>
            <div
              class="rounded-md border border-neutral-800 bg-neutral-900 p-3"
            >
              <div class="flex items-center gap-3">
                <div
                  class="grid h-16 w-11 place-items-center rounded border border-neutral-700 bg-neutral-950 text-[10px] uppercase text-neutral-500"
                >
                  Out
                </div>
                <div>
                  <div class="text-xs uppercase text-neutral-500">Discard</div>
                  <div class="mt-1 text-2xl font-semibold">
                    {discardPile.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          class="rounded-md border border-neutral-800 bg-neutral-950 p-3"
        >
          <h2 class="text-sm font-semibold">Government</h2>
          <div class="mt-3 space-y-2 text-sm text-neutral-300">
            <div class="flex justify-between gap-2">
              <span class="text-neutral-500">Ja</span>
              <span>{jaVotes}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-neutral-500">Nein</span>
              <span>{neinVotes}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-neutral-500">Needed</span>
              <span>{Math.floor(alivePlayers.length / 2) + 1} Ja</span>
            </div>
          </div>
        </section>
      </div>

      <section
        class="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-4"
      >
        {#if phase === 'nomination'}
          <h2 class="text-sm font-semibold">Nominate Chancellor</h2>
          <p class="mt-2 text-sm text-neutral-400">
            {presidentName} nominates an eligible living player from the player list.
          </p>
        {:else if phase === 'voting'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold">Vote on Government</h2>
              <p class="mt-2 text-sm text-neutral-400">
                Proposed government:
                <span class={`font-semibold ${playerNameClasses(president)}`}>
                  {presidentName}
                </span>
                and
                <span
                  class={`font-semibold ${playerNameClasses(nominee ?? president)}`}
                >
                  {nomineeName}
                </span>
              </p>
              {#if ballotRevealPending}
                <p class="mt-1 text-xs text-amber-200">
                  Ballots are revealed. Continue when you are ready.
                </p>
              {/if}
            </div>
            <button
              class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
              type="button"
              disabled={!ballotRevealPending || !allVotesCast}
              on:click={continueAfterBallotReveal}
            >
              {ballotRevealPending ? 'Next' : 'Waiting for ballots'}
            </button>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each alivePlayers as player}
              <div
                class="rounded-md border border-neutral-800 bg-neutral-900 p-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="text-sm font-medium">{player.name}</div>
                  {#if ballotRevealPending && votes[player.id]}
                    <span
                      class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${voteRevealClasses(votes[player.id])}`}
                    >
                      {voteLabel(votes[player.id])}
                    </span>
                  {:else if votes[player.id]}
                    <span
                      class="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-100"
                    >
                      Ballot submitted
                    </span>
                  {:else}
                    <span class="text-[10px] text-neutral-500"
                      >Awaiting ballot</span
                    >
                  {/if}
                </div>
                {#if canManuallyVote(player)}
                  <div
                    class="mt-2 flex min-h-[7.5rem] items-center justify-center gap-3 rounded-md border border-neutral-800 bg-neutral-950 p-2"
                  >
                    <button
                      class={`w-16 overflow-hidden rounded-md border p-1 transition hover:border-emerald-200 ${
                        votes[player.id] === 'ja'
                          ? 'border-emerald-300 bg-emerald-400/20'
                          : 'border-neutral-700 bg-neutral-950'
                      }`}
                      type="button"
                      on:click={() => castHumanVote('ja')}
                      aria-label="Vote Ja"
                    >
                      <img
                        class="aspect-[2/3] h-24 w-full rounded object-cover"
                        src={ballotAssets.ja}
                        alt=""
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      class={`w-16 overflow-hidden rounded-md border p-1 transition hover:border-red-200 ${
                        votes[player.id] === 'nein'
                          ? 'border-red-300 bg-red-400/20'
                          : 'border-neutral-700 bg-neutral-950'
                      }`}
                      type="button"
                      on:click={() => castHumanVote('nein')}
                      aria-label="Vote Nein"
                    >
                      <img
                        class="aspect-[2/3] h-24 w-full rounded object-cover"
                        src={ballotAssets.nein}
                        alt=""
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                {:else}
                  <div
                    class={`mt-2 rounded-md border p-2 text-center text-xs ${
                      ballotRevealPending
                        ? voteRevealClasses(votes[player.id])
                        : 'border-neutral-800 bg-neutral-950 text-neutral-500'
                    }`}
                  >
                    <img
                      class="mx-auto aspect-[2/3] h-24 rounded object-cover shadow"
                      src={voteAsset(
                        ballotRevealPending ? votes[player.id] : null,
                      )}
                      alt={ballotRevealPending
                        ? voteCardLabel(votes[player.id])
                        : ''}
                      aria-hidden={!ballotRevealPending}
                    />
                    <div class="mt-2">
                      {#if ballotRevealPending}
                        Vote: {voteLabel(votes[player.id])}
                      {:else}
                        Private ballot controlled by {player.name}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else if phase === 'president-discard'}
          <h2 class="text-sm font-semibold">President Discards One Policy</h2>
          {#if !canViewPresidentCards()}
            <p class="mt-2 text-sm text-neutral-400">
              Policy identities are hidden from {players[identityViewer]?.name}.
              Switch Viewing as to {presidentName} to resolve this private draw.
            </p>
          {/if}
          <div class="mt-3 grid max-w-lg grid-cols-3 gap-2">
            {#each presidentHand as policy, index}
              {#if canViewPresidentCards()}
                <button
                  class={`overflow-hidden rounded-md border p-1 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-amber-100 ${policyClasses(policy)}`}
                  type="button"
                  on:click={() => presidentDiscard(index)}
                  aria-label={`Discard ${policyLabel(policy)} policy`}
                >
                  <img
                    class="aspect-[2/3] w-full rounded object-cover"
                    src={policyAsset(policy)}
                    alt=""
                    aria-hidden="true"
                  />
                  <span class="mt-2 block pb-1"
                    >Discard {policyLabel(policy)}</span
                  >
                </button>
              {:else}
                <div
                  class={`rounded-md border p-1 text-center text-sm font-semibold ${hiddenPolicyClasses()}`}
                >
                  <img
                    class="aspect-[2/3] w-full rounded object-cover"
                    src={dossierBackAsset}
                    alt=""
                    aria-hidden="true"
                  />
                  <span class="mt-2 block pb-1">Hidden policy</span>
                </div>
              {/if}
            {/each}
          </div>
        {:else if phase === 'chancellor-discard'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold">
                Chancellor Enacts One Policy
              </h2>
              <p class="mt-2 text-sm text-neutral-400">
                {#if canViewChancellorCards()}
                  Select the policy to enact. The other policy is discarded.
                {:else}
                  Policy identities are hidden from {players[identityViewer]
                    ?.name}. Switch Viewing as to {nomineeName} to resolve this private
                  hand.
                {/if}
              </p>
            </div>
            {#if vetoUnlocked && canViewChancellorCards()}
              <button
                class="rounded-md border border-amber-300/60 px-3 py-2 text-sm text-amber-100 hover:border-amber-200"
                type="button"
                on:click={requestVeto}
              >
                Request veto
              </button>
            {/if}
          </div>
          <div class="mt-3 grid max-w-md grid-cols-2 gap-2">
            {#each chancellorHand as policy, index}
              {#if canViewChancellorCards()}
                <button
                  class={`overflow-hidden rounded-md border p-1 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-amber-100 ${policyClasses(policy)}`}
                  type="button"
                  on:click={() => chancellorEnact(index)}
                  aria-label={`Enact ${policyLabel(policy)} policy`}
                >
                  <img
                    class="aspect-[2/3] w-full rounded object-cover"
                    src={policyAsset(policy)}
                    alt=""
                    aria-hidden="true"
                  />
                  <span class="mt-2 block pb-1"
                    >Enact {policyLabel(policy)}</span
                  >
                </button>
              {:else}
                <div
                  class={`rounded-md border p-1 text-center text-sm font-semibold ${hiddenPolicyClasses()}`}
                >
                  <img
                    class="aspect-[2/3] w-full rounded object-cover"
                    src={dossierBackAsset}
                    alt=""
                    aria-hidden="true"
                  />
                  <span class="mt-2 block pb-1">Hidden policy</span>
                </div>
              {/if}
            {/each}
          </div>
        {:else if phase === 'veto'}
          <h2 class="text-sm font-semibold">Veto Request</h2>
          <p class="mt-2 text-sm text-neutral-400">
            President may approve the veto and discard the agenda, or reject it
            and force the Chancellor to enact one policy.
          </p>
          {#if identityViewer === president}
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
                type="button"
                on:click={approveVeto}
              >
                Approve veto
              </button>
              <button
                class="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
                type="button"
                on:click={rejectVeto}
              >
                Reject veto
              </button>
            </div>
          {:else}
            <p class="mt-3 text-sm text-neutral-500">
              Switch Viewing as to {presidentName} for the private veto response.
            </p>
          {/if}
        {:else if phase === 'policy-peek'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-sm font-semibold">Policy Peek</h2>
            {#if canContinueAIExecutivePower()}
              <button
                class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
                type="button"
                on:click={() => void runAI()}
              >
                Next
              </button>
            {/if}
          </div>
          <p class="mt-2 text-sm text-neutral-400">
            {#if canViewPresidentCards()}
              President privately views the top three policies.
            {:else}
              Policy identities are hidden from {players[identityViewer]?.name}.
              Switch Viewing as to {presidentName} to resolve this private peek.
            {/if}
          </p>
          <div class="mt-3 grid max-w-lg grid-cols-3 gap-2">
            {#each peekedPolicies as policy}
              {#if canViewPresidentCards()}
                <div
                  class={`rounded-md border p-1 text-center text-sm font-semibold ${policyClasses(policy)}`}
                >
                  <img
                    class="aspect-[2/3] w-full rounded object-cover"
                    src={policyAsset(policy)}
                    alt={`${policyLabel(policy)} policy`}
                  />
                  <span class="mt-2 block pb-1">{policyLabel(policy)}</span>
                </div>
              {:else}
                <div
                  class={`rounded-md border p-1 text-center text-sm font-semibold ${hiddenPolicyClasses()}`}
                >
                  <img
                    class="aspect-[2/3] w-full rounded object-cover"
                    src={dossierBackAsset}
                    alt=""
                    aria-hidden="true"
                  />
                  <span class="mt-2 block pb-1">Hidden policy</span>
                </div>
              {/if}
            {/each}
          </div>
          {#if canViewPresidentCards()}
            <button
              class="mt-3 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
              type="button"
              on:click={completePolicyPeek}
            >
              Done
            </button>
          {/if}
        {:else if phase === 'investigate'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-sm font-semibold">Investigate Loyalty</h2>
            {#if canContinueAIExecutivePower()}
              <button
                class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
                type="button"
                on:click={() => void runAI()}
              >
                Next
              </button>
            {/if}
          </div>
          <p class="mt-2 text-sm text-neutral-400">
            Choose a player to reveal their party membership.
          </p>
          {#if investigationResult}
            <div
              class="mt-3 rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100"
            >
              {investigationResult}
            </div>
            <button
              class="mt-3 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
              type="button"
              on:click={completeInvestigation}
            >
              Done
            </button>
          {/if}
        {:else if phase === 'special-election'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-sm font-semibold">Special Election</h2>
            {#if canContinueAIExecutivePower()}
              <button
                class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
                type="button"
                on:click={() => void runAI()}
              >
                Next
              </button>
            {/if}
          </div>
          <p class="mt-2 text-sm text-neutral-400">
            Choose a living player to become the next President. The presidency
            returns to the normal order afterward.
          </p>
        {:else if phase === 'execution'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-sm font-semibold">Execution</h2>
            {#if canContinueAIExecutivePower()}
              <button
                class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400"
                type="button"
                on:click={() => void runAI()}
              >
                Let {presidentName} Execute
              </button>
            {/if}
          </div>
          <p class="mt-2 text-sm text-neutral-400">
            {presidentName} has the execution power. If Hitler is executed, Liberals
            win immediately.
          </p>
          {#if canContinueAIExecutivePower()}
            <p class="mt-1 text-xs text-amber-200">
              Press the button to let the AI President choose a target.
            </p>
          {:else if !humanIsPresident}
            <p class="mt-1 text-xs text-amber-200">
              Waiting for {presidentName}. Assign a model to this President if
              you want them to resolve execution.
            </p>
          {/if}
        {:else}
          <h2 class="text-sm font-semibold">Game Over</h2>
          <p class="mt-2 text-sm text-neutral-400">{winner}</p>
        {/if}
      </section>

      <section
        class="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold">Table Reads</h2>
          <div class="flex flex-wrap items-center gap-2">
            <select
              class="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
              value={tableReadProfileId}
              disabled={configuredProfiles.length === 0 || tableReadThinking}
              on:change={(event) =>
                selectTableReadProfile(event.currentTarget.value)}
            >
              <option value="">Neutral analyst</option>
              {#each configuredProfiles as profile (profile.id)}
                <option value={profile.id}>
                  {profileLabel(profile)}
                </option>
              {/each}
            </select>
            <button
              class="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-100 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              disabled={!tableReadProfileId ||
                tableReadThinking ||
                chatMessages.length === 0}
              on:click={() => void requestTableReads()}
            >
              {tableReadThinking ? 'Reading...' : 'Read room'}
            </button>
          </div>
        </div>
        {#if tableReadWarning}
          <div
            class="mt-3 rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
          >
            {tableReadWarning}
          </div>
        {:else if tableReadStatus}
          <div
            class="mt-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300"
          >
            {tableReadStatus}
          </div>
        {:else if !tableReadProfileId}
          <p class="mt-2 text-xs text-neutral-500">
            Select a configured model profile to act as the neutral analyst.
          </p>
        {/if}

        <div class="mt-3 grid gap-4 lg:grid-cols-[1fr_240px]">
          <svg
            class="h-56 w-full rounded-md border border-neutral-900 bg-neutral-950"
            viewBox="0 0 100 100"
            role="img"
            aria-label="Trust and suspicion relationships between players"
          >
            <defs>
              {#each relationshipLegend as status}
                <marker
                  id={relationshipMarkerId(status)}
                  viewBox="0 0 10 10"
                  refX="8.2"
                  refY="5"
                  markerWidth="3.6"
                  markerHeight="3.6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill={relationshipStroke(status)}
                  />
                </marker>
              {/each}
            </defs>
            {#each relationshipEdges as edge}
              <path
                d={relationshipPath(edge, players.length)}
                fill="none"
                stroke={relationshipStroke(edge.status)}
                stroke-width={relationshipStrokeWidth(edge.status)}
                opacity={relationshipOpacity(edge.status)}
                stroke-linecap="round"
                marker-end={`url(#${relationshipMarkerId(edge.status)})`}
              >
                <title>{relationshipSummary(edge)}</title>
              </path>
            {/each}
            {#each players as player, index}
              {@const position = relationshipNodePosition(
                index,
                players.length,
              )}
              <circle
                cx={position.x}
                cy={position.y}
                r="5.5"
                fill={player.id === HUMAN_PLAYER_INDEX ? '#0c4a6e' : '#171717'}
                stroke={player.alive ? '#737373' : '#404040'}
                stroke-width="0.8"
              />
              <text
                x={position.x}
                y={position.y + 11}
                text-anchor="middle"
                class="text-[4.6px] font-semibold"
                style={`fill:${playerNameColor(player.id)}`}
              >
                {player.name.replace(' (You)', '')}
              </text>
            {/each}
          </svg>

          <div class="min-h-0">
            <div class="flex flex-wrap gap-2 text-[10px] text-neutral-400">
              {#each relationshipLegend as status}
                <span class="inline-flex items-center gap-1">
                  <span
                    class="h-2 w-4 rounded-full"
                    style={`background:${relationshipStroke(status)}`}
                  ></span>
                  {relationshipLabel(status)}
                </span>
              {/each}
            </div>

            <div
              class="mt-3 max-h-52 space-y-1 overflow-y-auto pr-1 text-[11px] text-neutral-400"
            >
              {#if tableReadEdges.length}
                {#each relationshipEdges as edge}
                  <div class="flex items-center gap-2">
                    <span
                      class="h-2 w-2 rounded-full"
                      style={`background:${relationshipStroke(edge.status)}`}
                    ></span>
                    <span
                      class={edge.status === 'neutral'
                        ? 'text-neutral-500'
                        : ''}
                    >
                      <span
                        class="font-semibold"
                        style={`color:${playerNameColor(edge.from)}`}
                      >
                        {displayNameFor(edge.from)}
                      </span>
                      <span class="text-neutral-500"> -> </span>
                      <span
                        class="font-semibold"
                        style={`color:${playerNameColor(edge.to)}`}
                      >
                        {displayNameFor(edge.to)}
                      </span>
                      <span>: {edge.summary}</span>
                    </span>
                  </div>
                {/each}
              {:else if activeRelationshipEdges.length}
                {#each activeRelationshipEdges as edge}
                  <div class="flex items-center gap-2">
                    <span
                      class="h-2 w-2 rounded-full"
                      style={`background:${relationshipStroke(edge.status)}`}
                    ></span>
                    <span>
                      <span
                        class="font-semibold"
                        style={`color:${playerNameColor(edge.from)}`}
                      >
                        {displayNameFor(edge.from)}
                      </span>
                      <span class="text-neutral-500"> -> </span>
                      <span
                        class="font-semibold"
                        style={`color:${playerNameColor(edge.to)}`}
                      >
                        {displayNameFor(edge.to)}
                      </span>
                      <span>: {edge.summary}</span>
                    </span>
                  </div>
                {/each}
              {:else}
                <div>No strong reads yet. Everyone starts neutral.</div>
              {/if}
            </div>
          </div>
        </div>
      </section>
    </section>

    <aside
      class="flex min-h-[calc(100vh-8rem)] flex-col rounded-md border border-neutral-800 bg-neutral-900 p-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Players</h2>
        <span class="text-xs text-neutral-500">
          Viewing as {players[HUMAN_PLAYER_INDEX]?.name ?? germanPlayerName(0)}
        </span>
      </div>

      <div
        class={`mt-3 grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-1 ${
          players.length > 5 ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {#each players as player}
          {@const visibleRole = visibleRoleFor(identityViewer, player)}
          <div
            class={`flex h-[17.5rem] flex-col overflow-hidden rounded-md border p-3 ${
              !player.alive
                ? 'border-neutral-800 bg-neutral-950 opacity-60'
                : player.id === president
                  ? 'border-emerald-400/60 bg-emerald-400/10'
                  : player.id === nominee
                    ? 'border-amber-300/60 bg-amber-300/10'
                    : 'border-neutral-800 bg-neutral-950'
            }`}
          >
            <div>
              <div class="min-w-0 w-full">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class={`text-sm font-medium ${playerNameClasses(player.id)}`}
                  >
                    {player.name}
                  </span>
                  <span
                    class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase leading-none ${lifeBadgeClasses(
                      player,
                    )}`}
                  >
                    {lifeBadgeLabel(player)}
                  </span>
                </div>
                <div class="text-xs text-neutral-500">
                  {playerStatus(player)}
                </div>
                <select
                  class="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                  value={playerProfileSelections[player.id] ??
                    (player.id === HUMAN_PLAYER_INDEX ? HUMAN_PROFILE : '')}
                  disabled={player.id !== HUMAN_PLAYER_INDEX &&
                    configuredProfiles.length === 0}
                  on:change={(event) =>
                    selectPlayerProfile(player.id, event.currentTarget.value)}
                >
                  {#if player.id === HUMAN_PLAYER_INDEX}
                    <option value={HUMAN_PROFILE}>🧠 Human</option>
                  {/if}
                  {#if configuredProfiles.length}
                    {#each configuredProfiles as profile (profile.id)}
                      <option value={profile.id}>
                        {profileLabel(profile)}
                      </option>
                    {/each}
                  {:else if player.id !== HUMAN_PLAYER_INDEX}
                    <option value="">No model profiles</option>
                  {/if}
                </select>
              </div>
            </div>

            <div class="mt-3 grid gap-2">
              {#if phase === 'nomination'}
                <button
                  class="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!canNominate(player)}
                  on:click={() => nominate(player.id)}
                >
                  Nominate Chancellor
                </button>
              {/if}

              {#if phase === 'investigate'}
                <button
                  class="rounded-md border border-amber-300/50 px-3 py-1.5 text-xs text-amber-100 hover:border-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!humanIsPresident ||
                    !player.alive ||
                    player.id === president ||
                    Boolean(investigationResult)}
                  on:click={() => investigate(player.id)}
                >
                  Investigate
                </button>
              {/if}

              {#if phase === 'special-election'}
                <button
                  class="rounded-md border border-emerald-400/50 px-3 py-1.5 text-xs text-emerald-100 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!humanIsPresident ||
                    !player.alive ||
                    player.id === president}
                  on:click={() => chooseSpecialPresident(player.id)}
                >
                  Choose President
                </button>
              {/if}

              {#if phase === 'execution'}
                <button
                  class="rounded-md border border-red-400/50 px-3 py-1.5 text-xs text-red-100 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!humanIsPresident ||
                    !player.alive ||
                    player.id === president}
                  on:click={() => executePlayer(player.id)}
                >
                  Execute
                </button>
              {/if}
            </div>

            <div class="mt-3 flex flex-1 items-center justify-center gap-3">
              <div class="w-20 shrink-0">
                <div
                  class={`overflow-hidden rounded-md border p-1 ${roleBadgeClasses(
                    visibleRole,
                  )}`}
                >
                  <img
                    class="aspect-[2/3] w-full rounded object-cover"
                    src={roleAssetForPlayer(player, visibleRole)}
                    alt={roleCardLabel(visibleRole)}
                  />
                  <div
                    class="mt-1 truncate text-center text-[10px] font-semibold"
                  >
                    {visibleRole ? roleLabel(visibleRole) : 'Hidden'}
                  </div>
                </div>
              </div>
              {#if visibleRole}
                <div class="w-20 shrink-0">
                  <img
                    class="aspect-[2/3] w-full rounded-md border border-amber-100/20 object-cover"
                    src={partyAssetForRole(visibleRole)}
                    alt={`${partyLabel(visibleRole)} membership`}
                  />
                </div>
              {:else}
                <div class="w-20 shrink-0">
                  <div
                    class={`overflow-hidden rounded-md border p-1 ${roleBadgeClasses(
                      null,
                    )}`}
                  >
                    <img
                      class="aspect-[2/3] w-full rounded object-cover"
                      src={dossierBackAsset}
                      alt="Hidden party membership"
                    />
                    <div
                      class="mt-1 truncate text-center text-[10px] font-semibold"
                    >
                      Hidden
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </aside>

    <aside
      class="flex min-h-[calc(100vh-8rem)] flex-col rounded-md border border-neutral-800 bg-neutral-900 p-4"
    >
      <section
        class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold">Table Chat</h2>
          <span class="text-xs text-neutral-500">
            Speaking as {players[HUMAN_PLAYER_INDEX]?.name ??
              germanPlayerName(0)}
          </span>
        </div>

        <div class="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {#if chatMessages.length}
            {#each chatMessages as item (item.id)}
              <article
                class="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <span
                    class={`text-xs font-semibold ${playerNameClasses(item.playerId)}`}
                  >
                    {item.playerName}
                  </span>
                  <span
                    class="text-[10px] uppercase tracking-wide text-neutral-600"
                  >
                    Turn {item.turn}
                  </span>
                </div>
                <p class="mt-1 whitespace-pre-wrap text-sm text-neutral-300">
                  {item.body}
                </p>
              </article>
            {/each}
          {:else}
            <div
              class="flex h-full min-h-24 items-center justify-center rounded-md border border-dashed border-neutral-800 px-3 py-4 text-center text-sm text-neutral-600"
            >
              No table talk yet.
            </div>
          {/if}
        </div>

        <div class="mt-3 shrink-0">
          <textarea
            class="h-20 w-full resize-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
            maxlength="500"
            placeholder={humanCanChat
              ? `Message as ${humanPlayer?.name ?? germanPlayerName(0)}`
              : 'Executed players cannot chat'}
            disabled={!humanCanChat}
            bind:value={chatDraft}
            on:keydown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendChatMessage();
              }
            }}
          ></textarea>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="text-[10px] text-neutral-600">
              {humanCanChat
                ? 'Enter sends. Shift+Enter adds a line.'
                : 'You have been executed and can no longer talk.'}
            </span>
            <button
              class="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
              type="button"
              disabled={!humanCanChat || !chatDraft.trim()}
              on:click={sendChatMessage}
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </aside>
  </div>
</section>
