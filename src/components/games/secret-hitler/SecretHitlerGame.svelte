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
  const liberalSpaces = ['Policy', 'Policy', 'Policy', 'Policy', 'Liberals win'];
  const fascistPowersByPlayerCount: Record<number, ExecutivePower[]> = {
    5: ['none', 'none', 'policy-peek', 'execution', 'execution', 'none'],
    6: ['none', 'none', 'policy-peek', 'execution', 'execution', 'none'],
    7: ['none', 'investigate', 'special-election', 'execution', 'execution', 'none'],
    8: ['none', 'investigate', 'special-election', 'execution', 'execution', 'none'],
    9: ['investigate', 'investigate', 'special-election', 'execution', 'execution', 'none'],
    10: ['investigate', 'investigate', 'special-election', 'execution', 'execution', 'none'],
  };
  const powerLabels: Record<ExecutivePower, string> = {
    none: 'No power',
    'policy-peek': 'Policy peek',
    investigate: 'Investigate',
    'special-election': 'Special election',
    execution: 'Execution',
  };

  let keys: StoredKeys = {};
  let playerCount = 5;
  let seed = 'secret-table';
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
  let phase: Phase = 'nomination';
  let identityViewer = HUMAN_PLAYER_INDEX;
  let investigationResult = '';
  let message = '';
  let winner = '';
  let turn = 1;
  let chatDraft = '';
  let chatMessages: ChatMessage[] = [];
  let aiThinking = false;
  let aiWarning = '';
  let aiController: globalThis.AbortController | undefined;
  let chatReplyController: globalThis.AbortController | undefined;
  let lastUsage: TokenUsage | undefined;
  let totalUsage: TokenUsage = { input: 0, output: 0 };
  const answeredQuestionKeys = new Set<string>();
  let playerProfileSelections: PlayerProfileSelections = {
    [HUMAN_PLAYER_INDEX]: HUMAN_PROFILE,
  };

  $: alivePlayers = players.filter((player) => player.alive);
  $: presidentPlayer = players[president];
  $: nomineePlayer = nominee === null ? undefined : players[nominee];
  $: presidentName = presidentPlayer?.name ?? 'Player 1';
  $: nomineeName = nomineePlayer?.name ?? 'Not nominated';
  $: jaVotes = alivePlayers.filter((player) => votes[player.id] === 'ja').length;
  $: neinVotes = alivePlayers.filter((player) => votes[player.id] === 'nein').length;
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
  $: currentActor = players.length
    ? secretHitlerAdapter.currentPlayer(toAdapterState())
    : HUMAN_PLAYER_INDEX;
  $: currentActorProfile = configuredProfileById(
    playerProfileSelections[currentActor] ?? HUMAN_PROFILE,
  );

  function refreshKeys() {
    keys = getStoredKeys();
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
      winner: winner
        ? winner.startsWith('Liberals')
          ? 0
          : 1
        : null,
      winnerText: winner,
      turn,
      chatMessages: chatMessages.map(
        ({ id: _id, ...item }) => item,
      ) satisfies SecretHitlerChatMessage[],
    };
  }

  function loadAdapterState(state: SecretHitlerState) {
    players = state.players;
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

  function startGame() {
    const roles = rolesFor(playerCount);
    players = roles.map((role, index) => ({
      id: index,
      name:
        index === HUMAN_PLAYER_INDEX
          ? 'Player 1 (You)'
          : `Player ${index + 1}`,
      role,
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
    phase = 'nomination';
    identityViewer = HUMAN_PLAYER_INDEX;
    investigationResult = '';
    message = 'Nominate a Chancellor.';
    winner = '';
    turn = 1;
    chatDraft = '';
    chatMessages = [];
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

  function playerNameClasses(playerId: number): string {
    return playerId === HUMAN_PLAYER_INDEX
      ? 'text-sky-300'
      : 'text-neutral-200';
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
    if (aiThinking || phase === 'game-over' || winner) {
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

        const move = await requestAIAction(
          state,
          player,
          legalMoves,
          profile,
          aiController.signal,
        );
        loadAdapterState(secretHitlerAdapter.applyMove(state, move));
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
      resolveVote();
      return;
    }
    void runAI();
  }

  function canManuallyVote(player: Player): boolean {
    return phase === 'voting' && player.id === HUMAN_PLAYER_INDEX && player.alive;
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
    discardPile = [...discardPile, ...chancellorHand.filter((_, item) => item !== index)];
    chancellorHand = [];
    enactPolicy(policy);
    void runAI();
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
        if (power === 'policy-peek') {
          peekedPolicies = drawPile.slice(0, 3);
        }
        return;
      }
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
  }

  function advancePresident() {
    if (specialReturnPresident !== null) {
      const returnPresident = specialReturnPresident;
      specialReturnPresident = null;

      if (president === returnPresident) {
        president = nextAliveAfter(president);
        return;
      }

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
    if (phase !== 'investigate' || !player || player.id === president) {
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
    if (phase !== 'special-election' || !player?.alive || player.id === president) {
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
    if (phase !== 'execution' || !player?.alive || player.id === president) {
      return;
    }

    players = players.map((item) =>
      item.id === playerId ? { ...item, alive: false } : item,
    );

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
      ? 'border-blue-300 bg-blue-500/20 text-blue-100'
      : 'border-red-300 bg-red-500/20 text-red-100';
  }

  function hiddenPolicyClasses(): string {
    return 'border-neutral-700 bg-neutral-900 text-neutral-500';
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
    if (!body || !author) {
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
  });
</script>

<section class="h-full overflow-auto bg-neutral-950 px-6 py-6 text-neutral-100">
  <div class="mx-auto grid max-w-[2050px] gap-4 xl:grid-cols-[1fr_520px_360px]">
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
        <section class="rounded-md border border-blue-400/30 bg-blue-400/5 p-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-blue-100">Liberal Track</h2>
            <span class="text-xs text-blue-200">{liberalPolicies}/5</span>
          </div>
          <div class="mt-3 grid grid-cols-5 gap-2">
            {#each liberalSpaces as space, index}
              <div
                class={`flex aspect-[4/3] items-center justify-center rounded-md border text-center text-xs ${
                  index < liberalPolicies
                    ? 'border-blue-300 bg-blue-400/30 text-white'
                    : 'border-blue-400/30 bg-neutral-950 text-blue-100'
                }`}
              >
                {space}
              </div>
            {/each}
          </div>
        </section>

        <section class="rounded-md border border-red-400/30 bg-red-400/5 p-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-red-100">Fascist Track</h2>
            <span class="text-xs text-red-200">{fascistPolicies}/6</span>
          </div>
          <div class="mt-3 grid grid-cols-6 gap-2">
            {#each fascistPowersByPlayerCount[playerCount] as power, index}
              <div
                class={`flex aspect-[4/3] items-center justify-center rounded-md border px-1 text-center text-xs ${
                  index < fascistPolicies
                    ? 'border-red-300 bg-red-500/30 text-white'
                    : 'border-red-400/30 bg-neutral-950 text-red-100'
                }`}
              >
                {index === 5 ? 'Fascists win' : powerLabels[power]}
              </div>
            {/each}
          </div>
        </section>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
          <h2 class="text-sm font-semibold">Election Tracker</h2>
          <div class="mt-3 grid grid-cols-3 gap-2">
            {#each [0, 1, 2] as step}
              <div
                class={`h-10 rounded-md border ${
                  step < electionTracker
                    ? 'border-amber-300 bg-amber-300/30'
                    : 'border-neutral-700 bg-neutral-900'
                }`}
              ></div>
            {/each}
          </div>
          <div class="mt-3 text-xs text-neutral-500">
            Three failed governments enact the top policy.
          </div>
        </section>

        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
          <h2 class="text-sm font-semibold">Policy Deck</h2>
          <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-md border border-neutral-800 bg-neutral-900 p-3">
              <div class="text-xs uppercase text-neutral-500">Draw</div>
              <div class="mt-1 text-2xl font-semibold">{drawPile.length}</div>
            </div>
            <div class="rounded-md border border-neutral-800 bg-neutral-900 p-3">
              <div class="text-xs uppercase text-neutral-500">Discard</div>
              <div class="mt-1 text-2xl font-semibold">{discardPile.length}</div>
            </div>
          </div>
        </section>

        <section class="rounded-md border border-neutral-800 bg-neutral-950 p-3">
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

      <section class="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-4">
        {#if phase === 'nomination'}
          <h2 class="text-sm font-semibold">Nominate Chancellor</h2>
          <p class="mt-2 text-sm text-neutral-400">
            {presidentName} nominates an eligible living player from the player
            list.
          </p>
        {:else if phase === 'voting'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold">Vote on Government</h2>
              <p class="mt-2 text-sm text-neutral-400">
                Proposed government: {presidentName} and {nomineeName}
              </p>
            </div>
            <button
              class="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
              type="button"
              disabled={!allVotesCast}
              on:click={resolveVote}
            >
              Resolve Vote
            </button>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each alivePlayers as player}
              <div class="rounded-md border border-neutral-800 bg-neutral-900 p-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-sm font-medium">{player.name}</div>
                  {#if votes[player.id]}
                    <span
                      class="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-100"
                    >
                      Ballot submitted
                    </span>
                  {:else}
                    <span class="text-[10px] text-neutral-500">Awaiting ballot</span>
                  {/if}
                </div>
                {#if canManuallyVote(player)}
                  <div class="mt-2 flex gap-2">
                    <button
                      class={`flex-1 rounded-md border px-2 py-1 text-xs ${
                        votes[player.id] === 'ja'
                          ? 'border-emerald-300 bg-emerald-400/20 text-emerald-100'
                          : 'border-neutral-700 text-neutral-300'
                      }`}
                      type="button"
                      on:click={() => castHumanVote('ja')}
                    >
                      Ja
                    </button>
                    <button
                      class={`flex-1 rounded-md border px-2 py-1 text-xs ${
                        votes[player.id] === 'nein'
                          ? 'border-red-300 bg-red-400/20 text-red-100'
                          : 'border-neutral-700 text-neutral-300'
                      }`}
                      type="button"
                      on:click={() => castHumanVote('nein')}
                    >
                      Nein
                    </button>
                  </div>
                {:else}
                  <div
                    class="mt-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-center text-xs text-neutral-500"
                  >
                    Private ballot controlled by {player.name}
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
                  class={`aspect-[3/4] rounded-md border px-2 text-sm font-semibold ${policyClasses(policy)}`}
                  type="button"
                  on:click={() => presidentDiscard(index)}
                >
                  Discard {policyLabel(policy)}
                </button>
              {:else}
                <div
                  class={`flex aspect-[3/4] items-center justify-center rounded-md border px-2 text-center text-sm font-semibold ${hiddenPolicyClasses()}`}
                >
                  Hidden policy
                </div>
              {/if}
            {/each}
          </div>
        {:else if phase === 'chancellor-discard'}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold">Chancellor Enacts One Policy</h2>
              <p class="mt-2 text-sm text-neutral-400">
                {#if canViewChancellorCards()}
                  Select the policy to enact. The other policy is discarded.
                {:else}
                  Policy identities are hidden from {players[identityViewer]
                    ?.name}. Switch Viewing as to {nomineeName} to resolve this
                  private hand.
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
                  class={`aspect-[3/4] rounded-md border px-2 text-sm font-semibold ${policyClasses(policy)}`}
                  type="button"
                  on:click={() => chancellorEnact(index)}
                >
                  Enact {policyLabel(policy)}
                </button>
              {:else}
                <div
                  class={`flex aspect-[3/4] items-center justify-center rounded-md border px-2 text-center text-sm font-semibold ${hiddenPolicyClasses()}`}
                >
                  Hidden policy
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
          <h2 class="text-sm font-semibold">Policy Peek</h2>
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
                  class={`flex aspect-[3/4] items-center justify-center rounded-md border px-2 text-sm font-semibold ${policyClasses(policy)}`}
                >
                  {policyLabel(policy)}
                </div>
              {:else}
                <div
                  class={`flex aspect-[3/4] items-center justify-center rounded-md border px-2 text-center text-sm font-semibold ${hiddenPolicyClasses()}`}
                >
                  Hidden policy
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
          <h2 class="text-sm font-semibold">Investigate Loyalty</h2>
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
          <h2 class="text-sm font-semibold">Special Election</h2>
          <p class="mt-2 text-sm text-neutral-400">
            Choose a living player to become the next President. The presidency
            returns to the normal order afterward.
          </p>
        {:else if phase === 'execution'}
          <h2 class="text-sm font-semibold">Execution</h2>
          <p class="mt-2 text-sm text-neutral-400">
            Choose one living player to execute. If Hitler is executed, Liberals
            win immediately.
          </p>
        {:else}
          <h2 class="text-sm font-semibold">Game Over</h2>
          <p class="mt-2 text-sm text-neutral-400">{winner}</p>
        {/if}
      </section>
    </section>

    <aside
      class="h-[calc(100vh-8rem)] min-h-0 rounded-md border border-neutral-800 bg-neutral-900 p-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold">Players</h2>
        <span class="text-xs text-neutral-500">
          Viewing as {players[HUMAN_PLAYER_INDEX]?.name ?? 'Player 1'}
        </span>
      </div>

      <div
        class={`mt-3 grid max-h-[calc(100vh-12rem)] gap-3 overflow-y-auto pr-1 ${
          players.length > 5 ? 'grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {#each players as player}
          {@const visibleRole = visibleRoleFor(identityViewer, player)}
          <div
            class={`rounded-md border p-3 ${
              !player.alive
                ? 'border-neutral-800 bg-neutral-950 opacity-60'
                : player.id === president
                  ? 'border-emerald-400/60 bg-emerald-400/10'
                  : player.id === nominee
                    ? 'border-amber-300/60 bg-amber-300/10'
                    : 'border-neutral-800 bg-neutral-950'
            }`}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class={`text-sm font-medium ${playerNameClasses(player.id)}`}>
                  {player.name}
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
              <div
                class={`rounded-full border px-2 py-1 text-xs ${roleBadgeClasses(
                  visibleRole,
                )}`}
              >
                {visibleRole ? roleLabel(visibleRole) : 'Hidden'}
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
                  disabled={!player.alive || player.id === president || Boolean(investigationResult)}
                  on:click={() => investigate(player.id)}
                >
                  Investigate
                </button>
              {/if}

              {#if phase === 'special-election'}
                <button
                  class="rounded-md border border-emerald-400/50 px-3 py-1.5 text-xs text-emerald-100 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!player.alive || player.id === president}
                  on:click={() => chooseSpecialPresident(player.id)}
                >
                  Choose President
                </button>
              {/if}

              {#if phase === 'execution'}
                <button
                  class="rounded-md border border-red-400/50 px-3 py-1.5 text-xs text-red-100 hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  disabled={!player.alive || player.id === president}
                  on:click={() => executePlayer(player.id)}
                >
                  Execute
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

    </aside>

    <aside
      class="flex h-[calc(100vh-8rem)] min-h-0 flex-col rounded-md border border-neutral-800 bg-neutral-900 p-4"
    >
      <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 p-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold">Table Chat</h2>
          <span class="text-xs text-neutral-500">
            Speaking as {players[HUMAN_PLAYER_INDEX]?.name ?? 'Player 1'}
          </span>
        </div>

        <div class="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {#if chatMessages.length}
            {#each chatMessages as item (item.id)}
              <article
                class="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class={`text-xs font-semibold ${playerNameClasses(item.playerId)}`}>
                    {item.playerName}
                  </span>
                  <span class="text-[10px] uppercase tracking-wide text-neutral-600">
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
            class="h-20 w-full resize-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
            maxlength="500"
            placeholder={`Message as ${players[HUMAN_PLAYER_INDEX]?.name ?? 'Player 1'}`}
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
              Enter sends. Shift+Enter adds a line.
            </span>
            <button
              class="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
              type="button"
              disabled={!chatDraft.trim()}
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
