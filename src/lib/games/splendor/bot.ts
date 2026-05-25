import { createRng, type Rng } from '@/lib/games/shared/rng';
import {
  applyMove,
  isTerminal,
  legalMoves as legalSplendorMoves,
  winner,
} from './rules';
import {
  boardKey,
  GEMS,
  type BonusSet,
  type Card,
  type Gem,
  type GemOrGold,
  type Noble,
  type PlayerState,
  type SplendorMove,
  type SplendorState,
  type TokenSet,
} from './state';

export type SplendorBotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface SplendorBotOptions {
  difficulty?: SplendorBotDifficulty;
  seed?: string;
  timeBudgetMs?: number;
}

interface ScoredMove {
  move: SplendorMove;
  score: number;
}

const STANDARD_GEMS: GemOrGold[] = [...GEMS, 'gold'];
const RESERVE_TOKEN_THRESHOLD = 9;
const NOBLE_PORTFOLIO_THRESHOLD = 3;

function tokenTotal(tokens: Partial<Record<GemOrGold, number>>): number {
  return Object.values(tokens).reduce((sum, value) => sum + (value ?? 0), 0);
}

function gemCost(card: Card, gem: Gem): number {
  return card.cost[gem] ?? 0;
}

function nobleCost(noble: Noble, gem: Gem): number {
  return noble.cost[gem] ?? 0;
}

function visibleCards(state: SplendorState): Card[] {
  return ([1, 2, 3] as const).flatMap((tier) =>
    state.board[boardKey(tier)].filter((card): card is Card => card !== null),
  );
}

function boardCardById(state: SplendorState, cardId: string): Card | undefined {
  return visibleCards(state).find((card) => card.id === cardId);
}

function moveCard(
  state: SplendorState,
  player: PlayerState,
  move: SplendorMove,
): Card | undefined {
  if (move.kind === 'buy' && move.source === 'reserved') {
    return player.reserved.find((card) => card.id === move.cardId);
  }

  if ('cardId' in move) {
    return boardCardById(state, move.cardId);
  }

  return undefined;
}

function cardDistance(player: PlayerState, card: Card): number {
  const missing = GEMS.reduce((sum, gem) => {
    const remaining = Math.max(0, gemCost(card, gem) - player.bonuses[gem]);
    return sum + Math.max(0, remaining - player.tokens[gem]);
  }, 0);

  return Math.max(0, missing - player.tokens.gold);
}

function cardDemand(state: SplendorState, gem: Gem): number {
  return visibleCards(state).reduce((sum, card) => {
    return sum + Math.min(3, gemCost(card, gem));
  }, 0);
}

function nobleProgress(player: PlayerState, noble: Noble): number {
  const total = GEMS.reduce((sum, gem) => sum + nobleCost(noble, gem), 0);
  if (total === 0) {
    return 0;
  }

  const matched = GEMS.reduce((sum, gem) => {
    return sum + Math.min(player.bonuses[gem], nobleCost(noble, gem));
  }, 0);

  return matched / total;
}

function nobleScore(player: PlayerState, nobles: Noble[]): number {
  return nobles.reduce((sum, noble) => {
    const progress = nobleProgress(player, noble);
    return sum + progress * progress * 24;
  }, 0);
}

function bestNobleProgress(player: PlayerState, nobles: Noble[]): number {
  if (nobles.length === 0) {
    return 0;
  }

  return Math.max(...nobles.map((noble) => nobleProgress(player, noble)));
}

function isEndgame(state: SplendorState, player: PlayerState): boolean {
  return (
    player.prestige >= 10 ||
    Math.max(...state.players.map((current) => current.prestige)) >= 12
  );
}

function isNoblePortfolioReady(player: PlayerState): boolean {
  return (
    GEMS.filter((gem) => player.bonuses[gem] >= NOBLE_PORTFOLIO_THRESHOLD)
      .length >= 3
  );
}

