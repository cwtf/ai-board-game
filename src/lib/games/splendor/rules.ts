import {
  boardKey,
  deckKey,
  GEMS,
  type Card,
  type Gem,
  type GemOrGold,
  type GemCost,
  type Noble,
  type PlayerState,
  type SplendorMove,
  type SplendorState,
  type Tier,
  type TokenSet,
} from './state';

function cloneState(state: SplendorState): SplendorState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      tokens: { ...player.tokens },
      bonuses: { ...player.bonuses },
      cards: [...player.cards],
      reserved: [...player.reserved],
      nobles: [...player.nobles],
    })),
    tokenPool: { ...state.tokenPool },
    board: {
      tier1: [...state.board.tier1],
      tier2: [...state.board.tier2],
      tier3: [...state.board.tier3],
    },
    decks: {
      tier1: [...state.decks.tier1],
      tier2: [...state.decks.tier2],
      tier3: [...state.decks.tier3],
    },
    noblesInPlay: [...state.noblesInPlay],
    log: [...state.log],
  };
}

function gemValue(cost: GemCost, gem: Gem): number {
  return cost[gem] ?? 0;
}

function tokenTotal(tokens: Partial<Record<GemOrGold, number>>): number {
  return Object.values(tokens).reduce((sum, value) => sum + (value ?? 0), 0);
}

function availableGems(state: SplendorState): Gem[] {
  return GEMS.filter((gem) => state.tokenPool[gem] > 0);
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }

  if (items.length < size) {
    return [];
  }

  const [first, ...rest] = items;
  return [
    ...combinations(rest, size - 1).map((combo) => [first, ...combo]),
    ...combinations(rest, size),
  ];
}

function moveIdForTake(gems: Gem[]): string {
  return gems.length === 3
    ? `TAKE3:${gems.join(',')}`
    : `TAKEN:${gems.join(',')}`;
}

function reserveId(tier: Tier, cardId: string | 'DECK'): string {
  return `RESERVE:${tier}:${cardId}`;
}

function buyId(source: 'BOARD' | 'RESERVED', cardId: string): string {
  return `BUY:${source}:${cardId}`;
}

function boardCards(state: SplendorState): Array<{ tier: Tier; card: Card }> {
  return ([1, 2, 3] as const).flatMap((tier) =>
    state.board[boardKey(tier)]
      .filter((card): card is Card => card !== null)
      .map((card) => ({ tier, card })),
  );
}

export function currentPlayer(state: SplendorState): number {
  return state.current;
}

function canAfford(player: PlayerState, card: Card): boolean {
  const needed = GEMS.reduce((sum, gem) => {
    return (
      sum +
      Math.max(
        0,
        gemValue(card.cost, gem) - player.bonuses[gem] - player.tokens[gem],
      )
    );
  }, 0);

  return needed <= player.tokens.gold;
}

function findBoardCard(
  state: SplendorState,
  cardId: string,
): { card: Card; tier: Tier; index: number } | null {
  for (const tier of [1, 2, 3] as const) {
    const cards = state.board[boardKey(tier)];
    const index = cards.findIndex((card) => card?.id === cardId);
    if (index !== -1) {
      return { card: cards[index] as Card, tier, index };
    }
  }

  return null;
}

function findReservedCard(
  player: PlayerState,
  cardId: string,
): { card: Card; index: number } | null {
  const index = player.reserved.findIndex((card) => card.id === cardId);
  return index === -1 ? null : { card: player.reserved[index], index };
}

export function legalMoves(
  state: SplendorState,
  playerIndex = currentPlayer(state),
): SplendorMove[] {
  const player = state.players[playerIndex];
  const moves: SplendorMove[] = [];
  const gems = availableGems(state);
  const takeSize = Math.min(3, gems.length);

  if (takeSize > 0) {
    for (const combo of combinations(gems, takeSize)) {
      moves.push({ id: moveIdForTake(combo), kind: 'take', gems: combo });
    }
  }

  for (const gem of GEMS) {
    if (state.tokenPool[gem] >= 4) {
      moves.push({ id: `TAKE2:${gem}`, kind: 'take', gems: [gem, gem] });
    }
  }

  if (player.reserved.length < 3) {
    for (const { tier, card } of boardCards(state)) {
      moves.push({
        id: reserveId(tier, card.id),
        kind: 'reserve',
        source: 'board',
        tier,
        cardId: card.id,
      });
    }

    for (const tier of [1, 2, 3] as const) {
      if (state.decks[deckKey(tier)].length > 0) {
        moves.push({
          id: reserveId(tier, 'DECK'),
          kind: 'reserve',
          source: 'deck',
          tier,
        });
      }
    }
  }

  for (const { card } of boardCards(state)) {
    if (canAfford(player, card)) {
      moves.push({
        id: buyId('BOARD', card.id),
        kind: 'buy',
        source: 'board',
        cardId: card.id,
      });
    }
  }

  for (const card of player.reserved) {
    if (canAfford(player, card)) {
      moves.push({
        id: buyId('RESERVED', card.id),
        kind: 'buy',
        source: 'reserved',
        cardId: card.id,
      });
    }
  }

  return moves;
}

function assertDiscard(
  player: PlayerState,
  pool: TokenSet,
  discard: SplendorMove['discard'],
) {
  const total = tokenTotal(player.tokens);
  if (total <= 10) {
    return;
  }

  const discardTotal = tokenTotal(discard ?? {});
  if (total - discardTotal !== 10) {
    throw new Error('Discard must reduce token count to exactly 10.');
  }

  for (const gem of [...GEMS, 'gold'] as const) {
    const amount = discard?.[gem] ?? 0;
    if (amount < 0 || amount > player.tokens[gem]) {
      throw new Error(`Invalid discard amount for ${gem}.`);
    }
    player.tokens[gem] -= amount;
    pool[gem] += amount;
  }
}

function applyTake(
  state: SplendorState,
  move: Extract<SplendorMove, { kind: 'take' }>,
) {
  const player = state.players[state.current];
  const counts = new Map<Gem, number>();
  for (const gem of move.gems) {
    counts.set(gem, (counts.get(gem) ?? 0) + 1);
  }

  if (move.gems.length === 0 || move.gems.length > 3) {
    throw new Error('Take move must take 1-3 tokens.');
  }

  if (counts.size === 1 && move.gems.length === 2) {
    const gem = move.gems[0];
    if (state.tokenPool[gem] < 4) {
      throw new Error('Taking two requires at least four tokens in supply.');
    }
  } else if (counts.size !== move.gems.length) {
    throw new Error(
      'Take move may only duplicate gems when taking exactly two of the same colour.',
    );
  }

  for (const [gem, amount] of counts) {
    if (state.tokenPool[gem] < amount) {
      throw new Error(`Not enough ${gem} tokens in supply.`);
    }
    state.tokenPool[gem] -= amount;
    player.tokens[gem] += amount;
  }
}

function refillBoard(state: SplendorState, tier: Tier, index: number) {
  const key = deckKey(tier);
  const next = state.decks[key].shift() ?? null;
  state.board[boardKey(tier)][index] = next;
}

function applyReserve(
  state: SplendorState,
  move: Extract<SplendorMove, { kind: 'reserve' }>,
) {
  const player = state.players[state.current];
  if (player.reserved.length >= 3) {
    throw new Error('Player cannot reserve more than 3 cards.');
  }

  let card: Card | undefined;
  if (move.source === 'board') {
    const found = findBoardCard(state, move.cardId);
    if (!found) {
      throw new Error('Board card is not available to reserve.');
    }
    card = found.card;
    refillBoard(state, found.tier, found.index);
  } else {
    card = state.decks[deckKey(move.tier)].shift();
    if (!card) {
      throw new Error('Cannot reserve from an empty deck.');
    }
  }

  player.reserved.push(card);
  if (state.tokenPool.gold > 0) {
    state.tokenPool.gold -= 1;
    player.tokens.gold += 1;
  }
}