function bestTargetScore(state: SplendorState, player: PlayerState): number {
  const targets = [...visibleCards(state), ...player.reserved];
  if (targets.length === 0) {
    return 0;
  }

  return Math.max(
    ...targets.map((card) => {
      const distance = cardDistance(player, card);
      return card.prestige * 30 + card.tier * 4 - distance * 11;
    }),
  );
}

function canAffordSoon(player: PlayerState, card: Card): boolean {
  return cardDistance(player, card) <= 1;
}

function opponentDenialScore(
  state: SplendorState,
  playerIndex: number,
  card: Card | undefined,
): number {
  if (!card) {
    return 0;
  }

  return state.players.reduce((score, opponent, index) => {
    if (index === playerIndex) {
      return score;
    }

    if (cardDistance(opponent, card) === 0) {
      return score + 35 + card.prestige * 12;
    }

    if (canAffordSoon(opponent, card)) {
      return score + 16 + card.prestige * 8;
    }

    return score;
  }, 0);
}

function opponentNobleDenialScore(
  state: SplendorState,
  playerIndex: number,
  card: Card | undefined,
): number {
  if (!card) {
    return 0;
  }

  return state.players.reduce((score, opponent, index) => {
    if (index === playerIndex) {
      return score;
    }

    return (
      score +
      state.noblesInPlay.reduce((nobleScore, noble) => {
        const required = nobleCost(noble, card.bonus);
        if (required <= opponent.bonuses[card.bonus]) {
          return nobleScore;
        }

        const progress = nobleProgress(opponent, noble);
        if (progress < 0.45) {
          return nobleScore;
        }

        const missing = GEMS.reduce((sum, gem) => {
          return (
            sum + Math.max(0, nobleCost(noble, gem) - opponent.bonuses[gem])
          );
        }, 0);
        const cardWouldCompleteNoble = missing === 1;
        const cardIsAccessible = cardDistance(opponent, card) <= 2;

        return (
          nobleScore +
          progress * 45 +
          (cardWouldCompleteNoble ? 80 : 0) +
          (cardIsAccessible ? 25 : 0)
        );
      }, 0)
    );
  }, 0);
}

function projectedTokensForMove(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): TokenSet {
  const tokens = { ...state.players[playerIndex].tokens };

  if (move.kind === 'take') {
    for (const gem of move.gems) {
      tokens[gem] += 1;
    }
  }

  if (move.kind === 'reserve' && state.tokenPool.gold > 0) {
    tokens.gold += 1;
  }

  return tokens;
}

function discardValue(
  state: SplendorState,
  player: PlayerState,
  gem: GemOrGold,
): number {
  if (gem === 'gold') {
    return 8;
  }

  const nearTermNeed = [...visibleCards(state), ...player.reserved].reduce(
    (sum, card) => {
      if (cardDistance(player, card) > 3) {
        return sum;
      }

      return sum + Math.max(0, gemCost(card, gem) - player.bonuses[gem]);
    },
    0,
  );

  return nearTermNeed + cardDemand(state, gem) * 0.15;
}

function discardDownToTen(
  state: SplendorState,
  playerIndex: number,
  tokens: TokenSet,
): Partial<Record<GemOrGold, number>> {
  let remaining = tokenTotal(tokens) - 10;
  if (remaining <= 0) {
    return {};
  }

  const player = state.players[playerIndex];
  const discard: Partial<Record<GemOrGold, number>> = {};
  const order = [...STANDARD_GEMS].sort((left, right) => {
    return (
      discardValue(state, player, left) - discardValue(state, player, right)
    );
  });

  for (const gem of order) {
    if (remaining === 0) {
      break;
    }

    const amount = Math.min(tokens[gem], remaining);
    if (amount > 0) {
      discard[gem] = amount;
      remaining -= amount;
    }
  }

  return discard;
}

function eligibleNobles(bonuses: BonusSet, nobles: Noble[]): Noble[] {
  return nobles.filter((noble) =>
    GEMS.every((gem) => bonuses[gem] >= nobleCost(noble, gem)),
  );
}