function paymentFor(
  player: PlayerState,
  card: Card,
  goldUsedFor?: Partial<Record<Gem, number>>,
) {
  const payment: Partial<Record<GemOrGold, number>> = {};
  let goldTotal = 0;

  for (const gem of GEMS) {
    const remaining = Math.max(
      0,
      gemValue(card.cost, gem) - player.bonuses[gem],
    );
    const goldForGem =
      goldUsedFor?.[gem] ?? Math.max(0, remaining - player.tokens[gem]);
    if (goldForGem < 0 || goldForGem > remaining) {
      throw new Error(`Invalid gold allocation for ${gem}.`);
    }

    const tokenPay = remaining - goldForGem;
    if (tokenPay > player.tokens[gem]) {
      throw new Error(`Not enough ${gem} tokens to buy card.`);
    }

    payment[gem] = tokenPay;
    goldTotal += goldForGem;
  }

  if (goldTotal > player.tokens.gold) {
    throw new Error('Not enough gold tokens to buy card.');
  }

  payment.gold = goldTotal;
  return payment;
}

function applyBuy(
  state: SplendorState,
  move: Extract<SplendorMove, { kind: 'buy' }>,
) {
  const player = state.players[state.current];
  let card: Card;

  if (move.source === 'board') {
    const found = findBoardCard(state, move.cardId);
    if (!found) {
      throw new Error('Board card is not available to buy.');
    }
    card = found.card;
    refillBoard(state, found.tier, found.index);
  } else {
    const found = findReservedCard(player, move.cardId);
    if (!found) {
      throw new Error('Reserved card is not available to buy.');
    }
    card = found.card;
    player.reserved.splice(found.index, 1);
  }

  const payment = paymentFor(player, card, move.goldUsedFor);
  for (const gem of [...GEMS, 'gold'] as const) {
    const amount = payment[gem] ?? 0;
    player.tokens[gem] -= amount;
    state.tokenPool[gem] += amount;
  }

  player.cards.push(card);
  player.bonuses[card.bonus] += 1;
  player.prestige += card.prestige;
}

function eligibleNobles(player: PlayerState, nobles: Noble[]): Noble[] {
  return nobles.filter((noble) =>
    GEMS.every((gem) => player.bonuses[gem] >= gemValue(noble.cost, gem)),
  );
}

function claimNoble(state: SplendorState, move: SplendorMove) {
  const player = state.players[state.current];
  const eligible = eligibleNobles(player, state.noblesInPlay);
  if (eligible.length === 0) {
    return;
  }

  const chosen =
    eligible.length === 1
      ? eligible[0]
      : eligible.find((noble) => noble.id === move.noble);
  if (!chosen) {
    throw new Error(
      'A noble choice is required when multiple nobles are eligible.',
    );
  }

  state.noblesInPlay = state.noblesInPlay.filter(
    (noble) => noble.id !== chosen.id,
  );
  player.nobles.push(chosen);
  player.prestige += chosen.prestige;
}

function advanceTurn(state: SplendorState) {
  const player = state.players[state.current];
  if (!state.finalRoundTriggered && player.prestige >= 15) {
    state.finalRoundTriggered = true;
    state.finalRoundStartedAt = state.turn;
  }

  state.turn += 1;
  state.current = (state.current + 1) % state.players.length;
}

export function applyMove(
  state: SplendorState,
  move: SplendorMove,
): SplendorState {
  const next = cloneState(state);
  if (isTerminal(next)) {
    throw new Error('Cannot apply a move to a finished game.');
  }

  if (move.kind === 'take') {
    applyTake(next, move);
  } else if (move.kind === 'reserve') {
    applyReserve(next, move);
  } else {
    applyBuy(next, move);
  }

  assertDiscard(next.players[next.current], next.tokenPool, move.discard);
  claimNoble(next, move);
  advanceTurn(next);
  return next;
}

export function isTerminal(state: SplendorState): boolean {
  if (!state.finalRoundTriggered || state.finalRoundStartedAt === null) {
    return false;
  }

  const triggerPlayer = state.finalRoundStartedAt % state.players.length;
  return (
    state.turn > state.finalRoundStartedAt && state.current === triggerPlayer
  );
}

export function winner(state: SplendorState): number | null {
  if (!isTerminal(state)) {
    return null;
  }

  const bestPrestige = Math.max(
    ...state.players.map((player) => player.prestige),
  );
  const contenders = state.players
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