function bonusesAfterMove(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): BonusSet {
  const bonuses = { ...state.players[playerIndex].bonuses };
  if (move.kind === 'buy') {
    const card = moveCard(state, state.players[playerIndex], move);
    if (card) {
      bonuses[card.bonus] += 1;
    }
  }

  return bonuses;
}

function basePreparedMove(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): SplendorMove {
  const projected = projectedTokensForMove(state, playerIndex, move);
  if (tokenTotal(projected) <= 10) {
    return move;
  }

  return {
    ...move,
    discard: discardDownToTen(state, playerIndex, projected),
  };
}

function candidateMoves(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): SplendorMove[] {
  const prepared = basePreparedMove(state, playerIndex, move);
  const nobles = eligibleNobles(
    bonusesAfterMove(state, playerIndex, prepared),
    state.noblesInPlay,
  );

  if (nobles.length <= 1) {
    return [prepared];
  }

  return nobles.map((noble) => ({ ...prepared, noble: noble.id }));
}

function validPreparedMoves(
  state: SplendorState,
  playerIndex: number,
  moves: SplendorMove[],
): SplendorMove[] {
  return moves.flatMap((move) =>
    candidateMoves(state, playerIndex, move).filter((candidate) => {
      try {
        applyMove(state, candidate);
        return true;
      } catch {
        return false;
      }
    }),
  );
}

function randomChoice<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) {
    throw new Error('Cannot choose from an empty list.');
  }

  return items[rng.int(items.length)];
}

function weightedChoice<T>(
  items: readonly T[],
  weightFor: (item: T) => number,
  rng: Rng,
): T {
  const weights = items.map((item) => Math.max(0.01, weightFor(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = rng.next() * total;

  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) {
      return items[index];
    }
  }

  return items[items.length - 1];
}

function easyWeight(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
) {
  const card = moveCard(state, state.players[playerIndex], move);
  if (move.kind === 'buy') {
    return 12 + (card?.prestige ?? 0) * 5;
  }

  if (move.kind === 'reserve') {
    return 3 + (card?.prestige ?? 0) * 2;
  }

  return 1 + move.gems.length;
}

function tokenUsefulness(
  state: SplendorState,
  player: PlayerState,
  move: SplendorMove,
): number {
  if (move.kind !== 'take') {
    return 0;
  }

  return move.gems.reduce((sum, gem) => {
    return sum + discardValue(state, player, gem);
  }, 0);
}

function evaluateMove(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): number {
  const before = state.players[playerIndex];
  const card = moveCard(state, before, move);
  const after = applyMove(state, move);
  const afterPlayer = after.players[playerIndex];
  const prestigeGain = afterPlayer.prestige - before.prestige;
  const tokenPenalty = tokenTotal(move.discard ?? {}) * 4;
  const targetGain =
    bestTargetScore(after, afterPlayer) - bestTargetScore(state, before);
  const nobleGain =
    nobleScore(afterPlayer, after.noblesInPlay) -
    nobleScore(before, state.noblesInPlay);
  const targetGainWeight = move.kind === 'reserve' ? 0.2 : 0.75;

  let score =
    prestigeGain * (after.finalRoundTriggered ? 170 : 115) +
    targetGain * targetGainWeight +
    nobleGain -
    tokenPenalty;

  if (move.kind === 'buy') {
    score += 24;
    if (card) {
      score += card.tier * 5 + cardDemand(state, card.bonus) * 0.45;
    }
  }

  if (move.kind === 'reserve') {
    const reserveSlotsBefore = before.reserved.length;
    const denial = opponentDenialScore(state, playerIndex, card);
    const goldTempo = state.tokenPool.gold > 0 ? 7 : 0;

    score += denial + goldTempo - 18 - reserveSlotsBefore * 20;
    if (card) {
      const distance = cardDistance(before, card);
      const closePlanBonus =
        distance <= 2 ? 18 : distance <= 4 && card.prestige >= 3 ? 10 : 0;
      const highValueBonus =
        card.prestige >= 3 ? card.prestige * 7 + card.tier * 2 : 0;
      score += closePlanBonus + highValueBonus - distance * 5;
    } else {
      score += move.tier - 10;
    }
    score -= afterPlayer.reserved.length * 6;
  }

  if (move.kind === 'take') {
    score += tokenUsefulness(state, before, move) * 1.3;
  }

  if (isTerminal(after)) {
    score += winner(after) === playerIndex ? 10_000 : -10_000;
  }

  if (Math.max(...state.players.map((player) => player.prestige)) >= 12) {
    score += prestigeGain * 90;
  }

  return score;
}

function nobleFocusScore(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): number {
  if (state.noblesInPlay.length === 0) {
    return 0;
  }

  const before = state.players[playerIndex];
  const card = moveCard(state, before, move);
  const after = applyMove(state, move);
  const afterPlayer = after.players[playerIndex];
  const claimedNobles = afterPlayer.nobles.length - before.nobles.length;
  const bestProgressGain = Math.max(
    0,
    bestNobleProgress(afterPlayer, state.noblesInPlay) -
      bestNobleProgress(before, state.noblesInPlay),
  );
  const totalProgressGain = Math.max(
    0,
    nobleScore(afterPlayer, state.noblesInPlay) -
      nobleScore(before, state.noblesInPlay),
  );

  let score =
    claimedNobles * 220 + bestProgressGain * 260 + totalProgressGain * 3;

  if (card) {
    const neededBonus = state.noblesInPlay.reduce((sum, noble) => {
      if (nobleProgress(before, noble) < 0.25) {
        return sum;
      }

      return (
        sum +
        Math.max(0, nobleCost(noble, card.bonus) - before.bonuses[card.bonus])
      );
    }, 0);

    score += neededBonus * (move.kind === 'buy' ? 18 : 7);
  }

  if (move.kind === 'take') {
    const usefulTokenCount = move.gems.reduce((sum, gem) => {
      const helpsNobleCard = visibleCards(state).some((visibleCard) => {
        if (cardDistance(before, visibleCard) > 3) {
          return false;
        }

        const bonusNeeded = state.noblesInPlay.some(
          (noble) =>
            nobleProgress(before, noble) >= 0.25 &&
            nobleCost(noble, visibleCard.bonus) >
              before.bonuses[visibleCard.bonus],
        );

        return bonusNeeded && gemCost(visibleCard, gem) > before.bonuses[gem];
      });

      return sum + (helpsNobleCard ? 1 : 0);
    }, 0);

    score += usefulTokenCount * 8;
  }

  return score;
}

function earlyPortfolioBalanceScore(
  player: PlayerState,
  card: Card | undefined,
): number {
  if (!card || isNoblePortfolioReady(player)) {
    return 0;
  }

  const minBonus = Math.min(...GEMS.map((gem) => player.bonuses[gem]));
  const maxBonus = Math.max(...GEMS.map((gem) => player.bonuses[gem]));
  const cardBonusCount = player.bonuses[card.bonus];

  return (
    (maxBonus - cardBonusCount) * 24 + (cardBonusCount === minBonus ? 36 : 0)
  );
}

function buyTempoScore(move: SplendorMove, card: Card | undefined): number {
  if (move.kind !== 'buy') {
    return 0;
  }

  return 140 + (card?.prestige ?? 0) * 8;
}

function endgamePointScore(
  state: SplendorState,
  player: PlayerState,
  move: SplendorMove,
  card: Card | undefined,
): number {
  if (!isEndgame(state, player)) {
    return 0;
  }

  if (move.kind === 'buy') {
    return (card?.prestige ?? 0) * 150;
  }

  return move.kind === 'reserve' && (card?.prestige ?? 0) > 0
    ? (card?.prestige ?? 0) * 12
    : 0;
}

function stagedNobleScore(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): number {
  const player = state.players[playerIndex];
  if (!isNoblePortfolioReady(player) || isEndgame(state, player)) {
    return 0;
  }

  return nobleFocusScore(state, playerIndex, move);
}

function hardReservePolicyScore(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): number {
  if (move.kind !== 'reserve') {
    return 0;
  }

  const player = state.players[playerIndex];
  const card = moveCard(state, player, move);
  const tokenCount = tokenTotal(player.tokens);
  const denial = opponentNobleDenialScore(state, playerIndex, card);

  return (
    -120 +
    (tokenCount >= RESERVE_TOKEN_THRESHOLD
      ? 110 + Math.max(0, tokenCount - RESERVE_TOKEN_THRESHOLD) * 16
      : 0) +
    denial
  );
}

function evaluateHardMove(
  state: SplendorState,
  playerIndex: number,
  move: SplendorMove,
): number {
  const player = state.players[playerIndex];
  const card = moveCard(state, player, move);

  return (
    evaluateMove(state, playerIndex, move) +
    buyTempoScore(move, card) +
    earlyPortfolioBalanceScore(player, card) +
    stagedNobleScore(state, playerIndex, move) +
    endgamePointScore(state, player, move, card) +
    hardReservePolicyScore(state, playerIndex, move)
  );
}

function chooseEasyMove(
  state: SplendorState,
  playerIndex: number,
  moves: SplendorMove[],
  rng: Rng,
): SplendorMove {
  const prepared = validPreparedMoves(state, playerIndex, moves);
  return weightedChoice(
    prepared,
    (move) => easyWeight(state, playerIndex, move),
    rng,
  );
}

function chooseMediumMove(
  state: SplendorState,
  playerIndex: number,
  moves: SplendorMove[],
  rng: Rng,
): SplendorMove {
  const scored = validPreparedMoves(state, playerIndex, moves)
    .map<ScoredMove>((move) => ({
      move,
      score: evaluateMove(state, playerIndex, move),
    }))
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    throw new Error('Splendor bot has no valid legal moves.');
  }

  const bestScore = scored[0].score;
  const tied = scored.filter(
    (entry) => Math.abs(entry.score - bestScore) < 0.001,
  );
  return randomChoice(tied, rng).move;
}

function chooseHardMove(
  state: SplendorState,
  playerIndex: number,
  moves: SplendorMove[],
  rng: Rng,
): SplendorMove {
  const scored = validPreparedMoves(state, playerIndex, moves)
    .map<ScoredMove>((move) => ({
      move,
      score: evaluateHardMove(state, playerIndex, move),
    }))
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) {
    throw new Error('Splendor bot has no valid legal moves.');
  }

  const bestScore = scored[0].score;
  const tied = scored.filter(
    (entry) => Math.abs(entry.score - bestScore) < 0.001,
  );
  return randomChoice(tied, rng).move;
}

export function chooseSplendorBotMove(
  state: SplendorState,
  playerIndex = state.current,
  legalMoves = legalSplendorMoves(state, playerIndex),
  options: SplendorBotOptions = {},
): SplendorMove {
  if (playerIndex !== state.current) {
    throw new Error('Splendor bot can only choose for the current player.');
  }

  if (legalMoves.length === 0) {
    throw new Error('Splendor bot has no legal moves.');
  }

  const difficulty = options.difficulty ?? 'medium';
  const rng = createRng(
    options.seed ?? `${state.seed}:splendor-bot:${playerIndex}:${state.turn}`,
  );

  if (difficulty === 'easy') {
    return chooseEasyMove(state, playerIndex, legalMoves, rng);
  }

  if (difficulty === 'hard') {
    return chooseHardMove(state, playerIndex, legalMoves, rng);
  }

  return chooseMediumMove(state, playerIndex, legalMoves, rng);
}

export const splendorBot = {
  chooseMove: chooseSplendorBotMove,
};
